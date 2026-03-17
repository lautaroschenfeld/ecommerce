import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"

import { requireCustomerAdmin } from "../../../_shared/customer-auth"
import { pgQuery } from "../../../../../../lib/pg"
import { listProductSkuPresentation } from "./_sku-summary"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MAX_OFFSET = 1_000_000
const DEFAULT_LOW_STOCK_THRESHOLD = 3

type InventoryStatusFilter = "all" | "in_stock" | "low_stock" | "out_of_stock" | "to_buy"
type InventorySort =
  | "stock_asc"
  | "stock_desc"
  | "reorder_desc"
  | "name_asc"
  | "name_desc"

const VALID_STATUS_FILTERS = new Set<InventoryStatusFilter>([
  "all",
  "in_stock",
  "low_stock",
  "out_of_stock",
  "to_buy",
])

const VALID_SORTS = new Set<InventorySort>([
  "stock_asc",
  "stock_desc",
  "reorder_desc",
  "name_asc",
  "name_desc",
])

function readQueryString(req: HttpRequest, key: string, max = 180) {
  const raw = (req.query as Record<string, unknown>)?.[key]
  if (typeof raw === "string") return raw.trim().slice(0, max)
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === "string")
    return typeof first === "string" ? first.trim().slice(0, max) : ""
  }
  return ""
}

function parseBoundedInt(input: unknown, fallback: number, min: number, max: number) {
  if (typeof input === "string" && !input.trim()) return fallback
  const value = typeof input === "number" ? input : Number(input)
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function parseStatusFilter(input: string): InventoryStatusFilter {
  const normalized = input.trim().toLowerCase() as InventoryStatusFilter
  return VALID_STATUS_FILTERS.has(normalized) ? normalized : "all"
}

function parseSort(input: string): InventorySort {
  const normalized = input.trim().toLowerCase() as InventorySort
  return VALID_SORTS.has(normalized) ? normalized : "stock_asc"
}

function orderSqlFor(sort: InventorySort) {
  if (sort === "stock_desc") {
    return `order by fr."available_qty" desc, fr."product_name" asc, fr."id" asc`
  }
  if (sort === "reorder_desc") {
    return `order by fr."reorder_suggested_qty" desc, fr."available_qty" asc, fr."product_name" asc, fr."id" asc`
  }
  if (sort === "name_asc") {
    return `order by fr."product_name" asc, fr."id" asc`
  }
  if (sort === "name_desc") {
    return `order by fr."product_name" desc, fr."id" asc`
  }
  return `order by fr."available_qty" asc, fr."product_name" asc, fr."id" asc`
}

function statusWhereSql(status: InventoryStatusFilter) {
  if (status === "in_stock") return `where fr."in_stock" = true`
  if (status === "low_stock") return `where fr."in_stock" = true and fr."low_stock" = true`
  if (status === "out_of_stock") return `where fr."in_stock" = false`
  if (status === "to_buy") return `where fr."reorder_suggested_qty" > 0`
  return ""
}

const ARCHIVED_SQL = `case
  when lower(coalesce(trim(p."metadata"->>'archived'), '')) in ('true', '1', 'yes') then true
  when lower(coalesce(trim(p."metadata"->>'archived'), '')) in ('false', '0', 'no') then false
  else false
end`

const PRODUCT_STATUS_SQL = `case
  when ${ARCHIVED_SQL} then 'archived'
  when lower(trim(coalesce(p."status", ''))) = 'published' then 'published'
  else 'draft'
end`

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const limit = parseBoundedInt(readQueryString(req, "limit", 20), DEFAULT_LIMIT, 1, MAX_LIMIT)
  const offset = parseBoundedInt(readQueryString(req, "offset", 20), 0, 0, MAX_OFFSET)
  const q = readQueryString(req, "q", 180) || readQueryString(req, "search", 180)
  const status = parseStatusFilter(readQueryString(req, "status", 40))
  const sort = parseSort(readQueryString(req, "sort", 40))

  const params: unknown[] = []
  const baseWhere: string[] = [`p."deleted_at" is null`]

  if (q) {
    params.push(`%${q}%`)
    const idx = `$${params.length}`
    baseWhere.push(`(
      p."id" ilike ${idx}
      or p."title" ilike ${idx}
      or exists (
        select 1
        from "product_variant" pv_search
        where pv_search."deleted_at" is null
          and pv_search."product_id" = p."id"
          and pv_search."sku" ilike ${idx}
      )
    )`)
  }

  const baseWhereSql = `where ${baseWhere.join(" and ")}`
  const filteredWhereSql = statusWhereSql(status)
  const orderSql = orderSqlFor(sort)
  const limitIdx = params.length + 1
  const offsetIdx = params.length + 2

  const inventorySql = `
    with inventory_rows as (
      select
        p."id" as "id",
        p."id" as "product_id",
        'product'::text as "stock_scope",
        p."title" as "product_name",
        ${PRODUCT_STATUS_SQL} as "product_status",
        ${ARCHIVED_SQL} as "archived",
        coalesce(s."available_qty", 0)::int as "available_qty",
        coalesce(s."reserved_qty", 0)::int as "reserved_qty",
        coalesce(s."sold_qty", 0)::int as "sold_qty",
        coalesce(s."low_stock_threshold", ${DEFAULT_LOW_STOCK_THRESHOLD})::int as "stock_threshold",
        greatest(
          coalesce(s."low_stock_threshold", ${DEFAULT_LOW_STOCK_THRESHOLD}) - coalesce(s."available_qty", 0),
          0
        )::int as "reorder_suggested_qty",
        case
          when coalesce(s."allow_backorder", false) then true
          else coalesce(s."available_qty", 0) > 0
        end as "in_stock",
        case
          when coalesce(s."allow_backorder", false) then false
          else coalesce(s."available_qty", 0) <= coalesce(s."low_stock_threshold", ${DEFAULT_LOW_STOCK_THRESHOLD})
        end as "low_stock",
        s."updated_at" as "updated_at"
      from "product" p
      left join "mp_product_stock" s
        on s."product_id" = p."id"
      ${baseWhereSql}
    ),
    filtered_rows as (
      select *
      from inventory_rows fr
      ${filteredWhereSql}
    )
    select
      fr."id",
      fr."product_id",
      fr."stock_scope",
      fr."product_name",
      fr."product_status",
      fr."archived",
      fr."available_qty",
      fr."reserved_qty",
      fr."sold_qty",
      fr."stock_threshold",
      fr."reorder_suggested_qty",
      fr."in_stock",
      fr."low_stock",
      fr."updated_at"
    from filtered_rows fr
    ${orderSql}
    limit $${limitIdx} offset $${offsetIdx};
  `

  const countSql = `
    with inventory_rows as (
      select
        p."id" as "id",
        ${PRODUCT_STATUS_SQL} as "product_status",
        ${ARCHIVED_SQL} as "archived",
        coalesce(s."available_qty", 0)::int as "available_qty",
        coalesce(s."reserved_qty", 0)::int as "reserved_qty",
        coalesce(s."low_stock_threshold", ${DEFAULT_LOW_STOCK_THRESHOLD})::int as "stock_threshold",
        greatest(
          coalesce(s."low_stock_threshold", ${DEFAULT_LOW_STOCK_THRESHOLD}) - coalesce(s."available_qty", 0),
          0
        )::int as "reorder_suggested_qty",
        case
          when coalesce(s."allow_backorder", false) then true
          else coalesce(s."available_qty", 0) > 0
        end as "in_stock",
        case
          when coalesce(s."allow_backorder", false) then false
          else coalesce(s."available_qty", 0) <= coalesce(s."low_stock_threshold", ${DEFAULT_LOW_STOCK_THRESHOLD})
        end as "low_stock"
      from "product" p
      left join "mp_product_stock" s
        on s."product_id" = p."id"
      ${baseWhereSql}
    ),
    filtered_rows as (
      select *
      from inventory_rows fr
      ${filteredWhereSql}
    )
    select count(*)::int as "count"
    from filtered_rows;
  `

  const summarySql = `
    with inventory_rows as (
      select
        p."id" as "id",
        coalesce(s."available_qty", 0)::int as "available_qty",
        coalesce(s."reserved_qty", 0)::int as "reserved_qty",
        coalesce(s."low_stock_threshold", ${DEFAULT_LOW_STOCK_THRESHOLD})::int as "stock_threshold",
        greatest(
          coalesce(s."low_stock_threshold", ${DEFAULT_LOW_STOCK_THRESHOLD}) - coalesce(s."available_qty", 0),
          0
        )::int as "reorder_suggested_qty",
        case
          when coalesce(s."allow_backorder", false) then true
          else coalesce(s."available_qty", 0) > 0
        end as "in_stock",
        case
          when coalesce(s."allow_backorder", false) then false
          else coalesce(s."available_qty", 0) <= coalesce(s."low_stock_threshold", ${DEFAULT_LOW_STOCK_THRESHOLD})
        end as "low_stock"
      from "product" p
      left join "mp_product_stock" s
        on s."product_id" = p."id"
      ${baseWhereSql}
    ),
    filtered_rows as (
      select *
      from inventory_rows fr
      ${filteredWhereSql}
    )
    select
      count(*)::int as "total_products",
      coalesce(sum(fr."available_qty"), 0)::bigint as "total_available_qty",
      count(*) filter (where fr."low_stock" = true and fr."in_stock" = true)::int as "low_stock_count",
      count(*) filter (where fr."in_stock" = false)::int as "out_of_stock_count",
      count(*) filter (where fr."reorder_suggested_qty" > 0)::int as "reorder_count",
      count(*) filter (where fr."reserved_qty" > 0)::int as "products_with_active_reservations"
    from filtered_rows fr;
  `

  const [inventory, countRows, summaryRows] = await Promise.all([
    pgQuery<Record<string, unknown>>(inventorySql, [...params, limit, offset]),
    pgQuery<{ count: number | string }>(countSql, params),
    pgQuery<Record<string, unknown>>(summarySql, params),
  ])

  const summary = summaryRows[0] ?? {}
  const skuPresentationByProductId = await listProductSkuPresentation(
    inventory.map((row) => String(row.product_id ?? "")),
    q
  )

  return res.json({
    inventory: inventory.map((row) => ({
      ...(skuPresentationByProductId.get(String(row.product_id ?? "")) ?? { sku: "-", skuList: [] }),
      id: row.id,
      productId: row.product_id,
      stockScope: row.stock_scope,
      productName: row.product_name,
      productStatus: row.product_status,
      archived: Boolean(row.archived),
      availableQty: Math.max(0, Number(row.available_qty ?? 0) || 0),
      reservedQty: Math.max(0, Number(row.reserved_qty ?? 0) || 0),
      soldQty: Math.max(0, Number(row.sold_qty ?? 0) || 0),
      stockThreshold: Math.max(0, Number(row.stock_threshold ?? 0) || 0),
      reorderSuggestedQty: Math.max(0, Number(row.reorder_suggested_qty ?? 0) || 0),
      inStock: Boolean(row.in_stock),
      lowStock: Boolean(row.low_stock),
      updatedAt: row.updated_at ?? null,
    })),
    count: Math.max(0, Number(countRows[0]?.count ?? 0) || 0),
    limit,
    offset,
    summary: {
      totalProducts: Math.max(0, Number(summary.total_products ?? 0) || 0),
      totalAvailableQty: Math.max(0, Number(summary.total_available_qty ?? 0) || 0),
      lowStockCount: Math.max(0, Number(summary.low_stock_count ?? 0) || 0),
      outOfStockCount: Math.max(0, Number(summary.out_of_stock_count ?? 0) || 0),
      reorderCount: Math.max(0, Number(summary.reorder_count ?? 0) || 0),
      productsWithActiveReservations: Math.max(
        0,
        Number(summary.products_with_active_reservations ?? 0) || 0
      ),
    },
  })
}
