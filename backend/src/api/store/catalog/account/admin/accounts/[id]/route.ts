import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../../../lib/http"
import { pgQuery } from "../../../../../../../lib/pg"

import {
  getCustomerAuthService,
  mapPublicAccount,
  normalizeDocumentNumber,
  normalizePhone,
  normalizeText,
  requireCustomerAdministrator,
} from "../../../../_shared/customer-auth"

const BLOCKED_UNTIL_FAR_FUTURE = "2099-12-31T23:59:59.000Z"
const DEFAULT_DETAIL_ORDERS_LIMIT = 12
const MAX_DETAIL_ORDERS_LIMIT = 40

function readQueryString(req: HttpRequest, key: string, max = 40) {
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

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function normalizeEmail(input: unknown) {
  return normalizeText(input, 180).toLowerCase()
}

function parseBool(raw: unknown) {
  if (typeof raw === "boolean") return raw
  if (typeof raw !== "string") return null

  const value = normalizeText(raw, 10).toLowerCase()
  if (value === "true" || value === "1" || value === "yes") return true
  if (value === "false" || value === "0" || value === "no") return false
  return null
}

function parseBlockedUntil(raw: unknown) {
  if (raw === null) return null

  if (typeof raw === "string" || typeof raw === "number") {
    const value = typeof raw === "string" ? normalizeText(raw, 80) : raw
    if (!value) return null
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) {
      throw new HttpError(
        HttpError.Types.INVALID_DATA,
        "blocked_until must be null or a valid ISO date."
      )
    }
    return date
  }

  throw new HttpError(
    HttpError.Types.INVALID_DATA,
    "blocked_until must be null or a valid ISO date."
  )
}

function mapAdminAccount(entry: Record<string, unknown>) {
  return {
    ...mapPublicAccount(entry as Record<string, any>),
    admin_notes: normalizeText(entry.admin_notes, 4000) || "",
  }
}

async function getAdminAccountDetailRecord(accountId: string) {
  const rows = await pgQuery<Record<string, unknown>>(
    `select
       a.*,
       coalesce(addr."addresses", '[]'::jsonb) as "addresses",
       coalesce(stats."orders_count", 0)::int as "orders_count",
       coalesce(stats."total_spent_ars", 0)::bigint as "total_spent_ars",
       case
         when coalesce(stats."orders_count", 0) > 0
           then round(coalesce(stats."total_spent_ars", 0)::numeric / stats."orders_count", 2)
         else 0::numeric
       end as "avg_ticket_ars",
       stats."last_purchase_at" as "last_purchase_at",
       case
         when greatest(
           coalesce(extract(epoch from stats."last_purchase_at"), 0),
           coalesce(extract(epoch from a."last_login_at"), 0),
           coalesce(extract(epoch from a."updated_at"), 0)
         ) > 0
           then to_timestamp(
             greatest(
               coalesce(extract(epoch from stats."last_purchase_at"), 0),
               coalesce(extract(epoch from a."last_login_at"), 0),
               coalesce(extract(epoch from a."updated_at"), 0)
             )
           )
         else null
       end as "last_activity_at"
     from "mp_customer_account" a
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
         and ad."account_id" = a."id"
     ) addr on true
     left join lateral (
       select
         count(o."id")::int as "orders_count",
         coalesce(sum(greatest(o."total_ars", 0)), 0)::bigint as "total_spent_ars",
         max(o."created_at") as "last_purchase_at"
       from "mp_customer_order" o
       where o."deleted_at" is null
         and (
           (nullif(trim(o."account_id"), '') is not null and o."account_id" = a."id")
           or (
             nullif(trim(a."email"), '') is not null
             and lower(trim(coalesce(o."email", ''))) = lower(trim(a."email"))
           )
         )
     ) stats on true
     where a."deleted_at" is null
       and a."id" = $1
     limit 1;`,
    [accountId]
  )

  return rows[0] ?? null
}

async function listAdminAccountOrders(
  accountId: string,
  email: string,
  limit: number,
  offset: number
) {
  return await pgQuery<Record<string, unknown>>(
    `select *
     from "mp_customer_order"
     where "deleted_at" is null
       and (
         (nullif(trim("account_id"), '') is not null and "account_id" = $1)
         or (
           nullif(trim($2::text), '') is not null
           and lower(trim(coalesce("email", ''))) = lower(trim($2::text))
         )
       )
     order by "created_at" desc nulls last, "id" asc
     limit $3 offset $4;`,
    [accountId, email, limit, offset]
  )
}

async function countAdminAccountOrders(accountId: string, email: string) {
  const rows = await pgQuery<{ count: number | string }>(
    `select count(*)::int as "count"
     from "mp_customer_order"
     where "deleted_at" is null
       and (
         (nullif(trim("account_id"), '') is not null and "account_id" = $1)
         or (
           nullif(trim($2::text), '') is not null
           and lower(trim(coalesce("email", ''))) = lower(trim($2::text))
         )
       );`,
    [accountId, email]
  )

  return Math.max(0, Number(rows[0]?.count ?? 0) || 0)
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdministrator(req, res)

  const accountId = normalizeText(req.params.id, 120)
  if (!accountId) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Account id is required.")
  }
  const ordersLimit = parseBoundedInt(
    readQueryString(req, "orders_limit", 20) || readQueryString(req, "limit", 20),
    DEFAULT_DETAIL_ORDERS_LIMIT,
    1,
    MAX_DETAIL_ORDERS_LIMIT
  )
  const ordersOffset = parseBoundedInt(
    readQueryString(req, "orders_offset", 20) || readQueryString(req, "offset", 20),
    0,
    0,
    1_000_000
  )

  const account = await getAdminAccountDetailRecord(accountId)
  if (!account) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Account not found.")
  }

  const normalizedEmail = normalizeEmail(account.email)
  const [orders, ordersTotalCount] = await Promise.all([
    listAdminAccountOrders(accountId, normalizedEmail, ordersLimit, ordersOffset),
    countAdminAccountOrders(accountId, normalizedEmail),
  ])

  return res.json({
    account: {
      ...mapAdminAccount(account),
      addresses: Array.isArray(account.addresses) ? account.addresses : [],
      orders_count: Math.max(0, Number(account.orders_count ?? 0) || 0),
      total_spent_ars: Math.max(0, Number(account.total_spent_ars ?? 0) || 0),
      avg_ticket_ars: Math.max(0, Number(account.avg_ticket_ars ?? 0) || 0),
      last_purchase_at:
        typeof account.last_purchase_at === "string"
          ? account.last_purchase_at
          : account.last_purchase_at ?? null,
      last_activity_at:
        typeof account.last_activity_at === "string"
          ? account.last_activity_at
          : account.last_activity_at ?? null,
    },
    orders,
    orders_total_count: ordersTotalCount,
    orders_limit: ordersLimit,
    orders_offset: ordersOffset,
  })
}

export async function PATCH(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdministrator(req, res)

  const service = getCustomerAuthService(req)
  const accountId = normalizeText(req.params.id, 120)
  if (!accountId) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Account id is required.")
  }

  const found = await service.listCustomerAccounts({ id: accountId }, { take: 1 })
  const current = found[0]
  if (!current) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Account not found.")
  }

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {}

  const data: Record<string, unknown> = {}

  if (hasOwn(body, "email")) {
    const nextEmail = normalizeEmail(body.email)
    if (!nextEmail) {
      throw new HttpError(HttpError.Types.INVALID_DATA, "email must be a valid address.")
    }

    const existing = await service.listCustomerAccounts({ email: nextEmail }, { take: 2 })
    const usedByAnother = existing.some((entry: Record<string, unknown>) => entry.id !== accountId)
    if (usedByAnother) {
      throw new HttpError(HttpError.Types.INVALID_DATA, "Email already in use.")
    }

    data.email = nextEmail
  }

  if (hasOwn(body, "first_name") || hasOwn(body, "firstName")) {
    data.first_name = normalizeText(body.first_name ?? body.firstName, 80) || null
  }

  if (hasOwn(body, "last_name") || hasOwn(body, "lastName")) {
    data.last_name = normalizeText(body.last_name ?? body.lastName, 80) || null
  }

  if (hasOwn(body, "document_number") || hasOwn(body, "documentNumber")) {
    data.document_number = normalizeDocumentNumber(body.document_number ?? body.documentNumber) || null
  }

  if (hasOwn(body, "phone")) {
    data.phone = normalizePhone(body.phone) || null
  }

  if (hasOwn(body, "whatsapp")) {
    data.whatsapp = normalizePhone(body.whatsapp) || null
  }

  const hasBlockedFlag = hasOwn(body, "blocked")
  const hasBlockedUntil = hasOwn(body, "blocked_until") || hasOwn(body, "blockedUntil")

  if (hasBlockedFlag && hasBlockedUntil) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "Provide either blocked or blocked_until, not both."
    )
  }

  if (hasBlockedFlag) {
    const blocked = parseBool(body.blocked)
    if (blocked === null) {
      throw new HttpError(HttpError.Types.INVALID_DATA, "blocked must be a boolean.")
    }
    data.blocked_until = blocked ? new Date(BLOCKED_UNTIL_FAR_FUTURE) : null
  } else if (hasBlockedUntil) {
    data.blocked_until = parseBlockedUntil(body.blocked_until ?? body.blockedUntil)
  }

  if (hasOwn(body, "admin_notes") || hasOwn(body, "adminNotes")) {
    data.admin_notes = normalizeText(body.admin_notes ?? body.adminNotes, 4000) || ""
  }

  if (!Object.keys(data).length) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "No editable fields provided. Allowed: email, first_name, last_name, document_number, phone, whatsapp, blocked, blocked_until, admin_notes."
    )
  }

  await service.updateCustomerAccounts({
    selector: { id: accountId },
    data,
  })

  const refreshed = await service.listCustomerAccounts({ id: accountId }, { take: 1 })
  const account = refreshed[0]
  if (!account) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Account not found.")
  }

  return res.json({ account: mapAdminAccount(account) })
}
