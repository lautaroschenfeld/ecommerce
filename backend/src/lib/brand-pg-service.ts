import { prefixedNanoId } from "./id"

import { pgQuery } from "./pg"

type ListConfig = {
  take?: number
  order?: Record<string, "ASC" | "DESC" | "asc" | "desc">
}

function clampTake(value: unknown, fallback = 50, max = 500) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.max(1, Math.min(max, Math.trunc(parsed)))
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

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function asTextArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function addFilter(
  clauses: string[],
  params: unknown[],
  field: string,
  value: unknown
) {
  if (value === undefined) return

  if (value === null) {
    clauses.push(`\"${field}\" is null`)
    return
  }

  if (isObject(value) && "$in" in value) {
    const list = asTextArray(value.$in)
    if (!list.length) {
      clauses.push("1=0")
      return
    }
    params.push(list)
    clauses.push(`\"${field}\" = any($${params.length}::text[])`)
    return
  }

  params.push(value)
  clauses.push(`\"${field}\" = $${params.length}`)
}

export class BrandPgService {
  async listBrands(filters: Record<string, unknown>, config?: ListConfig) {
    const params: unknown[] = []
    const clauses: string[] = ['"deleted_at" is null']

    addFilter(clauses, params, "id", filters?.id)
    addFilter(clauses, params, "slug", filters?.slug)
    addFilter(clauses, params, "name", filters?.name)

    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""
    const order = normalizeOrder(config?.order, ["created_at", "updated_at", "name", "slug"])
    const take = clampTake(config?.take, 500, 500)
    params.push(take)

    return await pgQuery(
      `select * from "brand"${where}${order} limit $${params.length};`,
      params
    )
  }

  async createBrands(input: Record<string, unknown>) {
    const id =
      typeof input.id === "string" && input.id.trim()
        ? input.id.trim()
        : prefixedNanoId("brand")
    const name = typeof input.name === "string" ? input.name.trim() : ""
    const slug = typeof input.slug === "string" ? input.slug.trim() : ""

    if (!name || !slug) {
      throw new Error("Brand name and slug are required.")
    }

    const rows = await pgQuery(
      `insert into "brand"
        ("id","name","slug","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,now(),now(),null)
       on conflict ("slug") where "deleted_at" is null
       do nothing
       returning *;`,
      [id, name, slug]
    )

    if (rows[0]) return rows[0]

    const existing = await this.listBrands({ slug }, { take: 1 })
    return existing[0]
  }
}

let singleton: BrandPgService | null = null

export function getBrandPgService() {
  if (!singleton) singleton = new BrandPgService()
  return singleton
}
