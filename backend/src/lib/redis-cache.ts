import { createClient, type RedisClientType } from "redis"

type CacheSetOptions = {
  ttlSeconds: number
}

const REDIS_URL = String(process.env.REDIS_URL || "").trim()
const REDIS_ENABLED = Boolean(REDIS_URL)
const REDIS_CONNECT_TIMEOUT_MS = 2_500
const REDIS_SCAN_BATCH_SIZE = 200

let redisClientPromise: Promise<RedisClientType | null> | null = null
let redisUnavailableLogged = false

function logRedisUnavailable(error: unknown) {
  if (redisUnavailableLogged) return
  redisUnavailableLogged = true
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[redis-cache] disabled: ${message}`)
}

async function createRedisClient() {
  if (!REDIS_ENABLED) return null

  const client: RedisClientType = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    },
  })

  client.on("error", (error) => {
    logRedisUnavailable(error)
  })

  try {
    await client.connect()
    return client
  } catch (error) {
    logRedisUnavailable(error)
    try {
      await client.disconnect()
    } catch {
      // Best-effort cleanup.
    }
    return null
  }
}

async function getRedisClient() {
  if (!REDIS_ENABLED) return null

  if (!redisClientPromise) {
    redisClientPromise = createRedisClient().catch((error) => {
      logRedisUnavailable(error)
      return null
    })
  }

  return await redisClientPromise
}

export async function getJsonFromRedisCache<T>(key: string): Promise<T | null> {
  const client = await getRedisClient()
  if (!client) return null

  try {
    const raw = await client.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function setJsonInRedisCache(
  key: string,
  value: unknown,
  options: CacheSetOptions
) {
  const client = await getRedisClient()
  if (!client) return

  const ttlSeconds = Math.max(1, Math.trunc(options.ttlSeconds))

  try {
    await client.set(key, JSON.stringify(value), {
      EX: ttlSeconds,
    })
  } catch {
    // Best-effort cache write.
  }
}

async function deleteKeys(client: RedisClientType, keys: string[]) {
  if (!keys.length) return
  try {
    await client.del(keys)
  } catch {
    // Best-effort invalidation.
  }
}

export async function invalidateRedisCachePrefix(prefix: string) {
  const client = await getRedisClient()
  if (!client) return

  const pattern = `${prefix}*`
  const batch: string[] = []

  try {
    for await (const key of client.scanIterator({
      MATCH: pattern,
      COUNT: REDIS_SCAN_BATCH_SIZE,
    })) {
      batch.push(String(key))
      if (batch.length < REDIS_SCAN_BATCH_SIZE) continue
      await deleteKeys(client, batch)
      batch.length = 0
    }

    if (batch.length) {
      await deleteKeys(client, batch)
    }
  } catch {
    // Best-effort invalidation.
  }
}

