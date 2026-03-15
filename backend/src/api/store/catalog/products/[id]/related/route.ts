import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"

import {
  createCatalogCacheKey,
  getCatalogCacheJson,
  setCatalogCacheJson,
} from "../../../../../../lib/catalog-cache"
import {
  getCatalogProductsByIds,
  listCatalogProductsPage,
  type CatalogProduct,
} from "../../../../../../lib/catalog-pg"
import { setStorefrontPublicCacheHeaders } from "../../../../../../lib/http-cache"
import { getStockSnapshotsByProductIds } from "../../../../../../lib/stock"

type StoreProductSummary = {
  id: string
  name: string
  description?: string
  brand?: { id: string; name: string; slug: string }
  category?: { id: string; name: string }
  priceArs?: number
  sku?: string
  imageUrl?: string
  images: string[]
  createdAt: Date
  metadata: Record<string, unknown>
  condition: "nuevo" | "reacondicionado" | "usado"
  color?: string
  size?: string
  availableSizes: string[]
  gender?: "hombre" | "mujer" | "unisex"
  variantGroupId?: string
  inStock?: boolean
  stockAvailable?: number
  stockReserved?: number
  stockThreshold?: number
  lowStock?: boolean
}

const RELATED_FETCH_MULTIPLIER = 6
const RELATED_MIN_FETCH_LIMIT = 24
const RELATED_MAX_FETCH_LIMIT = 96
const RELATED_CACHE_TTL_SECONDS = 20
const RELATED_PRICE_SPAN_RATIO = 0.35
const RELATED_MIN_PRICE_SPAN_ARS = 5_000

function uniq(list: string[]) {
  return Array.from(new Set(list))
}

function toNumber(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

function pickConfiguredPrice(variant: CatalogProduct["variants"][number] | undefined) {
  if (!variant) return undefined

  const prices = Array.isArray(variant.prices) ? variant.prices : []
  const preferred = prices.find(
    (price) => price.currency_code === "ars" && Number(price.amount) > 0
  )
  if (preferred && Number.isFinite(Number(preferred.amount))) {
    return Math.trunc(Number(preferred.amount))
  }

  const fallback = prices.find((price) => Number(price.amount) > 0)
  if (fallback && Number.isFinite(Number(fallback.amount))) {
    return Math.trunc(Number(fallback.amount))
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

function pickImageUrls(product: CatalogProduct): string[] {
  const urls: string[] = []
  if (typeof product.thumbnail === "string" && product.thumbnail.trim()) {
    urls.push(product.thumbnail.trim())
  }

  for (const image of product.images || []) {
    const url = typeof image?.url === "string" ? image.url.trim() : ""
    if (url) urls.push(url)
  }

  return uniq(urls)
}

function normalizeComparableText(value: string | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

function resolveRelatedPriceWindow(priceArs: number | undefined) {
  if (!Number.isFinite(priceArs) || !priceArs || priceArs <= 0) return null

  const basePrice = Math.max(0, Math.round(priceArs))
  const spread = Math.max(
    RELATED_MIN_PRICE_SPAN_ARS,
    Math.round(basePrice * RELATED_PRICE_SPAN_RATIO)
  )

  return {
    minPrice: Math.max(0, basePrice - spread),
    maxPrice: basePrice + spread,
  }
}

function mapCatalogProductToStoreSummary(product: CatalogProduct): StoreProductSummary {
  const firstVariant = Array.isArray(product.variants) ? product.variants[0] : undefined
  const firstCategory = Array.isArray(product.categories) ? product.categories[0] : undefined
  const priceArs = pickConfiguredPrice(firstVariant)
  const images = pickImageUrls(product)
  const metadata =
    product.metadata && typeof product.metadata === "object" ? product.metadata : {}
  const conditionRaw =
    typeof metadata.condition === "string" ? String(metadata.condition).toLowerCase() : ""
  const condition =
    conditionRaw === "usado"
      ? "usado"
      : conditionRaw === "reacondicionado"
        ? "reacondicionado"
        : "nuevo"
  const color = typeof metadata.color === "string" ? metadata.color.trim() : undefined
  const size = typeof metadata.size === "string" ? metadata.size.trim() : undefined
  const activeSizes = listActiveSizes(metadata)
  const genderRaw =
    typeof metadata.gender === "string" ? metadata.gender.trim().toLowerCase() : ""
  const gender =
    genderRaw === "hombre" || genderRaw === "mujer" || genderRaw === "unisex"
      ? genderRaw
      : undefined
  const variantGroupId =
    typeof metadata.group_id === "string"
      ? metadata.group_id
      : typeof metadata.variant_group_id === "string"
        ? metadata.variant_group_id
        : typeof metadata.family === "string"
          ? metadata.family
          : undefined

  return {
    id: product.id,
    name: product.title,
    description: typeof product.description === "string" ? product.description : undefined,
    brand: product.brand
      ? {
          id: product.brand.id,
          name: product.brand.name,
          slug: product.brand.slug,
        }
      : undefined,
    category: firstCategory
      ? {
          id: firstCategory.id,
          name: firstCategory.name,
        }
      : undefined,
    priceArs,
    sku: firstVariant?.sku ?? undefined,
    imageUrl: images[0] ?? undefined,
    images,
    createdAt: product.created_at,
    metadata,
    condition,
    color,
    size: size || activeSizes[0],
    availableSizes: activeSizes,
    gender,
    variantGroupId,
  }
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

function sortRelatedByAffinity(candidates: StoreProductSummary[], anchor: StoreProductSummary) {
  const anchorBrand = normalizeComparableText(anchor.brand?.name)
  const anchorCategory = normalizeComparableText(anchor.category?.name)
  const anchorPrice = Math.max(0, Math.trunc(anchor.priceArs ?? 0))

  return [...candidates].sort((a, b) => {
    const aInStock = a.inStock === false ? 0 : 1
    const bInStock = b.inStock === false ? 0 : 1
    if (aInStock !== bInStock) return bInStock - aInStock

    const aBrand = normalizeComparableText(a.brand?.name) === anchorBrand ? 1 : 0
    const bBrand = normalizeComparableText(b.brand?.name) === anchorBrand ? 1 : 0
    if (aBrand !== bBrand) return bBrand - aBrand

    const aCategory = normalizeComparableText(a.category?.name) === anchorCategory ? 1 : 0
    const bCategory = normalizeComparableText(b.category?.name) === anchorCategory ? 1 : 0
    if (aCategory !== bCategory) return bCategory - aCategory

    const aPriceDiff = Math.abs(Math.max(0, Math.trunc(a.priceArs ?? 0)) - anchorPrice)
    const bPriceDiff = Math.abs(Math.max(0, Math.trunc(b.priceArs ?? 0)) - anchorPrice)
    if (aPriceDiff !== bPriceDiff) return aPriceDiff - bPriceDiff

    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : ""
  if (!id) {
    return res.status(404).json({ message: "Not found" })
  }

  const limit = Math.max(1, Math.min(12, toNumber(req.query.limit) ?? 4))
  const cacheKey = createCatalogCacheKey(
    "products:related",
    req.originalUrl || req.url || `${id}:${limit}`
  )
  const cached = await getCatalogCacheJson<{
    products: StoreProductSummary[]
    count: number
    limit: number
  }>(cacheKey)
  if (cached) {
    setStorefrontPublicCacheHeaders(res, {
      maxAgeSeconds: RELATED_CACHE_TTL_SECONDS,
      staleWhileRevalidateSeconds: RELATED_CACHE_TTL_SECONDS * 3,
    })
    return res.json(cached)
  }

  const anchor = (await getCatalogProductsByIds([id], { status: "published" }))[0]
  if (!anchor) {
    return res.status(404).json({ message: "Not found" })
  }

  const anchorSummary = mapCatalogProductToStoreSummary(anchor)
  const categoryId = anchor.categories[0]?.id
  const brandSlug = anchor.brand?.slug
  const priceWindow = resolveRelatedPriceWindow(anchorSummary.priceArs)
  const fetchLimit = Math.max(
    RELATED_MIN_FETCH_LIMIT,
    Math.min(RELATED_MAX_FETCH_LIMIT, limit * RELATED_FETCH_MULTIPLIER)
  )

  const filterPlans: Array<{ categoryId?: string; brandSlugs?: string[] }> = []
  if (brandSlug || categoryId) {
    filterPlans.push({
      ...(categoryId ? { categoryId } : {}),
      ...(brandSlug ? { brandSlugs: [brandSlug] } : {}),
    })
  }
  if (categoryId) {
    filterPlans.push({ categoryId })
  }
  if (brandSlug) {
    filterPlans.push({ brandSlugs: [brandSlug] })
  }
  filterPlans.push({})

  const candidates = new Map<string, CatalogProduct>()

  for (const plan of filterPlans) {
    if (candidates.size >= fetchLimit) break

    const response = await listCatalogProductsPage({
      status: "published",
      ...(priceWindow ? priceWindow : {}),
      ...plan,
      limit: fetchLimit,
      offset: 0,
      sort: "relevancia",
    })

    for (const product of response.products) {
      if (product.id === anchor.id) continue
      if (
        anchorSummary.variantGroupId &&
        anchorSummary.variantGroupId ===
          (typeof product.metadata?.group_id === "string"
            ? product.metadata.group_id
            : typeof product.metadata?.variant_group_id === "string"
              ? product.metadata.variant_group_id
              : typeof product.metadata?.family === "string"
                ? product.metadata.family
                : undefined)
      ) {
        continue
      }
      if (!candidates.has(product.id)) {
        candidates.set(product.id, product)
      }
    }
  }

  const mappedCandidates = Array.from(candidates.values()).map(mapCatalogProductToStoreSummary)
  const withStock = await attachStock(mappedCandidates)
  const related = sortRelatedByAffinity(withStock, anchorSummary).slice(0, limit)

  const responseBody = {
    products: related,
    count: related.length,
    limit,
  }
  await setCatalogCacheJson(cacheKey, responseBody, RELATED_CACHE_TTL_SECONDS)
  setStorefrontPublicCacheHeaders(res, {
    maxAgeSeconds: RELATED_CACHE_TTL_SECONDS,
    staleWhileRevalidateSeconds: RELATED_CACHE_TTL_SECONDS * 3,
  })

  return res.json(responseBody)
}
