import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"

import { requireCustomerAdmin } from "../../../../_shared/customer-auth"
import { pgQuery } from "../../../../../../../lib/pg"
import { listProductSkuPresentation } from "../_sku-summary"

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MAX_OFFSET = 1_000_000

type InventoryMovementRow = {
  id: string
  item_id: string | null
  product_id: string | null
  product_name: string | null
  variant_name: string | null
  movement: string | null
  delta_qty: number | string | null
  balance_qty: number | string | null
  source: string | null
  motive: string | null
  reference: string | null
  user_name: string | null
  at: string | Date | null
}

type ProductSkuPresentation = {
  sku: string
  skuList: string[]
}

function readQueryString(req: HttpRequest, key: string, max = 40) {
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

function toIsoString(input: string | Date | null | undefined) {
  if (!input) return null
  if (input instanceof Date) return input.toISOString()
  const parsed = Date.parse(String(input))
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString()
}

function toInt(input: unknown, fallback = 0) {
  const value = typeof input === "number" ? input : Number(input)
  if (!Number.isFinite(value)) return fallback
  return Math.trunc(value)
}

function mapMovement(
  row: InventoryMovementRow,
  skuPresentation: ProductSkuPresentation | undefined
) {
  return {
    id: String(row.id || ""),
    itemId: typeof row.item_id === "string" ? row.item_id : null,
    productId: typeof row.product_id === "string" ? row.product_id : null,
    sku: skuPresentation?.sku ?? "-",
    skuList: skuPresentation?.skuList ?? [],
    productName: typeof row.product_name === "string" ? row.product_name : "",
    variantName: typeof row.variant_name === "string" ? row.variant_name : "",
    movement: typeof row.movement === "string" ? row.movement : "unknown",
    deltaQty: toInt(row.delta_qty, 0),
    balanceQty:
      row.balance_qty === null || row.balance_qty === undefined
        ? null
        : Math.max(0, toInt(row.balance_qty, 0)),
    source: typeof row.source === "string" ? row.source : "",
    motive: typeof row.motive === "string" ? row.motive : "",
    reference: typeof row.reference === "string" ? row.reference : "",
    user: typeof row.user_name === "string" ? row.user_name : "",
    at: toIsoString(row.at) ?? new Date(0).toISOString(),
  }
}

const MOVEMENTS_FROM_SQL = `
  with reservation_base as (
    select
      r."id" as "reservation_id",
      r."status",
      r."account_id",
      r."email",
      r."created_at",
      r."released_at",
      r."consumed_at",
      coalesce(
        (
          select ci."order_id"
          from "mp_checkout_idempotency" ci
          where ci."reservation_id" = r."id"
            and nullif(trim(coalesce(ci."order_id", '')), '') is not null
          order by ci."created_at" desc
          limit 1
        ),
        ''
      ) as "order_id"
    from "mp_stock_reservation" r
  ),
  movement_rows as (
    select
      concat(rb."reservation_id", ':reserve:', ri."id") as "id",
      ri."id" as "item_id",
      ri."product_id" as "product_id",
      ri."name" as "product_name",
      ''::text as "variant_name",
      'reserve'::text as "movement",
      greatest(ri."qty", 0) * -1 as "delta_qty",
      null::int as "balance_qty",
      'checkout'::text as "source",
      'Reserva de stock'::text as "motive",
      rb."reservation_id"::text as "reference",
      coalesce(
        nullif(trim(coalesce(rb."email", '')), ''),
        nullif(trim(coalesce(rb."account_id", '')), ''),
        'Cliente'
      ) as "user_name",
      rb."created_at" as "at"
    from reservation_base rb
    join "mp_stock_reservation_item" ri
      on ri."reservation_id" = rb."reservation_id"
    where rb."created_at" is not null

    union all

    select
      concat(rb."reservation_id", ':release:', ri."id") as "id",
      ri."id" as "item_id",
      ri."product_id" as "product_id",
      ri."name" as "product_name",
      ''::text as "variant_name",
      'release'::text as "movement",
      greatest(ri."qty", 0) as "delta_qty",
      null::int as "balance_qty",
      case when rb."status" = 'expired' then 'expiration' else 'checkout' end as "source",
      case when rb."status" = 'expired' then 'Reserva vencida' else 'Liberacion de reserva' end as "motive",
      rb."reservation_id"::text as "reference",
      coalesce(
        nullif(trim(coalesce(rb."email", '')), ''),
        nullif(trim(coalesce(rb."account_id", '')), ''),
        'Sistema'
      ) as "user_name",
      rb."released_at" as "at"
    from reservation_base rb
    join "mp_stock_reservation_item" ri
      on ri."reservation_id" = rb."reservation_id"
    where rb."released_at" is not null
      and rb."status" in ('released', 'expired')

    union all

    select
      concat(rb."reservation_id", ':exit:', ri."id") as "id",
      ri."id" as "item_id",
      ri."product_id" as "product_id",
      ri."name" as "product_name",
      ''::text as "variant_name",
      'exit'::text as "movement",
      greatest(ri."qty", 0) * -1 as "delta_qty",
      null::int as "balance_qty",
      'orders'::text as "source",
      case
        when nullif(trim(rb."order_id"), '') is not null then 'Venta confirmada'
        else 'Reserva consumida'
      end as "motive",
      coalesce(nullif(trim(rb."order_id"), ''), rb."reservation_id"::text) as "reference",
      coalesce(
        nullif(trim(coalesce(rb."email", '')), ''),
        nullif(trim(coalesce(rb."account_id", '')), ''),
        'Cliente'
      ) as "user_name",
      rb."consumed_at" as "at"
    from reservation_base rb
    join "mp_stock_reservation_item" ri
      on ri."reservation_id" = rb."reservation_id"
    where rb."consumed_at" is not null
      and rb."status" = 'consumed'
  )
`

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const limit = parseBoundedInt(
    readQueryString(req, "limit", 20),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT
  )
  const offset = parseBoundedInt(readQueryString(req, "offset", 20), 0, 0, MAX_OFFSET)

  const [countRows, movementRows] = await Promise.all([
    pgQuery<{ count: number | string }>(
      `${MOVEMENTS_FROM_SQL}
       select count(*)::int as "count"
       from movement_rows;`,
      []
    ),
    pgQuery<InventoryMovementRow>(
      `${MOVEMENTS_FROM_SQL},
       paged_rows as (
         select *
         from movement_rows
         order by "at" desc nulls last, "id" desc
         limit $1 offset $2
       )
       select
         pr."id",
         pr."item_id",
         pr."product_id",
         pr."product_name",
         pr."variant_name",
         pr."movement",
         pr."delta_qty",
         pr."balance_qty",
         pr."source",
         pr."motive",
         pr."reference",
         pr."user_name",
         pr."at"
       from paged_rows pr
       order by pr."at" desc nulls last, pr."id" desc;`,
      [limit, offset]
    ),
  ])

  const skuPresentationByProductId = await listProductSkuPresentation(
    movementRows.map((row) => String(row.product_id ?? ""))
  )

  return res.json({
    movements: movementRows.map((row) =>
      mapMovement(row, skuPresentationByProductId.get(String(row.product_id ?? "")))
    ),
    count: Math.max(0, Number(countRows[0]?.count ?? 0) || 0),
    limit,
    offset,
  })
}
