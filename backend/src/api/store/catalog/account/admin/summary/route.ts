import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"

import { pgQuery } from "../../../../../../lib/pg"
import { requireCustomerAdministrator } from "../../../_shared/customer-auth"

type RangeKey = "today" | "week" | "month" | "year" | "custom"
type Granularity = "hour" | "day" | "month"
type PeriodKey = "current" | "previous"

type OrderRow = {
  period: PeriodKey | string | null
  id: string
  account_id: string | null
  email: string | null
  status: string | null
  payment_status: string | null
  total_ars: number | string | null
  item_count: number | string | null
  shipping_method: string | null
  payment_method: string | null
  sales_channel: string | null
  sales_channel_alt: string | null
  channel: string | null
  utm_source: string | null
  utm_source_alt: string | null
  utm_nested_source: string | null
  source: string | null
  profit_ars_meta: number | string | null
  items_cost_ars_meta: number | string | null
  payment_fee_ars_meta: number | string | null
  payment_fee_pct_meta: number | string | null
  channel_fee_ars_meta: number | string | null
  channel_fee_pct_meta: number | string | null
  refunded_ars_meta: number | string | null
  shipping_ars_meta: number | string | null
  operational_shipping_cost_ars_meta: number | string | null
  created_at: string | Date | null
  updated_at: string | Date | null
  dispatch_at: string | Date | null
  delivered_at: string | Date | null
}

type Order = {
  period: PeriodKey
  id: string
  accountId: string
  email: string
  status: string
  paymentStatus: string
  totalArs: number
  itemCount: number
  shippingMethod: string
  paymentMethod: string
  salesChannel: string
  salesChannelAlt: string
  channelSource: string
  utmSource: string
  utmSourceAlt: string
  utmNestedSource: string
  source: string
  profitArsMeta: number | null
  itemsCostArsMeta: number | null
  paymentFeeArsMeta: number | null
  paymentFeePctMeta: number | null
  channelFeeArsMeta: number | null
  channelFeePctMeta: number | null
  refundedArsMeta: number | null
  shippingArsMeta: number | null
  operationalShippingCostArsMeta: number | null
  createdAt: Date
  updatedAt: Date | null
  dispatchAt: Date | null
  deliveredAt: Date | null
}

type OrderItemRow = {
  period: PeriodKey | string | null
  order_id: string | null
  product_id: string | null
  item_sku: string | null
  item_name: string | null
  brand: string | null
  qty: number | string | null
  price_ars: number | string | null
  unit_cost_ars: number | string | null
}

type OrderItem = {
  period: PeriodKey
  orderId: string
  productId: string
  key: string
  name: string
  brand: string | null
  qty: number
  price: number
  explicitUnitCost: number | null
}

type Bucket = {
  label: string
  at: Date
  start: Date
  end: Date
}

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const
const CHANNELS = [
  { key: "web", label: "Tráfico directo" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "ads", label: "Publicidad" },
  { key: "whatsapp", label: "WhatsApp" },
] as const
const PAYMENT_GROUPS = [
  { key: "approved", label: "Aprobados" },
  { key: "pending", label: "Pendientes" },
  { key: "rejected", label: "Rechazados" },
  { key: "refunded", label: "Reintegrados" },
] as const
const RAW_STATUS_SQL = `lower(trim(coalesce(o."status", '')))`
const RAW_PAYMENT_STATUS_SQL = `lower(trim(coalesce(o."payment_status", '')))`
const CANCELLED_STATUS_SQL = `${RAW_STATUS_SQL} in ('cancelled', 'canceled', 'anulado', 'anulada')`
const REJECTED_PAYMENT_SQL = `(
  ${RAW_PAYMENT_STATUS_SQL} like '%fail%'
  or ${RAW_PAYMENT_STATUS_SQL} like '%reject%'
  or ${RAW_PAYMENT_STATUS_SQL} like '%denied%'
  or ${RAW_PAYMENT_STATUS_SQL} like '%cancel%'
)`
const REVENUE_ORDER_SQL = `not (${CANCELLED_STATUS_SQL}) and not (${REJECTED_PAYMENT_SQL})`

function q(req: HttpRequest, key: string) {
  const value = (req.query as Record<string, unknown>)?.[key]
  if (typeof value === "string") return value.trim()
  if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim()
  return ""
}

function lower(value: unknown, max = 160) {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim().slice(0, max).toLowerCase()
}

function text(value: unknown, max = 180) {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  return null
}

function num(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function int(value: unknown, fallback = 0) {
  return Math.round(num(value, fallback))
}

function toDate(value: unknown) {
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

function dStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function mStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1))
}

function addDays(value: Date, days: number) {
  const out = new Date(value.getTime())
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

function addHours(value: Date, hours: number) {
  const out = new Date(value.getTime())
  out.setUTCHours(out.getUTCHours() + hours)
  return out
}

function addMonths(value: Date, months: number) {
  const out = new Date(value.getTime())
  out.setUTCMonth(out.getUTCMonth() + months)
  return out
}

function parseDateOnly(raw: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  const out = new Date(Date.UTC(y, mo - 1, d))
  if (out.getUTCFullYear() !== y || out.getUTCMonth() !== mo - 1 || out.getUTCDate() !== d) return null
  return out
}

function rangeKey(req: HttpRequest): RangeKey {
  const key = q(req, "r").toLowerCase()
  return key === "today" || key === "week" || key === "month" || key === "year" || key === "custom"
    ? key
    : "month"
}

function comparisonLabel(key: RangeKey) {
  if (key === "today") return "vs ayer"
  if (key === "week") return "vs semana pasada"
  if (key === "year") return "vs año pasado"
  if (key === "month") return "vs mes pasado"
  return null
}

function buckets(start: Date, endExclusive: Date, granularity: Granularity) {
  const out: Bucket[] = []

  if (granularity === "hour") {
    let cursor = dStart(start)
    const cap = endExclusive.getTime() > cursor.getTime() ? endExclusive : addHours(cursor, 2)
    while (cursor.getTime() < cap.getTime()) {
      const next = addHours(cursor, 2)
      out.push({
        label: `${String(cursor.getUTCHours()).padStart(2, "0")}:00`,
        at: new Date(cursor.getTime()),
        start: new Date(cursor.getTime()),
        end: next,
      })
      cursor = next
    }
    return out
  }

  if (granularity === "day") {
    let cursor = dStart(start)
    while (cursor.getTime() < endExclusive.getTime()) {
      const next = addDays(cursor, 1)
      out.push({
        label: `${String(cursor.getUTCDate()).padStart(2, "0")} ${MONTHS[cursor.getUTCMonth()]}`,
        at: new Date(cursor.getTime()),
        start: new Date(cursor.getTime()),
        end: next,
      })
      cursor = next
    }
    return out
  }

  let cursor = mStart(start)
  const endMonth = mStart(addDays(endExclusive, -1))
  const sameYear = cursor.getUTCFullYear() === endMonth.getUTCFullYear()
  while (cursor.getTime() < endExclusive.getTime()) {
    const next = addMonths(cursor, 1)
    const yy = String(cursor.getUTCFullYear()).slice(-2)
    out.push({
      label: sameYear ? MONTHS[cursor.getUTCMonth()] : `${MONTHS[cursor.getUTCMonth()]} ${yy}`,
      at: new Date(cursor.getTime()),
      start: new Date(cursor.getTime()),
      end: next,
    })
    cursor = next
  }
  return out
}

function resolveRange(req: HttpRequest) {
  const key = rangeKey(req)
  const now = new Date()
  const today = dStart(now)

  if (key === "today") {
    const start = today
    const endExclusive = addDays(today, 1)
    return { key, start, endExclusive, granularity: "hour" as Granularity, showComparisons: true }
  }
  if (key === "week") {
    const start = addDays(today, -6)
    const endExclusive = addDays(today, 1)
    return { key, start, endExclusive, granularity: "day" as Granularity, showComparisons: true }
  }
  if (key === "year") {
    const start = addMonths(mStart(now), -11)
    const endExclusive = addMonths(mStart(now), 1)
    return { key, start, endExclusive, granularity: "month" as Granularity, showComparisons: true }
  }
  if (key === "custom") {
    const end = parseDateOnly(q(req, "to")) ?? today
    const start = parseDateOnly(q(req, "from")) ?? addDays(today, -13)
    const a = start.getTime() <= end.getTime() ? start : end
    const b = start.getTime() <= end.getTime() ? end : start
    const startNorm = dStart(a)
    const endNorm = dStart(b)
    const endExclusive = addDays(dStart(b), 1)
    const days = Math.max(1, Math.round((endExclusive.getTime() - startNorm.getTime()) / 86400000))
    const granularity: Granularity = days <= 45 ? "day" : "month"
    return {
      key,
      start: granularity === "month" ? mStart(startNorm) : startNorm,
      endExclusive: granularity === "month" ? addMonths(mStart(endNorm), 1) : endExclusive,
      granularity,
      showComparisons: false,
    }
  }
  const start = addDays(today, -29)
  const endExclusive = addDays(today, 1)
  return { key: "month" as RangeKey, start, endExclusive, granularity: "day" as Granularity, showComparisons: true }
}

function previousRange(current: { start: Date; endExclusive: Date; granularity: Granularity; showComparisons: boolean }) {
  if (!current.showComparisons) {
    return { start: current.start, endExclusive: current.start }
  }
  if (current.granularity === "month") {
    const months =
      (current.endExclusive.getUTCFullYear() - current.start.getUTCFullYear()) * 12 +
      (current.endExclusive.getUTCMonth() - current.start.getUTCMonth())
    return { start: addMonths(current.start, -Math.max(1, months)), endExclusive: current.start }
  }
  const duration = current.endExclusive.getTime() - current.start.getTime()
  return { start: new Date(current.start.getTime() - duration), endExclusive: current.start }
}

function nullableNum(value: unknown) {
  const parsed =
    typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function periodKey(value: unknown) {
  return value === "previous" ? "previous" : "current"
}

async function listOrders(
  currentStart: Date,
  currentEndExclusive: Date,
  previousStart: Date,
  previousEndExclusive: Date
) {
  const rows = await pgQuery<OrderRow>(
    `select
      case
        when o."created_at" >= $1::timestamptz and o."created_at" < $2::timestamptz then 'current'
        else 'previous'
      end as "period",
      o."id",
      o."account_id",
      o."email",
      o."status",
      o."payment_status",
      o."total_ars",
      o."item_count",
      o."shipping_method",
      o."payment_method",
      nullif(trim(coalesce(o."metadata"->>'sales_channel', '')), '') as "sales_channel",
      nullif(trim(coalesce(o."metadata"->>'salesChannel', '')), '') as "sales_channel_alt",
      nullif(trim(coalesce(o."metadata"->>'channel', '')), '') as "channel",
      nullif(trim(coalesce(o."metadata"->>'utm_source', '')), '') as "utm_source",
      nullif(trim(coalesce(o."metadata"->>'utmSource', '')), '') as "utm_source_alt",
      nullif(trim(coalesce(o."metadata"->'utm'->>'source', '')), '') as "utm_nested_source",
      nullif(trim(coalesce(o."metadata"->>'source', '')), '') as "source",
      nullif(trim(coalesce(o."metadata"->>'profit_ars', o."metadata"->>'profitArs', '')), '') as "profit_ars_meta",
      nullif(trim(coalesce(o."metadata"->>'items_cost_ars', o."metadata"->>'itemsCostArs', '')), '') as "items_cost_ars_meta",
      nullif(trim(coalesce(o."metadata"->>'payment_fee_ars', o."metadata"->>'paymentFeeArs', '')), '') as "payment_fee_ars_meta",
      nullif(trim(coalesce(o."metadata"->>'payment_fee_pct', o."metadata"->>'paymentFeePct', '')), '') as "payment_fee_pct_meta",
      nullif(trim(coalesce(o."metadata"->>'channel_fee_ars', o."metadata"->>'channelFeeArs', '')), '') as "channel_fee_ars_meta",
      nullif(trim(coalesce(o."metadata"->>'channel_fee_pct', o."metadata"->>'channelFeePct', '')), '') as "channel_fee_pct_meta",
      nullif(trim(coalesce(o."metadata"->>'refunded_ars', o."metadata"->>'refundedArs', '')), '') as "refunded_ars_meta",
      nullif(trim(coalesce(o."metadata"->>'shipping_ars', o."metadata"->>'shippingArs', '')), '') as "shipping_ars_meta",
      nullif(trim(coalesce(o."metadata"->>'operational_shipping_cost_ars', o."metadata"->>'operationalShippingCostArs', '')), '') as "operational_shipping_cost_ars_meta",
      o."created_at",
      o."updated_at",
      delivery."dispatch_at",
      delivery."delivered_at"
     from "mp_customer_order" o
     left join lateral (
       select
         min(ev."at") filter (
           where ev."status" in (
             'ready_to_dispatch',
             'ready_pickup',
             'dispatched',
             'shipped',
             'in_transit',
             'out_for_delivery',
             'delivered'
           )
         ) as "dispatch_at",
         min(ev."at") filter (where ev."status" = 'delivered') as "delivered_at"
       from (
         select
           (entry.value->>'at')::timestamptz as "at",
           lower(
             trim(
               regexp_replace(
                 regexp_replace(coalesce(entry.value->>'message', ''), '^.*estado actualizado a\\s+', '', 'i'),
                 '[.!?]+$',
                 '',
                 'g'
               )
             )
           ) as "status"
         from jsonb_array_elements(
           case
             when jsonb_typeof(coalesce(o."metadata"->'timeline', '[]'::jsonb)) = 'array'
               then coalesce(o."metadata"->'timeline', '[]'::jsonb)
             else '[]'::jsonb
           end
         ) entry(value)
         where lower(trim(coalesce(entry.value->>'type', ''))) = 'order.status.changed'
           and nullif(trim(coalesce(entry.value->>'at', '')), '') is not null
       ) ev
     ) delivery on true
     where o."deleted_at" is null
       and (
         (o."created_at" >= $1::timestamptz and o."created_at" < $2::timestamptz)
         or (
           $3::timestamptz < $4::timestamptz
           and o."created_at" >= $3::timestamptz
           and o."created_at" < $4::timestamptz
         )
       )
     order by o."created_at" asc, o."id" asc;`,
    [
      currentStart.toISOString(),
      currentEndExclusive.toISOString(),
      previousStart.toISOString(),
      previousEndExclusive.toISOString(),
    ]
  )

  return rows
    .map((row) => {
      const createdAt = toDate(row.created_at)
      if (!createdAt || !text(row.id, 140)) return null

      return {
        period: periodKey(row.period),
        id: text(row.id, 140),
        accountId: text(row.account_id, 140),
        email: text(row.email, 220).toLowerCase(),
        status: lower(row.status, 80),
        paymentStatus: lower(row.payment_status, 80),
        totalArs: Math.max(0, int(row.total_ars, 0)),
        itemCount: Math.max(0, int(row.item_count, 0)),
        shippingMethod: lower(row.shipping_method, 80),
        paymentMethod: lower(row.payment_method, 80),
        salesChannel: lower(row.sales_channel, 120),
        salesChannelAlt: lower(row.sales_channel_alt, 120),
        channelSource: lower(row.channel, 120),
        utmSource: lower(row.utm_source, 120),
        utmSourceAlt: lower(row.utm_source_alt, 120),
        utmNestedSource: lower(row.utm_nested_source, 120),
        source: lower(row.source, 120),
        profitArsMeta: nullableNum(row.profit_ars_meta),
        itemsCostArsMeta: nullableNum(row.items_cost_ars_meta),
        paymentFeeArsMeta: nullableNum(row.payment_fee_ars_meta),
        paymentFeePctMeta: nullableNum(row.payment_fee_pct_meta),
        channelFeeArsMeta: nullableNum(row.channel_fee_ars_meta),
        channelFeePctMeta: nullableNum(row.channel_fee_pct_meta),
        refundedArsMeta: nullableNum(row.refunded_ars_meta),
        shippingArsMeta: nullableNum(row.shipping_ars_meta),
        operationalShippingCostArsMeta: nullableNum(row.operational_shipping_cost_ars_meta),
        createdAt,
        updatedAt: toDate(row.updated_at),
        dispatchAt: toDate(row.dispatch_at),
        deliveredAt: toDate(row.delivered_at),
      } as Order
    })
    .filter(Boolean) as Order[]
}

async function listOrderItems(
  currentStart: Date,
  currentEndExclusive: Date,
  previousStart: Date,
  previousEndExclusive: Date
) {
  const rows = await pgQuery<OrderItemRow>(
    `with scoped_orders as (
       select
         o."id",
         case
           when o."created_at" >= $1::timestamptz and o."created_at" < $2::timestamptz then 'current'
           else 'previous'
         end as "period",
         o."items"
       from "mp_customer_order" o
       where o."deleted_at" is null
         and ${REVENUE_ORDER_SQL}
         and (
           (o."created_at" >= $1::timestamptz and o."created_at" < $2::timestamptz)
           or (
             $3::timestamptz < $4::timestamptz
             and o."created_at" >= $3::timestamptz
             and o."created_at" < $4::timestamptz
           )
         )
     )
     select
       so."period",
       so."id" as "order_id",
       nullif(trim(coalesce(item.value->>'id', item.value->>'product_id', item.value->>'productId', '')), '') as "product_id",
       nullif(trim(coalesce(item.value->>'sku', '')), '') as "item_sku",
       coalesce(nullif(trim(coalesce(item.value->>'name', '')), ''), 'Producto') as "item_name",
       coalesce(
         nullif(trim(coalesce(item.value->>'brand', '')), ''),
         nullif(trim(coalesce(item.value->'brand'->>'name', '')), ''),
         nullif(trim(coalesce(item.value->>'brand_name', item.value->>'brandName', '')), '')
       ) as "brand",
       nullif(trim(coalesce(item.value->>'qty', '')), '') as "qty",
       coalesce(
         nullif(trim(coalesce(item.value->>'priceArs', '')), ''),
         nullif(trim(coalesce(item.value->>'price_ars', '')), ''),
         nullif(trim(coalesce(item.value->>'unitPriceArs', '')), ''),
         nullif(trim(coalesce(item.value->>'unit_price_ars', '')), ''),
         nullif(trim(coalesce(item.value->>'price', '')), '')
       ) as "price_ars",
       coalesce(
         nullif(trim(coalesce(item.value->>'costArs', '')), ''),
         nullif(trim(coalesce(item.value->>'cost_ars', '')), ''),
         nullif(trim(coalesce(item.value->>'unitCostArs', '')), ''),
         nullif(trim(coalesce(item.value->>'unit_cost_ars', '')), '')
       ) as "unit_cost_ars"
     from scoped_orders so
     cross join lateral jsonb_array_elements(
       case
         when jsonb_typeof(coalesce(so."items"::jsonb, '[]'::jsonb)) = 'array'
           then coalesce(so."items"::jsonb, '[]'::jsonb)
         else '[]'::jsonb
       end
     ) item(value);`,
    [
      currentStart.toISOString(),
      currentEndExclusive.toISOString(),
      previousStart.toISOString(),
      previousEndExclusive.toISOString(),
    ]
  )

  return rows
    .map((row) => {
      const orderId = text(row.order_id, 140)
      if (!orderId) return null
      const name = text(row.item_name, 180) || "Producto"
      const qty = Math.max(0, int(row.qty, 0))
      if (!qty) return null
      const price = Math.max(0, int(row.price_ars, 0))
      const productId = text(row.product_id, 140)
      const itemSku = text(row.item_sku, 140)
      const key = productId || itemSku || lower(name, 140)
      if (!key) return null

      return {
        period: periodKey(row.period),
        orderId,
        productId,
        key,
        name,
        brand: text(row.brand, 120) || null,
        qty,
        price,
        explicitUnitCost: (() => {
          const parsed = nullableNum(row.unit_cost_ars)
          return parsed !== null && parsed >= 0 ? Math.round(parsed) : null
        })(),
      } as OrderItem
    })
    .filter(Boolean) as OrderItem[]
}

async function listEventCounts(currentStart: Date, currentEndExclusive: Date, previousStart: Date, previousEndExclusive: Date) {
  const rows = await pgQuery<{ event: string | null; current_count: string | number | null; previous_count: string | number | null }>(
    `select
      "event",
      sum(case when "created_at" >= $1 and "created_at" < $2 then 1 else 0 end) as "current_count",
      sum(case when "created_at" >= $3 and "created_at" < $4 then 1 else 0 end) as "previous_count"
     from "mp_auth_audit_log"
     where "deleted_at" is null
       and "created_at" >= $3
       and "created_at" < $2
       and ("event" = 'cart.synced' or "event" = 'checkout.finalized' or "event" like 'telemetry.%')
     group by "event";`,
    [currentStart.toISOString(), currentEndExclusive.toISOString(), previousStart.toISOString(), previousEndExclusive.toISOString()]
  )

  const map = new Map<string, { current: number; previous: number }>()
  for (const row of rows) {
    const event = lower(row.event, 160)
    if (!event) continue
    map.set(event, { current: Math.max(0, int(row.current_count, 0)), previous: Math.max(0, int(row.previous_count, 0)) })
  }
  return map
}

async function listProductCosts(productIds: string[]) {
  const ids = Array.from(new Set(productIds.map((id) => text(id, 140)).filter(Boolean)))
  if (!ids.length) return new Map<string, number>()

  const rows = await pgQuery<{ product_id: string | null; cost_ars: string | number | null; metadata: unknown }>(
    `select distinct on (v."product_id")
      v."product_id",
      v."cost_ars",
      v."metadata"
     from "product_variant" v
     where v."deleted_at" is null
       and v."product_id" = any($1::text[])
     order by v."product_id" asc, v."variant_rank" asc nulls last, v."created_at" asc, v."id" asc;`,
    [ids]
  )

  const map = new Map<string, number>()
  for (const row of rows) {
    const productId = text(row.product_id, 140)
    if (!productId) continue

    const fromColumn = int(row.cost_ars, -1)
    if (fromColumn >= 0) {
      map.set(productId, fromColumn)
      continue
    }

    const metadata = asRecord(row.metadata)
    const fromMeta = int(metadata?.cost_ars ?? metadata?.costArs, -1)
    if (fromMeta >= 0) {
      map.set(productId, fromMeta)
    }
  }
  return map
}

function rejectedPayment(status: string) {
  return status.includes("failed") || status.includes("reject") || status.includes("denied") || status.includes("cancel")
}

function cancelledStatus(status: string) {
  return status === "cancelled" || status === "canceled" || status === "anulado" || status === "anulada"
}

function revenueOrder(order: Order) {
  return !cancelledStatus(order.status) && !rejectedPayment(order.paymentStatus)
}

function pct(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

function trend(current: number, previous: number, show: boolean, invert = false) {
  if (!show) return null
  const value = invert ? -pct(current, previous) : pct(current, previous)
  const rounded = Math.round(Math.max(-999, Math.min(999, value)) * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

function eventCount(
  events: Map<string, { current: number; previous: number }>,
  event: string,
  period: "current" | "previous"
) {
  return events.get(event)?.[period] ?? 0
}

function preferredEventCount(
  events: Map<string, { current: number; previous: number }>,
  period: "current" | "previous",
  preferredEvents: string[]
) {
  for (const event of preferredEvents) {
    const value = eventCount(events, event, period)
    if (value > 0) return value
  }
  return 0
}

function channel(order: Order) {
  const candidates = [
    order.salesChannel,
    order.salesChannelAlt,
    order.channelSource,
    order.utmSource,
    order.utmSourceAlt,
    order.utmNestedSource,
    order.source,
    order.shippingMethod,
    order.paymentMethod,
  ]
  for (const raw of candidates) {
    const value = lower(raw, 120)
    if (!value) continue
    if (value.includes("instagram") || value === "ig") return "instagram"
    if (value.includes("facebook") || value === "fb") return "facebook"
    if (value.includes("whatsapp") || value === "wa") return "whatsapp"
    if (value.includes("ads") || value.includes("anuncio") || value.includes("campaign") || value.includes("google") || value.includes("meta")) return "ads"
    if (value.includes("web") || value.includes("store_checkout") || value.includes("site")) return "web"
  }
  return "web"
}

function paymentGroup(status: string) {
  if (status.includes("paid") || status.includes("approve") || status.includes("accredit") || status.includes("success")) return "approved"
  if (status.includes("refund") || status.includes("reintegr") || status.includes("chargeback")) return "refunded"
  if (rejectedPayment(status)) return "rejected"
  return "pending"
}

function paymentFeePercent(methodRaw: string) {
  const method = lower(methodRaw, 120)
  if (!method) return 3.3
  if (method.includes("transfer")) return 0.8
  if (method.includes("cash") || method.includes("efectivo")) return 0
  if (method.includes("debit")) return 1.8
  if (method.includes("credit")) return 3.9
  if (method.includes("card") || method.includes("mercado") || method.includes("mp")) return 4.2
  return 3.3
}

function channelFeePercent(channelKey: string) {
  if (channelKey === "instagram" || channelKey === "facebook") return 4.2
  if (channelKey === "ads") return 8.5
  if (channelKey === "whatsapp") return 1.2
  return 0
}

function operationalShippingCost(order: Order) {
  const explicit = order.operationalShippingCostArsMeta
  if (explicit !== null && Number.isFinite(explicit) && explicit >= 0) return Math.round(explicit)

  const shippingMethod = lower(order.shippingMethod, 120)
  const shippingArs = Math.max(0, int(order.shippingArsMeta, 0))
  const pickup =
    shippingMethod.includes("retiro") ||
    shippingMethod.includes("pickup") ||
    shippingMethod.includes("sucursal") ||
    shippingMethod.includes("local")
  if (pickup) return 0
  if (shippingArs > 0) return Math.max(0, Math.round(shippingArs * 0.85))
  return 3900
}

function lineItemCosts(orderItems: OrderItem[], productCostMap: Map<string, number>) {
  const costs: Array<{ qty: number; unitPrice: number; unitCost: number }> = []
  for (const item of orderItems) {
    const qty = Math.max(0, item.qty)
    if (!qty) continue

    const unitPrice = Math.max(0, item.price)
    const explicitUnitCost = item.explicitUnitCost ?? -1
    const mappedUnitCost = item.productId ? (productCostMap.get(item.productId) ?? -1) : -1
    const fallbackUnitCost = Math.max(0, Math.round(unitPrice * 0.55))
    const unitCost =
      explicitUnitCost >= 0
        ? explicitUnitCost
        : mappedUnitCost >= 0
          ? mappedUnitCost
          : fallbackUnitCost

    costs.push({ qty, unitPrice, unitCost })
  }
  return costs
}

function gain(order: Order, orderItems: OrderItem[], productCostMap: Map<string, number>) {
  const explicit = order.profitArsMeta
  if (explicit !== null && Number.isFinite(explicit)) return Math.round(explicit)

  const itemCosts = lineItemCosts(orderItems, productCostMap)
  const itemsCostExplicit = order.itemsCostArsMeta
  const itemsCost = itemsCostExplicit !== null && Number.isFinite(itemsCostExplicit)
    ? Math.max(0, Math.round(itemsCostExplicit))
    : itemCosts.length
      ? itemCosts.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
      : Math.max(0, Math.round(order.totalArs * 0.55))

  const paymentFeeExplicit = order.paymentFeeArsMeta
  const paymentFeePctMeta = order.paymentFeePctMeta
  const paymentFee = paymentFeeExplicit !== null && Number.isFinite(paymentFeeExplicit)
    ? Math.max(0, Math.round(paymentFeeExplicit))
    : Math.max(
        0,
        Math.round(
          order.totalArs *
            (
              paymentFeePctMeta !== null && Number.isFinite(paymentFeePctMeta)
                ? Math.max(0, paymentFeePctMeta)
                : paymentFeePercent(order.paymentMethod)
            ) /
            100
        )
      )

  const channelFeeExplicit = order.channelFeeArsMeta
  const channelFeePctMeta = order.channelFeePctMeta
  const channelFee = channelFeeExplicit !== null && Number.isFinite(channelFeeExplicit)
    ? Math.max(0, Math.round(channelFeeExplicit))
    : Math.max(
        0,
        Math.round(
          order.totalArs *
            (
              channelFeePctMeta !== null && Number.isFinite(channelFeePctMeta)
                ? Math.max(0, channelFeePctMeta)
                : channelFeePercent(channel(order))
            ) /
            100
        )
      )

  const refundedExplicit = order.refundedArsMeta
  const refunded = refundedExplicit !== null && Number.isFinite(refundedExplicit)
    ? Math.max(0, Math.round(refundedExplicit))
    : paymentGroup(order.paymentStatus) === "refunded"
      ? order.totalArs
      : 0

  return Math.round(order.totalArs - refunded - itemsCost - paymentFee - channelFee - operationalShippingCost(order))
}

function deliveryStats(orders: Order[], referenceMs: number) {
  const deliveryDays: number[] = []
  const dispatchHours: number[] = []
  let delivered = 0
  let onTime = 0
  let delayed = 0

  for (const order of orders) {
    if (cancelledStatus(order.status)) continue
    const createdMs = order.createdAt.getTime()
    let dispatchMs = order.dispatchAt?.getTime() ?? Number.NaN
    let deliveredMs = order.deliveredAt?.getTime() ?? Number.NaN

    if (!Number.isFinite(deliveredMs) && order.status === "delivered" && order.updatedAt) deliveredMs = order.updatedAt.getTime()
    if (!Number.isFinite(dispatchMs) && order.updatedAt && (order.status === "ready_to_dispatch" || order.status === "ready_pickup" || order.status === "dispatched" || order.status === "shipped" || order.status === "in_transit" || order.status === "out_for_delivery" || order.status === "delivered")) {
      dispatchMs = order.updatedAt.getTime()
    }

    if (Number.isFinite(dispatchMs) && dispatchMs >= createdMs) dispatchHours.push((dispatchMs - createdMs) / 3600000)

    if (Number.isFinite(deliveredMs) && deliveredMs >= createdMs) {
      const days = (deliveredMs - createdMs) / 86400000
      deliveryDays.push(days)
      delivered += 1
      if (days <= 3) onTime += 1
      else delayed += 1
    } else if ((referenceMs - createdMs) / 86400000 > 3) {
      delayed += 1
    }
  }

  const avgDays = deliveryDays.length ? deliveryDays.reduce((a, b) => a + b, 0) / deliveryDays.length : null
  const onTimeRate = delivered > 0 ? (onTime / delivered) * 100 : null
  const avgDispatch = dispatchHours.length ? dispatchHours.reduce((a, b) => a + b, 0) / dispatchHours.length : null

  return {
    averageDays: avgDays !== null ? Math.round(avgDays * 100) / 100 : null,
    onTimeRate: onTimeRate !== null ? Math.round(onTimeRate * 100) / 100 : null,
    dispatchHours: avgDispatch !== null ? Math.round(avgDispatch * 100) / 100 : null,
    delayed,
  }
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdministrator(req, res)
  res.setHeader("Cache-Control", "private, no-store, max-age=0")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("X-Content-Type-Options", "nosniff")

  const current = resolveRange(req)
  const prev = previousRange(current)
  const [orders, events] = await Promise.all([
    listOrders(current.start, current.endExclusive, prev.start, prev.endExclusive),
    listEventCounts(current.start, current.endExclusive, prev.start, prev.endExclusive),
  ])

  const currentOrders = orders.filter((order) => order.period === "current")
  const previousOrders = orders.filter((order) => order.period === "previous")

  const currentRevenueOrders = currentOrders.filter(revenueOrder)
  const previousRevenueOrders = previousOrders.filter(revenueOrder)

  const currentBilling = currentRevenueOrders.reduce((sum, order) => sum + order.totalArs, 0)
  const previousBilling = previousRevenueOrders.reduce((sum, order) => sum + order.totalArs, 0)

  let revenueItems: OrderItem[] = []
  let productCostMap = new Map<string, number>()
  if (currentRevenueOrders.length || previousRevenueOrders.length) {
    revenueItems = await listOrderItems(
      current.start,
      current.endExclusive,
      prev.start,
      prev.endExclusive
    )

    const productIds = Array.from(
      new Set(revenueItems.map((item) => item.productId).filter(Boolean))
    )
    productCostMap = await listProductCosts(productIds)
  }

  const itemsByOrderId = new Map<string, OrderItem[]>()
  for (const item of revenueItems) {
    const bucket = itemsByOrderId.get(item.orderId) ?? []
    bucket.push(item)
    itemsByOrderId.set(item.orderId, bucket)
  }

  const currentNet = currentRevenueOrders.reduce(
    (sum, order) => sum + gain(order, itemsByOrderId.get(order.id) ?? [], productCostMap),
    0
  )
  const previousNet = previousRevenueOrders.reduce(
    (sum, order) => sum + gain(order, itemsByOrderId.get(order.id) ?? [], productCostMap),
    0
  )

  const customerCount = (orders: Order[]) => {
    const ids = new Set<string>()
    for (const order of orders) {
      if (order.accountId) ids.add(`a:${order.accountId}`)
      else if (order.email) ids.add(`e:${order.email}`)
    }
    return ids.size
  }

  const currentClients = customerCount(currentRevenueOrders)
  const previousClients = customerCount(previousRevenueOrders)
  const currentAvgTicket = currentRevenueOrders.length ? Math.round(currentBilling / currentRevenueOrders.length) : 0
  const previousAvgTicket = previousRevenueOrders.length ? Math.round(previousBilling / previousRevenueOrders.length) : 0

  const chartBuckets = buckets(current.start, current.endExclusive, current.granularity)
  const chartValues = chartBuckets.map(() => 0)
  for (const order of currentRevenueOrders) {
    const at = order.createdAt.getTime()
    for (let i = 0; i < chartBuckets.length; i += 1) {
      const bucket = chartBuckets[i]
      if (at >= bucket.start.getTime() && at < bucket.end.getTime()) {
        chartValues[i] = (chartValues[i] ?? 0) + order.totalArs
        break
      }
    }
  }

  const channelMap = (orders: Order[]) => {
    const map = new Map<string, { orders: number; revenue: number }>()
    for (const def of CHANNELS) map.set(def.key, { orders: 0, revenue: 0 })
    for (const order of orders) {
      const key = channel(order)
      const currentValue = map.get(key) ?? { orders: 0, revenue: 0 }
      currentValue.orders += 1
      currentValue.revenue += order.totalArs
      map.set(key, currentValue)
    }
    return map
  }
  const currentChannels = channelMap(currentRevenueOrders)
  const previousChannels = channelMap(previousRevenueOrders)

  const topProducts = (period: PeriodKey) => {
    const map = new Map<string, { name: string; brand: string | null; units: number; revenue: number }>()
    for (const item of revenueItems) {
      if (item.period !== period) continue
      const value = map.get(item.key) ?? { name: item.name, brand: item.brand, units: 0, revenue: 0 }
      value.name = item.name || value.name
      if (item.brand && !value.brand) value.brand = item.brand
      value.units += item.qty
      value.revenue += item.qty * item.price
      map.set(item.key, value)
    }
    return Array.from(map.entries())
      .map(([key, value]) => ({
        key,
        name: value.name,
        brand: value.brand,
        units: value.units,
        revenue: Math.max(0, Math.round(value.revenue)),
      }))
      .sort((a, b) => (b.units - a.units) || (b.revenue - a.revenue) || a.name.localeCompare(b.name))
      .slice(0, 5)
  }
  const currentTopProducts = topProducts("current")
  const previousTopProducts = new Map(topProducts("previous").map((entry) => [entry.key, entry]))

  const paymentCounts = new Map<string, number>()
  for (const group of PAYMENT_GROUPS) paymentCounts.set(group.key, 0)
  for (const order of currentOrders) paymentCounts.set(paymentGroup(order.paymentStatus), (paymentCounts.get(paymentGroup(order.paymentStatus)) ?? 0) + 1)

  const visitsCurrent = preferredEventCount(events, "current", [
    "telemetry.session_start",
    "telemetry.page_view",
    "telemetry.home_view",
    "telemetry.collection_view",
    "telemetry.product_view",
  ])
  const visitsPrevious = preferredEventCount(events, "previous", [
    "telemetry.session_start",
    "telemetry.page_view",
    "telemetry.home_view",
    "telemetry.collection_view",
    "telemetry.product_view",
  ])
  const cartsCurrent = preferredEventCount(events, "current", [
    "telemetry.add_to_cart",
    "cart.synced",
    "telemetry.begin_checkout",
    "telemetry.cart_view",
  ])
  const cartsPrevious = preferredEventCount(events, "previous", [
    "telemetry.add_to_cart",
    "cart.synced",
    "telemetry.begin_checkout",
    "telemetry.cart_view",
  ])
  const purchasesCurrent = currentRevenueOrders.length
  const purchasesPrevious = previousRevenueOrders.length
  const conversionCurrent = visitsCurrent > 0 ? (purchasesCurrent / visitsCurrent) * 100 : 0
  const conversionPrevious = visitsPrevious > 0 ? (purchasesPrevious / visitsPrevious) * 100 : 0

  const currentDelivery = deliveryStats(currentRevenueOrders, current.endExclusive.getTime())
  const previousDelivery = deliveryStats(previousRevenueOrders, prev.endExclusive.getTime())

  return res.json({
    range: {
      key: current.key,
      granularity: current.granularity,
      start_date: current.start.toISOString(),
      end_date: new Date(current.endExclusive.getTime() - 1).toISOString(),
      comparison_label: comparisonLabel(current.key),
      show_comparisons: current.showComparisons,
    },
    chart: {
      points: chartBuckets.map((bucket, index) => ({
        label: bucket.label,
        value: Math.max(0, Math.round(chartValues[index] ?? 0)),
        date: bucket.at.toISOString(),
      })),
    },
    metrics: {
      billing: { value: currentBilling, trend: trend(currentBilling, previousBilling, current.showComparisons) },
      net_revenue: { value: currentNet, trend: trend(currentNet, previousNet, current.showComparisons) },
      clients: { value: currentClients, trend: trend(currentClients, previousClients, current.showComparisons) },
      avg_ticket: { value: currentAvgTicket, trend: trend(currentAvgTicket, previousAvgTicket, current.showComparisons) },
    },
    channels: CHANNELS.map((def) => {
      const currentValue = currentChannels.get(def.key) ?? { orders: 0, revenue: 0 }
      const previousValue = previousChannels.get(def.key) ?? { orders: 0, revenue: 0 }
      const share = currentBilling > 0 ? (currentValue.revenue / currentBilling) * 100 : 0
      return {
        key: def.key,
        label: def.label,
        orders: currentValue.orders,
        revenue: currentValue.revenue,
        share: Math.round(share * 100) / 100,
        trend: trend(currentValue.revenue, previousValue.revenue, current.showComparisons),
      }
    }),
    top_products: currentTopProducts.map((entry) => ({
      ...entry,
      trend: trend(entry.revenue, previousTopProducts.get(entry.key)?.revenue ?? 0, current.showComparisons),
    })),
    funnel: {
      visits: { value: visitsCurrent, trend: trend(visitsCurrent, visitsPrevious, current.showComparisons) },
      cart: { value: cartsCurrent, trend: trend(cartsCurrent, cartsPrevious, current.showComparisons) },
      purchases: { value: purchasesCurrent, trend: trend(purchasesCurrent, purchasesPrevious, current.showComparisons) },
      conversion: { value: Math.round(conversionCurrent * 100) / 100, trend: trend(conversionCurrent, conversionPrevious, current.showComparisons) },
    },
    payment_statuses: PAYMENT_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      count: paymentCounts.get(group.key) ?? 0,
    })),
    delivery: {
      average_days: {
        value: currentDelivery.averageDays,
        trend: trend(currentDelivery.averageDays ?? 0, previousDelivery.averageDays ?? 0, current.showComparisons, true),
      },
      on_time_rate: {
        value: currentDelivery.onTimeRate,
        trend: trend(currentDelivery.onTimeRate ?? 0, previousDelivery.onTimeRate ?? 0, current.showComparisons),
      },
      dispatch_hours: {
        value: currentDelivery.dispatchHours,
        trend: trend(currentDelivery.dispatchHours ?? 0, previousDelivery.dispatchHours ?? 0, current.showComparisons, true),
      },
      delayed_orders: {
        value: currentDelivery.delayed,
        trend: trend(currentDelivery.delayed, previousDelivery.delayed, current.showComparisons, true),
      },
    },
  })
}

