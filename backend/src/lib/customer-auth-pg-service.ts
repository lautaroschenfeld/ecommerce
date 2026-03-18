import { nanoId, prefixedNanoId } from "./id"

import { pgQuery } from "./pg"

type ListConfig = {
  take?: number
  skip?: number
  order?: Record<string, "ASC" | "DESC" | "asc" | "desc">
}

type UpdateInput = {
  selector: Record<string, unknown>
  data: Record<string, unknown>
}

type JsonbUpdateOptions = {
  jsonbFields?: string[]
}

function clampTake(value: unknown, fallback = 50, max = 500) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.max(1, Math.min(max, Math.trunc(parsed)))
}

function clampSkip(value: unknown, fallback = 0, max = 1_000_000) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.max(0, Math.min(max, Math.trunc(parsed)))
}

function normalizeOrder(order?: ListConfig["order"], allowed: string[] = []) {
  if (!order) return ""
  const [entry] = Object.entries(order)
  if (!entry) return ""
  const [rawField, rawDir] = entry
  const field = String(rawField || "")
  if (!allowed.includes(field)) return ""
  const dir = String(rawDir || "").toUpperCase() === "ASC" ? "ASC" : "DESC"
  return ` ORDER BY \"${field}\" ${dir}`
}

function buildWhere(
  filters: Record<string, unknown> | null | undefined,
  allowedFields: string[],
  params: unknown[]
) {
  const clauses: string[] = ['"deleted_at" is null']

  const entries = Object.entries(filters ?? {})
  for (const [key, value] of entries) {
    if (!allowedFields.includes(key)) continue
    if (value === undefined) continue
    if (value === null) {
      clauses.push(`\"${key}\" is null`)
      continue
    }
    params.push(value)
    clauses.push(`\"${key}\" = $${params.length}`)
  }

  return ` WHERE ${clauses.join(" AND ")}`
}

function buildUpdateSet(
  data: Record<string, unknown>,
  allowedFields: string[],
  params: unknown[],
  options?: JsonbUpdateOptions
) {
  const entries = Object.entries(data ?? {})
  const sets: string[] = []
  const jsonbFields = new Set((options?.jsonbFields ?? []).filter(Boolean))

  for (const [key, value] of entries) {
    if (!allowedFields.includes(key)) continue
    if (value === undefined) continue

    if (jsonbFields.has(key)) {
      params.push(toJsonbParam(value))
      sets.push(`\"${key}\" = $${params.length}::jsonb`)
      continue
    }

    params.push(value)
    sets.push(`\"${key}\" = $${params.length}`)
  }

  // Always bump updated_at on writes.
  sets.push(`\"updated_at\" = now()`)

  return sets
}

function selectorId(selector: Record<string, unknown>) {
  const id = selector?.id
  if (typeof id !== "string" || !id.trim()) return ""
  return id.trim()
}

function toJsonbParam(value: unknown) {
  if (value === null) return null
  try {
    const json = JSON.stringify(value)
    return typeof json === "string" ? json : "null"
  } catch {
    return "null"
  }
}

export class CustomerAuthPgService {
  async listCustomerAccounts(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "email", "role"], params)
    const order = normalizeOrder(config?.order, ["created_at", "updated_at", "email", "role"])
    const take = clampTake(config?.take, 50, 500)
    params.push(take)

    return await pgQuery(
      `select * from "mp_customer_account"${where}${order} limit $${params.length};`,
      params
    )
  }

  async createCustomerAccounts(input: Record<string, unknown>) {
    const id = nanoId()
    const params = [
      id,
      input.email ?? null,
      input.password_hash ?? null,
      input.first_name ?? null,
      input.last_name ?? null,
      input.document_number ?? null,
      input.phone ?? null,
      input.whatsapp ?? null,
      input.admin_notes ?? null,
      toJsonbParam(input.notifications ?? { email: true, whatsapp: false }),
      input.role ?? "user",
      input.failed_login_count ?? 0,
      input.blocked_until ?? null,
      input.last_login_at ?? null,
    ]

    const rows = await pgQuery(
      `insert into "mp_customer_account"
        ("id","email","password_hash","first_name","last_name","document_number","phone","whatsapp","admin_notes","notifications","role","failed_login_count","blocked_until","last_login_at","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,now(),now(),null)
       returning *;`,
      params
    )

    return rows[0]
  }

  async updateCustomerAccounts(input: UpdateInput) {
    const id = selectorId(input.selector)
    if (!id) return

    const params: unknown[] = [id]
    const set = buildUpdateSet(
      input.data,
      [
        "email",
        "password_hash",
        "first_name",
        "last_name",
        "document_number",
        "phone",
        "whatsapp",
        "admin_notes",
        "notifications",
        "role",
        "failed_login_count",
        "blocked_until",
        "last_login_at",
      ],
      params
      ,
      { jsonbFields: ["notifications"] }
    )

    if (set.length === 1) return

    await pgQuery(
      `update "mp_customer_account"
       set ${set.join(", ")}
       where "id" = $1 and "deleted_at" is null;`,
      params
    )
  }

  async listCustomerSessions(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(
      filters,
      ["id", "account_id", "access_token_hash", "refresh_token_hash"],
      params
    )
    const order = normalizeOrder(config?.order, ["created_at", "updated_at"])
    const take = clampTake(config?.take, 50, 500)
    params.push(take)

    return await pgQuery(
      `select * from "mp_customer_session"${where}${order} limit $${params.length};`,
      params
    )
  }

  async createCustomerSessions(input: Record<string, unknown>) {
    const id = prefixedNanoId("cses")

    const params = [
      id,
      input.account_id ?? null,
      input.access_token_hash ?? null,
      input.refresh_token_hash ?? null,
      input.access_expires_at ?? null,
      input.refresh_expires_at ?? null,
      input.revoked_at ?? null,
      input.ip_address ?? null,
      input.user_agent ?? null,
      input.created_by ?? "password",
    ]

    const rows = await pgQuery(
      `insert into "mp_customer_session"
        ("id","account_id","access_token_hash","refresh_token_hash","access_expires_at","refresh_expires_at","revoked_at","ip_address","user_agent","created_by","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now(),null)
       returning *;`,
      params
    )

    return rows[0]
  }

  async updateCustomerSessions(input: UpdateInput) {
    const id = selectorId(input.selector)
    if (!id) return

    const params: unknown[] = [id]
    const set = buildUpdateSet(
      input.data,
      [
        "access_token_hash",
        "refresh_token_hash",
        "access_expires_at",
        "refresh_expires_at",
        "revoked_at",
        "ip_address",
        "user_agent",
        "created_by",
      ],
      params
    )

    if (set.length === 1) return

    await pgQuery(
      `update "mp_customer_session"
       set ${set.join(", ")}
       where "id" = $1 and "deleted_at" is null;`,
      params
    )
  }

  async createAuthAuditLogs(input: Record<string, unknown>) {
    const id = prefixedNanoId("caud")
    const params = [
      id,
      input.account_id ?? null,
      input.event ?? null,
      input.success ?? true,
      input.ip_address ?? null,
      input.user_agent ?? null,
      toJsonbParam(input.metadata ?? {}),
    ]

    const rows = await pgQuery(
      `insert into "mp_auth_audit_log"
        ("id","account_id","event","success","ip_address","user_agent","metadata","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,$4,$5,$6,$7::jsonb,now(),now(),null)
       returning *;`,
      params
    )

    return rows[0]
  }

  async listAuthAuditLogs(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "account_id", "event", "success"], params)
    const order = normalizeOrder(config?.order, ["created_at", "updated_at", "event"])
    const take = clampTake(config?.take, 50, 500)
    params.push(take)

    return await pgQuery(
      `select * from "mp_auth_audit_log"${where}${order} limit $${params.length};`,
      params
    )
  }

  async listCustomerCarts(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "account_id"], params)
    const order = normalizeOrder(config?.order, ["created_at", "updated_at"])
    const take = clampTake(config?.take, 50, 50)
    params.push(take)

    return await pgQuery(
      `select * from "mp_customer_cart"${where}${order} limit $${params.length};`,
      params
    )
  }

  async createCustomerCarts(input: Record<string, unknown>) {
    const id = prefixedNanoId("ccart")
    const params = [
      id,
      input.account_id ?? null,
      toJsonbParam(input.items ?? []),
      input.updated_at_override ?? null,
    ]

    const rows = await pgQuery(
      `insert into "mp_customer_cart"
        ("id","account_id","items","updated_at_override","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3::jsonb,$4,now(),now(),null)
       returning *;`,
      params
    )
    return rows[0]
  }

  async updateCustomerCarts(input: UpdateInput) {
    const id = selectorId(input.selector)
    if (!id) return

    const params: unknown[] = [id]
    const set = buildUpdateSet(
      input.data,
      ["account_id", "items", "updated_at_override"],
      params
      ,
      { jsonbFields: ["items"] }
    )

    if (set.length === 1) return

    await pgQuery(
      `update "mp_customer_cart"
       set ${set.join(", ")}
       where "id" = $1 and "deleted_at" is null;`,
      params
    )
  }

  async listCustomerAddresses(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "account_id"], params)
    const order = normalizeOrder(config?.order, ["created_at", "updated_at"])
    const take = clampTake(config?.take, 100, 500)
    params.push(take)

    return await pgQuery(
      `select * from "mp_customer_address"${where}${order} limit $${params.length};`,
      params
    )
  }

  async createCustomerAddresses(input: Record<string, unknown>) {
    const id = prefixedNanoId("caddr")
    const params = [
      id,
      input.account_id ?? null,
      input.label ?? "Address",
      input.recipient ?? null,
      input.phone ?? null,
      input.line1 ?? null,
      input.street_number ?? null,
      input.line2 ?? null,
      input.city ?? null,
      input.province ?? null,
      input.postal_code ?? null,
      input.is_default ?? false,
    ]

    const rows = await pgQuery(
      `insert into "mp_customer_address"
        ("id","account_id","label","recipient","phone","line1","street_number","line2","city","province","postal_code","is_default","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now(),null)
       returning *;`,
      params
    )

    return rows[0]
  }

  async updateCustomerAddresses(input: UpdateInput) {
    const id = selectorId(input.selector)
    if (!id) return

    const params: unknown[] = [id]
    const set = buildUpdateSet(
      input.data,
      [
        "label",
        "recipient",
        "phone",
        "line1",
        "street_number",
        "line2",
        "city",
        "province",
        "postal_code",
        "is_default",
      ],
      params
    )

    if (set.length === 1) return

    await pgQuery(
      `update "mp_customer_address"
       set ${set.join(", ")}
       where "id" = $1 and "deleted_at" is null;`,
      params
    )
  }

  async deleteCustomerAddresses(ids: string[]) {
    const safeIds = (ids ?? []).filter((id) => typeof id === "string" && id.trim())
    if (!safeIds.length) return

    await pgQuery(
      `update "mp_customer_address"
       set "deleted_at" = now(), "updated_at" = now()
       where "id" = any($1::text[]) and "deleted_at" is null;`,
      [safeIds]
    )
  }

  async listCustomerOrders(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "account_id", "email", "order_number"], params)
    const order = normalizeOrder(config?.order, ["created_at", "updated_at"])
    const take = clampTake(config?.take, 50, 200)
    params.push(take)

    return await pgQuery(
      `select * from "mp_customer_order"${where}${order} limit $${params.length};`,
      params
    )
  }

  async createCustomerOrders(input: Record<string, unknown>) {
    const id = prefixedNanoId("cord")
    const params = [
      id,
      input.order_number ?? null,
      input.account_id ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.status ?? null,
      input.payment_status ?? null,
      input.total_ars ?? 0,
      input.currency_code ?? null,
      input.item_count ?? 0,
      input.shipping_method ?? null,
      input.payment_method ?? null,
      input.tracking_code ?? null,
      toJsonbParam(input.items ?? []),
      toJsonbParam(input.metadata ?? {}),
    ]

    const rows = await pgQuery(
      `insert into "mp_customer_order"
        ("id","order_number","account_id","email","phone","status","payment_status","total_ars","currency_code","item_count","shipping_method","payment_method","tracking_code","items","metadata","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,now(),now(),null)
       returning *;`,
      params
    )

    return rows[0]
  }

  async updateCustomerOrders(input: UpdateInput) {
    const id = selectorId(input.selector)
    if (!id) return

    const params: unknown[] = [id]
    const set = buildUpdateSet(
      input.data,
      [
        "order_number",
        "account_id",
        "email",
        "phone",
        "status",
        "payment_status",
        "total_ars",
        "currency_code",
        "item_count",
        "shipping_method",
        "payment_method",
        "tracking_code",
        "items",
        "metadata",
      ],
      params,
      { jsonbFields: ["items", "metadata"] }
    )

    if (set.length === 1) return

    await pgQuery(
      `update "mp_customer_order"
       set ${set.join(", ")}
       where "id" = $1 and "deleted_at" is null;`,
      params
    )
  }

  async listCustomerFavoriteProducts(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "account_id", "product_id"], params)
    const order = normalizeOrder(config?.order, ["created_at", "updated_at", "product_id"])
    const take = clampTake(config?.take, 100, 1000)
    params.push(take)

    return await pgQuery(
      `select * from "mp_customer_favorite_product"${where}${order} limit $${params.length};`,
      params
    )
  }

  async createCustomerFavoriteProducts(input: Record<string, unknown>) {
    const id = prefixedNanoId("cfav")
    const params = [
      id,
      input.account_id ?? null,
      input.product_id ?? null,
    ]

    const rows = await pgQuery(
      `insert into "mp_customer_favorite_product"
        ("id","account_id","product_id","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,now(),now(),null)
       on conflict ("account_id", "product_id")
       do update
         set "deleted_at" = null,
             "updated_at" = now(),
             "created_at" = now()
       returning *;`,
      params
    )

    return rows[0]
  }

  async deleteCustomerFavoriteProducts(input: {
    accountId: string
    productIds: string[]
  }) {
    const accountId = typeof input.accountId === "string" ? input.accountId.trim() : ""
    if (!accountId) return

    const safeProductIds = (input.productIds ?? [])
      .filter((id) => typeof id === "string" && id.trim())
      .map((id) => id.trim())
    if (!safeProductIds.length) return

    await pgQuery(
      `update "mp_customer_favorite_product"
       set "deleted_at" = now(),
           "updated_at" = now()
       where "account_id" = $1
         and "product_id" = any($2::text[])
         and "deleted_at" is null;`,
      [accountId, safeProductIds]
    )
  }

  async listCustomerLists(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "account_id", "name"], params)
    const order = normalizeOrder(config?.order, ["created_at", "updated_at", "name"])
    const take = clampTake(config?.take, 100, 1000)
    params.push(take)

    return await pgQuery(
      `select * from "mp_customer_list"${where}${order} limit $${params.length};`,
      params
    )
  }

  async createCustomerLists(input: Record<string, unknown>) {
    const id = prefixedNanoId("clst")
    const params = [
      id,
      input.account_id ?? null,
      input.name ?? null,
    ]

    const rows = await pgQuery(
      `insert into "mp_customer_list"
        ("id","account_id","name","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,now(),now(),null)
       returning *;`,
      params
    )

    return rows[0]
  }

  async updateCustomerLists(input: UpdateInput) {
    const id = selectorId(input.selector)
    if (!id) return

    const params: unknown[] = [id]
    const set = buildUpdateSet(
      input.data,
      ["name"],
      params
    )

    if (set.length === 1) return

    await pgQuery(
      `update "mp_customer_list"
       set ${set.join(", ")}
       where "id" = $1 and "deleted_at" is null;`,
      params
    )
  }

  async deleteCustomerLists(input: { accountId: string; ids: string[] }) {
    const accountId = typeof input.accountId === "string" ? input.accountId.trim() : ""
    if (!accountId) return

    const safeIds = (input.ids ?? [])
      .filter((id) => typeof id === "string" && id.trim())
      .map((id) => id.trim())
    if (!safeIds.length) return

    await pgQuery(
      `update "mp_customer_list"
       set "deleted_at" = now(),
           "updated_at" = now()
       where "account_id" = $1
         and "id" = any($2::text[])
         and "deleted_at" is null;`,
      [accountId, safeIds]
    )
  }

  async listCustomerListItems(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "account_id", "list_id", "product_id"], params)
    const order = normalizeOrder(config?.order, ["created_at", "updated_at", "list_id", "product_id"])
    const take = clampTake(config?.take, 300, 5000)
    params.push(take)

    return await pgQuery(
      `select * from "mp_customer_list_item"${where}${order} limit $${params.length};`,
      params
    )
  }

  async createCustomerListItems(input: Record<string, unknown>) {
    const id = prefixedNanoId("clit")
    const params = [
      id,
      input.account_id ?? null,
      input.list_id ?? null,
      input.product_id ?? null,
    ]

    const rows = await pgQuery(
      `insert into "mp_customer_list_item"
        ("id","account_id","list_id","product_id","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,$4,now(),now(),null)
       on conflict ("list_id", "product_id")
       do update
         set "deleted_at" = null,
             "updated_at" = now(),
             "created_at" = now(),
             "account_id" = excluded."account_id"
       returning *;`,
      params
    )

    return rows[0]
  }

  async deleteCustomerListItems(input: {
    accountId: string
    listIds?: string[]
    productIds?: string[]
  }) {
    const accountId = typeof input.accountId === "string" ? input.accountId.trim() : ""
    if (!accountId) return

    const listIds = (input.listIds ?? [])
      .filter((id) => typeof id === "string" && id.trim())
      .map((id) => id.trim())
    const productIds = (input.productIds ?? [])
      .filter((id) => typeof id === "string" && id.trim())
      .map((id) => id.trim())

    const params: unknown[] = [accountId]
    const clauses = [`"account_id" = $1`, `"deleted_at" is null`]

    if (listIds.length) {
      params.push(listIds)
      clauses.push(`"list_id" = any($${params.length}::text[])`)
    }
    if (productIds.length) {
      params.push(productIds)
      clauses.push(`"product_id" = any($${params.length}::text[])`)
    }

    if (clauses.length <= 2) return

    await pgQuery(
      `update "mp_customer_list_item"
       set "deleted_at" = now(),
           "updated_at" = now()
       where ${clauses.join(" and ")};`,
      params
    )
  }

  async listPasswordResetTokens(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "account_id", "token_hash", "used_at"], params)
    const order = normalizeOrder(config?.order, ["created_at", "updated_at", "expires_at"])
    const take = clampTake(config?.take, 50, 500)
    params.push(take)

    return await pgQuery(
      `select * from "mp_password_reset_token"${where}${order} limit $${params.length};`,
      params
    )
  }

  async createPasswordResetTokens(input: Record<string, unknown>) {
    const id = prefixedNanoId("prt")
    const params = [
      id,
      input.account_id ?? null,
      input.token_hash ?? null,
      input.expires_at ?? null,
      input.used_at ?? null,
      input.requested_ip ?? null,
      input.requested_user_agent ?? null,
    ]

    const rows = await pgQuery(
      `insert into "mp_password_reset_token"
        ("id","account_id","token_hash","expires_at","used_at","requested_ip","requested_user_agent","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,$4,$5,$6,$7,now(),now(),null)
       returning *;`,
      params
    )

    return rows[0]
  }

  async updatePasswordResetTokens(input: UpdateInput) {
    const id = selectorId(input.selector)
    if (!id) return

    const params: unknown[] = [id]
    const set = buildUpdateSet(
      input.data,
      ["used_at", "expires_at", "requested_ip", "requested_user_agent"],
      params
    )

    if (set.length === 1) return

    await pgQuery(
      `update "mp_password_reset_token"
       set ${set.join(", ")}
       where "id" = $1 and "deleted_at" is null;`,
      params
    )
  }

  async listCoupons(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "code", "is_active"], params)
    const order = normalizeOrder(config?.order, ["created_at", "updated_at"])
    const take = clampTake(config?.take, 50, 500)
    const skip = clampSkip(config?.skip, 0, 1_000_000)
    params.push(take, skip)

    return await pgQuery(
      `select * from "mp_coupon"${where}${order} limit $${params.length - 1} offset $${params.length};`,
      params
    )
  }

  async countCoupons(filters: Record<string, unknown>) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "code", "is_active"], params)
    const rows = await pgQuery<{ count?: number | string }>(
      `select count(*)::int as "count" from "mp_coupon"${where};`,
      params
    )
    return Math.max(0, Number(rows[0]?.count ?? 0) || 0)
  }

  async createCoupons(input: Record<string, unknown>) {
    const id = prefixedNanoId("cpn")
    const params = [
      id,
      input.code ?? null,
      input.title ?? null,
      input.description ?? null,
      input.percentage_tenths ?? null,
      input.is_active ?? true,
      input.used_count ?? 0,
      toJsonbParam(input.metadata ?? {}),
    ]

    const rows = await pgQuery(
      `insert into "mp_coupon"
        ("id","code","title","description","percentage_tenths","is_active","used_count","metadata","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now(),now(),null)
       returning *;`,
      params
    )
    return rows[0]
  }

  async updateCoupons(input: UpdateInput) {
    const id = selectorId(input.selector)
    if (!id) return

    const params: unknown[] = [id]
    const set = buildUpdateSet(
      input.data,
      ["code", "title", "description", "percentage_tenths", "is_active", "used_count", "metadata"],
      params
      ,
      { jsonbFields: ["metadata"] }
    )

    if (set.length === 1) return

    await pgQuery(
      `update "mp_coupon"
       set ${set.join(", ")}
       where "id" = $1 and "deleted_at" is null;`,
      params
    )
  }

  async deleteCoupons(ids: string[]) {
    const safeIds = (ids ?? []).filter((id) => typeof id === "string" && id.trim())
    if (!safeIds.length) return

    await pgQuery(
      `update "mp_coupon"
       set "deleted_at" = now(), "updated_at" = now()
       where "id" = any($1::text[]) and "deleted_at" is null;`,
      [safeIds]
    )
  }

  async listShippingSettings(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "scope"], params)
    const take = clampTake(config?.take, 1, 10)
    params.push(take)

    return await pgQuery(
      `select * from "mp_shipping_setting"${where} limit $${params.length};`,
      params
    )
  }

  async createShippingSettings(input: Record<string, unknown>) {
    const id = prefixedNanoId("shps")
    const params = [
      id,
      input.scope ?? "default",
      input.free_shipping_threshold_ars ?? 50000,
      toJsonbParam(input.metadata ?? {}),
    ]

    const rows = await pgQuery(
      `insert into "mp_shipping_setting"
        ("id","scope","free_shipping_threshold_ars","metadata","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,$4::jsonb,now(),now(),null)
       returning *;`,
      params
    )
    return rows[0]
  }

  async updateShippingSettings(input: UpdateInput) {
    const id = selectorId(input.selector)
    if (!id) return

    const params: unknown[] = [id]
    const set = buildUpdateSet(
      input.data,
      ["scope", "free_shipping_threshold_ars", "metadata"],
      params
      ,
      { jsonbFields: ["metadata"] }
    )

    if (set.length === 1) return

    await pgQuery(
      `update "mp_shipping_setting"
       set ${set.join(", ")}
       where "id" = $1 and "deleted_at" is null;`,
      params
    )
  }

  async listStorefrontSettings(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const where = buildWhere(filters, ["id", "scope"], params)
    const take = clampTake(config?.take, 1, 10)
    params.push(take)

    return await pgQuery(
      `select * from "mp_storefront_setting"${where} limit $${params.length};`,
      params
    )
  }

  async createStorefrontSettings(input: Record<string, unknown>) {
    const id = prefixedNanoId("stfs")
    const params = [
      id,
      input.scope ?? "default",
      input.store_name ?? "Ecommerce",
      input.logo_url ?? null,
      input.primary_color ?? "#0b1220",
      input.accent_color ?? "#0ea5e9",
      toJsonbParam(input.metadata ?? {}),
    ]

    const rows = await pgQuery(
      `insert into "mp_storefront_setting"
        ("id","scope","store_name","logo_url","primary_color","accent_color","metadata","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,$4,$5,$6,$7::jsonb,now(),now(),null)
       returning *;`,
      params
    )
    return rows[0]
  }

  async updateStorefrontSettings(input: UpdateInput) {
    const id = selectorId(input.selector)
    if (!id) return

    const params: unknown[] = [id]
    const set = buildUpdateSet(
      input.data,
      ["scope", "store_name", "logo_url", "primary_color", "accent_color", "metadata"],
      params
      ,
      { jsonbFields: ["metadata"] }
    )

    if (set.length === 1) return

    await pgQuery(
      `update "mp_storefront_setting"
       set ${set.join(", ")}
       where "id" = $1 and "deleted_at" is null;`,
      params
    )
  }
}

let singleton: CustomerAuthPgService | null = null

export function getCustomerAuthPgService() {
  if (!singleton) singleton = new CustomerAuthPgService()
  return singleton
}
