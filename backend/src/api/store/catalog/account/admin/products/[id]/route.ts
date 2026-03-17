import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"

import { getBrandPgService } from "../../../../../../../lib/brand-pg-service"
import { invalidateStoreCatalogCache } from "../../../../../../../lib/catalog-cache"
import { STORE_CURRENCY_CODE } from "../../../../../../../lib/catalog"
import { getCatalogProductsByIds } from "../../../../../../../lib/catalog-pg"
import { pgQuery } from "../../../../../../../lib/pg"
import {
  deleteSimpleProduct,
  updateSimpleProduct,
} from "../../../../../../../lib/products-pg-service"
import { slugify } from "../../../../../../../lib/slug"
import {
  getStockSnapshotsByProductIds,
  setProductStockLevel,
} from "../../../../../../../lib/stock"
import { requireCustomerAdmin } from "../../../../_shared/customer-auth"

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
    return normalized === "true" || normalized === "1" || normalized === "yes"
  }
  return false
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

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const id = req.params.id
  const products = await getCatalogProductsByIds([id])
  const product = products[0] as any
  if (!product) {
    return res.status(404).json({ message: "Not found" })
  }

  const brand = pickBrand(product)
  const firstCategory = Array.isArray(product.categories)
    ? product.categories[0]
    : undefined
  const firstVariant = Array.isArray(product.variants) ? product.variants[0] : undefined
  const priceArs = pickConfiguredPrice(firstVariant)
  const stockByProduct = await getStockSnapshotsByProductIds([id])
  const stock = stockByProduct.get(id)
  const meta = (typeof product.metadata === "object" && product.metadata) || {}
  const variantMeta =
    (Array.isArray(product.variants) &&
      typeof product.variants[0]?.metadata === "object" &&
      product.variants[0].metadata) ||
    {}
  const metadata = { ...meta, ...variantMeta }
  const costArs = pickConfiguredCost(firstVariant, metadata) ?? Math.max(0, Math.round((priceArs ?? 0) * 0.55))
  const condition =
    typeof metadata.condition === "string" ? String(metadata.condition) : "nuevo"
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

  return res.json({
    product: {
      id: product.id,
      name: product.title,
      description: product.description,
      metadata,
      condition,
      color,
      size,
      gender,
      variantGroupId,
      archived,
      active: product.status === "published",
      brand: brand ? { id: brand.id, name: brand.name, slug: brand.slug } : undefined,
      category: firstCategory ? { id: firstCategory.id, name: firstCategory.name } : undefined,
      priceArs,
      costArs,
      sku: firstVariant?.sku ?? undefined,
      variantId: firstVariant?.id ?? undefined,
      images: Array.isArray(product.images)
        ? product.images.map((img: any) => img.url).filter(Boolean)
        : [],
      thumbnail: product.thumbnail ?? undefined,
      stockAvailable: stock?.availableQty ?? 0,
      stockReserved: stock?.reservedQty ?? 0,
      stockSold: stock?.soldQty ?? 0,
      stockThreshold: stock?.lowStockThreshold ?? 3,
      inStock: stock?.inStock ?? false,
      lowStock: stock?.lowStock ?? true,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    },
  })
}

export async function PATCH(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const brandService = getBrandPgService()

  const id = req.params.id
  const body = (req.body ?? {}) as Record<string, unknown>

  const titleRaw = (body.title ?? body.name) as unknown
  const title = typeof titleRaw === "string" ? titleRaw.trim() : undefined

  const description = typeof body.description === "string" ? body.description : undefined

  const categoryRaw = (body.category ?? body.categoria) as unknown
  const categoryName =
    typeof categoryRaw === "string" ? categoryRaw.trim() : undefined

  const brandRaw = (body.brand ?? body.marca) as unknown
  const brandName = typeof brandRaw === "string" ? brandRaw.trim() : undefined

  const priceArs = toNumber(body.priceArs ?? body.precio ?? body.price)
  const directCostArs = toMoneyInt(body.costArs ?? body.costoArs ?? body.costo ?? body.cost)
  const stockQtyRaw = toNumber(
    body.stock ?? body.stock_qty ?? body.stockAvailable ?? body.available_qty
  )
  const sku = typeof body.sku === "string" ? body.sku.trim() : undefined
  const metadata =
    typeof body.metadata === "object" && body.metadata !== null
      ? (body.metadata as Record<string, any>)
      : undefined
  const metadataCostArs =
    metadata !== undefined
      ? toMoneyInt(metadata.cost_ars ?? metadata.costArs)
      : undefined
  const costArs =
    directCostArs !== undefined
      ? directCostArs
      : metadataCostArs

  const active =
    typeof body.active === "boolean"
      ? body.active
      : typeof body.status === "string"
        ? body.status !== "inactive"
        : undefined

  const images =
    Array.isArray(body.images) && body.images.every((x) => typeof x === "string")
      ? (body.images as string[]).map((s) => s.trim()).filter(Boolean)
      : undefined
  if (images && images.length > 10) {
    return res.status(400).json({ message: "max 10 images" })
  }

  if (stockQtyRaw !== undefined && stockQtyRaw < 0) {
    return res.status(400).json({ message: "stock must be >= 0" })
  }
  if (directCostArs !== undefined && directCostArs < 0) {
    return res.status(400).json({ message: "costArs must be >= 0" })
  }
  if (metadataCostArs !== undefined && metadataCostArs < 0) {
    return res.status(400).json({ message: "metadata.costArs must be >= 0" })
  }

  // Ensure product exists before updating.
  const current = (await getCatalogProductsByIds([id]))[0]
  if (!current) return res.status(404).json({ message: "Not found" })

  // Category resolution
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
    if (!categoryId) return res.status(400).json({ message: "category is invalid" })
  }

  // Brand upsert
  let nextBrand = undefined as any
  if (brandName) {
    const slug = slugify(brandName)
    const existing = await brandService.listBrands({ slug })
    nextBrand = existing[0] ?? (await brandService.createBrands({ name: brandName, slug }))
  }

  if (!Array.isArray(current.variants) || !current.variants.length) {
    return res.status(400).json({ message: "Product has no variants" })
  }

  await updateSimpleProduct({
    productId: id,
    title,
    description,
    status: active === undefined ? undefined : active ? "published" : "draft",
    images,
    metadata,
    categoryId,
    brandId: nextBrand?.id,
    variantSku: sku,
    currencyCode: STORE_CURRENCY_CODE,
    priceAmount: priceArs,
    costAmount: costArs,
  })

  if (stockQtyRaw !== undefined) {
    await setProductStockLevel({
      productId: id,
      availableQty: Math.trunc(stockQtyRaw),
    })
  }

  await invalidateStoreCatalogCache()

  return res.status(200).json({ id })
}

export async function DELETE(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const id = req.params.id
  const current = (await getCatalogProductsByIds([id]))[0] as any
  if (!current) return res.status(404).json({ message: "Not found" })

  await deleteSimpleProduct(id)
  await invalidateStoreCatalogCache()

  return res.sendStatus(204)
}
