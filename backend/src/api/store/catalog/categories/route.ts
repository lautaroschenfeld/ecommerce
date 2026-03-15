import type { HttpRequest, HttpResponse } from "../../../../lib/http"

import {
  createCatalogCacheKey,
  getCatalogCacheJson,
  setCatalogCacheJson,
} from "../../../../lib/catalog-cache"
import { setStorefrontPublicCacheHeaders } from "../../../../lib/http-cache"
import { pgQuery } from "../../../../lib/pg"

const CATEGORIES_CACHE_TTL_SECONDS = 600

export async function GET(req: HttpRequest, res: HttpResponse) {
  try {
    const cacheKey = createCatalogCacheKey(
      "categories:list",
      req.originalUrl || req.url || "/store/catalog/categories"
    )
    const cached = await getCatalogCacheJson<{
      categories: Array<{ id: string; name: string }>
      count: number
    }>(cacheKey)
    if (cached) {
      setStorefrontPublicCacheHeaders(res, {
        maxAgeSeconds: 300,
        staleWhileRevalidateSeconds: 1800,
      })
      return res.json(cached)
    }

    const categories = await pgQuery<{ id: string; name: string }>(
      `select "id", "name"
       from "product_category"
       where "deleted_at" is null
       limit 500;`
    )

    const mapped = categories
      .map((c: any) => ({ id: c.id as string, name: c.name as string }))
      .filter((c) => typeof c.name === "string" && c.name.trim())
      .map((c) => ({ id: c.id, name: c.name.trim() }))

    mapped.sort((a, b) => a.name.localeCompare(b.name))

    const responseBody = {
      categories: mapped,
      count: mapped.length,
    }
    await setCatalogCacheJson(cacheKey, responseBody, CATEGORIES_CACHE_TTL_SECONDS)
    setStorefrontPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 1800,
    })
    return res.json(responseBody)
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    console.error("[store/catalog/categories] failed to load categories", {
      path: req.path,
      message: errorMessage,
    })
    return res.status(500).json({
      message: "Service temporarily unavailable.",
      code: "CATALOG_CATEGORIES_UNAVAILABLE",
    })
  }
}
