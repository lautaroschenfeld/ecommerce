import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"

import { getBrandPgService } from "../../../../../../lib/brand-pg-service"
import { invalidateStoreCatalogCache } from "../../../../../../lib/catalog-cache"
import { STORE_CURRENCY_CODE } from "../../../../../../lib/catalog"
import { listAdminCatalogProductsPage } from "../../../../../../lib/catalog-pg"
import { pgQuery } from "../../../../../../lib/pg"
import { createSimpleProduct } from "../../../../../../lib/products-pg-service"
import { slugify } from "../../../../../../lib/slug"
import {
  getStockSnapshotsByProductIds,
  setProductStockLevel,
} from "../../../../../../lib/stock"
import { requireCustomerAdmin } from "../../../_shared/customer-auth"

function toNumber(value: unknown) {
  const n =
    typeof value === "string" || typeof value === "number"
      ? Number(value)
      : Number.NaN
  return Number.isFinite(n) ? n : undefined
}

function toMoneyInt(value: unknown) {
  const parsed = toNumber(value)
  if (parsed === undefined) return undefined
  return Math.trunc(parsed)
}

function toString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string") as string[]
  return []
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isArchivedFromMetadata(metadata: Record<string, unknown>) {
  const value = metadata.archived
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value > 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true
    if (normalized === "false" || normalized === "0" || normalized === "no") return false
  }
  return false
}

type AdminProductsStatusFilter = "all" | "live" | "active" | "draft" | "archived"
type AdminProductsSort =
  | "created_desc"
  | "created_asc"
  | "price_desc"
  | "price_asc"
  | "name_asc"
  | "name_desc"
  | "stock_desc"
  | "stock_asc"

function parseAdminProductsStatusFilter(value: unknown): AdminProductsStatusFilter {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (
    normalized === "all" ||
    normalized === "live" ||
    normalized === "active" ||
    normalized === "draft" ||
    normalized === "archived"
  ) {
    return normalized
  }
  return "live"
}

function parseAdminProductsSort(value: unknown): AdminProductsSort {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (
    normalized === "created_desc" ||
    normalized === "created_asc" ||
    normalized === "price_desc" ||
    normalized === "price_asc" ||
    normalized === "name_asc" ||
    normalized === "name_desc" ||
    normalized === "stock_desc" ||
    normalized === "stock_asc"
  ) {
    return normalized
  }
  return "created_desc"
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

  const configured = candidates.find(
    (p: any) => p?.currency_code === STORE_CURRENCY_CODE
  )
  const configuredAmount = Number(configured?.amount)
  if (Number.isFinite(configuredAmount) && configuredAmount > 0) {
    return configuredAmount
  }

  const fallback = candidates.find(
    (p: any) => Number.isFinite(Number(p?.amount)) && Number(p?.amount) > 0
  )
  const fallbackAmount = Number(fallback?.amount)
  return Number.isFinite(fallbackAmount) && fallbackAmount > 0
    ? fallbackAmount
    : undefined
}

function pickConfiguredCost(variant: any, metadata: Record<string, unknown>) {
  const variantCost = toMoneyInt(variant?.cost_ars)
  if (variantCost !== undefined && variantCost >= 0) return variantCost

  const variantMeta = asRecord(variant?.metadata) ?? {}
  const fromVariantMeta =
    toMoneyInt(variantMeta.cost_ars) ??
    toMoneyInt(variantMeta.costArs)
  if (fromVariantMeta !== undefined && fromVariantMeta >= 0) return fromVariantMeta

  const fromMetadata = toMoneyInt(metadata.cost_ars) ?? toMoneyInt(metadata.costArs)
  return fromMetadata !== undefined && fromMetadata >= 0 ? fromMetadata : undefined
}

async function attachStock<T extends { id: string }>(products: T[]) {
  const ids = products
    .map((product) => (typeof product?.id === "string" ? product.id : ""))
    .filter(Boolean)
  const stockByProduct = await getStockSnapshotsByProductIds(ids)

  return products.map((product) => {
    const stock = stockByProduct.get(product.id)
    const available = stock?.availableQty ?? 0
    const reserved = stock?.reservedQty ?? 0
    const sold = stock?.soldQty ?? 0
    const inStock = stock?.inStock ?? false
    const lowStock = stock?.lowStock ?? !inStock
    const threshold = stock?.lowStockThreshold ?? 3

    return {
      ...product,
      stockAvailable: available,
      stockReserved: reserved,
      stockSold: sold,
      stockThreshold: threshold,
      inStock,
      lowStock,
    }
  })
}

async function getCategoryIdByName(name: string) {
  const found = await pgQuery<{ id: string }>(
    `select "id"
     from "product_category"
     where "deleted_at" is null and "name" = $1
     limit 1;`,
    [name]
  )
  const id = found[0]?.id
  return typeof id === "string" ? id : ""
}

async function handleExists(handle: string) {
  const found = await pgQuery<{ id: string }>(
    `select "id"
     from "product"
     where "deleted_at" is null and "handle" = $1
     limit 1;`,
    [handle]
  )
  return Boolean(found[0]?.id)
}

async function resolveAvailableHandle(rawTitle: string) {
  const base = slugify(rawTitle) || `producto-${Date.now()}`
  let candidate = base
  let index = 2

  while (await handleExists(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }

  return candidate
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const limit = Math.max(1, Math.min(200, toNumber(req.query.limit) ?? 48))
  const offset = Math.max(0, toNumber(req.query.offset) ?? 0)

  const q = toString(req.query.q) || toString(req.query.buscar) || ""
  const categoryName = toString(req.query.category) || toString(req.query.categoria) || ""
  const brandRaw = req.query.brand ?? req.query.marca
  const brandFilters = toStringArray(brandRaw)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
  const minPrice = toNumber(req.query.min_price) ?? toNumber(req.query.minPrice)
  const maxPrice = toNumber(req.query.max_price) ?? toNumber(req.query.maxPrice)
  const statusFilter = parseAdminProductsStatusFilter(req.query.status)
  const sort = parseAdminProductsSort(req.query.sort)

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

  const brandSlugs = Array.from(
    new Set(
      brandFilters
        .map((brand) => slugify(brand))
        .map((brand) => brand.trim())
        .filter(Boolean)
    )
  )

  const { products, count, productCount } = await listAdminCatalogProductsPage({
    q,
    ...(categoryId ? { categoryId } : {}),
    ...(brandSlugs.length ? { brandSlugs } : {}),
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    statusFilter,
    sort,
    limit,
    offset,
  })

  const mapped = products.map((p: any) => {
    const brand = pickBrand(p)
    const firstCategory = Array.isArray(p.categories) ? p.categories[0] : undefined
    const firstVariant = Array.isArray(p.variants) ? p.variants[0] : undefined
    const resolvedAmount = pickConfiguredPrice(firstVariant)
    const meta = (typeof p.metadata === "object" && p.metadata) || {}
    const variantMeta =
      (Array.isArray(p.variants) &&
        typeof p.variants[0]?.metadata === "object" &&
        p.variants[0].metadata) ||
      {}
    const metadata = { ...meta, ...variantMeta }
    const costArs = pickConfiguredCost(firstVariant, metadata) ?? Math.max(0, Math.round((resolvedAmount ?? 0) * 0.55))
    const condition =
      typeof metadata.condition === "string"
        ? String(metadata.condition)
        : "nuevo"
    const color = typeof metadata.color === "string" ? String(metadata.color) : undefined
    const size = typeof metadata.size === "string" ? String(metadata.size) : undefined
    const genderRaw =
      typeof metadata.gender === "string"
        ? String(metadata.gender).trim().toLowerCase()
        : ""
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
    const archived = isArchivedFromMetadata(asRecord(metadata) ?? {})

    return {
      id: p.id as string,
      name: p.title as string,
      active: p.status === "published",
      archived,
      brand: brand ? { id: brand.id, name: brand.name, slug: brand.slug } : undefined,
      category: firstCategory ? { id: firstCategory.id, name: firstCategory.name } : undefined,
      priceArs: resolvedAmount,
      costArs,
      sku: firstVariant?.sku ?? undefined,
      imageUrl:
        typeof p.thumbnail === "string" && p.thumbnail
          ? p.thumbnail
          : Array.isArray(p.images) && p.images[0]?.url
            ? p.images[0].url
            : undefined,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      metadata,
      condition,
      color,
      size,
      gender,
      variantGroupId,
    }
  })
  const withStock = await attachStock(mapped)

  res.json({ products: withStock, count, product_count: productCount, limit, offset })
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const brandService = getBrandPgService()

  const body = (req.body ?? {}) as Record<string, unknown>

  const titleRaw = (body.title ?? body.name) as unknown
  const title = typeof titleRaw === "string" ? titleRaw.trim() : ""

  const brandRaw = (body.brand ?? body.marca) as unknown
  const brandName = typeof brandRaw === "string" ? brandRaw.trim() : ""

  const categoryRaw = (body.category ?? body.categoria) as unknown
  const categoryName = typeof categoryRaw === "string" ? categoryRaw.trim() : ""
  const handleRaw = (body.handle ?? body.slug) as unknown
  const requestedHandle =
    typeof handleRaw === "string" && handleRaw.trim()
      ? slugify(handleRaw.trim())
      : ""

  const priceArs = toNumber(body.priceArs ?? body.precio ?? body.price)
  const directCostArs = toMoneyInt(body.costArs ?? body.costoArs ?? body.costo ?? body.cost)
  const sku = typeof body.sku === "string" ? body.sku.trim() : undefined
  const description = typeof body.description === "string" ? body.description : undefined
  const metadata =
    typeof body.metadata === "object" && body.metadata !== null
      ? (body.metadata as Record<string, any>)
      : {}
  const stockQtyRaw = toNumber(
    body.stock ?? body.stock_qty ?? body.stockAvailable ?? body.available_qty
  )

  const active =
    typeof body.active === "boolean" ? body.active : body.status === "inactive" ? false : true

  const imageUrl =
    typeof body.imageUrl === "string" && body.imageUrl.trim()
      ? body.imageUrl.trim()
      : undefined

  const images =
    Array.isArray(body.images) && body.images.every((x) => typeof x === "string")
      ? (body.images as string[]).map((s) => s.trim()).filter(Boolean)
      : imageUrl
        ? [imageUrl]
        : []
  if (images.length > 10) return res.status(400).json({ message: "max 10 images" })

  if (!title) return res.status(400).json({ message: "title is required" })
  if (!brandName) return res.status(400).json({ message: "brand is required" })
  if (!categoryName) return res.status(400).json({ message: "category is required" })
  if (priceArs === undefined || priceArs <= 0) {
    return res.status(400).json({ message: "priceArs is required" })
  }
  if (directCostArs !== undefined && directCostArs < 0) {
    return res.status(400).json({ message: "costArs must be >= 0" })
  }
  if (stockQtyRaw !== undefined && stockQtyRaw < 0) {
    return res.status(400).json({ message: "stock must be >= 0" })
  }

  const categoryId = await getCategoryIdByName(categoryName)
  if (!categoryId) {
    return res.status(400).json({ message: "category is invalid" })
  }

  const handle = await resolveAvailableHandle(requestedHandle || title)
  const metadataCostArs = toMoneyInt(metadata.cost_ars ?? metadata.costArs)
  if (metadataCostArs !== undefined && metadataCostArs < 0) {
    return res.status(400).json({ message: "metadata.costArs must be >= 0" })
  }
  const resolvedCostArs =
    directCostArs !== undefined
      ? directCostArs
      : metadataCostArs !== undefined
        ? metadataCostArs
        : Math.max(0, Math.round(priceArs * 0.55))

  // Brand upsert
  const brandSlug = slugify(brandName)
  const existingBrand = await brandService.listBrands({ slug: brandSlug })
  const brand =
    existingBrand[0] ??
    (await brandService.createBrands({ name: brandName, slug: brandSlug }))

  const created = await createSimpleProduct({
    title,
    handle,
    description,
    status: active ? "published" : "draft",
    thumbnail: images[0] ?? null,
    images,
    metadata,
    categoryId,
    brandId: brand.id,
    variantSku: sku ?? null,
    variantMetadata: metadata,
    currencyCode: STORE_CURRENCY_CODE,
    priceAmount: priceArs,
    costAmount: resolvedCostArs,
  })

  const stock = await setProductStockLevel({
    productId: created.productId,
    availableQty: stockQtyRaw === undefined ? 15 : Math.trunc(stockQtyRaw),
  })

  await invalidateStoreCatalogCache()

  return res.status(201).json({
    product: {
      id: created.productId,
      name: title,
      active,
      brand: { id: brand.id, name: brand.name, slug: brand.slug },
      category: { id: categoryId, name: categoryName },
      priceArs,
      costArs: resolvedCostArs,
      sku,
      imageUrl: images[0],
      stockAvailable: stock.availableQty,
      stockReserved: stock.reservedQty,
      stockSold: stock.soldQty,
      stockThreshold: stock.lowStockThreshold,
      inStock: stock.inStock,
      lowStock: stock.lowStock,
    },
  })
}
