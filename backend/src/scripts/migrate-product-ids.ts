import "../lib/env"

import { nanoId } from "../lib/id"
import { pgQuery, pgTransaction, type PgClient } from "../lib/pg"

const LEGACY_ID_PREFIX = "prod_"
const COMPACT_PRODUCT_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
const COMPACT_PRODUCT_ID_LENGTH = 12
const SAMPLE_PREVIEW_COUNT = 8

type ProductIdMap = Map<string, string>

type JsonColumnTarget = {
  table: string
  idColumn: string
  jsonColumn: string
}

type JsonColumnStats = Record<string, { scanned: number; updated: number }>

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  return {
    dryRun: args.includes("--dry-run"),
  }
}

function randomCompactProductId() {
  return nanoId(COMPACT_PRODUCT_ID_LENGTH)
}

function isLegacyProductId(id: string) {
  return id.startsWith(LEGACY_ID_PREFIX)
}

function isHex16ProductId(id: string) {
  return /^[0-9a-f]{16}$/i.test(id)
}

function isCompactProductId(id: string) {
  const expr = new RegExp(
    `^[${COMPACT_PRODUCT_ID_ALPHABET}]{${COMPACT_PRODUCT_ID_LENGTH}}$`
  )
  return expr.test(id)
}

function shouldMigrateProductId(id: string) {
  if (!id) return false
  if (isLegacyProductId(id)) return true
  if (isHex16ProductId(id)) return true
  if (id.length > COMPACT_PRODUCT_ID_LENGTH && !isCompactProductId(id)) return true
  return false
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function replaceIdsInJson(
  value: unknown,
  map: ProductIdMap
): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const next = map.get(value)
    if (!next) return { value, changed: false }
    return { value: next, changed: true }
  }

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const result = replaceIdsInJson(item, map)
      changed = changed || result.changed
      return result.value
    })
    return changed ? { value: next, changed: true } : { value, changed: false }
  }

  if (!isPlainObject(value)) {
    return { value, changed: false }
  }

  let changed = false
  const next: Record<string, unknown> = {}
  for (const [key, current] of Object.entries(value)) {
    const result = replaceIdsInJson(current, map)
    changed = changed || result.changed
    next[key] = result.value
  }

  return changed ? { value: next, changed: true } : { value, changed: false }
}

async function listAllProductIds() {
  const rows = await pgQuery<{ id: string }>(
    `select "id"
     from "product";`
  )

  return rows
    .map((row) => normalizeText(row.id))
    .filter(Boolean)
}

async function listMigratableProductIds() {
  const rows = await pgQuery<{ id: string }>(
    `select "id"
     from "product"
     order by "created_at" asc, "id" asc;`,
    []
  )

  return rows
    .map((row) => normalizeText(row.id))
    .filter((id) => shouldMigrateProductId(id))
    .filter(Boolean)
}

function buildProductIdMap(input: {
  migratableIds: string[]
  allExistingIds: string[]
}) {
  const map: ProductIdMap = new Map()
  const occupied = new Set<string>(input.allExistingIds)

  for (const oldId of input.migratableIds) {
    let next = randomCompactProductId()
    while (occupied.has(next) || map.has(next)) {
      next = randomCompactProductId()
    }
    map.set(oldId, next)
    occupied.add(next)
  }

  return map
}

async function seedMapTableTx(client: PgClient, map: ProductIdMap) {
  await client.query(
    `create temp table "_tmp_product_id_map" (
      "old_id" text primary key,
      "new_id" text not null unique
    ) on commit drop;`
  )

  const oldIds = Array.from(map.keys())
  const newIds = Array.from(map.values())

  if (!oldIds.length) return

  await client.query(
    `insert into "_tmp_product_id_map" ("old_id", "new_id")
     select *
     from unnest($1::text[], $2::text[]) as t("old_id", "new_id");`,
    [oldIds, newIds]
  )
}

async function updateDirectProductIdReferencesTx(client: PgClient) {
  const statements: Array<{ key: string; sql: string }> = [
    {
      key: "product",
      sql: `update "product" t
            set "id" = m."new_id"
            from "_tmp_product_id_map" m
            where t."id" = m."old_id"
            returning 1 as "changed";`,
    },
    {
      key: "product_category_product",
      sql: `update "product_category_product" t
            set "product_id" = m."new_id"
            from "_tmp_product_id_map" m
            where t."product_id" = m."old_id"
            returning 1 as "changed";`,
    },
    {
      key: "product_brand",
      sql: `update "product_brand" t
            set "product_id" = m."new_id"
            from "_tmp_product_id_map" m
            where t."product_id" = m."old_id"
            returning 1 as "changed";`,
    },
    {
      key: "product_variant",
      sql: `update "product_variant" t
            set "product_id" = m."new_id"
            from "_tmp_product_id_map" m
            where t."product_id" = m."old_id"
            returning 1 as "changed";`,
    },
    {
      key: "image",
      sql: `update "image" t
            set "product_id" = m."new_id"
            from "_tmp_product_id_map" m
            where t."product_id" = m."old_id"
            returning 1 as "changed";`,
    },
    {
      key: "mp_product_stock",
      sql: `update "mp_product_stock" t
            set "product_id" = m."new_id"
            from "_tmp_product_id_map" m
            where t."product_id" = m."old_id"
            returning 1 as "changed";`,
    },
    {
      key: "mp_stock_reservation_item",
      sql: `update "mp_stock_reservation_item" t
            set "product_id" = m."new_id"
            from "_tmp_product_id_map" m
            where t."product_id" = m."old_id"
            returning 1 as "changed";`,
    },
    {
      key: "mp_product_question",
      sql: `update "mp_product_question" t
            set "product_id" = m."new_id"
            from "_tmp_product_id_map" m
            where t."product_id" = m."old_id"
            returning 1 as "changed";`,
    },
  ]

  const counts: Record<string, number> = {}
  for (const entry of statements) {
    const result = await client.query(entry.sql)
    counts[entry.key] = Array.isArray(result.rows) ? result.rows.length : 0
  }

  return counts
}

async function updateJsonColumnIdsTx(
  client: PgClient,
  map: ProductIdMap,
  target: JsonColumnTarget
) {
  const rows = await client.query(
    `select "${target.idColumn}" as "row_id", "${target.jsonColumn}" as "json_value"
     from "${target.table}"
     where "${target.jsonColumn}" is not null;`
  )

  let scanned = 0
  let updated = 0

  for (const row of rows.rows ?? []) {
    const rowId = normalizeText((row as Record<string, unknown>).row_id)
    if (!rowId) continue
    scanned += 1

    const currentValue = (row as Record<string, unknown>).json_value
    const replaced = replaceIdsInJson(currentValue, map)
    if (!replaced.changed) continue

    await client.query(
      `update "${target.table}"
       set "${target.jsonColumn}" = $2::jsonb
       where "${target.idColumn}" = $1;`,
      [rowId, JSON.stringify(replaced.value)]
    )
    updated += 1
  }

  return { scanned, updated }
}

async function updateJsonReferencesTx(client: PgClient, map: ProductIdMap) {
  const targets: JsonColumnTarget[] = [
    { table: "mp_customer_cart", idColumn: "id", jsonColumn: "items" },
    { table: "mp_customer_order", idColumn: "id", jsonColumn: "items" },
    { table: "mp_customer_order", idColumn: "id", jsonColumn: "metadata" },
    { table: "mp_checkout_idempotency", idColumn: "id", jsonColumn: "response_json" },
    { table: "mp_admin_products_bulk_job", idColumn: "id", jsonColumn: "errors" },
    { table: "mp_admin_products_bulk_job", idColumn: "id", jsonColumn: "parameters" },
  ]

  const stats: JsonColumnStats = {}
  for (const target of targets) {
    const key = `${target.table}.${target.jsonColumn}`
    stats[key] = await updateJsonColumnIdsTx(client, map, target)
  }

  return stats
}

async function runMigration() {
  const { dryRun } = parseArgs(process.argv)

  const [migratableIds, allIds] = await Promise.all([
    listMigratableProductIds(),
    listAllProductIds(),
  ])

  if (!migratableIds.length) {
    console.log("[migrate-product-ids] No hay IDs de producto para migrar.")
    return
  }

  const map = buildProductIdMap({ migratableIds, allExistingIds: allIds })
  const preview = Array.from(map.entries()).slice(0, SAMPLE_PREVIEW_COUNT)

  console.log(
    `[migrate-product-ids] Productos a migrar: ${migratableIds.length}`
  )
  console.log(
    `[migrate-product-ids] Formato objetivo: ${COMPACT_PRODUCT_ID_LENGTH} chars [0-9a-z]`
  )
  console.log("[migrate-product-ids] Preview (old -> new):")
  for (const [oldId, newId] of preview) {
    console.log(`  - ${oldId} -> ${newId}`)
  }
  if (migratableIds.length > preview.length) {
    console.log(`  ... y ${migratableIds.length - preview.length} mas.`)
  }

  if (dryRun) {
    console.log("[migrate-product-ids] Dry-run finalizado. No se aplicaron cambios.")
    return
  }

  const result = await pgTransaction(async (client) => {
    await seedMapTableTx(client, map)
    const directCounts = await updateDirectProductIdReferencesTx(client)
    const jsonStats = await updateJsonReferencesTx(client, map)
    return { directCounts, jsonStats }
  })

  console.log("[migrate-product-ids] Migracion aplicada correctamente.")
  console.log("[migrate-product-ids] Cambios en columnas directas:")
  for (const [table, count] of Object.entries(result.directCounts)) {
    console.log(`  - ${table}: ${count}`)
  }

  console.log("[migrate-product-ids] Reescritura de JSON:")
  for (const [target, stats] of Object.entries(result.jsonStats)) {
    console.log(
      `  - ${target}: ${stats.updated} actualizados (escaneados: ${stats.scanned})`
    )
  }
}

if (require.main === module) {
  void runMigration().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[migrate-product-ids] Error:", message)
    process.exit(1)
  })
}



