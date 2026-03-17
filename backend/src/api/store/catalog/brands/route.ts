import type { HttpRequest, HttpResponse } from "../../../../lib/http"
import {
  createCatalogCacheKey,
  getCatalogCacheJson,
  setCatalogCacheJson,
} from "../../../../lib/catalog-cache"
import { getBrandPgService } from "../../../../lib/brand-pg-service"
import { setStorefrontPublicCacheHeaders } from "../../../../lib/http-cache"

const BRANDS_CACHE_TTL_SECONDS = 600

export async function GET(req: HttpRequest, res: HttpResponse) {
  const cacheKey = createCatalogCacheKey(
    "brands:list",
    req.originalUrl || req.url || "/store/catalog/brands"
  )
  const cached = await getCatalogCacheJson<{
    brands: Array<{ id: string; name: string; slug: string }>
    count: number
  }>(cacheKey)
  if (cached) {
    setStorefrontPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 1800,
    })
    return res.json(cached)
  }

  const brands = await getBrandPgService().listBrands({})
  brands.sort((a, b) => a.name.localeCompare(b.name))

  const responseBody = {
    brands: brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug })),
    count: brands.length,
  }
  await setCatalogCacheJson(cacheKey, responseBody, BRANDS_CACHE_TTL_SECONDS)
  setStorefrontPublicCacheHeaders(res, {
    maxAgeSeconds: 300,
    staleWhileRevalidateSeconds: 1800,
  })
  res.json(responseBody)
}
