import { nanoId } from "../../../../../../../lib/id"

import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../../../lib/http"
import { pgQuery } from "../../../../../../../lib/pg"
import { getStockSnapshotsByProductIds } from "../../../../../../../lib/stock"

import {
  getCustomerAuthService,
  normalizeText,
  requireCustomerAdmin,
} from "../../../../_shared/customer-auth"

function asObject(input: unknown) {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null
}

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function normalizeTags(input: unknown) {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (typeof raw !== "string") continue
    const value = normalizeText(raw, 40)
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out.slice(0, 24)
}

function newEventId() {
  return nanoId(12)
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

  // Keep the timeline bounded to avoid unbounded row growth.
  metadata.timeline = next.slice(-200)
}

async function getOrderById(req: HttpRequest, orderId: string) {
  const service = getCustomerAuthService(req)
  const found = await service.listCustomerOrders({ id: orderId }, { take: 1 })
  return found[0] ?? null
}

async function buildOrderItemMeta(order: Record<string, any>) {
  const rawItems = Array.isArray(order?.items) ? order.items : []
  const productIds = rawItems
    .map((it: any) => (typeof it?.id === "string" ? String(it.id).trim() : ""))
    .filter(Boolean)

  if (!productIds.length) {
    return { item_skus: {}, item_stock: {} }
  }

  const variants = await pgQuery<{ product_id: string; sku: string | null }>(
    `select "product_id", "sku"
     from "product_variant"
     where "deleted_at" is null and "product_id" = any($1::text[])
     order by "variant_rank" asc nulls last, "created_at" asc;`,
    [productIds]
  )

  const skuByProductId: Record<string, string> = {}
  for (const row of variants) {
    const productId = typeof row.product_id === "string" ? row.product_id : ""
    if (!productId) continue
    if (skuByProductId[productId]) continue
    const sku = typeof row.sku === "string" ? row.sku.trim() : ""
    if (sku) skuByProductId[productId] = sku
  }

  const stockByProductId = await getStockSnapshotsByProductIds(productIds)
  const stockOut: Record<string, any> = {}
  for (const [productId, stock] of stockByProductId.entries()) {
    stockOut[productId] = stock
  }

  return {
    item_skus: skuByProductId,
    item_stock: stockOut,
  }
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const orderId = normalizeText(req.params.id, 120)
  if (!orderId) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "order id is required.")
  }

  const order = await getOrderById(req, orderId)
  if (!order) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Order not found.")
  }

  const meta = await buildOrderItemMeta(order)
  return res.json({
    order,
    ...meta,
  })
}

export async function PATCH(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const service = getCustomerAuthService(req)
  const orderId = normalizeText(req.params.id, 120)
  if (!orderId) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "order id is required.")
  }

  const current = await getOrderById(req, orderId)
  if (!current) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Order not found.")
  }

  const body = asObject(req.body) ?? {}
  const data: Record<string, unknown> = {}

  const metadataCurrent =
    current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? (current.metadata as Record<string, any>)
      : {}
  const metadataNext: Record<string, any> = { ...metadataCurrent }
  let metadataChanged = false

  const statusRaw = body.status
  if (hasOwn(body, "status")) {
    const next = normalizeText(statusRaw, 60)
    if (!next) {
      throw new HttpError(HttpError.Types.INVALID_DATA, "status must be a non-empty string.")
    }
    if (next !== current.status) {
      data.status = next
      metadataChanged = true
      appendTimelineEvent(metadataNext, {
        type: "order.status.changed",
        message: `Estado actualizado a ${next}.`,
      })
    }
  }

  const paymentStatusRaw = body.payment_status ?? body.paymentStatus
  if (hasOwn(body, "payment_status") || hasOwn(body, "paymentStatus")) {
    const next = normalizeText(paymentStatusRaw, 60)
    if (!next) {
      throw new HttpError(
        HttpError.Types.INVALID_DATA,
        "payment_status must be a non-empty string."
      )
    }
    if (next !== current.payment_status) {
      data.payment_status = next
      metadataChanged = true
      appendTimelineEvent(metadataNext, {
        type: "order.payment.changed",
        message: `Pago actualizado a ${next}.`,
      })
    }
  }

  const trackingRaw = body.tracking_code ?? body.trackingCode
  if (hasOwn(body, "tracking_code") || hasOwn(body, "trackingCode")) {
    const next = normalizeText(trackingRaw, 120) || null
    if (next !== (current.tracking_code ?? null)) {
      data.tracking_code = next
      metadataChanged = true
      appendTimelineEvent(metadataNext, {
        type: "order.tracking.changed",
        message: next ? "Tracking actualizado." : "Tracking eliminado.",
      })
    }
  }

  const notesRaw = body.admin_notes ?? body.adminNotes
  if (hasOwn(body, "admin_notes") || hasOwn(body, "adminNotes")) {
    const next = normalizeText(notesRaw, 4000) || ""
    if (String(metadataCurrent.admin_notes ?? "") !== next) {
      metadataNext.admin_notes = next
      metadataChanged = true
      appendTimelineEvent(metadataNext, {
        type: "order.note.updated",
        message: next ? "Nota interna actualizada." : "Nota interna eliminada.",
      })
    }
  }

  const tagsRaw = body.admin_tags ?? body.adminTags
  if (hasOwn(body, "admin_tags") || hasOwn(body, "adminTags")) {
    const next = normalizeTags(tagsRaw)
    const currentTags = Array.isArray(metadataCurrent.admin_tags)
      ? normalizeTags(metadataCurrent.admin_tags)
      : []
    const same =
      next.length === currentTags.length && next.every((v, idx) => v === currentTags[idx])
    if (!same) {
      metadataNext.admin_tags = next
      metadataChanged = true
      appendTimelineEvent(metadataNext, {
        type: "order.tags.updated",
        message: next.length ? "Etiquetas actualizadas." : "Etiquetas eliminadas.",
      })
    }
  }

  if (metadataChanged) {
    data.metadata = metadataNext
  }

  if (Object.keys(data).length) {
    await service.updateCustomerOrders({
      selector: { id: orderId },
      data,
    })
  }

  const updated = await getOrderById(req, orderId)
  if (!updated) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Order not found.")
  }

  const meta = await buildOrderItemMeta(updated)
  return res.json({
    order: updated,
    ...meta,
  })
}

