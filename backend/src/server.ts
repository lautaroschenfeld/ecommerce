import crypto from "crypto"
import * as fs from "fs/promises"
import type { Server } from "http"
import path from "path"

import cors from "cors"
import express from "express"

import { runAppMigrations } from "./lib/db-migrations"
import { assertSecureRuntimeEnv, loadEnv } from "./lib/env"
import { HttpError } from "./lib/http"
import { logError, logInfo } from "./lib/logger"
import { startMaintenanceScheduler } from "./lib/maintenance-scheduler"
import { recordHttpRequestMetric, renderPrometheusMetrics } from "./lib/metrics"
import { closePgPool, pgQuery } from "./lib/pg"
import { sanitizeExpressRequestInputs } from "./lib/request-input-sanitizer"
import { responseTimeMiddleware } from "./api/_shared/response-time"
import {
  authRateLimitMiddleware,
  telemetryRateLimitMiddleware,
} from "./api/store/catalog/_shared/auth-rate-limit"

// Avoid adding a TS dependency on @types/multer.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require("multer")

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD"

const ROUTE_METHODS: readonly HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
]

let processSafetyHandlersInstalled = false

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    message: String(error),
    stack: undefined,
  }
}

function installProcessSafetyHandlers() {
  if (processSafetyHandlersInstalled) return
  processSafetyHandlersInstalled = true

  process.on("unhandledRejection", (reason) => {
    const info = formatUnknownError(reason)
    logError("server.unhandled_rejection", info)
  })

  process.on("uncaughtException", (error) => {
    const info = formatUnknownError(error)
    logError("server.uncaught_exception", info)
  })
}

function parseAllowedOrigins(raw: string | undefined) {
  return String(raw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function buildAllowedOrigins() {
  return new Set([
    ...parseAllowedOrigins(process.env.STORE_CORS),
    ...parseAllowedOrigins(process.env.ADMIN_CORS),
    ...parseAllowedOrigins(process.env.AUTH_CORS),
  ])
}

function toPositiveInt(raw: unknown, fallback: number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.trunc(parsed)
}

function appendVary(existing: unknown, value: string) {
  const current = typeof existing === "string" ? existing : ""
  const values = current
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (!values.includes(value)) {
    values.push(value)
  }
  return values.join(", ")
}

function sanitizeRequestId(raw: unknown) {
  const normalized = String(raw || "")
    .trim()
    .slice(0, 120)
  if (!normalized) return ""
  const safe = normalized.replace(/[^a-zA-Z0-9._:-]/g, "")
  return safe.slice(0, 120)
}

function resolveRequestId(req: any) {
  const fromHeader = sanitizeRequestId(
    req?.headers?.["x-request-id"] ??
      req?.headers?.["x-correlation-id"]
  )
  if (fromHeader) return fromHeader
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function getDefaultContentSecurityPolicy() {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join("; ")
}

function resolveRequestPath(req: any) {
  const fromOriginalUrl =
    typeof req?.originalUrl === "string"
      ? req.originalUrl.split("?")[0]
      : ""
  if (fromOriginalUrl) return fromOriginalUrl

  const fromPath = typeof req?.path === "string" ? req.path : ""
  if (fromPath) return fromPath

  return "/"
}

function resolveClientIp(req: any) {
  const fromIp = typeof req?.ip === "string" ? req.ip.trim() : ""
  if (fromIp) return fromIp

  const fromForwarded = req?.headers?.["x-forwarded-for"]
  if (typeof fromForwarded === "string") {
    const first = fromForwarded.split(",")[0]?.trim()
    if (first) return first
  }
  if (Array.isArray(fromForwarded) && typeof fromForwarded[0] === "string") {
    const first = fromForwarded[0].split(",")[0]?.trim()
    if (first) return first
  }

  return ""
}

type UploadMiddlewareOptions = {
  maxFileSizeBytes?: number
  maxFiles?: number
  allowedMime?: Set<string>
  allowedExt?: Set<string>
}

function createUploadMiddleware(options: UploadMiddlewareOptions = {}) {
  const MAX_UPLOAD_FILE_SIZE_BYTES = toPositiveInt(
    typeof options.maxFileSizeBytes === "number"
      ? options.maxFileSizeBytes
      : process.env.ADMIN_UPLOAD_MAX_FILE_SIZE_BYTES,
    8 * 1024 * 1024
  )

  const maxFilesFallback = toPositiveInt(process.env.ADMIN_UPLOAD_MAX_FILES, 8)
  const maxFiles = toPositiveInt(
    typeof options.maxFiles === "number" ? options.maxFiles : maxFilesFallback,
    8
  )

  const ALLOWED_UPLOAD_MIME = options.allowedMime ?? new Set(["image/jpeg", "image/png", "image/webp"])
  const ALLOWED_UPLOAD_EXT = options.allowedExt ?? new Set([".jpg", ".jpeg", ".png", ".webp"])

  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_UPLOAD_FILE_SIZE_BYTES,
      files: maxFiles,
    },
    fileFilter: (
      _req: any,
      file: any,
      cb: (error: Error | null, acceptFile?: boolean) => void
    ) => {
      const mime = String(file?.mimetype || "").toLowerCase()
      const ext = path.extname(String(file?.originalname || "")).toLowerCase()

      if (!ALLOWED_UPLOAD_MIME.has(mime) || !ALLOWED_UPLOAD_EXT.has(ext)) {
        return cb(new Error("File type not allowed."))
      }
      return cb(null, true)
    },
  })
}

function methodAndPathMatch(req: any, methods: HttpMethod[], matcher: RegExp | string) {
  const method = String(req.method || "").toUpperCase()
  if (!methods.includes(method as HttpMethod)) return false

  const pathValue = typeof req.path === "string" ? req.path : ""
  if (matcher instanceof RegExp) return matcher.test(pathValue)
  return pathValue === matcher
}

function shouldApplyAuthRateLimit(req: any) {
  const methods: HttpMethod[] = ["GET", "POST", "PATCH", "DELETE"]
  if (methodAndPathMatch(req, methods, /^\/store\/catalog\/auth\//)) return true
  if (methodAndPathMatch(req, ["POST"], "/store/catalog/checkout/orders")) return true
  if (methodAndPathMatch(req, ["POST"], /^\/store\/catalog\/checkout\/orders\/[^/]+\/transfer-proof$/))
    return true
  if (methodAndPathMatch(req, ["POST"], "/store/catalog/coupons/validate")) return true
  if (methodAndPathMatch(req, ["POST", "DELETE"], /^\/store\/catalog\/checkout\/reservations\//)) return true
  if (methodAndPathMatch(req, ["POST"], "/store/catalog/checkout/reservations")) return true
  if (methodAndPathMatch(req, methods, /^\/store\/catalog\/account\//)) return true
  return false
}

function shouldApplyTelemetryRateLimit(req: any) {
  return methodAndPathMatch(req, ["POST"], /^\/store\/catalog\/telemetry\//)
}

function filePathToRoutePath(routeFile: string, apiRoot: string) {
  const dir = path.dirname(routeFile)
  const relDir = path.relative(apiRoot, dir)
  const segments = relDir
    .split(path.sep)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment) => {
      const match = segment.match(/^\[(.+)\]$/)
      if (match) return `:${match[1]}`
      return segment
    })

  return `/${segments.join("/")}`
}

async function findRouteFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await findRouteFiles(full)))
      continue
    }
    if (entry.isFile() && (entry.name === "route.ts" || entry.name === "route.js")) {
      out.push(full)
    }
  }
  return out
}

function mapHttpErrorToStatus(error: HttpError) {
  const type = String((error as any).type || "")
  if (type === HttpError.Types.INVALID_DATA) return 400
  if (type === HttpError.Types.UNAUTHORIZED) return 401
  if (type === HttpError.Types.NOT_FOUND) return 404
  if (type === HttpError.Types.UNEXPECTED_STATE) return 409
  return 500
}

type PublishableKeyCache = {
  tokens: Set<string>
  expiresAtMs: number
}

let publishableKeyCache: PublishableKeyCache = {
  tokens: new Set(),
  expiresAtMs: 0,
}

function readPublishableKey(req: any) {
  const raw = req?.headers?.["x-publishable-api-key"]
  if (typeof raw === "string") return raw.trim()
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim()
  return ""
}

function isStorePath(pathname: string) {
  return pathname === "/store" || pathname.startsWith("/store/")
}

async function validatePublishableKey(token: string) {
  if (!token) return false

  const nowMs = Date.now()
  if (nowMs < publishableKeyCache.expiresAtMs && publishableKeyCache.tokens.has(token)) {
    return true
  }

  if (nowMs >= publishableKeyCache.expiresAtMs) {
    const rows = await pgQuery<{ token: string }>(
      `select "token"
       from "api_key"
       where "deleted_at" is null
         and "revoked_at" is null
         and "type" = 'publishable'
       limit 50;`
    )

    publishableKeyCache = {
      tokens: new Set(
        rows.map((row) => (typeof row?.token === "string" ? row.token : "")).filter(Boolean)
      ),
      expiresAtMs: nowMs + 60_000,
    }

    return publishableKeyCache.tokens.has(token)
  }

  const found = await pgQuery<{ id: string }>(
    `select "id"
     from "api_key"
     where "deleted_at" is null
       and "revoked_at" is null
       and "type" = 'publishable'
       and "token" = $1
     limit 1;`,
    [token]
  )

  const ok = typeof found[0]?.id === "string" && Boolean(found[0].id)
  if (ok) {
    publishableKeyCache.tokens.add(token)
  }
  return ok
}

async function registerApiRoutes(app: any) {
  // Works for both `src/server.ts` (ts-node) and `dist/server.js` (built).
  const apiRoot = path.resolve(__dirname, "api")
  const adminUpload = createUploadMiddleware()
  const transferProofUpload = createUploadMiddleware({
    maxFileSizeBytes: toPositiveInt(
      process.env.TRANSFER_PROOF_MAX_FILE_SIZE_BYTES,
      12 * 1024 * 1024
    ),
    maxFiles: toPositiveInt(process.env.TRANSFER_PROOF_MAX_FILES, 1),
    allowedMime: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
    allowedExt: new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]),
  })

  const uploadMatchers = new Map<string, any>([
    ["/store/catalog/account/admin/uploads", adminUpload.array("files")],
    ["/store/catalog/checkout/orders/:id/transfer-proof", transferProofUpload.array("files")],
  ])

  const routeFiles = await findRouteFiles(apiRoot)

  for (const routeFile of routeFiles) {
    const routePath = filePathToRoutePath(routeFile, apiRoot)

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(routeFile) as Record<string, any>

    for (const method of ROUTE_METHODS) {
      const handler = mod[method]
      if (typeof handler !== "function") continue

      const expressMethod = method.toLowerCase()
      const middlewares: any[] = []

      if (method === "POST" && uploadMatchers.has(routePath)) {
        middlewares.push(uploadMatchers.get(routePath))
      }

      app[expressMethod](routePath, ...middlewares, async (req: any, res: any, next: any) => {
        try {
          sanitizeExpressRequestInputs(req)
          await handler(req, res)
        } catch (error) {
          next(error)
        }
      })
    }
  }
}

async function runReadinessChecks() {
  await pgQuery(`select 1 as ok;`)
}

type StartedServer = {
  app: any
  port: number
  stop: () => Promise<void>
}

export async function startServer(): Promise<StartedServer> {
  installProcessSafetyHandlers()
  loadEnv()
  assertSecureRuntimeEnv()
  await runAppMigrations()

  const allowedOrigins = buildAllowedOrigins()

  const app = express()

  const trustProxy =
    String(process.env.TRUST_PROXY_HEADERS || "").toLowerCase() === "true"
  if (trustProxy) {
    app.set("trust proxy", true)
  }

  app.disable("x-powered-by")

  app.use((req: any, res: any, next: any) => {
    const requestId = resolveRequestId(req)
    req.requestId = requestId
    res.setHeader("x-request-id", requestId)
    next()
  })

  app.use((req: any, res: any, next: any) => {
    const startedAt = process.hrtime.bigint()

    res.on("finish", () => {
      const elapsedNs = process.hrtime.bigint() - startedAt
      const durationMs = Number(elapsedNs) / 1_000_000
      const method = String(req.method || "GET").toUpperCase()
      const pathValue = resolveRequestPath(req)
      const status =
        Number.isFinite(Number(res.statusCode)) && Number(res.statusCode) > 0
          ? Math.trunc(Number(res.statusCode))
          : 0
      const requestId =
        sanitizeRequestId(req.requestId) ||
        sanitizeRequestId(res.getHeader("x-request-id"))

      recordHttpRequestMetric({
        method,
        path: pathValue,
        status,
        durationMs,
      })

      const fields = {
        requestId: requestId || undefined,
        method,
        path: pathValue,
        status,
        durationMs: Math.round(durationMs * 100) / 100,
        ip: resolveClientIp(req) || undefined,
      }

      if (status >= 500) {
        logError("http.request.completed", fields)
        return
      }
      if (status >= 400) {
        logInfo("http.request.completed", fields)
        return
      }
      if (pathValue !== "/health" && pathValue !== "/health/ready" && pathValue !== "/metrics") {
        logInfo("http.request.completed", fields)
      }
    })

    next()
  })

  app.use((req: any, res: any, next: any) => {
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("Referrer-Policy", "no-referrer")
    if (!res.getHeader("Content-Security-Policy")) {
      res.setHeader("Content-Security-Policy", getDefaultContentSecurityPolicy())
    }
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    )
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
    res.setHeader("Cross-Origin-Resource-Policy", "same-site")

    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains")
    }

    next()
  })

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true)
        if (allowedOrigins.has(origin)) return cb(null, true)
        return cb(new Error("Origin not allowed by CORS"))
      },
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Origin",
        "X-Requested-With",
        "Content-Type",
        "Accept",
        "Authorization",
        "x-publishable-api-key",
        "x-request-id",
      ],
      exposedHeaders: ["x-response-time-ms", "x-idempotency-replayed", "x-request-id"],
    })
  )

  app.use((req: any, res: any, next: any) => {
    const pathValue = String(req.path || "")
    if (!pathValue.startsWith("/store/")) return next()

    const hasCorsOrigin = Boolean(res.getHeader("Access-Control-Allow-Origin"))
    if (!hasCorsOrigin) return next()

    const vary = appendVary(res.getHeader("Vary"), "Origin")
    if (vary) {
      res.setHeader("Vary", vary)
    }
    return next()
  })

  app.use(express.json({ limit: "2mb" }))

  app.use("/static", express.static(path.resolve(process.cwd(), "static")))

  // Match previous middleware coverage.
  app.use((req: any, res: any, next: any) => {
    const pathValue = typeof req.path === "string" ? req.path : ""
    if (pathValue.startsWith("/store/") || pathValue === "/store") {
      return responseTimeMiddleware(req, res, next)
    }
    if (
      pathValue === "/docs" ||
      pathValue === "/openapi" ||
      pathValue === "/metrics" ||
      pathValue === "/health" ||
      pathValue === "/health/ready"
    ) {
      return responseTimeMiddleware(req, res, next)
    }
    return next()
  })

  // Storefront routes require a publishable key header.
  app.use((req: any, res: any, next: any) => {
    const pathValue = typeof req.path === "string" ? req.path : ""
    if (!isStorePath(pathValue)) return next()
    if (String(req.method || "").toUpperCase() === "OPTIONS") return next()
    if (pathValue.startsWith("/store/catalog/auth/oauth/")) return next()

    const token = readPublishableKey(req)
    if (!token) {
      return res.status(401).json({ message: "Publishable API key required." })
    }

    void validatePublishableKey(token)
      .then((ok) => {
        if (ok) return next()
        return res.status(401).json({ message: "Publishable API key required." })
      })
      .catch((error) => next(error))
  })

  app.use((req: any, res: any, next: any) => {
    if (shouldApplyAuthRateLimit(req)) {
      return authRateLimitMiddleware(req, res, next)
    }
    return next()
  })

  app.use((req: any, res: any, next: any) => {
    if (shouldApplyTelemetryRateLimit(req)) {
      return telemetryRateLimitMiddleware(req, res, next)
    }
    return next()
  })

  app.get("/health", (_req: any, res: any) => {
    res.json({ ok: true })
  })

  app.get("/metrics", (_req: any, res: any) => {
    res.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8")
    res.setHeader("cache-control", "no-store, max-age=0")
    return res.status(200).send(renderPrometheusMetrics())
  })

  app.get("/health/ready", async (_req: any, res: any) => {
    try {
      await runReadinessChecks()
      return res.status(200).json({
        ok: true,
        checks: {
          database: "ok",
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logError("server.readiness_check_failed", { message })
      return res.status(503).json({
        ok: false,
        checks: {
          database: "error",
        },
      })
    }
  })

  await registerApiRoutes(app)
  const maintenanceScheduler = startMaintenanceScheduler()

  // Centralized error response.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((error: any, req: any, res: any, _next: any) => {
    const message = error instanceof Error ? error.message : String(error)
    const requestId =
      sanitizeRequestId(req?.requestId) || sanitizeRequestId(res.getHeader("x-request-id"))
    const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production"

    if (res.headersSent) {
      return
    }

    if (error instanceof HttpError) {
      const status = mapHttpErrorToStatus(error)
      return res.status(status).json({
        type: error.type,
        message,
        request_id: requestId || undefined,
      })
    }

    logError("server.unhandled_error", {
      requestId: requestId || undefined,
      path: req?.path,
      method: req?.method,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    })

    const responseMessage = isProduction ? "Internal server error." : message || "Internal server error."
    return res.status(500).json({
      type: "unknown_error",
      message: responseMessage,
      request_id: requestId || undefined,
    })
  })

  const port = toPositiveInt(process.env.PORT, 9000)
  const server = await new Promise<Server>((resolve, reject) => {
    const listeningServer = app.listen(port, () => resolve(listeningServer))
    listeningServer.once("error", reject)
  })

  let stopped = false
  const stop = async () => {
    if (stopped) return
    stopped = true
    maintenanceScheduler.stop()

    let closeError: unknown = null
    await new Promise<void>((resolve) => {
      server.close((error?: Error) => {
        if (error) closeError = error
        resolve()
      })
    })

    try {
      await closePgPool()
    } catch (error) {
      if (!closeError) closeError = error
    }

    if (closeError) {
      throw closeError
    }
  }

  logInfo("server.listening", { port })
  return { app, port, stop }
}

if (require.main === module) {
  let shuttingDown = false

  void startServer()
    .then((started) => {
      const shutdown = (signal: NodeJS.Signals) => {
        if (shuttingDown) return
        shuttingDown = true
        logInfo("server.shutdown.signal_received", { signal })
        void started
          .stop()
          .then(() => process.exit(0))
          .catch((error) => {
            logError("server.shutdown.failed", {
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            })
            process.exit(1)
          })
      }

      process.once("SIGINT", () => shutdown("SIGINT"))
      process.once("SIGTERM", () => shutdown("SIGTERM"))
    })
    .catch((error) => {
      logError("server.start.failed", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      process.exit(1)
    })
}
