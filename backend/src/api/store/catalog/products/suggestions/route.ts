import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import {
  createCatalogCacheKey,
  getCatalogCacheJson,
  setCatalogCacheJson,
} from "../../../../../lib/catalog-cache"
import { listCatalogProductSuggestions } from "../../../../../lib/catalog-pg"
import { setStorefrontPublicCacheHeaders } from "../../../../../lib/http-cache"
import { pgQuery } from "../../../../../lib/pg"
import { slugify } from "../../../../../lib/slug"

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

function uniq(list: string[]) {
  return Array.from(new Set(list))
}

const PRODUCT_SUGGESTIONS_CACHE_TTL_SECONDS = 30

export async function GET(req: HttpRequest, res: HttpResponse) {
  const q = (toString(req.query.q) || toString(req.query.buscar) || "").trim()
  const limit = Math.max(1, Math.min(12, toNumber(req.query.limit) ?? 8))
  if (q.length < 2) {
    setStorefrontPublicCacheHeaders(res, {
      maxAgeSeconds: PRODUCT_SUGGESTIONS_CACHE_TTL_SECONDS,
      staleWhileRevalidateSeconds: PRODUCT_SUGGESTIONS_CACHE_TTL_SECONDS * 3,
    })
    return res.json({
      suggestions: [],
      count: 0,
      q,
      limit,
    })
  }

  const cacheKey = createCatalogCacheKey(
    "products:suggestions",
    req.originalUrl || req.url || JSON.stringify(req.query || {})
  )
  const cached = await getCatalogCacheJson<{
    suggestions: unknown[]
    count: number
    q: string
    limit: number
  }>(cacheKey)
  if (cached) {
    setStorefrontPublicCacheHeaders(res, {
      maxAgeSeconds: PRODUCT_SUGGESTIONS_CACHE_TTL_SECONDS,
      staleWhileRevalidateSeconds: PRODUCT_SUGGESTIONS_CACHE_TTL_SECONDS * 3,
    })
    return res.json(cached)
  }

  const categoryName = toString(req.query.categoria) || toString(req.query.category)
  const brandRaw = req.query.marca ?? req.query.brand
  const brandFilters = toStringArray(brandRaw)
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean)
  const minPrice = toNumber(req.query.min_price) ?? toNumber(req.query.minPrice)
  const maxPrice = toNumber(req.query.max_price) ?? toNumber(req.query.maxPrice)

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

  const brandSlugs = uniq(
    brandFilters
      .map((b) => slugify(b))
      .map((b) => b.trim())
      .filter(Boolean)
  )

  const suggestions = await listCatalogProductSuggestions({
    q,
    status: "published",
    ...(categoryId ? { categoryId } : {}),
    ...(brandSlugs.length ? { brandSlugs } : {}),
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
    limit,
  })

  const responseBody = {
    suggestions: suggestions.map((item) => ({
      id: item.id,
      handle: item.handle,
      name: item.title,
      brand: item.brand ? { id: item.brand.id, name: item.brand.name, slug: item.brand.slug } : undefined,
      category: item.category ? { id: item.category.id, name: item.category.name } : undefined,
      priceArs: item.price_ars ?? undefined,
      imageUrl: item.thumbnail ?? undefined,
      createdAt: item.created_at,
    })),
    count: suggestions.length,
    q,
    limit,
  }

  await setCatalogCacheJson(cacheKey, responseBody, PRODUCT_SUGGESTIONS_CACHE_TTL_SECONDS)
  setStorefrontPublicCacheHeaders(res, {
    maxAgeSeconds: PRODUCT_SUGGESTIONS_CACHE_TTL_SECONDS,
    staleWhileRevalidateSeconds: PRODUCT_SUGGESTIONS_CACHE_TTL_SECONDS * 3,
  })
  return res.json(responseBody)
}
