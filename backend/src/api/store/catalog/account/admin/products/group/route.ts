import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"

import { getBrandPgService } from "../../../../../../../lib/brand-pg-service"
import { invalidateStoreCatalogCache } from "../../../../../../../lib/catalog-cache"
import { STORE_CURRENCY_CODE } from "../../../../../../../lib/catalog"
import { pgQuery } from "../../../../../../../lib/pg"
import {
  ProductGroupSyncConflictError,
  syncSimpleProductGroup,
  type SyncSimpleProductGroupVariantInput,
} from "../../../../../../../lib/products-pg-service"
import { slugify } from "../../../../../../../lib/slug"
import { requireCustomerAdmin } from "../../../../_shared/customer-auth"

function toNumber(value: unknown) {
  const parsed =
    typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
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

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

async function getCategoryIdByName(name: string) {
  const rows = await pgQuery<{ id: string }>(
    `select "id"
     from "product_category"
     where "deleted_at" is null and "name" = $1
     limit 1;`,
    [name]
  )
  const id = rows[0]?.id
  return typeof id === "string" ? id : ""
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const brandService = getBrandPgService()
  const body = asRecord(req.body) ?? {}
  const anchorProductId =
    typeof body.anchorProductId === "string" ? body.anchorProductId.trim() : ""
  const expectedExistingProductIds = normalizeStringArray(body.expectedExistingProductIds)
  const variantsRaw = Array.isArray(body.variants) ? body.variants : []

  if (!anchorProductId) {
    return res.status(400).json({ message: "anchorProductId is required" })
  }
  if (!variantsRaw.length) {
    return res.status(400).json({ message: "variants must include at least one item" })
  }

  const categoryIdCache = new Map<string, string>()
  const brandIdCache = new Map<string, string>()
  const normalizedVariants: SyncSimpleProductGroupVariantInput[] = []

  for (const rawVariant of variantsRaw) {
    const variant = asRecord(rawVariant)
    if (!variant) {
      return res.status(400).json({ message: "variants contains an invalid item" })
    }

    const title = typeof variant.title === "string" ? variant.title.trim() : ""
    const brandName = typeof variant.brand === "string" ? variant.brand.trim() : ""
    const categoryName =
      typeof variant.category === "string" ? variant.category.trim() : ""
    const requestedHandle =
      typeof variant.handle === "string" ? slugify(variant.handle.trim()) : ""
    const priceArs = toNumber(variant.priceArs ?? variant.precio ?? variant.price)
    const directCostArs = toMoneyInt(
      variant.costArs ?? variant.costoArs ?? variant.costo ?? variant.cost
    )
    const stockAvailable = toNumber(
      variant.stock ?? variant.stock_qty ?? variant.stockAvailable ?? variant.available_qty
    )
    const sku = typeof variant.sku === "string" ? variant.sku.trim() : undefined
    const description =
      typeof variant.description === "string" ? variant.description : undefined
    const metadata = asRecord(variant.metadata) ?? {}
    const metadataCostArs = toMoneyInt(metadata.cost_ars ?? metadata.costArs)
    const images = normalizeStringArray(variant.images)
    const id = typeof variant.id === "string" ? variant.id.trim() : undefined
    const active =
      typeof variant.active === "boolean"
        ? variant.active
        : typeof variant.status === "string"
          ? variant.status !== "inactive"
          : true

    if (!title) return res.status(400).json({ message: "title is required" })
    if (!brandName) return res.status(400).json({ message: "brand is required" })
    if (!categoryName) return res.status(400).json({ message: "category is required" })
    if (priceArs === undefined || priceArs <= 0) {
      return res.status(400).json({ message: "priceArs is required" })
    }
    if (directCostArs !== undefined && directCostArs < 0) {
      return res.status(400).json({ message: "costArs must be >= 0" })
    }
    if (metadataCostArs !== undefined && metadataCostArs < 0) {
      return res.status(400).json({ message: "metadata.costArs must be >= 0" })
    }
    if (stockAvailable === undefined || stockAvailable < 0) {
      return res.status(400).json({ message: "stockAvailable must be >= 0" })
    }
    if (images.length > 10) {
      return res.status(400).json({ message: "max 10 images" })
    }

    let categoryId = categoryIdCache.get(categoryName)
    if (!categoryId) {
      categoryId = await getCategoryIdByName(categoryName)
      if (!categoryId) {
        return res.status(400).json({ message: "category is invalid" })
      }
      categoryIdCache.set(categoryName, categoryId)
    }

    let brandId = brandIdCache.get(brandName)
    if (!brandId) {
      const brandSlug = slugify(brandName)
      const existingBrand = await brandService.listBrands({ slug: brandSlug })
      const brand =
        existingBrand[0] ??
        (await brandService.createBrands({ name: brandName, slug: brandSlug }))
      const nextBrandId = typeof brand?.id === "string" ? brand.id : ""
      if (!nextBrandId) {
        return res.status(400).json({ message: "brand is invalid" })
      }
      brandId = nextBrandId
      brandIdCache.set(brandName, nextBrandId)
    }
    const resolvedBrandId = brandId
    if (!resolvedBrandId) {
      return res.status(400).json({ message: "brand is invalid" })
    }

    normalizedVariants.push({
      ...(id ? { id } : {}),
      title,
      ...(requestedHandle ? { handle: requestedHandle } : {}),
      description,
      status: active ? "published" : "draft",
      images,
      metadata,
      categoryId,
      brandId: resolvedBrandId,
      variantSku: sku ?? null,
      currencyCode: STORE_CURRENCY_CODE,
      priceAmount: priceArs,
      costAmount:
        directCostArs !== undefined
          ? directCostArs
          : metadataCostArs !== undefined
            ? metadataCostArs
            : Math.max(0, Math.round(priceArs * 0.55)),
      stockAvailable: Math.trunc(stockAvailable),
    })
  }

  try {
    const result = await syncSimpleProductGroup({
      anchorProductId,
      expectedExistingProductIds,
      variants: normalizedVariants,
    })

    await invalidateStoreCatalogCache()

    return res.status(200).json({
      groupId: result.groupId,
      productIds: result.productIds,
    })
  } catch (error) {
    if (error instanceof ProductGroupSyncConflictError) {
      return res.status(409).json({ message: error.message })
    }
    throw error
  }
}
