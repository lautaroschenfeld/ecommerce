import { ApiHttpError, fetchJsonWithAuthRetry as fetchJson } from "./store-client"

export type AdminInventoryItem = {
  id: string
  productId: string
  stockScope: "product"
  productName: string
  productStatus: "published" | "draft" | "archived"
  archived: boolean
  sku: string
  skuList: string[]
  availableQty: number
  reservedQty: number
  soldQty: number
  stockThreshold: number
  reorderSuggestedQty: number
  inStock: boolean
  lowStock: boolean
  updatedAt: string | null
  metadata: Record<string, unknown> | null
}

export type AdminInventorySummary = {
  totalProducts: number
  totalAvailableQty: number
  lowStockCount: number
  outOfStockCount: number
  reorderCount: number
  productsWithActiveReservations: number
}

export type AdminInventoryStatusFilter = "all" | "in_stock" | "low_stock" | "out_of_stock" | "to_buy"
export type AdminInventorySort =
  | "stock_asc"
  | "stock_desc"
  | "reorder_desc"
  | "name_asc"
  | "name_desc"

export type AdminInventoryMovementKind =
  | "entry"
  | "exit"
  | "reserve"
  | "release"
  | "return"
  | "adjustment"
  | "purchase_in"
  | "unknown"

export type AdminInventoryMovement = {
  id: string
  itemId: string | null
  productId: string | null
  sku: string
  skuList: string[]
  productName: string
  variantName: string
  movement: AdminInventoryMovementKind
  deltaQty: number
  balanceQty: number | null
  source: string
  motive: string
  reference: string
  user: string
  at: string
}

export type AdminInventoryQuery = {
  q?: string
  status?: AdminInventoryStatusFilter
  sort?: AdminInventorySort
  limit?: number
  offset?: number
}

export type AdminInventoryMovementsPage = {
  movements: AdminInventoryMovement[]
  count: number
  limit: number
  offset: number
}

export type AdminInventoryPage = {
  inventory: AdminInventoryItem[]
  count: number
  limit: number
  offset: number
  summary: AdminInventorySummary
}

const DEFAULT_ADMIN_INVENTORY_PAGE_SIZE = 50

const EMPTY_SUMMARY: AdminInventorySummary = {
  totalProducts: 0,
  totalAvailableQty: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
  reorderCount: 0,
  productsWithActiveReservations: 0,
}

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || ""
}

function adminHeaders(): Record<string, string> {
  const key = getPublishableKey()
  if (!key) return {}
  return { "x-publishable-api-key": key }
}

function appendQueryParam(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null) return
  const text = typeof value === "string" ? value.trim() : String(value)
  if (!text) return
  params.set(key, text)
}

function asRecord(input: unknown) {
  return typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)
    : null
}

function toString(input: unknown, max = 200) {
  if (typeof input !== "string") return ""
  return input.replace(/\s+/g, " ").trim().slice(0, max)
}

function toNullableString(input: unknown, max = 200) {
  const out = toString(input, max)
  return out || null
}

function toNumber(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) return input
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toInt(input: unknown, fallback = 0) {
  const parsed = toNumber(input)
  if (parsed === undefined) return fallback
  return Math.trunc(parsed)
}

function toNonNegativeInt(input: unknown, fallback = 0) {
  return Math.max(0, toInt(input, fallback))
}

function pickString(rec: Record<string, unknown>, keys: string[], max = 200) {
  for (const key of keys) {
    const value = toString(rec[key], max)
    if (value) return value
  }
  return ""
}

function pickNumber(rec: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toNumber(rec[key])
    if (value !== undefined) return value
  }
  return undefined
}

function toStringArray(input: unknown, max = 120) {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    const value = toString(raw, max)
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

function pickStringArray(rec: Record<string, unknown>, keys: string[], max = 120) {
  for (const key of keys) {
    const value = toStringArray(rec[key], max)
    if (value.length) return value
  }
  return []
}

function buildSkuSummary(skuList: string[]) {
  if (!skuList.length) return "-"
  const visible = skuList.slice(0, 2)
  const hiddenCount = Math.max(0, skuList.length - visible.length)
  return hiddenCount > 0 ? `${visible.join(", ")} +${hiddenCount}` : visible.join(", ")
}

function normalizeMovementKind(input: string): AdminInventoryMovementKind {
  const value = input.trim().toLowerCase()
  if (!value) return "unknown"
  if (value === "entry" || value === "in" || value === "ingreso") return "entry"
  if (value === "exit" || value === "out" || value === "egreso") return "exit"
  if (value === "reserve" || value === "reservation" || value === "reserva") return "reserve"
  if (value === "release" || value === "liberacion" || value === "release_reserve") {
    return "release"
  }
  if (value === "return" || value === "devolucion") return "return"
  if (value === "adjust" || value === "adjustment" || value === "ajuste") return "adjustment"
  if (value === "purchase_in" || value === "recepcion_compra") return "purchase_in"
  return "unknown"
}

function mapInventoryItem(raw: unknown): AdminInventoryItem | null {
  const rec = asRecord(raw)
  if (!rec) return null

  const metadataRaw = asRecord(rec.metadata)
  const metadata = metadataRaw ? { ...metadataRaw } : null
  const id = pickString(rec, ["id", "product_id", "productId"], 120)
  const productId = pickString(rec, ["product_id", "productId", "id"], 120)
  const productName = pickString(
    rec,
    ["product_name", "productName", "name", "title", "item_name"],
    220
  )
  const productStatusRaw = pickString(rec, ["product_status", "productStatus", "status"], 40).toLowerCase()
  const productStatus =
    productStatusRaw === "archived"
      ? "archived"
      : productStatusRaw === "published"
        ? "published"
        : "draft"
  const archived =
    typeof rec.archived === "boolean"
      ? rec.archived
      : productStatus === "archived"
  const skuList = pickStringArray(rec, ["skuList", "sku_list", "skus"], 120)
  const sku = pickString(rec, ["skuSummary", "sku_summary", "sku", "item_sku"], 160) || buildSkuSummary(skuList)
  const availableQty = toNonNegativeInt(
    pickNumber(rec, ["availableQty", "available_qty", "stockAvailable", "available", "qty"])
  )
  const reservedQty = toNonNegativeInt(
    pickNumber(rec, ["reservedQty", "reserved_qty", "stockReserved", "reserved"])
  )
  const soldQty = toNonNegativeInt(
    pickNumber(rec, ["soldQty", "sold_qty", "stockSold", "sold"])
  )
  const stockThreshold = toNonNegativeInt(
    pickNumber(rec, ["stockThreshold", "stock_threshold", "lowStockThreshold", "low_stock_threshold"]),
    3
  )
  const inStockRaw = rec.inStock
  const inStock = typeof inStockRaw === "boolean" ? inStockRaw : availableQty > 0
  const lowStockRaw = rec.lowStock
  const lowStock = typeof lowStockRaw === "boolean" ? lowStockRaw : availableQty <= stockThreshold
  const reorderSuggestedQty = Math.max(0, stockThreshold - availableQty)
  const updatedAt = toNullableString(
    pickString(rec, ["updated_at", "updatedAt", "last_movement_at", "lastMovementAt"], 80),
    80
  )
  const stockScope = pickString(rec, ["stock_scope", "stockScope"], 40).toLowerCase()

  if (!id || !productId || !productName) return null

  return {
    id,
    productId,
    stockScope: stockScope === "product" ? "product" : "product",
    productName,
    productStatus,
    archived,
    sku,
    skuList,
    availableQty,
    reservedQty,
    soldQty,
    stockThreshold,
    reorderSuggestedQty,
    inStock,
    lowStock,
    updatedAt,
    metadata,
  }
}

function mapInventorySummary(raw: unknown): AdminInventorySummary {
  const rec = asRecord(raw)
  if (!rec) return { ...EMPTY_SUMMARY }

  return {
    totalProducts: toNonNegativeInt(rec.totalProducts ?? rec.total_products, 0),
    totalAvailableQty: toNonNegativeInt(rec.totalAvailableQty ?? rec.total_available_qty, 0),
    lowStockCount: toNonNegativeInt(rec.lowStockCount ?? rec.low_stock_count, 0),
    outOfStockCount: toNonNegativeInt(rec.outOfStockCount ?? rec.out_of_stock_count, 0),
    reorderCount: toNonNegativeInt(rec.reorderCount ?? rec.reorder_count, 0),
    productsWithActiveReservations: toNonNegativeInt(
      rec.productsWithActiveReservations ?? rec.products_with_active_reservations,
      0
    ),
  }
}

function mapInventoryMovement(raw: unknown): AdminInventoryMovement | null {
  const rec = asRecord(raw)
  if (!rec) return null

  const id = pickString(rec, ["id", "movement_id", "movementId"], 120)
  const itemId = toNullableString(
    pickString(rec, ["item_id", "itemId", "variant_id", "variantId"], 120),
    120
  )
  const productId = toNullableString(
    pickString(rec, ["product_id", "productId"], 120),
    120
  )
  const skuList = pickStringArray(rec, ["skuList", "sku_list", "skus"], 120)
  const sku = pickString(rec, ["skuSummary", "sku_summary", "sku"], 160) || buildSkuSummary(skuList)
  const productName = pickString(rec, ["product_name", "productName", "name", "title"], 220)
  const variantName = pickString(rec, ["variant_name", "variantName"], 180)
  const movement = normalizeMovementKind(
    pickString(rec, ["movement", "type", "kind", "event"], 60)
  )
  const deltaQty = toInt(
    pickNumber(rec, ["deltaQty", "delta_qty", "delta", "quantity", "qty", "change"]),
    0
  )
  const balanceRaw = pickNumber(rec, ["balanceQty", "balance_qty", "balance", "available_after"])
  const balanceQty = balanceRaw === undefined ? null : toNonNegativeInt(balanceRaw)
  const source = pickString(rec, ["source", "origin", "channel"], 120)
  const motive = pickString(rec, ["motive", "reason"], 220)
  const reference = pickString(rec, ["reference", "reference_id", "referenceId", "order_id"], 160)
  const user = pickString(rec, ["user", "actor", "actor_name", "created_by"], 120)
  const at = pickString(rec, ["at", "created_at", "createdAt", "date", "timestamp"], 80)

  if (!id) return null

  return {
    id,
    itemId,
    productId,
    sku,
    skuList,
    productName,
    variantName,
    movement,
    deltaQty,
    balanceQty,
    source,
    motive,
    reference,
    user,
    at,
  }
}

export async function getAdminInventoryPage(query: AdminInventoryQuery = {}): Promise<AdminInventoryPage> {
  const params = new URLSearchParams()
  appendQueryParam(params, "q", query.q)
  appendQueryParam(params, "status", query.status && query.status !== "all" ? query.status : undefined)
  appendQueryParam(params, "sort", query.sort)
  appendQueryParam(params, "limit", query.limit)
  appendQueryParam(params, "offset", query.offset)

  const queryString = params.toString()
  const data = await fetchJson<{
    inventory?: unknown[]
    count?: number | string
    limit?: number | string
    offset?: number | string
    summary?: unknown
  }>(
    `/store/catalog/account/admin/inventory${queryString ? `?${queryString}` : ""}`,
    {
      method: "GET",
      headers: adminHeaders(),
      credentials: "include",
    }
  )

  const inventory = (data.inventory ?? []).map(mapInventoryItem).filter(Boolean) as AdminInventoryItem[]
  const parsedCount = Number(data.count)
  const parsedLimit = Number(data.limit)
  const parsedOffset = Number(data.offset)

  return {
    inventory,
    count: Number.isFinite(parsedCount) && parsedCount >= 0 ? Math.trunc(parsedCount) : inventory.length,
    limit:
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.trunc(parsedLimit)
        : DEFAULT_ADMIN_INVENTORY_PAGE_SIZE,
    offset: Number.isFinite(parsedOffset) && parsedOffset >= 0 ? Math.trunc(parsedOffset) : 0,
    summary: mapInventorySummary(data.summary),
  }
}

const INVENTORY_MOVEMENTS_ENDPOINTS = [
  "/store/catalog/account/admin/inventory/movements",
  "/store/catalog/account/admin/inventory/kardex",
  "/store/catalog/account/admin/inventory/history",
] as const

export async function getAdminInventoryMovementsPage(
  query: Pick<AdminInventoryQuery, "limit" | "offset"> = {}
): Promise<AdminInventoryMovementsPage> {
  const safeLimit = Math.max(1, Math.trunc(query.limit || 25))
  const safeOffset = Math.max(0, Math.trunc(query.offset || 0))

  for (const endpoint of INVENTORY_MOVEMENTS_ENDPOINTS) {
    try {
      const data = await fetchJson<{
        movements?: unknown[]
        count?: number | string
        limit?: number | string
        offset?: number | string
      }>(
        `${endpoint}?limit=${safeLimit}&offset=${safeOffset}`,
        {
          method: "GET",
          headers: adminHeaders(),
          credentials: "include",
        }
      )
      const movements = (data.movements ?? [])
        .map(mapInventoryMovement)
        .filter(Boolean) as AdminInventoryMovement[]

      return {
        movements,
        count: toNonNegativeInt(data.count, movements.length),
        limit: Math.max(1, toNonNegativeInt(data.limit, safeLimit)),
        offset: toNonNegativeInt(data.offset, safeOffset),
      }
    } catch (error) {
      if (error instanceof ApiHttpError && error.status === 404) {
        continue
      }
      throw error
    }
  }

  return {
    movements: [],
    count: 0,
    limit: safeLimit,
    offset: safeOffset,
  }
}

export async function getAdminInventoryMovements(limit = 250): Promise<AdminInventoryMovement[]> {
  const page = await getAdminInventoryMovementsPage({ limit, offset: 0 })
  return page.movements
}
