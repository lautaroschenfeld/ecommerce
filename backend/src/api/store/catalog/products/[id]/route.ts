import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import {
  createCatalogCacheKey,
  getCatalogCacheJson,
  setCatalogCacheJson,
} from "../../../../../lib/catalog-cache"
import { STORE_CURRENCY_CODE } from "../../../../../lib/catalog"
import { getCatalogProductsByIds, listCatalogProducts } from "../../../../../lib/catalog-pg"
import { setStorefrontPublicCacheHeaders } from "../../../../../lib/http-cache"
import { getStockSnapshotsByProductIds } from "../../../../../lib/stock"

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

const PRODUCT_DETAIL_CACHE_TTL_SECONDS = 20

async function findProductByIdOrHandle(idOrHandle: string) {
  const normalized = idOrHandle.trim()
  if (!normalized) return null

  const byId = (await getCatalogProductsByIds([normalized], { status: "published" }))[0]
  if (byId) return byId

  const normalizedHandle = normalized.toLowerCase()
  const candidates = await listCatalogProducts({
    q: normalized,
    status: "published",
  })
  return (
    candidates.find(
      (candidate) =>
        typeof candidate.handle === "string" &&
        candidate.handle.trim().toLowerCase() === normalizedHandle
    ) ?? null
  )
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : ""
  if (!id) {
    return res.status(404).json({ message: "Not found" })
  }

  const cacheKey = createCatalogCacheKey(
    "products:detail",
    req.originalUrl || req.url || id
  )
  const cached = await getCatalogCacheJson<{ product: unknown }>(cacheKey)
  if (cached) {
    setStorefrontPublicCacheHeaders(res, {
      maxAgeSeconds: PRODUCT_DETAIL_CACHE_TTL_SECONDS,
      staleWhileRevalidateSeconds: PRODUCT_DETAIL_CACHE_TTL_SECONDS * 3,
    })
    return res.json(cached)
  }

  const product = (await findProductByIdOrHandle(id)) as any
  if (!product) {
    return res.status(404).json({ message: "Not found" })
  }

  const brand = pickBrand(product)
  const firstCategory = Array.isArray(product.categories) ? product.categories[0] : undefined
  const firstVariant = Array.isArray(product.variants) ? product.variants[0] : undefined
  const calc = firstVariant?.calculated_price
  const calculatedAmount = Number(calc?.calculated_amount)
  const fallbackAmount = pickConfiguredPrice(firstVariant)
  const resolvedAmount =
    Number.isFinite(calculatedAmount) && calculatedAmount > 0
      ? calculatedAmount
      : fallbackAmount
  const images = pickImageUrls(product)
  const metadata = (typeof product.metadata === "object" && product.metadata) || {}
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
  const color = typeof metadata?.color === "string" ? String(metadata.color).trim() : undefined
  const size = typeof metadata?.size === "string" ? String(metadata.size).trim() : undefined
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

  const stockByProduct = await getStockSnapshotsByProductIds([product.id])
  const stock = stockByProduct.get(product.id)
  const available = stock?.availableQty ?? 0
  const reserved = stock?.reservedQty ?? 0
  const lowThreshold = stock?.lowStockThreshold ?? 3
  const inStock = stock?.inStock ?? false
  const lowStock = stock?.lowStock ?? !inStock

  const responseBody = {
    product: {
      id: product.id as string,
      name: product.title as string,
      description: typeof product.description === "string" ? product.description : undefined,
      brand: brand ? { id: brand.id, name: brand.name, slug: brand.slug } : undefined,
      category: firstCategory ? { id: firstCategory.id, name: firstCategory.name } : undefined,
      priceArs: resolvedAmount,
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
      stockAvailable: available,
      stockReserved: reserved,
      stockThreshold: lowThreshold,
      inStock,
      lowStock,
    },
  }

  await setCatalogCacheJson(cacheKey, responseBody, PRODUCT_DETAIL_CACHE_TTL_SECONDS)
  setStorefrontPublicCacheHeaders(res, {
    maxAgeSeconds: PRODUCT_DETAIL_CACHE_TTL_SECONDS,
    staleWhileRevalidateSeconds: PRODUCT_DETAIL_CACHE_TTL_SECONDS * 3,
  })
  return res.json(responseBody)
}
