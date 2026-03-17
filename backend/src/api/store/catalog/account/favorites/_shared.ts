import type { HttpRequest } from "../../../../../lib/http"
import {
  getCatalogProductsByIds,
  type CatalogProduct,
} from "../../../../../lib/catalog-pg"
import { getStockSnapshotsByProductIds } from "../../../../../lib/stock"

import {
  getCustomerAuthService,
  normalizeText,
} from "../../_shared/customer-auth"

const FAVORITES_MAX_TAKE = 500

export type StoreAccountSavedProductSummary = {
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

function uniq(list: string[]) {
  return Array.from(new Set(list))
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

function mapCatalogProductToStoreSummary(product: CatalogProduct): StoreAccountSavedProductSummary {
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

export function normalizeFavoriteProductId(raw: unknown) {
  return normalizeText(raw, 140)
}

export async function listFavoriteProductIdsForAccount(
  req: HttpRequest,
  accountId: string
) {
  const service = getCustomerAuthService(req)
  const rows = await service.listCustomerFavoriteProducts(
    { account_id: accountId },
    {
      take: FAVORITES_MAX_TAKE,
      order: { updated_at: "DESC" },
    }
  )

  return uniq(
    rows
      .map((row: any) => normalizeFavoriteProductId(row?.product_id))
      .filter(Boolean)
  )
}

export async function isPublishedStoreProduct(productId: string) {
  const found = await getCatalogProductsByIds([productId], { status: "published" })
  return Boolean(found[0])
}

export async function buildSavedProductsFromIds(productIdsRaw: string[]) {
  const productIds = uniq(productIdsRaw.map((id) => normalizeFavoriteProductId(id)).filter(Boolean))
  if (!productIds.length) {
    return {
      product_ids: [] as string[],
      products: [] as StoreAccountSavedProductSummary[],
      count: 0,
    }
  }

  const products = await getCatalogProductsByIds(productIds, { status: "published" })
  const mapped = products.map(mapCatalogProductToStoreSummary)
  const withStock = await attachStock(mapped)
  const byId = new Map(withStock.map((item) => [item.id, item]))
  const orderedProducts = productIds
    .map((productId) => byId.get(productId))
    .filter((item): item is StoreAccountSavedProductSummary => Boolean(item))

  return {
    product_ids: productIds,
    products: orderedProducts,
    count: productIds.length,
  }
}

export async function buildFavoriteProductsResponse(
  req: HttpRequest,
  accountId: string
) {
  const productIds = await listFavoriteProductIdsForAccount(req, accountId)
  return await buildSavedProductsFromIds(productIds)
}
