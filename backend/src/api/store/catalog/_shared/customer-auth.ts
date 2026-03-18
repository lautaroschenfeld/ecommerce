import crypto from "crypto"

import { HttpError, type HttpRequest, type HttpResponse } from "../../../../lib/http"
import { getCustomerAuthPgService } from "../../../../lib/customer-auth-pg-service"

import {
  ACCESS_TOKEN_TTL_SECONDS,
  CART_MERGE_RULE,
  CUSTOMER_ROLES,
  CUSTOMER_ROLE_ADMINISTRATOR,
  CUSTOMER_ROLE_USER,
  CUSTOMER_ACCESS_COOKIE,
  CUSTOMER_REFRESH_COOKIE,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_FAILED_ATTEMPTS,
  PASSWORD_RESET_TTL_MINUTES,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../../../../lib/customer-auth/constants"
import type { CustomerRole } from "../../../../lib/customer-auth/constants"

export type CustomerNotifications = {
  email: boolean
  whatsapp: boolean
}

export type CustomerCartItem = {
  id: string
  name: string
  brand: string
  category: string
  priceArs: number
  imageUrl?: string
  imageUrls?: string[]
  qty: number
}

export type CustomerAuthContext = {
  account: Record<string, any>
  session: Record<string, any>
}

const PASSWORD_SALT_BYTES = 16
const PASSWORD_KEY_LEN = 64

const DEFAULT_SCRYPT_N = 16384
const DEFAULT_SCRYPT_R = 8
const DEFAULT_SCRYPT_P = 1

const ACCESS_COOKIE_PATH = "/"
const REFRESH_COOKIE_PATH = "/"
const TRUST_PROXY_HEADERS =
  String(process.env.TRUST_PROXY_HEADERS || "").toLowerCase() === "true"
const CORS_ALLOW_METHODS = "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS"
const CORS_ALLOW_HEADERS =
  "Origin,X-Requested-With,Content-Type,Accept,Authorization,x-publishable-api-key"

function now() {
  return new Date()
}

function parseAllowedOrigins(raw: string | undefined) {
  return String(raw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function isOriginAllowed(origin: string) {
  const allowed = new Set([
    ...parseAllowedOrigins(process.env.STORE_CORS),
    ...parseAllowedOrigins(process.env.ADMIN_CORS),
    ...parseAllowedOrigins(process.env.AUTH_CORS),
  ])
  return allowed.has(origin)
}

function setCorsErrorHeaders(req: HttpRequest, res: HttpResponse) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : ""
  if (!origin || !isOriginAllowed(origin)) return

  res.setHeader("Vary", "Origin")
  res.setHeader("Access-Control-Allow-Origin", origin)
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Methods", CORS_ALLOW_METHODS)
  res.setHeader("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS)
}

function toDate(value: unknown) {
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function normalizeEmail(input: unknown) {
  if (typeof input !== "string") return ""
  return input.trim().toLowerCase()
}

function sanitizeIp(input: unknown) {
  if (typeof input !== "string") return "unknown"
  const trimmed = input.trim()
  if (!trimmed) return "unknown"
  return trimmed.slice(0, 120)
}

export function normalizeText(input: unknown, max = 160) {
  if (typeof input !== "string") return ""
  return input.replace(/\s+/g, " ").trim().slice(0, max)
}

export function normalizePhone(input: unknown) {
  return normalizeText(input, 40)
}

function digitsOnly(input: unknown) {
  return String(input || "").replace(/\D/g, "")
}

export function normalizeDocumentNumber(input: unknown) {
  const digits = digitsOnly(input)
  if (!digits) return ""
  return digits.slice(0, 16)
}

export function normalizeCustomerRole(
  value: unknown,
  fallback: CustomerRole = CUSTOMER_ROLE_USER
): CustomerRole {
  if (typeof value !== "string") return fallback
  const normalized = normalizeText(value, 20).toLowerCase()
  if ((CUSTOMER_ROLES as readonly string[]).includes(normalized)) {
    return normalized as CustomerRole
  }
  return fallback
}

export function canAccessAdminPanelRole(value: unknown) {
  const role = normalizeCustomerRole(value)
  return role === "administrator"
}

function buildPasswordHash({
  salt,
  n,
  r,
  p,
  hash,
}: {
  salt: string
  n: number
  r: number
  p: number
  hash: string
}) {
  return `scrypt$${n}$${r}$${p}$${salt}$${hash}`
}

function scryptAsync(
  password: string,
  salt: string,
  keyLen: number,
  options: crypto.ScryptOptions
) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, options, (error, derivedKey) => {
      if (error) return reject(error)
      if (!Buffer.isBuffer(derivedKey)) {
        return reject(new Error("Invalid scrypt output."))
      }
      return resolve(derivedKey)
    })
  })
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString("hex")
  const hash = (
    await scryptAsync(password, salt, PASSWORD_KEY_LEN, {
      N: DEFAULT_SCRYPT_N,
      r: DEFAULT_SCRYPT_R,
      p: DEFAULT_SCRYPT_P,
    })
  ).toString("hex")

  return buildPasswordHash({
    salt,
    n: DEFAULT_SCRYPT_N,
    r: DEFAULT_SCRYPT_R,
    p: DEFAULT_SCRYPT_P,
    hash,
  })
}

export async function verifyPassword(password: string, storedHash: string) {
  const parts = String(storedHash || "").split("$")
  if (parts.length !== 6 || parts[0] !== "scrypt") return false

  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  const salt = parts[4] || ""
  const expected = parts[5] || ""

  if (!n || !r || !p || !salt || !expected) return false

  const actual = (
    await scryptAsync(password, salt, PASSWORD_KEY_LEN, {
      N: n,
      r,
      p,
    })
  ).toString("hex")

  const expectedBuf = Buffer.from(expected, "hex")
  const actualBuf = Buffer.from(actual, "hex")

  if (expectedBuf.length !== actualBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, actualBuf)
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export function newToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString("base64url")
}

export function getCustomerAuthService(req: HttpRequest) {
  void req
  return getCustomerAuthPgService() as any
}

export function getClientIp(req: HttpRequest) {
  if (TRUST_PROXY_HEADERS) {
    const xfwd = req.headers["x-forwarded-for"]
    if (typeof xfwd === "string" && xfwd.trim()) {
      return sanitizeIp(xfwd.split(",")[0])
    }
    if (Array.isArray(xfwd) && xfwd.length) {
      return sanitizeIp(xfwd[0])
    }

    const xreal = req.headers["x-real-ip"]
    if (typeof xreal === "string" && xreal.trim()) {
      return sanitizeIp(xreal)
    }
  }

  return sanitizeIp(req.ip || "unknown")
}

export function getUserAgent(req: HttpRequest) {
  return normalizeText(req.headers["user-agent"], 240)
}

function getCookieValue(req: HttpRequest, name: string) {
  const header = req.headers.cookie
  if (!header || typeof header !== "string") return ""

  const parts = header.split(";")
  for (const partRaw of parts) {
    const part = partRaw.trim()
    if (!part) continue
    const idx = part.indexOf("=")
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (key !== name) continue
    return decodeURIComponent(part.slice(idx + 1))
  }
  return ""
}

function cookieOptions(maxAgeSeconds: number) {
  const isProd = process.env.NODE_ENV === "production"
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    maxAge: maxAgeSeconds * 1000,
    path: "/",
  }
}

function readAccessTokenCookie(req: HttpRequest) {
  return getCookieValue(req, CUSTOMER_ACCESS_COOKIE)
}

function readRefreshTokenCookie(req: HttpRequest) {
  return getCookieValue(req, CUSTOMER_REFRESH_COOKIE)
}

export function setAuthCookies(
  res: HttpResponse,
  tokens: { accessToken: string; refreshToken: string }
) {
  res.cookie(
    CUSTOMER_ACCESS_COOKIE,
    encodeURIComponent(tokens.accessToken),
    cookieOptions(ACCESS_TOKEN_TTL_SECONDS)
  )
  res.cookie(
    CUSTOMER_REFRESH_COOKIE,
    encodeURIComponent(tokens.refreshToken),
    cookieOptions(REFRESH_TOKEN_TTL_SECONDS)
  )
}

export function clearAuthCookies(res: HttpResponse) {
  res.clearCookie(CUSTOMER_ACCESS_COOKIE, { path: ACCESS_COOKIE_PATH })
  res.clearCookie(CUSTOMER_REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH })
}

export async function findAccountByEmail(req: HttpRequest, email: string) {
  const service = getCustomerAuthService(req)
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  const list = await service.listCustomerAccounts(
    { email: normalized },
    { take: 1 }
  )
  return list[0] ?? null
}

export async function findAccountById(req: HttpRequest, id: string) {
  const service = getCustomerAuthService(req)
  const accountId = normalizeText(id, 120)
  if (!accountId) return null
  const list = await service.listCustomerAccounts({ id: accountId }, { take: 1 })
  return list[0] ?? null
}

export async function writeAuditLog(
  req: HttpRequest,
  input: {
    accountId?: string | null
    event: string
    success: boolean
    metadata?: Record<string, unknown>
  }
) {
  const service = getCustomerAuthService(req)
  await service.createAuthAuditLogs({
    account_id: input.accountId || null,
    event: normalizeText(input.event, 120),
    success: input.success,
    ip_address: getClientIp(req),
    user_agent: getUserAgent(req),
    metadata: input.metadata ?? {},
  })
}

async function revokeSessionById(req: HttpRequest, sessionId: string) {
  const service = getCustomerAuthService(req)
  await service.updateCustomerSessions({
    selector: { id: sessionId },
    data: { revoked_at: now() },
  })
}

export async function issueSessionForAccount(
  req: HttpRequest,
  res: HttpResponse,
  account: Record<string, any>,
  createdBy = "password"
) {
  const service = getCustomerAuthService(req)

  const accessToken = newToken()
  const refreshToken = newToken()
  const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000)
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)

  const created = await service.createCustomerSessions({
    account_id: account.id,
    access_token_hash: hashToken(accessToken),
    refresh_token_hash: hashToken(refreshToken),
    access_expires_at: accessExpiresAt,
    refresh_expires_at: refreshExpiresAt,
    revoked_at: null,
    ip_address: getClientIp(req),
    user_agent: getUserAgent(req),
    created_by: normalizeText(createdBy, 40) || "password",
  })

  setAuthCookies(res, { accessToken, refreshToken })
  return created
}

export async function rotateSessionByRefreshToken(
  req: HttpRequest,
  res: HttpResponse
) {
  const service = getCustomerAuthService(req)
  const refreshToken = readRefreshTokenCookie(req)
  if (!refreshToken) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Refresh token missing")
  }

  const hashed = hashToken(refreshToken)
  const list = await service.listCustomerSessions(
    { refresh_token_hash: hashed },
    { take: 1 }
  )
  const session = list[0]
  if (!session) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Invalid refresh token")
  }

  if (session.revoked_at) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Session revoked")
  }

  const refreshExpiry = toDate(session.refresh_expires_at)
  if (!refreshExpiry || refreshExpiry.getTime() <= Date.now()) {
    await revokeSessionById(req, session.id)
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Refresh token expired")
  }

  const nextAccessToken = newToken()
  const nextRefreshToken = newToken()
  const nextAccessExpiry = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000)
  const nextRefreshExpiry = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)

  await service.updateCustomerSessions({
    selector: { id: session.id },
    data: {
      access_token_hash: hashToken(nextAccessToken),
      refresh_token_hash: hashToken(nextRefreshToken),
      access_expires_at: nextAccessExpiry,
      refresh_expires_at: nextRefreshExpiry,
      revoked_at: null,
      ip_address: getClientIp(req),
      user_agent: getUserAgent(req),
    },
  })

  setAuthCookies(res, {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
  })

  const account = await findAccountById(req, session.account_id)
  if (!account) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Account not found")
  }

  const refreshed = (
    await service.listCustomerSessions({ id: session.id }, { take: 1 })
  )[0]
  return { account, session: refreshed ?? session }
}

export async function getSessionFromAccessCookie(req: HttpRequest) {
  const service = getCustomerAuthService(req)
  const accessToken = readAccessTokenCookie(req)
  if (!accessToken) return null

  const list = await service.listCustomerSessions(
    { access_token_hash: hashToken(accessToken) },
    { take: 1 }
  )
  const session = list[0]
  if (!session) return null
  if (session.revoked_at) return null

  const accessExpiry = toDate(session.access_expires_at)
  if (!accessExpiry || accessExpiry.getTime() <= Date.now()) return null

  const account = await findAccountById(req, session.account_id)
  if (!account) return null

  return { account, session } as CustomerAuthContext
}

export async function revokeCurrentSessionIfAny(
  req: HttpRequest,
  res: HttpResponse
) {
  const service = getCustomerAuthService(req)
  const accessToken = readAccessTokenCookie(req)
  if (!accessToken) {
    clearAuthCookies(res)
    return
  }

  const hash = hashToken(accessToken)
  const list = await service.listCustomerSessions(
    { access_token_hash: hash },
    { take: 1 }
  )
  const session = list[0]
  if (session && !session.revoked_at) {
    await revokeSessionById(req, session.id)
  }

  clearAuthCookies(res)
}

export async function requireCustomerAuth(
  req: HttpRequest,
  res: HttpResponse
) {
  const ctx = await getSessionFromAccessCookie(req)
  if (ctx) return ctx

  setCorsErrorHeaders(req, res)
  throw new HttpError(HttpError.Types.UNAUTHORIZED, "Not authenticated")
}

export async function requireCustomerAdmin(
  req: HttpRequest,
  res: HttpResponse
) {
  const ctx = await requireCustomerAuth(req, res)
  if (!canAccessAdminPanelRole(ctx.account.role)) {
    setCorsErrorHeaders(req, res)
    throw new HttpError(
      HttpError.Types.UNAUTHORIZED,
      "Admin role required."
    )
  }
  return ctx
}

export async function requireCustomerAdministrator(
  req: HttpRequest,
  res: HttpResponse
) {
  const ctx = await requireCustomerAuth(req, res)
  if (normalizeCustomerRole(ctx.account.role) !== CUSTOMER_ROLE_ADMINISTRATOR) {
    setCorsErrorHeaders(req, res)
    throw new HttpError(
      HttpError.Types.UNAUTHORIZED,
      "Administrator role required."
    )
  }
  return ctx
}

function parseNotificationValue(raw: unknown, fallback: boolean) {
  if (typeof raw === "boolean") return raw
  return fallback
}

export function sanitizeNotifications(raw: unknown): CustomerNotifications {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  return {
    email: parseNotificationValue(rec?.email, true),
    whatsapp: parseNotificationValue(rec?.whatsapp, false),
  }
}

function toNumber(value: unknown) {
  const parsed =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeImageUrls(...sources: unknown[]) {
  const out: string[] = []
  const seen = new Set<string>()

  const push = (value: unknown) => {
    const normalized = normalizeText(value, 500)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    out.push(normalized)
  }

  for (const source of sources) {
    if (Array.isArray(source)) {
      for (const entry of source) {
        push(entry)
      }
      continue
    }
    push(source)
  }

  return out.length ? out : undefined
}

export function sanitizeCartItems(raw: unknown): CustomerCartItem[] {
  if (!Array.isArray(raw)) return []

  const out: CustomerCartItem[] = []
  for (const entry of raw) {
    const rec =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : null
    if (!rec) continue

    const id = normalizeText(rec.id, 120)
    const name = normalizeText(rec.name, 160)
    const brand = normalizeText(rec.brand, 120)
    const category = normalizeText(rec.category, 120)
    const priceArs = toNumber(rec.priceArs)
    const qty = toNumber(rec.qty)
    const imageUrls = normalizeImageUrls(
      rec.imageUrls,
      rec.image_urls,
      rec.image_url,
      rec.imageUrl
    )
    const imageUrl = imageUrls?.[0]

    if (!id || !name || !brand || !category) continue
    if (!priceArs || priceArs <= 0) continue
    if (!qty || qty <= 0) continue

    out.push({
      id,
      name,
      brand,
      category,
      priceArs: Math.trunc(priceArs),
      imageUrl,
      imageUrls,
      qty: Math.max(1, Math.min(99, Math.trunc(qty))),
    })
  }

  return out
}

export async function getOrCreateServerCart(
  req: HttpRequest,
  accountId: string
) {
  const service = getCustomerAuthService(req)
  const found = await service.listCustomerCarts({ account_id: accountId }, { take: 1 })
  if (found[0]) return found[0]

  return await service.createCustomerCarts({
    account_id: accountId,
    items: [],
    updated_at_override: now(),
  })
}

export async function replaceServerCartItems(
  req: HttpRequest,
  accountId: string,
  nextItems: CustomerCartItem[]
) {
  const service = getCustomerAuthService(req)
  const cart = await getOrCreateServerCart(req, accountId)
  const sanitized = sanitizeCartItems(nextItems)

  await service.updateCustomerCarts({
    selector: { id: cart.id },
    data: {
      items: sanitized,
      updated_at_override: now(),
    },
  })

  const updated = await service.listCustomerCarts({ id: cart.id }, { take: 1 })
  return updated[0] ?? cart
}

export function mergeCartItemsWithSessionPriority(
  sessionItemsRaw: unknown,
  guestItemsRaw: unknown
) {
  const sessionItems = sanitizeCartItems(sessionItemsRaw)
  const guestItems = sanitizeCartItems(guestItemsRaw)

  if (CART_MERGE_RULE !== "session_priority") {
    return sessionItems
  }

  const byId = new Map(sessionItems.map((item) => [item.id, item]))
  const merged = [...sessionItems]

  for (const item of guestItems) {
    if (byId.has(item.id)) continue
    merged.push(item)
  }

  return merged
}

export function mapPublicAccount(account: Record<string, any>) {
  const role = normalizeCustomerRole(account.role)
  return {
    id: account.id,
    email: account.email,
    first_name: account.first_name,
    last_name: account.last_name || "",
    document_number: normalizeDocumentNumber(account.document_number) || "",
    phone: account.phone || "",
    whatsapp: account.whatsapp || "",
    notifications: sanitizeNotifications(account.notifications),
    blocked_until: account.blocked_until || null,
    last_login_at: account.last_login_at || null,
    role,
    created_at: account.created_at,
    updated_at: account.updated_at,
  }
}

export async function registerFailedLoginAttempt(
  req: HttpRequest,
  account: Record<string, any> | null,
  metadata?: Record<string, unknown>
) {
  if (!account) return

  const service = getCustomerAuthService(req)
  const currentCount = Number(account.failed_login_count || 0)
  const nextCount = currentCount + 1
  const shouldBlock = nextCount >= LOGIN_MAX_FAILED_ATTEMPTS
  const blockedUntil = shouldBlock
    ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000)
    : null

  await service.updateCustomerAccounts({
    selector: { id: account.id },
    data: {
      failed_login_count: shouldBlock ? 0 : nextCount,
      blocked_until: blockedUntil,
    },
  })

  await writeAuditLog(req, {
    accountId: account.id,
    event: "auth.login.failed",
    success: false,
    metadata: {
      ...metadata,
      failed_count: nextCount,
      blocked_until: blockedUntil?.toISOString() || null,
    },
  })
}

export async function clearFailedLoginState(
  req: HttpRequest,
  account: Record<string, any>
) {
  const service = getCustomerAuthService(req)
  await service.updateCustomerAccounts({
    selector: { id: account.id },
    data: {
      failed_login_count: 0,
      blocked_until: null,
      last_login_at: now(),
    },
  })
}

export function assertPasswordStrength(password: string) {
  const value = String(password || "")
  if (value.length < 8) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "Password must be at least 8 characters."
    )
  }

  const hasLower = /[a-z]/.test(value)
  const hasUpper = /[A-Z]/.test(value)
  const hasDigit = /\d/.test(value)
  if (!hasLower || !hasUpper || !hasDigit) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "Password must include uppercase, lowercase and a number."
    )
  }
}

export function normalizeAddressInput(raw: unknown) {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  if (!rec) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Invalid address payload")
  }

  const line1 = normalizeText(rec.line1, 200)
  const streetNumber = normalizeText(
    rec.street_number ?? rec.streetNumber ?? rec.address_number ?? rec.addressNumber,
    40
  )
  const city = normalizeText(rec.city, 120)
  const province = normalizeText(rec.province, 120)
  if (!line1 || !streetNumber || !city || !province) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "line1, street_number, city and province are required."
    )
  }

  return {
    label: normalizeText(rec.label, 60) || "Address",
    recipient: normalizeText(rec.recipient, 120) || null,
    phone: normalizePhone(rec.phone) || null,
    line1,
    street_number: streetNumber,
    line2: normalizeText(rec.line2, 120) || null,
    city,
    province,
    postal_code: normalizeText(rec.postal_code ?? rec.postalCode, 30) || null,
    is_default: Boolean(rec.is_default ?? rec.isDefault),
  }
}

export async function ensureSingleDefaultAddress(
  req: HttpRequest,
  accountId: string,
  preferredAddressId?: string
) {
  const service = getCustomerAuthService(req)
  const addresses = await service.listCustomerAddresses(
    { account_id: accountId },
    { take: 500 }
  )

  if (!addresses.length) return

  const defaultId =
    preferredAddressId ||
    addresses.find((address: Record<string, any>) => address.is_default)?.id ||
    addresses[0]?.id

  if (!defaultId) return

  for (const address of addresses) {
    const expected = address.id === defaultId
    if (Boolean(address.is_default) === expected) continue
    await service.updateCustomerAddresses({
      selector: { id: address.id },
      data: { is_default: expected },
    })
  }
}

export function buildOrderNumber() {
  const date = new Date()
  const yy = String(date.getUTCFullYear()).slice(-2)
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase()
  return `MP-${yy}${mm}${dd}-${rand}`
}

export function buildTrackingCode() {
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase()
  return `MPA-${rand}`
}

export function passwordResetExpiryDate() {
  return new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000)
}
