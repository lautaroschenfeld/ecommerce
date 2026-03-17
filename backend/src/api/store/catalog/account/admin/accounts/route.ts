import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"
import { pgQuery } from "../../../../../../lib/pg"

import {
  mapPublicAccount,
  normalizeText,
  requireCustomerAdministrator,
} from "../../../_shared/customer-auth"

type AdminAccountsSort = "latest_purchase" | "total_spent" | "newest"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MAX_OFFSET = 1_000_000
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const VALID_ROLE_FILTERS = new Set(["administrator", "employee", "user"])
const VALID_STATUS_FILTERS = new Set(["active", "blocked"])

function mapAdminAccount(entry: Record<string, unknown>) {
  return {
    ...mapPublicAccount(entry as Record<string, any>),
    admin_notes: normalizeText(entry.admin_notes, 4000) || "",
    addresses: Array.isArray(entry.addresses) ? entry.addresses : [],
    orders_count: Math.max(0, Number(entry.orders_count ?? 0) || 0),
    total_spent_ars: Math.max(0, Number(entry.total_spent_ars ?? 0) || 0),
    avg_ticket_ars: Math.max(0, Number(entry.avg_ticket_ars ?? 0) || 0),
    last_purchase_at:
      typeof entry.last_purchase_at === "string" ? entry.last_purchase_at : entry.last_purchase_at ?? null,
    last_activity_at:
      typeof entry.last_activity_at === "string" ? entry.last_activity_at : entry.last_activity_at ?? null,
  }
}

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

function parseAdminAccountsSort(input: string): AdminAccountsSort {
  const value = normalizeText(input, 40).toLowerCase()
  if (value === "total_spent") return "total_spent"
  if (value === "newest") return "newest"
  return "latest_purchase"
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdministrator(req, res)

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
  const roleFilter = normalizeText(readQueryString(req, "role", 40), 40).toLowerCase()
  const statusFilter = normalizeText(readQueryString(req, "status", 40), 40).toLowerCase()
  const sort = parseAdminAccountsSort(readQueryString(req, "sort", 40))

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
  const where: string[] = [`a."deleted_at" is null`]

  if (search) {
    params.push(`%${search}%`)
    const idx = `$${params.length}`
    where.push(`(
      a."id" ilike ${idx}
      or a."email" ilike ${idx}
      or a."phone" ilike ${idx}
      or a."whatsapp" ilike ${idx}
      or concat_ws(
        ' ',
        coalesce(a."first_name", ''),
        coalesce(a."last_name", '')
      ) ilike ${idx}
    )`)
  }

  if (roleFilter && roleFilter !== "all" && VALID_ROLE_FILTERS.has(roleFilter)) {
    params.push(roleFilter)
    where.push(`lower(trim(coalesce(a."role", ''))) = $${params.length}`)
  }

  if (statusFilter && statusFilter !== "all" && VALID_STATUS_FILTERS.has(statusFilter)) {
    where.push(
      statusFilter === "blocked"
        ? `a."blocked_until" is not null and a."blocked_until" > now()`
        : `(a."blocked_until" is null or a."blocked_until" <= now())`
    )
  }

  if (fromDate) {
    params.push(fromDate.toISOString())
    where.push(`a."created_at" >= $${params.length}::timestamptz`)
  }

  if (toDate) {
    params.push(toDate.toISOString())
    where.push(`a."created_at" <= $${params.length}::timestamptz`)
  }

  const filteredBaseSql = `
    from "mp_customer_account" a
    where ${where.join(" and ")}
  `

  const orderSql =
    sort === "total_spent"
      ? `order by
          r."total_spent_ars" desc,
          r."last_purchase_at" desc nulls last,
          r."created_at" desc nulls last,
          r."id" asc`
      : sort === "newest"
        ? `order by
            r."created_at" desc nulls last,
            r."id" asc`
        : `order by
            r."last_purchase_at" desc nulls last,
            r."created_at" desc nulls last,
            r."id" asc`

  const limitIdx = params.length + 1
  const offsetIdx = params.length + 2

  const accountsSql = `
    with filtered_accounts as (
      select a.*
      ${filteredBaseSql}
    ),
    account_stats as (
      select
        fa."id" as "account_id",
        count(o."id")::int as "orders_count",
        coalesce(sum(greatest(o."total_ars", 0)), 0)::bigint as "total_spent_ars",
        max(o."created_at") as "last_purchase_at"
      from filtered_accounts fa
      left join "mp_customer_order" o
        on o."deleted_at" is null
       and (
         (nullif(trim(o."account_id"), '') is not null and o."account_id" = fa."id")
         or (
           nullif(trim(fa."email"), '') is not null
           and lower(trim(coalesce(o."email", ''))) = lower(trim(fa."email"))
         )
       )
      group by fa."id"
    ),
    ranked_accounts as (
      select
        fa.*,
        coalesce(stats."orders_count", 0)::int as "orders_count",
        coalesce(stats."total_spent_ars", 0)::bigint as "total_spent_ars",
        case
          when coalesce(stats."orders_count", 0) > 0
            then round(coalesce(stats."total_spent_ars", 0)::numeric / stats."orders_count", 2)
          else 0::numeric
        end as "avg_ticket_ars",
        stats."last_purchase_at" as "last_purchase_at",
        greatest(
          coalesce(extract(epoch from stats."last_purchase_at"), 0),
          coalesce(extract(epoch from fa."last_login_at"), 0),
          coalesce(extract(epoch from fa."updated_at"), 0)
        ) as "last_activity_epoch"
      from filtered_accounts fa
      left join account_stats stats
        on stats."account_id" = fa."id"
    )
    select
      r.*,
      case
        when r."last_activity_epoch" > 0
          then to_timestamp(r."last_activity_epoch")
        else null
      end as "last_activity_at",
      coalesce(addr."addresses", '[]'::jsonb) as "addresses"
    from ranked_accounts r
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'label', coalesce(ad."label", ''),
          'line1', coalesce(ad."line1", ''),
          'city', coalesce(ad."city", ''),
          'province', coalesce(ad."province", ''),
          'postal_code', coalesce(ad."postal_code", '')
        )
        order by ad."is_default" desc, ad."created_at" asc, ad."id" asc
      ) as "addresses"
      from "mp_customer_address" ad
      where ad."deleted_at" is null
        and ad."account_id" = r."id"
    ) addr on true
    ${orderSql}
    limit $${limitIdx} offset $${offsetIdx};
  `

  const countSql = `select count(*)::int as "count" ${filteredBaseSql};`

  const [accounts, countRows] = await Promise.all([
    pgQuery<Record<string, unknown>>(accountsSql, [...params, limit, offset]),
    pgQuery<{ count: number | string }>(countSql, params),
  ])

  const mapped = accounts.map((entry) => mapAdminAccount(entry))
  const count = Math.max(0, Number(countRows[0]?.count ?? 0) || 0)

  return res.json({
    accounts: mapped,
    count,
    limit,
    offset,
  })
}
