import type { HttpRequest, HttpResponse } from "../../../../lib/http"

import {
  createCatalogCacheKey,
  getCatalogCacheJson,
  setCatalogCacheJson,
} from "../../../../lib/catalog-cache"
import { STORE_CURRENCY_CODE } from "../../../../lib/catalog"
import { listCatalogProductsPage } from "../../../../lib/catalog-pg"
import { setStorefrontPublicCacheHeaders } from "../../../../lib/http-cache"
import { pgQuery } from "../../../../lib/pg"
import { slugify } from "../../../../lib/slug"
import { getStockSnapshotsByProductIds } from "../../../../lib/stock"

type Sort =
  | "relevancia"
  | "precio_asc"
  | "precio_desc"
  | "nombre_asc"
  | "nombre_desc"

const PRODUCTS_CACHE_TTL_SECONDS = 20

function toNumber(value: unknown) {
  const n = typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(n) ? n : undefined
}

function toString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string") as string[]
  return []
}

function parseGenderFilter(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()
  if (normalized === "hombre" || normalized === "mujer" || normalized === "unisex") {
    return normalized
  }
  return undefined
}

function parseSizeStocksMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, number> {
  if (!metadata) return {}

  const raw =
    typeof metadata.size_stocks === "object" &&
    metadata.size_stocks !== null &&
    !Array.isArray(metadata.size_stocks)
      ? (metadata.size_stocks as Record<string, unknown>)
      : typeof metadata.sizeStocks === "object" &&
          metadata.sizeStocks !== null &&
          !Array.isArray(metadata.sizeStocks)
        ? (metadata.sizeStocks as Record<string, unknown>)
        : undefined

  if (!raw) return {}

  const out: Record<string, number> = {}
  for (const [size, value] of Object.entries(raw)) {
    const normalized = typeof size === "string" ? size.trim() : ""
    if (!normalized) continue
    const parsed = Number(value)
    out[normalized] = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
  }

  return out
}

function listActiveSizes(metadata: Record<string, unknown> | undefined) {
  const sizeStocks = parseSizeStocksMetadata(metadata)
  return Object.entries(sizeStocks)
    .filter(([, stock]) => stock > 0)
    .map(([size]) => size)
}

function pickBrand(product: any) {
  const b = product?.brand
  if (!b) return undefined
  if (Array.isArray(b)) return b[0]
  return b
}

function pickConfiguredPrice(variant: any): number | undefined {
  const candidates: any[] = []
  const fromPriceSet = variant?.price_set?.prices
  if (Array.isArray(fromPriceSet)) candidates.push(...fromPriceSet)
  const fromVariant = variant?.prices
  if (Array.isArray(fromVariant)) candidates.push(...fromVariant)
  if (!candidates.length) return undefined

  const configured = candidates.find((p: any) => p?.currency_code === STORE_CURRENCY_CODE)
  const configuredAmount = Number(configured?.amount)
  if (Number.isFinite(configuredAmount) && configuredAmount > 0) {
    return configuredAmount
  }

  const fallback = candidates.find((p: any) => Number.isFinite(Number(p?.amount)) && Number(p?.amount) > 0)
  const fallbackAmount = Number(fallback?.amount)
  return Number.isFinite(fallbackAmount) && fallbackAmount > 0 ? fallbackAmount : undefined
}

function uniq(list: string[]) {
  return Array.from(new Set(list))
}

function pickImageUrls(product: any): string[] {
  const urls: string[] = []

  if (typeof product?.thumbnail === "string" && product.thumbnail) {
    urls.push(product.thumbnail)
  }

  if (Array.isArray(product?.images)) {
    for (const image of product.images) {
      const url = typeof image?.url === "string" ? image.url : ""
      if (url) urls.push(url)
    }
  }

  return uniq(urls)
}

async function attachStock<T extends { id: string }>(products: T[]) {
  const ids = products
    .map((product) => (typeof product?.id === "string" ? product.id : ""))
    .filter(Boolean)

  if (!ids.length) return products.map((product) => ({ ...product }))

  const stockByProduct = await getStockSnapshotsByProductIds(ids)
  return products.map((product) => {
    const stock = stockByProduct.get(product.id)
    const available = stock?.availableQty ?? 0
    const reserved = stock?.reservedQty ?? 0
    const lowThreshold = stock?.lowStockThreshold ?? 3
    const inStock = stock?.inStock ?? false
    const lowStock = stock?.lowStock ?? !inStock

    return {
      ...product,
      stockAvailable: available,
      stockReserved: reserved,
      stockThreshold: lowThreshold,
      inStock,
      lowStock,
    }
  })
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  const cacheKey = createCatalogCacheKey(
    "products:list",
    req.originalUrl || req.url || JSON.stringify(req.query || {})
  )
  const cached = await getCatalogCacheJson<{
    products: unknown[]
    count: number
    offset: number
    limit: number
    availableSizes: string[]
  }>(cacheKey)
  if (cached) {
    setStorefrontPublicCacheHeaders(res, {
      maxAgeSeconds: PRODUCTS_CACHE_TTL_SECONDS,
      staleWhileRevalidateSeconds: PRODUCTS_CACHE_TTL_SECONDS * 3,
    })
    return res.json(cached)
  }

  const limit = Math.max(1, Math.min(100, toNumber(req.query.limit) ?? 24))
  const offset = Math.max(0, toNumber(req.query.offset) ?? 0)

  const q = toString(req.query.q) || toString(req.query.buscar) || ""
  const categoryName = toString(req.query.categoria) || toString(req.query.category)
  const brandRaw = req.query.marca ?? req.query.brand
  const brandFilters = toStringArray(brandRaw)
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean)
  const minPrice = toNumber(req.query.min_price) ?? toNumber(req.query.minPrice)
  const maxPrice = toNumber(req.query.max_price) ?? toNumber(req.query.maxPrice)
  const sort = (toString(req.query.sort) as Sort | undefined) ?? "relevancia"
  const conditionFilterRaw = req.query.estado
  const conditionFilter =
    typeof conditionFilterRaw === "string"
      ? [conditionFilterRaw.toLowerCase()]
      : Array.isArray(conditionFilterRaw)
        ? conditionFilterRaw.map((c: string) => (typeof c === "string" ? c.toLowerCase() : "")).filter(Boolean)
        : []
  const genderFilter = parseGenderFilter(
    toString(req.query.genero) || toString(req.query.gender)
  )
  const sizeFilter = (toString(req.query.talle) || toString(req.query.size) || "")
    .trim()
    .toLowerCase()
  const groupId = toString(req.query.grupo) || toString(req.query.group_id)

  // Resolve category id from name (optional)
  let categoryId: string | undefined = undefined
  if (categoryName) {
    const rows = await pgQuery<{ id: string }>(
      `select "id"
       from "product_category"
       where "deleted_at" is null and "name" = $1
       limit 1;`,
      [categoryName]
    )
    categoryId = rows[0]?.id
  }

  // Brand filter (DB-level) via link table.
  const brandSlugs = uniq(
    brandFilters
      .map((b) => slugify(b))
      .map((b) => b.trim())
      .filter(Boolean)
  )

  const { products: candidates, count, availableSizes } = await listCatalogProductsPage({
    q,
    status: "published",
    ...(categoryId ? { categoryId } : {}),
    ...(brandSlugs.length ? { brandSlugs } : {}),
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    sort,
    ...(conditionFilter.length ? { conditions: conditionFilter } : {}),
    ...(genderFilter ? { gender: genderFilter } : {}),
    ...(sizeFilter ? { size: sizeFilter } : {}),
    ...(groupId ? { groupId } : {}),
    limit,
    offset,
  })

  const mapped = candidates
    .map((p: any) => {
      const brand = pickBrand(p)
      const firstCategory = Array.isArray(p.categories) ? p.categories[0] : undefined
      const firstVariant = Array.isArray(p.variants) ? p.variants[0] : undefined
      const calc = firstVariant?.calculated_price
      const calculatedAmount = Number(calc?.calculated_amount)
      const fallbackAmount = pickConfiguredPrice(firstVariant)
      const resolvedAmount =
        Number.isFinite(calculatedAmount) && calculatedAmount > 0
          ? calculatedAmount
          : fallbackAmount
      const images = pickImageUrls(p)
      const metadata = (typeof p.metadata === "object" && p.metadata) || {}
      const conditionRaw =
        typeof metadata?.condition === "string"
          ? String(metadata.condition).toLowerCase()
          : ""
      const condition =
        conditionRaw === "usado"
          ? "usado"
          : conditionRaw === "reacondicionado"
            ? "reacondicionado"
            : "nuevo"
      const color =
        typeof metadata?.color === "string" ? String(metadata.color).trim() : undefined
      const size =
        typeof metadata?.size === "string" ? String(metadata.size).trim() : undefined
      const activeSizes = listActiveSizes(metadata)
      const genderRaw =
        typeof metadata?.gender === "string"
          ? String(metadata.gender).trim().toLowerCase()
          : ""
      const gender =
        genderRaw === "hombre" || genderRaw === "mujer" || genderRaw === "unisex"
          ? genderRaw
          : undefined
      const variantGroupId =
        typeof metadata?.group_id === "string"
          ? metadata.group_id
          : typeof metadata?.variant_group_id === "string"
            ? metadata.variant_group_id
            : typeof metadata?.family === "string"
              ? metadata.family
              : undefined

      return {
        id: p.id as string,
        name: p.title as string,
        description: typeof p.description === "string" ? p.description : undefined,
        brand: brand ? { id: brand.id, name: brand.name, slug: brand.slug } : undefined,
        category: firstCategory ? { id: firstCategory.id, name: firstCategory.name } : undefined,
        priceArs: resolvedAmount,
        sku: firstVariant?.sku ?? undefined,
        imageUrl: images[0] ?? undefined,
        images,
        createdAt: p.created_at,
        metadata,
        condition,
        color,
        size: size || activeSizes[0],
        availableSizes: activeSizes,
        gender,
        variantGroupId,
      }
    })
  const withStock = await attachStock(mapped as any[])

  const responseBody = {
    products: withStock,
    count,
    offset,
    limit,
    availableSizes,
  }

  await setCatalogCacheJson(cacheKey, responseBody, PRODUCTS_CACHE_TTL_SECONDS)
  setStorefrontPublicCacheHeaders(res, {
    maxAgeSeconds: PRODUCTS_CACHE_TTL_SECONDS,
    staleWhileRevalidateSeconds: PRODUCTS_CACHE_TTL_SECONDS * 3,
  })
  return res.json(responseBody)
}

