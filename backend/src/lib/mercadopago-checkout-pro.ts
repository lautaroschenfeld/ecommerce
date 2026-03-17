import crypto from "crypto"

import { appendPathToBaseUrl, getCanonicalBackendBaseUrl, getCanonicalStorefrontBaseUrl } from "./public-url"

type MpApiRequestInput = {
  accessToken: string
  method: "GET" | "POST"
  path: string
  body?: Record<string, unknown>
}

type MpPreferenceItemInput = {
  id: string
  name: string
  brand: string
  qty: number
  priceArs: number
}

export type MercadoPagoCheckoutProPreferenceInput = {
  orderId: string
  orderNumber: string
  email: string
  items: MpPreferenceItemInput[]
}

export type MercadoPagoCheckoutProPreferenceOutput = {
  id: string
  initPoint: string
  sandboxInitPoint: string
  redirectUrl: string
  externalReference: string
}

export type MercadoPagoPaymentSnapshot = {
  id: string
  status: string
  statusDetail: string
  externalReference: string
  merchantOrderId: string
  amount: number | null
  currencyId: string | null
  metadata: Record<string, unknown>
}

export type MercadoPagoMerchantOrderSnapshot = {
  id: string
  status: string
  externalReference: string
  payments: Array<{
    id: string
    status: string
    statusDetail: string
  }>
}

export type MercadoPagoWebhookSignatureInput = {
  secret: string
  dataId: string
  requestId: string
  signatureHeader: string
}

const MERCADO_PAGO_API_BASE_URL = "https://api.mercadopago.com"
const MERCADO_PAGO_TIMEOUT_MS_DEFAULT = 10_000

function asObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.trunc(parsed)
  return rounded > 0 ? rounded : fallback
}

function normalizeText(value: unknown, max = 240) {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, max)
}

function normalizeId(value: unknown, max = 180) {
  const normalized = normalizeText(value, max)
  if (!normalized) return ""
  return normalized.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, max)
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const rec = error as { name?: unknown; code?: unknown }
  return rec.name === "AbortError" || rec.code === "ABORT_ERR"
}

function safeEqualHex(left: string, right: string) {
  const a = String(left || "").trim().toLowerCase()
  const b = String(right || "").trim().toLowerCase()
  if (!a || !b) return false
  if (!/^[a-f0-9]+$/.test(a) || !/^[a-f0-9]+$/.test(b)) return false

  const aBuf = Buffer.from(a, "hex")
  const bBuf = Buffer.from(b, "hex")
  if (!aBuf.length || aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

function getMercadoPagoAccessToken() {
  return normalizeText(process.env.MERCADOPAGO_ACCESS_TOKEN, 500)
}

function getMercadoPagoHttpTimeoutMs() {
  return toPositiveInt(process.env.MERCADOPAGO_HTTP_TIMEOUT_MS, MERCADO_PAGO_TIMEOUT_MS_DEFAULT)
}

function parseSignatureHeader(signatureHeader: string) {
  const out: Record<string, string> = {}
  const entries = String(signatureHeader || "").split(",")
  for (const entryRaw of entries) {
    const entry = entryRaw.trim()
    if (!entry) continue
    const [k, ...rest] = entry.split("=")
    const key = normalizeText(k, 40).toLowerCase()
    if (!key || !rest.length) continue
    out[key] = normalizeText(rest.join("="), 400)
  }
  return out
}

function ensureMercadoPagoHttpUrl(rawUrl: string, label: string) {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`${label} is not a valid URL.`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https.`)
  }

  const allowInsecure =
    String(process.env.MERCADOPAGO_ALLOW_INSECURE_URLS || "").trim().toLowerCase() === "true"

  if (!allowInsecure && parsed.protocol !== "https:") {
    throw new Error(
      `${label} must use https. Configure public https URLs or set MERCADOPAGO_ALLOW_INSECURE_URLS=true only for local testing.`
    )
  }

  return parsed.toString()
}

function withQuery(baseUrl: string, query: Record<string, string>) {
  const url = new URL(baseUrl)
  for (const [key, value] of Object.entries(query)) {
    if (!value) continue
    url.searchParams.set(key, value)
  }
  return url.toString()
}

function getCheckoutReturnUrl(result: "success" | "failure" | "pending", orderId: string) {
  const basePath = appendPathToBaseUrl(getCanonicalStorefrontBaseUrl(), "/checkout")
  const url = withQuery(basePath, {
    mp_return: "1",
    mp_result: result,
    order_id: orderId,
  })
  return ensureMercadoPagoHttpUrl(url, `Checkout back_url (${result})`)
}

function getMercadoPagoWebhookUrl() {
  const basePath = appendPathToBaseUrl(getCanonicalBackendBaseUrl(), "/webhooks/mercadopago")
  return ensureMercadoPagoHttpUrl(basePath, "Mercado Pago notification_url")
}

function toPreferenceItem(input: MpPreferenceItemInput) {
  const qty = Math.max(1, Math.trunc(Number(input.qty || 0)))
  const unitPrice = Math.max(0, Number(input.priceArs || 0))

  return {
    id: normalizeId(input.id, 100),
    title: normalizeText(input.name, 200) || "Producto",
    description: normalizeText(input.brand, 200) || undefined,
    quantity: qty,
    unit_price: unitPrice,
    currency_id: "ARS",
  }
}

function parseJsonBody(text: string) {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function mercadoPagoApiRequest<T>(input: MpApiRequestInput): Promise<T> {
  const timeoutMs = getMercadoPagoHttpTimeoutMs()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${MERCADO_PAGO_API_BASE_URL}${input.path}`, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      const body = parseJsonBody(text)
      const message =
        normalizeText(body.message, 240) ||
        normalizeText(body.error, 240) ||
        `Mercado Pago request failed (${res.status}).`
      throw new Error(message)
    }

    const json = (await res.json()) as T
    return json
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("Mercado Pago request timed out.")
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export function isMercadoPagoCheckoutMethod(paymentMethod: unknown) {
  const method = normalizeText(paymentMethod, 80).toLowerCase()
  if (!method) return false
  return method.includes("mercado") || method === "mp" || method.includes("mpago")
}

export function isMercadoPagoConfigured() {
  return Boolean(getMercadoPagoAccessToken())
}

export function getMercadoPagoWebhookSecret() {
  return normalizeText(process.env.MERCADOPAGO_WEBHOOK_SECRET, 600)
}

export async function createMercadoPagoCheckoutProPreference(
  input: MercadoPagoCheckoutProPreferenceInput
): Promise<MercadoPagoCheckoutProPreferenceOutput> {
  const accessToken = getMercadoPagoAccessToken()
  if (!accessToken) {
    throw new Error(
      "Mercado Pago Checkout Pro is not configured. Missing MERCADOPAGO_ACCESS_TOKEN."
    )
  }

  const orderId = normalizeId(input.orderId, 120)
  const orderNumber = normalizeText(input.orderNumber, 120)
  const email = normalizeText(input.email, 160).toLowerCase()

  if (!orderId) {
    throw new Error("Mercado Pago checkout requires a valid order id.")
  }
  if (!email || !email.includes("@")) {
    throw new Error("Mercado Pago checkout requires a valid payer email.")
  }

  const items = input.items.map(toPreferenceItem).filter((item) => item.quantity > 0 && item.unit_price >= 0)
  if (!items.length) {
    throw new Error("Mercado Pago checkout requires at least one item.")
  }

  const successUrl = getCheckoutReturnUrl("success", orderId)
  const failureUrl = getCheckoutReturnUrl("failure", orderId)
  const pendingUrl = getCheckoutReturnUrl("pending", orderId)
  const notificationUrl = getMercadoPagoWebhookUrl()

  const statementDescriptor = normalizeText(process.env.MERCADOPAGO_STATEMENT_DESCRIPTOR, 22)

  const payload: Record<string, unknown> = {
    items,
    payer: {
      email,
    },
    external_reference: orderId,
    metadata: {
      order_id: orderId,
      order_number: orderNumber || orderId,
      integration: "checkout_pro",
    },
    back_urls: {
      success: successUrl,
      failure: failureUrl,
      pending: pendingUrl,
    },
    auto_return: "approved",
    notification_url: notificationUrl,
  }

  if (statementDescriptor) {
    payload.statement_descriptor = statementDescriptor
  }

  const raw = await mercadoPagoApiRequest<Record<string, unknown>>({
    accessToken,
    method: "POST",
    path: "/checkout/preferences",
    body: payload,
  })

  const preferenceId = normalizeText(raw.id, 120)
  const initPoint = normalizeText(raw.init_point, 500)
  const sandboxInitPoint = normalizeText(raw.sandbox_init_point, 500)
  const redirectUrl = sandboxInitPoint || initPoint

  if (!preferenceId || !redirectUrl) {
    throw new Error("Mercado Pago did not return a valid checkout preference URL.")
  }

  return {
    id: preferenceId,
    initPoint,
    sandboxInitPoint,
    redirectUrl,
    externalReference: orderId,
  }
}

export async function getMercadoPagoPaymentById(paymentIdRaw: string) {
  const accessToken = getMercadoPagoAccessToken()
  if (!accessToken) {
    throw new Error("Missing MERCADOPAGO_ACCESS_TOKEN.")
  }

  const paymentId = normalizeId(paymentIdRaw, 120)
  if (!paymentId) {
    throw new Error("payment_id is required.")
  }

  const raw = await mercadoPagoApiRequest<Record<string, unknown>>({
    accessToken,
    method: "GET",
    path: `/v1/payments/${encodeURIComponent(paymentId)}`,
  })

  const metadata = asObject(raw.metadata)
  const order = asObject(raw.order)
  return {
    id: normalizeText(raw.id, 120) || paymentId,
    status: normalizeText(raw.status, 80).toLowerCase(),
    statusDetail: normalizeText(raw.status_detail, 160).toLowerCase(),
    externalReference:
      normalizeText(raw.external_reference, 160) ||
      normalizeText(metadata.order_id, 160) ||
      normalizeText(metadata.order_number, 160),
    merchantOrderId: normalizeText(order.id, 120),
    amount:
      Number.isFinite(Number(raw.transaction_amount)) ? Number(raw.transaction_amount) : null,
    currencyId: normalizeText(raw.currency_id, 20) || null,
    metadata,
  } satisfies MercadoPagoPaymentSnapshot
}

export async function getMercadoPagoMerchantOrderById(merchantOrderIdRaw: string) {
  const accessToken = getMercadoPagoAccessToken()
  if (!accessToken) {
    throw new Error("Missing MERCADOPAGO_ACCESS_TOKEN.")
  }

  const merchantOrderId = normalizeId(merchantOrderIdRaw, 120)
  if (!merchantOrderId) {
    throw new Error("merchant_order_id is required.")
  }

  const raw = await mercadoPagoApiRequest<Record<string, unknown>>({
    accessToken,
    method: "GET",
    path: `/merchant_orders/${encodeURIComponent(merchantOrderId)}`,
  })

  const paymentsRaw = Array.isArray(raw.payments) ? raw.payments : []
  const payments = paymentsRaw
    .map((entry) => {
      const rec = asObject(entry)
      const id = normalizeText(rec.id, 120)
      if (!id) return null
      return {
        id,
        status: normalizeText(rec.status, 80).toLowerCase(),
        statusDetail: normalizeText(rec.status_detail, 160).toLowerCase(),
      }
    })
    .filter((entry): entry is { id: string; status: string; statusDetail: string } => Boolean(entry))

  return {
    id: normalizeText(raw.id, 120) || merchantOrderId,
    status: normalizeText(raw.order_status ?? raw.status, 80).toLowerCase(),
    externalReference: normalizeText(raw.external_reference, 160),
    payments,
  } satisfies MercadoPagoMerchantOrderSnapshot
}

export function mapMercadoPagoPaymentStatus(rawStatus: string) {
  const status = normalizeText(rawStatus, 80).toLowerCase()
  if (!status) return "pending"

  if (
    status.includes("refund") ||
    status.includes("chargeback") ||
    status.includes("charged_back")
  ) {
    return "refunded"
  }

  if (
    status.includes("reject") ||
    status.includes("cancel") ||
    status.includes("fail") ||
    status.includes("deny")
  ) {
    return "failed"
  }

  if (
    status.includes("approve") ||
    status.includes("accredit") ||
    status.includes("paid")
  ) {
    return "paid"
  }

  return "pending"
}

export function verifyMercadoPagoWebhookSignature(input: MercadoPagoWebhookSignatureInput) {
  const secret = normalizeText(input.secret, 600)
  const dataId = normalizeText(input.dataId, 180)
  const requestId = normalizeText(input.requestId, 180)
  const signatureHeader = normalizeText(input.signatureHeader, 800)
  if (!secret || !dataId || !requestId || !signatureHeader) return false

  const signature = parseSignatureHeader(signatureHeader)
  const ts = normalizeText(signature.ts, 80)
  const v1 = normalizeText(signature.v1, 200).toLowerCase()
  if (!ts || !v1) return false

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex")
  return safeEqualHex(expected, v1)
}
