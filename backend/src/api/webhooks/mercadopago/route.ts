import type { HttpRequest, HttpResponse } from "../../../lib/http"
import { nanoId } from "../../../lib/id"
import { publishAdminNotification } from "../../../lib/admin-notifications"
import {
  getMercadoPagoMerchantOrderById,
  getMercadoPagoPaymentById,
  getMercadoPagoWebhookSecret,
  mapMercadoPagoPaymentStatus,
  verifyMercadoPagoWebhookSignature,
} from "../../../lib/mercadopago-checkout-pro"

import { getCustomerAuthService, normalizeText } from "../../store/catalog/_shared/customer-auth"

function asObject(input: unknown) {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null
}

function newEventId() {
  return nanoId(12)
}

function readHeader(req: HttpRequest, key: string) {
  const raw = req.headers[key.toLowerCase()]
  if (typeof raw === "string") return raw.trim()
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === "string")
    return typeof first === "string" ? first.trim() : ""
  }
  return ""
}

function readQuery(req: HttpRequest, key: string, max = 180) {
  const raw = (req.query as Record<string, unknown>)?.[key]
  if (typeof raw === "string") return normalizeText(raw, max)
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === "string")
    return typeof first === "string" ? normalizeText(first, max) : ""
  }
  return ""
}

function resolveNotificationType(req: HttpRequest, body: Record<string, unknown> | null) {
  const fromQuery = normalizeText(
    readQuery(req, "type", 120) || readQuery(req, "topic", 120),
    120
  ).toLowerCase()
  const fromBody = normalizeText(
    body?.type ?? body?.topic ?? body?.action,
    120
  ).toLowerCase()
  const raw = fromQuery || fromBody
  if (!raw) return ""
  if (raw.includes("merchant_order")) return "merchant_order"
  if (raw.includes("payment")) return "payment"
  return raw
}

function resolveNotificationDataId(req: HttpRequest, body: Record<string, unknown> | null) {
  const fromQueryDot = readQuery(req, "data.id", 180)
  const queryData = asObject((req.query as Record<string, unknown>)?.data)
  const fromQueryData = normalizeText(queryData?.id, 180)
  const fromQueryLegacy = readQuery(req, "id", 180)

  const bodyData = asObject(body?.data)
  const fromBodyData = normalizeText(bodyData?.id, 180)
  const fromBodyLegacy = normalizeText(body?.id, 180)

  return (
    fromQueryDot ||
    fromQueryData ||
    fromQueryLegacy ||
    fromBodyData ||
    fromBodyLegacy
  )
}

function appendTimelineEvent(metadata: Record<string, any>, event: { type: string; message: string }) {
  const list = Array.isArray(metadata.timeline) ? metadata.timeline : []
  const next = [
    ...list,
    {
      id: newEventId(),
      at: new Date().toISOString(),
      type: normalizeText(event.type, 80) || "event",
      message: normalizeText(event.message, 240) || "",
    },
  ]

  metadata.timeline = next.slice(-200)
}

async function getOrderByReference(req: HttpRequest, reference: string) {
  const service = getCustomerAuthService(req)
  const byId = await service.listCustomerOrders({ id: reference }, { take: 1 })
  if (byId[0]) return byId[0]
  const byNumber = await service.listCustomerOrders({ order_number: reference }, { take: 1 })
  return byNumber[0] ?? null
}

function normalizeCurrentPaymentStatus(value: unknown) {
  const normalized = normalizeText(value, 60).toLowerCase()
  return normalized || "pending"
}

function shouldMoveOrderToPreparing(currentStatus: unknown, paymentStatus: string) {
  if (paymentStatus !== "paid") return false
  const current = normalizeText(currentStatus, 80).toLowerCase()
  if (!current) return true
  return current === "processing" || current === "pending"
}

function paymentStatusPriority(statusRaw: string) {
  const status = normalizeText(statusRaw, 80).toLowerCase()
  if (!status) return 0

  if (status.includes("approve") || status.includes("accredit") || status.includes("paid")) {
    return 40
  }

  if (
    status.includes("pending") ||
    status.includes("in_process") ||
    status.includes("inprocess") ||
    status.includes("authorized")
  ) {
    return 30
  }

  if (
    status.includes("refund") ||
    status.includes("chargeback") ||
    status.includes("charged_back")
  ) {
    return 20
  }

  if (
    status.includes("reject") ||
    status.includes("cancel") ||
    status.includes("fail") ||
    status.includes("deny")
  ) {
    return 10
  }

  return 1
}

function pickMerchantOrderPaymentId(
  payments: Array<{
    id: string
    status: string
    statusDetail: string
  }>
) {
  if (!payments.length) return ""
  const ordered = [...payments].sort(
    (left, right) => paymentStatusPriority(right.status) - paymentStatusPriority(left.status)
  )
  return ordered[0]?.id || ""
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  const body = asObject(req.body)
  const notificationType = resolveNotificationType(req, body)
  const dataId = resolveNotificationDataId(req, body)

  if (notificationType && notificationType !== "payment" && notificationType !== "merchant_order") {
    return res.status(200).json({ ok: true, ignored: "unsupported_type" })
  }

  if (!dataId) {
    return res.status(200).json({ ok: true, ignored: "missing_data_id" })
  }

  const webhookSecret = getMercadoPagoWebhookSecret()
  const allowUnsignedWebhooks =
    String(process.env.MERCADOPAGO_ALLOW_UNSIGNED_WEBHOOKS || "").trim().toLowerCase() === "true"
  if (!webhookSecret && process.env.NODE_ENV === "production" && !allowUnsignedWebhooks) {
    return res.status(503).json({
      message:
        "Mercado Pago webhook signature validation is required in production. Configure MERCADOPAGO_WEBHOOK_SECRET.",
    })
  }

  if (webhookSecret) {
    const signatureHeader = readHeader(req, "x-signature")
    const requestId = readHeader(req, "x-request-id")
    const valid = verifyMercadoPagoWebhookSignature({
      secret: webhookSecret,
      dataId,
      requestId,
      signatureHeader,
    })
    if (!valid) {
      return res.status(401).json({ message: "Invalid Mercado Pago webhook signature." })
    }
  }

  let payment = null as
    | {
        id: string
        status: string
        statusDetail: string
        externalReference: string
        merchantOrderId: string
        amount: number | null
        currencyId: string | null
        metadata: Record<string, unknown>
      }
    | null

  if (notificationType === "merchant_order") {
    const merchantOrder = await getMercadoPagoMerchantOrderById(dataId)
    const paymentId = pickMerchantOrderPaymentId(merchantOrder.payments)
    if (paymentId) {
      payment = await getMercadoPagoPaymentById(paymentId)
    } else {
      const status = normalizeText(merchantOrder.status, 80).toLowerCase()
      payment = {
        id: merchantOrder.id,
        status,
        statusDetail: "",
        externalReference: merchantOrder.externalReference,
        merchantOrderId: merchantOrder.id,
        amount: null,
        currencyId: null,
        metadata: {},
      }
    }
  } else {
    payment = await getMercadoPagoPaymentById(dataId)
  }

  const externalReference =
    normalizeText(payment.externalReference, 160) ||
    normalizeText(payment.metadata.order_id, 160) ||
    normalizeText(payment.metadata.order_number, 160)
  if (!externalReference) {
    return res.status(200).json({ ok: true, ignored: "missing_external_reference" })
  }

  const order = await getOrderByReference(req, externalReference)
  if (!order?.id) {
    return res.status(200).json({ ok: true, ignored: "order_not_found" })
  }

  const service = getCustomerAuthService(req)
  const metadataCurrent =
    order?.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
      ? (order.metadata as Record<string, any>)
      : {}
  const mpCurrent =
    metadataCurrent?.mercadopago &&
    typeof metadataCurrent.mercadopago === "object" &&
    !Array.isArray(metadataCurrent.mercadopago)
      ? (metadataCurrent.mercadopago as Record<string, any>)
      : {}

  const metadataNext: Record<string, any> = {
    ...metadataCurrent,
    mercadopago: {
      ...mpCurrent,
      mode: "checkout_pro",
      webhook_last_event_at: new Date().toISOString(),
      payment_id: payment.id,
      merchant_order_id: payment.merchantOrderId || mpCurrent.merchant_order_id || null,
      status: payment.status || null,
      status_detail: payment.statusDetail || null,
      external_reference: externalReference,
      amount: payment.amount,
      currency_id: payment.currencyId,
      metadata: payment.metadata,
    },
  }

  const nextPaymentStatus = mapMercadoPagoPaymentStatus(payment.status)
  const currentPaymentStatus = normalizeCurrentPaymentStatus(order.payment_status)
  const paymentStatusChanged = nextPaymentStatus !== currentPaymentStatus

  const patch: Record<string, unknown> = {
    metadata: metadataNext,
  }

  if (paymentStatusChanged) {
    patch.payment_status = nextPaymentStatus
    appendTimelineEvent(metadataNext, {
      type: "order.payment.changed",
      message: `Pago actualizado por Mercado Pago a ${nextPaymentStatus}.`,
    })
  }

  const shouldMoveToPreparing = shouldMoveOrderToPreparing(order.status, nextPaymentStatus)
  if (shouldMoveToPreparing) {
    patch.status = "preparing"
    appendTimelineEvent(metadataNext, {
      type: "order.status.changed",
      message: "Estado actualizado a preparing.",
    })
  }

  await service.updateCustomerOrders({
    selector: { id: order.id },
    data: patch,
  })

  if (paymentStatusChanged) {
    publishAdminNotification({
      type: "order.payment.changed",
      payload: {
        id: order.id,
        orderNumber: order.order_number,
        paymentStatus: nextPaymentStatus,
        provider: "mercadopago",
        paymentId: payment.id,
      },
    })
  }

  return res.status(200).json({
    ok: true,
    order_id: order.id,
    payment_status: nextPaymentStatus,
    provider: "mercadopago",
  })
}
