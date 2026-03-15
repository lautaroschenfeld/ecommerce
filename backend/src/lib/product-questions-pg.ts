import { prefixedNanoId } from "./id"

import { pgQuery } from "./pg"

export type ProductQuestionStatus = "pending" | "answered"
export type AdminProductQuestionSort =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "updated_asc"

type StorefrontProductQuestionRow = {
  id: string
  question: string
  answer: string | null
  status: ProductQuestionStatus
  created_at: Date
  answered_at: Date | null
}

type ProductQuestionRow = {
  id: string
  product_id: string
  question: string
  answer: string | null
  status: ProductQuestionStatus
  customer_name: string | null
  customer_email: string | null
  answered_by_account_id: string | null
  answered_at: Date | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  product_title?: string | null
  product_handle?: string | null
}

const VALID_PRODUCT_QUESTION_STATUSES = new Set<ProductQuestionStatus>([
  "pending",
  "answered",
])

const VALID_ADMIN_PRODUCT_QUESTION_SORTS = new Set<AdminProductQuestionSort>([
  "created_desc",
  "created_asc",
  "updated_desc",
  "updated_asc",
])

function collapseSpaces(input: string) {
  return input.replace(/\s+/g, " ").trim()
}

function newProductQuestionId() {
  return prefixedNanoId("pq")
}

export function normalizeQuestionStatus(
  value: unknown,
  fallback: ProductQuestionStatus = "pending"
): ProductQuestionStatus {
  const normalized =
    typeof value === "string" ? collapseSpaces(value).toLowerCase() : ""
  if (VALID_PRODUCT_QUESTION_STATUSES.has(normalized as ProductQuestionStatus)) {
    return normalized as ProductQuestionStatus
  }
  return fallback
}

export function normalizeAdminProductQuestionSort(
  value: unknown,
  fallback: AdminProductQuestionSort = "created_desc"
): AdminProductQuestionSort {
  const normalized =
    typeof value === "string" ? collapseSpaces(value).toLowerCase() : ""
  if (VALID_ADMIN_PRODUCT_QUESTION_SORTS.has(normalized as AdminProductQuestionSort)) {
    return normalized as AdminProductQuestionSort
  }
  return fallback
}

export function normalizeQuestionText(value: unknown, max = 1200) {
  if (typeof value !== "string") return ""
  return collapseSpaces(value).slice(0, max)
}

export function normalizeOptionalText(value: unknown, max = 160) {
  const normalized = normalizeQuestionText(value, max)
  return normalized || null
}

export function normalizeOptionalEmail(value: unknown, max = 160) {
  const normalized = normalizeQuestionText(value, max).toLowerCase()
  if (!normalized) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null
  return normalized
}

export async function findPublishedProductSummary(productIdRaw: string) {
  const productId = normalizeQuestionText(productIdRaw, 120)
  if (!productId) return null

  const rows = await pgQuery<{ id: string; title: string; handle: string }>(
    `select "id", "title", "handle"
     from "product"
     where "id" = $1
       and "deleted_at" is null
       and "status" = 'published'
     limit 1;`,
    [productId]
  )

  const row = rows[0]
  if (!row?.id) return null
  return {
    id: String(row.id),
    title: String(row.title || ""),
    handle: String(row.handle || ""),
  }
}

export async function listStorefrontProductQuestions(input: {
  productId: string
  limit: number
  offset: number
}) {
  const rows = await pgQuery<StorefrontProductQuestionRow>(
    `select
      q."id",
      q."question",
      q."answer",
      q."status",
      q."created_at",
      q."answered_at"
    from "mp_product_question" q
    where q."deleted_at" is null
      and q."product_id" = $1
      and q."status" in ('pending', 'answered')
    order by q."created_at" desc nulls last, q."id" desc
    limit $2 offset $3;`,
    [input.productId, input.limit, input.offset]
  )

  const countRows = await pgQuery<{ count: number }>(
    `select count(*)::int as "count"
     from "mp_product_question" q
     where q."deleted_at" is null
       and q."product_id" = $1
       and q."status" in ('pending', 'answered');`,
    [input.productId]
  )

  return {
    questions: rows,
    count: Math.max(0, Number(countRows[0]?.count ?? 0) || 0),
  }
}

export async function createProductQuestion(input: {
  productId: string
  question: string
  customerName?: string | null
  customerEmail?: string | null
  metadata?: Record<string, unknown>
}) {
  const rows = await pgQuery<ProductQuestionRow>(
    `insert into "mp_product_question"
      ("id","product_id","question","status","customer_name","customer_email","metadata","created_at","updated_at","deleted_at")
     values
      ($1,$2,$3,'pending',$4,$5,$6::jsonb,now(),now(),null)
     returning
      "id",
      "product_id",
      "question",
      "answer",
      "status",
      "customer_name",
      "customer_email",
      "answered_by_account_id",
      "answered_at",
      "metadata",
      "created_at",
      "updated_at";`,
    [
      newProductQuestionId(),
      input.productId,
      input.question,
      input.customerName ?? null,
      input.customerEmail ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  )

  return rows[0] ?? null
}

export async function getProductQuestionById(idRaw: string) {
  const id = normalizeQuestionText(idRaw, 120)
  if (!id) return null

  const rows = await pgQuery<ProductQuestionRow>(
    `select
      q."id",
      q."product_id",
      q."question",
      q."answer",
      q."status",
      q."customer_name",
      q."customer_email",
      q."answered_by_account_id",
      q."answered_at",
      q."metadata",
      q."created_at",
      q."updated_at",
      p."title" as "product_title",
      p."handle" as "product_handle"
     from "mp_product_question" q
     left join "product" p on p."id" = q."product_id"
     where q."id" = $1
       and q."deleted_at" is null
     limit 1;`,
    [id]
  )

  return rows[0] ?? null
}

export async function updateProductQuestion(input: {
  id: string
  status: ProductQuestionStatus
  answer: string | null
  answeredByAccountId: string | null
  answeredAt: Date | null
}) {
  const rows = await pgQuery<ProductQuestionRow>(
    `update "mp_product_question"
     set
      "status" = $2,
      "answer" = $3,
      "answered_by_account_id" = $4,
      "answered_at" = $5,
      "updated_at" = now()
     where "id" = $1
       and "deleted_at" is null
     returning
      "id",
      "product_id",
      "question",
      "answer",
      "status",
      "customer_name",
      "customer_email",
      "answered_by_account_id",
      "answered_at",
      "metadata",
      "created_at",
      "updated_at";`,
    [
      input.id,
      input.status,
      input.answer,
      input.answeredByAccountId,
      input.answeredAt,
    ]
  )

  return rows[0] ?? null
}

export async function deleteProductQuestion(idRaw: string) {
  const id = normalizeQuestionText(idRaw, 120)
  if (!id) return null

  const rows = await pgQuery<ProductQuestionRow>(
    `update "mp_product_question"
     set
      "deleted_at" = now(),
      "updated_at" = now()
     where "id" = $1
       and "deleted_at" is null
     returning
      "id",
      "product_id",
      "question",
      "answer",
      "status",
      "customer_name",
      "customer_email",
      "answered_by_account_id",
      "answered_at",
      "metadata",
      "created_at",
      "updated_at";`,
    [id]
  )

  return rows[0] ?? null
}

export async function listAdminProductQuestions(input: {
  q?: string
  status?: ProductQuestionStatus | "all"
  productId?: string
  sort?: AdminProductQuestionSort
  limit: number
  offset: number
}) {
  const params: unknown[] = []
  const where: string[] = [`q."deleted_at" is null`]

  const productId = normalizeQuestionText(input.productId, 120)
  if (productId) {
    params.push(productId)
    where.push(`q."product_id" = $${params.length}`)
  }

  const status = input.status === "all" ? "all" : normalizeQuestionStatus(input.status)
  if (status !== "all") {
    params.push(status)
    where.push(`q."status" = $${params.length}`)
  } else {
    where.push(`q."status" in ('pending', 'answered')`)
  }

  const q = normalizeQuestionText(input.q, 180)
  if (q) {
    params.push(`%${q}%`)
    const idx = `$${params.length}`
    where.push(`(
      q."question" ilike ${idx}
      or coalesce(q."answer", '') ilike ${idx}
      or coalesce(q."customer_name", '') ilike ${idx}
      or coalesce(q."customer_email", '') ilike ${idx}
      or coalesce(p."title", '') ilike ${idx}
      or q."product_id" ilike ${idx}
    )`)
  }

  const fromSql = `from "mp_product_question" q
    left join "product" p on p."id" = q."product_id"`
  const whereSql = where.length ? `where ${where.join(" and ")}` : ""
  const sort = normalizeAdminProductQuestionSort(input.sort)
  const orderBySql =
    sort === "created_asc"
      ? `q."created_at" asc nulls last, q."id" asc`
      : sort === "updated_desc"
        ? `q."updated_at" desc nulls last, q."id" desc`
        : sort === "updated_asc"
          ? `q."updated_at" asc nulls last, q."id" asc`
          : `q."created_at" desc nulls last, q."id" desc`

  const limitIdx = params.length + 1
  const offsetIdx = params.length + 2

  const rows = await pgQuery<ProductQuestionRow>(
    `select
      q."id",
      q."product_id",
      q."question",
      q."answer",
      q."status",
      q."customer_name",
      q."customer_email",
      q."answered_by_account_id",
      q."answered_at",
      q."metadata",
      q."created_at",
      q."updated_at",
      p."title" as "product_title",
      p."handle" as "product_handle"
     ${fromSql}
     ${whereSql}
     order by ${orderBySql}
     limit $${limitIdx} offset $${offsetIdx};`,
    [...params, input.limit, input.offset]
  )

  const countRows = await pgQuery<{ count: number }>(
    `select count(*)::int as "count"
     ${fromSql}
     ${whereSql};`,
    params
  )

  return {
    questions: rows,
    count: Math.max(0, Number(countRows[0]?.count ?? 0) || 0),
  }
}
