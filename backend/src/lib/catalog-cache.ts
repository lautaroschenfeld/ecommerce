import crypto from "crypto"

import {
  getJsonFromRedisCache,
  invalidateRedisCachePrefix,
  setJsonInRedisCache,
} from "./redis-cache"

const CATALOG_CACHE_PREFIX = "store:catalog:v1:"

function hashInput(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex")
}

export function createCatalogCacheKey(scope: string, rawInput: string) {
  const normalizedScope = scope.trim().toLowerCase() || "unknown"
  return `${CATALOG_CACHE_PREFIX}${normalizedScope}:${hashInput(rawInput)}`
}

export async function getCatalogCacheJson<T>(key: string) {
  return await getJsonFromRedisCache<T>(key)
}

export async function setCatalogCacheJson(
  key: string,
  value: unknown,
  ttlSeconds: number
) {
  await setJsonInRedisCache(key, value, { ttlSeconds })
}

export async function invalidateStoreCatalogCache() {
  await invalidateRedisCachePrefix(CATALOG_CACHE_PREFIX)
}

