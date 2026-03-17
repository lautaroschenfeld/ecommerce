import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"
import { pgQuery } from "../../../../../../lib/pg"

import { normalizeText, requireCustomerAdmin } from "../../../_shared/customer-auth"

type OrderSort = "created_desc" | "created_asc" | "total_desc" | "total_asc"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MAX_OFFSET = 1_000_000
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const VALID_STATUS_FILTERS = new Set([
  "processing",
  "preparing",
  "ready_to_dispatch",
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "cancelled",
])
const VALID_PAYMENT_STATUS_FILTERS = new Set(["paid", "pending", "failed", "refunded"])
const NORMALIZED_STATUS_SQL = `case
  when lower(trim(coalesce(o."status", ''))) = '' then 'processing'
  when lower(trim(coalesce(o."status", ''))) = 'ready_pickup' then 'ready_to_dispatch'
  when lower(trim(coalesce(o."status", ''))) = 'shipped' then 'dispatched'
  else lower(trim(coalesce(o."status", '')))
end`
const RAW_PAYMENT_STATUS_SQL = `lower(trim(coalesce(o."payment_status", '')))`
const NORMALIZED_PAYMENT_STATUS_SQL = `case
  when ${RAW_PAYMENT_STATUS_SQL} = '' then 'pending'
  when ${RAW_PAYMENT_STATUS_SQL} like '%refund%' then 'refunded'
  when ${RAW_PAYMENT_STATUS_SQL} like '%reintegr%' then 'refunded'
  when ${RAW_PAYMENT_STATUS_SQL} like '%chargeback%' then 'refunded'
  when ${RAW_PAYMENT_STATUS_SQL} like '%fail%' then 'failed'
  when ${RAW_PAYMENT_STATUS_SQL} like '%reject%' then 'failed'
  when ${RAW_PAYMENT_STATUS_SQL} like '%denied%' then 'failed'
  when ${RAW_PAYMENT_STATUS_SQL} like '%cancel%' then 'failed'
  when ${RAW_PAYMENT_STATUS_SQL} like '%paid%' then 'paid'
  when ${RAW_PAYMENT_STATUS_SQL} like '%approve%' then 'paid'
  when ${RAW_PAYMENT_STATUS_SQL} like '%accredit%' then 'paid'
  when ${RAW_PAYMENT_STATUS_SQL} like '%success%' then 'paid'
  else ${RAW_PAYMENT_STATUS_SQL}
end`

function readQueryString(req: HttpRequest, key: string, max = 120) {
  const raw = (req.query as Record<string, unknown>)?.[key]
  if (typeof raw === "string") return normalizeText(raw, max)
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === "string")
    return typeof first === "string" ? normalizeText(first, max) : ""
  }
  return ""
}

function parseBoundedInt(input: unknown, fallback: number, min: number, max: number) {
  if (typeof input === "string" && !input.trim()) return fallback
  const value = typeof input === "number" ? input : Number(input)
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function parseOrderSort(input: string): OrderSort {
  const value = normalizeText(input, 30).toLowerCase()
  if (value === "created_asc") return "created_asc"
  if (value === "total_desc") return "total_desc"
  if (value === "total_asc") return "total_asc"
  return "created_desc"
}

function normalizePaymentStatusFilter(input: string) {
  const value = normalizeText(input, 64).toLowerCase()
  if (!value) return ""
  if (value.includes("refund") || value.includes("reintegr") || value.includes("chargeback")) {
    return "refunded"
  }
  if (
    value.includes("fail") ||
    value.includes("reject") ||
    value.includes("denied") ||
    value.includes("cancel")
  ) {
    return "failed"
  }
  if (
    value.includes("paid") ||
    value.includes("approve") ||
    value.includes("accredit") ||
    value.includes("success")
  ) {
    return "paid"
  }
  if (value.includes("pend")) return "pending"
  return value
}

function parseDateBoundary(raw: string, boundary: "start" | "end") {
  const value = normalizeText(raw, 80)
  if (!value) return null

  const match = DATE_ONLY_PATTERN.exec(value)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null
    }

    const date = new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        boundary === "start" ? 0 : 23,
        boundary === "start" ? 0 : 59,
        boundary === "start" ? 0 : 59,
        boundary === "start" ? 0 : 999
      )
    )
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null
    }
    return date
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const limit = parseBoundedInt(
    readQueryString(req, "limit", 20),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT
  )
  const offset = parseBoundedInt(readQueryString(req, "offset", 20), 0, 0, MAX_OFFSET)

  const search = normalizeText(
    readQueryString(req, "q", 180) || readQueryString(req, "search", 180),
    180
  )
  const statusFilter = normalizeText(readQueryString(req, "status", 64), 64).toLowerCase()
  const paymentFilter = normalizePaymentStatusFilter(
    readQueryString(req, "payment_status", 64) ||
      readQueryString(req, "paymentStatus", 64) ||
      readQueryString(req, "payment", 64)
  )
  const sort = parseOrderSort(readQueryString(req, "sort", 30))

  const rawFrom = readQueryString(req, "from", 80)
  const rawTo = readQueryString(req, "to", 80)
  let fromValue = rawFrom
  let toValue = rawTo

  const fromForCompare = parseDateBoundary(rawFrom, "start")
  const toForCompare = parseDateBoundary(rawTo, "end")
  if (
    fromForCompare &&
    toForCompare &&
    fromForCompare.getTime() > toForCompare.getTime()
  ) {
    fromValue = rawTo
    toValue = rawFrom
  }

  const fromDate = parseDateBoundary(fromValue, "start")
  const toDate = parseDateBoundary(toValue, "end")

  const params: unknown[] = []
  const where: string[] = [`o."deleted_at" is null`]

  if (search) {
    params.push(`%${search}%`)
    const idx = `$${params.length}`
    where.push(`(
      o."id" ilike ${idx}
      or o."order_number" ilike ${idx}
      or o."email" ilike ${idx}
      or o."phone" ilike ${idx}
      or o."tracking_code" ilike ${idx}
      or concat_ws(
        ' ',
        coalesce(o."metadata"->'customer'->>'first_name', ''),
        coalesce(o."metadata"->'customer'->>'firstName', ''),
        coalesce(o."metadata"->'customer'->>'last_name', ''),
        coalesce(o."metadata"->'customer'->>'lastName', ''),
        coalesce(o."metadata"->'customer_data'->>'first_name', ''),
        coalesce(o."metadata"->'customer_data'->>'firstName', ''),
        coalesce(o."metadata"->'customer_data'->>'last_name', ''),
        coalesce(o."metadata"->'customer_data'->>'lastName', '')
      ) ilike ${idx}
    )`)
  }

  if (
    statusFilter &&
    statusFilter !== "all" &&
    VALID_STATUS_FILTERS.has(statusFilter)
  ) {
    params.push(statusFilter)
    where.push(`${NORMALIZED_STATUS_SQL} = $${params.length}`)
  }

  if (
    paymentFilter &&
    paymentFilter !== "all" &&
    VALID_PAYMENT_STATUS_FILTERS.has(paymentFilter)
  ) {
    params.push(paymentFilter)
    where.push(`${NORMALIZED_PAYMENT_STATUS_SQL} = $${params.length}`)
  }

  if (fromDate) {
    params.push(fromDate.toISOString())
    where.push(`o."created_at" >= $${params.length}::timestamptz`)
  }

  if (toDate) {
    params.push(toDate.toISOString())
    where.push(`o."created_at" <= $${params.length}::timestamptz`)
  }

  const whereSql = ` where ${where.join(" and ")}`
  const orderSql =
    sort === "created_asc"
      ? `order by o."created_at" asc nulls last, o."id" asc`
      : sort === "total_desc"
        ? `order by o."total_ars" desc nulls last, o."created_at" desc nulls last, o."id" asc`
        : sort === "total_asc"
          ? `order by o."total_ars" asc nulls last, o."created_at" desc nulls last, o."id" asc`
          : `order by o."created_at" desc nulls last, o."id" asc`

  const limitIdx = params.length + 1
  const offsetIdx = params.length + 2

  const ordersSql = `select o.*
    from "mp_customer_order" o${whereSql}
    ${orderSql}
    limit $${limitIdx} offset $${offsetIdx};`
  const countSql = `select count(*)::int as "count"
    from "mp_customer_order" o${whereSql};`

  const [orders, countRows] = await Promise.all([
    pgQuery<Record<string, unknown>>(ordersSql, [...params, limit, offset]),
    pgQuery<{ count: number | string }>(countSql, params),
  ])

  const count = Math.max(0, Number(countRows[0]?.count ?? 0) || 0)

  return res.json({
    orders,
    count,
    limit,
    offset,
  })
}
