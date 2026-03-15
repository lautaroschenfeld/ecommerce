import type { HttpRequest, HttpResponse } from "../../../../lib/http"
import { getPgPool, type PgClient, type PgPool } from "../../../../lib/pg"

type Bucket = {
  count: number
  resetAt: number
}

type RateLimitResult = {
  count: number
  resetAtMs: number
}

type RateLimitConfig = {
  keyPrefix: string
  limit: number
  windowMs: number
  code: string
}

const WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 120
const MAX_LOGIN_PER_WINDOW = 20

const TELEMETRY_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const MAX_TELEMETRY_PER_WINDOW = 40

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
const TRUST_PROXY_HEADERS =
  String(process.env.TRUST_PROXY_HEADERS || "").toLowerCase() === "true"

const fallbackByIpAndRoute = new Map<string, Bucket>()

let ensureTablePromise: Promise<void> | null = null
let nextCleanupAt = 0

function nowMs() {
  return Date.now()
}

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.trunc(parsed)
}

function getPool() {
  return getPgPool() as PgPool
}

function sanitizeIp(input: unknown) {
  if (typeof input !== "string") return "unknown"
  const trimmed = input.trim()
  return trimmed.slice(0, 120) || "unknown"
}

function getClientIp(req: HttpRequest) {
  if (TRUST_PROXY_HEADERS) {
    const xfwd = req.headers["x-forwarded-for"]
    if (typeof xfwd === "string" && xfwd.trim()) {
      return sanitizeIp(xfwd.split(",")[0])
    }
    if (Array.isArray(xfwd) && xfwd[0]) {
      return sanitizeIp(String(xfwd[0]))
    }

    const xreal = req.headers["x-real-ip"]
    if (typeof xreal === "string" && xreal.trim()) {
      return sanitizeIp(xreal)
    }
  }

  return sanitizeIp(typeof req.ip === "string" ? req.ip : "unknown")
}

function keyFor(req: HttpRequest, keyPrefix: string) {
  const ip = getClientIp(req)
  return `${keyPrefix}:${ip}:${req.path}`
}

function isLoginRoute(path: string) {
  return (
    path.includes("/auth/login") ||
    path.includes("/auth/register") ||
    path.includes("/auth/forgot-password") ||
    path.includes("/auth/reset-password")
  )
}

async function ensureTable() {
  if (ensureTablePromise) return ensureTablePromise
  ensureTablePromise = (async () => {
    const db = getPool()
    await db.query(`
      create table if not exists "mp_rate_limit_bucket" (
        "bucket_key" text primary key,
        "count" integer not null,
        "reset_at" timestamptz not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
    `)
    await db.query(`
      create index if not exists "IDX_mp_rate_limit_bucket_reset_at"
      on "mp_rate_limit_bucket" ("reset_at");
    `)
  })()
  return ensureTablePromise
}

async function consumePersistentBucket(
  bucketKey: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  await ensureTable()
  const now = nowMs()
  const db = getPool()
  const client = await db.connect()

  try {
    await client.query("begin")

    if (now >= nextCleanupAt) {
      nextCleanupAt = now + CLEANUP_INTERVAL_MS
      await client.query(`delete from "mp_rate_limit_bucket" where "reset_at" <= now();`)
    }

    const { rows } = await client.query(
      `
        select
          "count",
          extract(epoch from "reset_at") * 1000 as "reset_at_ms"
        from "mp_rate_limit_bucket"
        where "bucket_key" = $1
        for update;
      `,
      [bucketKey]
    )

    if (!rows[0]) {
      const resetAt = new Date(now + windowMs).toISOString()
      await client.query(
        `
          insert into "mp_rate_limit_bucket"
            ("bucket_key","count","reset_at","created_at","updated_at")
          values
            ($1, 1, $2, now(), now());
        `,
        [bucketKey, resetAt]
      )
      await client.query("commit")
      return { count: 1, resetAtMs: now + windowMs }
    }

    const currentCount = toPositiveInt(rows[0].count, 0)
    const resetAtMs = Math.trunc(Number(rows[0].reset_at_ms || 0))
    if (!Number.isFinite(resetAtMs) || resetAtMs <= now) {
      const nextResetAt = new Date(now + windowMs).toISOString()
      await client.query(
        `
          update "mp_rate_limit_bucket"
          set "count" = 1,
              "reset_at" = $2,
              "updated_at" = now()
          where "bucket_key" = $1;
        `,
        [bucketKey, nextResetAt]
      )
      await client.query("commit")
      return { count: 1, resetAtMs: now + windowMs }
    }

    const nextCount = currentCount + 1
    await client.query(
      `
        update "mp_rate_limit_bucket"
        set "count" = $2,
            "updated_at" = now()
        where "bucket_key" = $1;
      `,
      [bucketKey, nextCount]
    )

    await client.query("commit")
    return { count: nextCount, resetAtMs }
  } catch (error) {
    try {
      await client.query("rollback")
    } catch {
      // ignore rollback failure
    }
    throw error
  } finally {
    client.release()
  }
}

function consumeFallbackInMemory(
  bucketKey: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = nowMs()
  const current = fallbackByIpAndRoute.get(bucketKey)

  if (!current || current.resetAt <= now) {
    fallbackByIpAndRoute.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    })
    return { count: 1, resetAtMs: now + windowMs }
  }

  current.count += 1
  return {
    count: current.count,
    resetAtMs: current.resetAt,
  }
}

async function consumeBucket(
  bucketKey: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  try {
    return await consumePersistentBucket(bucketKey, limit, windowMs)
  } catch {
    return consumeFallbackInMemory(bucketKey, limit, windowMs)
  }
}

async function applyRateLimit(
  req: HttpRequest,
  res: HttpResponse,
  next: () => void,
  config: RateLimitConfig
) {
  const bucketKey = keyFor(req, config.keyPrefix)
  const result = await consumeBucket(bucketKey, config.limit, config.windowMs)
  if (result.count <= config.limit) {
    return next()
  }

  const retryAfter = Math.max(1, Math.ceil((result.resetAtMs - nowMs()) / 1000))
  res.setHeader("Retry-After", String(retryAfter))
  return res.status(429).json({
    message: "Too many requests. Please try again later.",
    code: config.code,
    retry_after_seconds: retryAfter,
  })
}

export function authRateLimitMiddleware(
  req: HttpRequest,
  res: HttpResponse,
  next: () => void
) {
  const isLogin = isLoginRoute(req.path)
  void applyRateLimit(req, res, next, {
    keyPrefix: "auth",
    limit: isLogin ? MAX_LOGIN_PER_WINDOW : MAX_REQUESTS_PER_WINDOW,
    windowMs: WINDOW_MS,
    code: "AUTH_RATE_LIMITED",
  }).catch((error) => {
    console.error("[rate-limit] auth middleware failed", {
      path: req.path,
      method: req.method,
      message: error instanceof Error ? error.message : String(error),
    })
    next()
  })
}

export function telemetryRateLimitMiddleware(
  req: HttpRequest,
  res: HttpResponse,
  next: () => void
) {
  void applyRateLimit(req, res, next, {
    keyPrefix: "telemetry",
    limit: MAX_TELEMETRY_PER_WINDOW,
    windowMs: TELEMETRY_WINDOW_MS,
    code: "TELEMETRY_RATE_LIMITED",
  }).catch((error) => {
    console.error("[rate-limit] telemetry middleware failed", {
      path: req.path,
      method: req.method,
      message: error instanceof Error ? error.message : String(error),
    })
    next()
  })
}
