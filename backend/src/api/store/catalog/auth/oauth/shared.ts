import crypto from "crypto"

import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../lib/http"
import {
  appendPathToBaseUrl,
  getCanonicalBackendBaseUrl,
  getCanonicalStorefrontBaseUrl,
} from "../../../../../lib/public-url"

export type OAuthProvider = "google" | "apple"

export type OAuthStartState = {
  provider: OAuthProvider
  state: string
  codeVerifier: string
  nonce: string
  redirectPath: string
  createdAt: number
}

const OAUTH_STATE_COOKIE = "store_oauth_state"
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const OAUTH_STATE_COOKIE_VERSION = "v1"
const OAUTH_JWKS_CACHE_TTL_MS = 5 * 60 * 1000
const OAUTH_JWT_CLOCK_TOLERANCE_SEC = 120
const OAUTH_HTTP_TIMEOUT_MS_DEFAULT = 8000

type OAuthJwk = {
  kid?: string
  kty?: string
  alg?: string
  use?: string
  [key: string]: unknown
}

type OAuthJwksCacheEntry = {
  keys: OAuthJwk[]
  expiresAt: number
}

const oauthJwksCache = new Map<string, OAuthJwksCacheEntry>()

function toPositiveInt(raw: unknown, fallback: number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.trunc(parsed)
  return rounded > 0 ? rounded : fallback
}

function getOAuthHttpTimeoutMsBase() {
  return toPositiveInt(process.env.OAUTH_HTTP_TIMEOUT_MS, OAUTH_HTTP_TIMEOUT_MS_DEFAULT)
}

function getOAuthTokenHttpTimeoutMs() {
  return toPositiveInt(process.env.OAUTH_TOKEN_HTTP_TIMEOUT_MS, getOAuthHttpTimeoutMsBase())
}

function getOAuthJwksHttpTimeoutMs() {
  return toPositiveInt(process.env.OAUTH_JWKS_HTTP_TIMEOUT_MS, getOAuthHttpTimeoutMsBase())
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const entry = error as { name?: unknown; code?: unknown }
  return entry.name === "AbortError" || entry.code === "ABORT_ERR"
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw new HttpError(HttpError.Types.INVALID_DATA, timeoutMessage)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function normalizeRedirectPath(input: string | undefined) {
  const path = (input || "/cuenta").trim()
  if (!path.startsWith("/") || path.startsWith("//")) return "/cuenta"
  if (path.startsWith("/admin")) return "/cuenta"
  return path
}

export function getOAuthProvider(raw: string): OAuthProvider {
  const normalized = raw.trim().toLowerCase()
  if (normalized === "google") return "google"
  if (normalized === "apple") return "apple"
  throw new HttpError(HttpError.Types.INVALID_DATA, "Unsupported OAuth provider")
}

export function getFrontendUrl() {
  return getCanonicalStorefrontBaseUrl()
}

function getBackendUrl() {
  return getCanonicalBackendBaseUrl()
}

export function getOAuthRedirectUri(provider: OAuthProvider) {
  return appendPathToBaseUrl(
    getBackendUrl(),
    `/store/catalog/auth/oauth/${provider}/callback`
  )
}

export function getOAuthConfig(provider: OAuthProvider) {
  if (provider === "google") {
    return {
      provider,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
      issuers: ["https://accounts.google.com", "accounts.google.com"],
      allowedIdTokenAlgs: ["RS256"] as const,
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "",
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "",
      scope: "openid email profile",
    }
  }

  return {
    provider,
    authUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    jwksUrl: "https://appleid.apple.com/auth/keys",
    issuers: ["https://appleid.apple.com"],
    allowedIdTokenAlgs: ["RS256"] as const,
    clientId: process.env.APPLE_OAUTH_CLIENT_ID?.trim() || "",
    clientSecret: process.env.APPLE_OAUTH_CLIENT_SECRET?.trim() || "",
    scope: "openid name email",
  }
}

export function createOAuthState(
  provider: OAuthProvider,
  redirectPathRaw: string | undefined
): OAuthStartState {
  return {
    provider,
    state: crypto.randomBytes(24).toString("hex"),
    codeVerifier: crypto.randomBytes(64).toString("base64url"),
    nonce: crypto.randomBytes(24).toString("base64url"),
    redirectPath: normalizeRedirectPath(redirectPathRaw),
    createdAt: Date.now(),
  }
}

function hashCodeVerifier(codeVerifier: string) {
  const hash = crypto.createHash("sha256").update(codeVerifier).digest()
  return hash.toString("base64url")
}

export function buildOAuthAuthorizeUrl(input: OAuthStartState) {
  const cfg = getOAuthConfig(input.provider)
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      `${input.provider} OAuth is not configured.`
    )
  }

  const redirectUri = getOAuthRedirectUri(input.provider)
  const params = new URLSearchParams()
  params.set("client_id", cfg.clientId)
  params.set("response_type", "code")
  params.set("redirect_uri", redirectUri)
  params.set("scope", cfg.scope)
  params.set("state", input.state)
  params.set("nonce", input.nonce)

  if (input.provider === "google") {
    params.set("code_challenge_method", "S256")
    params.set("code_challenge", hashCodeVerifier(input.codeVerifier))
    params.set("access_type", "offline")
    params.set("prompt", "consent")
  } else {
    params.set("response_mode", "query")
  }

  return `${cfg.authUrl}?${params.toString()}`
}

function parseCookie(req: HttpRequest, name: string) {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader || typeof cookieHeader !== "string") return ""
  const parts = cookieHeader.split(";")
  for (const raw of parts) {
    const part = raw.trim()
    if (!part) continue
    const idx = part.indexOf("=")
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (key !== name) continue
    return decodeURIComponent(part.slice(idx + 1))
  }
  return ""
}

export function setOAuthStateCookie(
  res: HttpResponse,
  state: OAuthStartState
) {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url")
  const signature = signOAuthStatePayload(payload)
  const raw = `${OAUTH_STATE_COOKIE_VERSION}.${payload}.${signature}`
  res.cookie(OAUTH_STATE_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_TTL_MS,
  })
}

export function clearOAuthStateCookie(res: HttpResponse) {
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" })
}

export function readAndValidateOAuthState(
  req: HttpRequest,
  expectedProvider: OAuthProvider,
  incomingState: string
) {
  const raw = parseCookie(req, OAUTH_STATE_COOKIE)
  if (!raw) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Missing OAuth state.")
  }

  const parts = raw.split(".")
  if (parts.length !== 3 || parts[0] !== OAUTH_STATE_COOKIE_VERSION) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Invalid OAuth state payload.")
  }
  const payload = parts[1] || ""
  const signature = parts[2] || ""
  if (!payload || !signature) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Invalid OAuth state payload.")
  }

  const expectedSignature = signOAuthStatePayload(payload)
  const validSignature = timingSafeEqual(signature, expectedSignature)
  if (!validSignature) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Invalid OAuth state signature.")
  }

  let parsedRaw: unknown = null
  try {
    parsedRaw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Invalid OAuth state payload.")
  }
  const parsed = toOAuthStartState(parsedRaw)

  if (!parsed) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Invalid OAuth state payload.")
  }

  if (parsed.provider !== expectedProvider) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "OAuth provider mismatch.")
  }
  if (!parsed.state || parsed.state !== incomingState) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "OAuth state mismatch.")
  }
  if (Date.now() - parsed.createdAt > OAUTH_STATE_TTL_MS) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "OAuth state expired.")
  }

  return parsed
}

function getOAuthStateSecret() {
  const configured = process.env.OAUTH_STATE_SECRET?.trim() || ""
  if (configured.length >= 32) return configured

  if (process.env.NODE_ENV === "production") {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "OAUTH_STATE_SECRET must be configured in production."
    )
  }

  const fallbackSeed = [
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "",
    process.env.APPLE_OAUTH_CLIENT_SECRET?.trim() || "",
    process.env.BACKEND_PUBLIC_URL?.trim() || "",
  ].join("|")

  return crypto
    .createHash("sha256")
    .update(fallbackSeed || "dev_oauth_state_secret")
    .digest("hex")
}

function signOAuthStatePayload(payloadBase64Url: string) {
  return crypto
    .createHmac("sha256", getOAuthStateSecret())
    .update(payloadBase64Url, "utf8")
    .digest("base64url")
}

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

function toOAuthStartState(value: unknown): OAuthStartState | null {
  if (!value || typeof value !== "object") return null

  const raw = value as Record<string, unknown>
  const provider = raw.provider
  const state = typeof raw.state === "string" ? raw.state : ""
  const codeVerifier = typeof raw.codeVerifier === "string" ? raw.codeVerifier : ""
  const nonce = typeof raw.nonce === "string" ? raw.nonce : ""
  const redirectPath =
    typeof raw.redirectPath === "string" ? normalizeRedirectPath(raw.redirectPath) : "/cuenta"
  const createdAt = Number(raw.createdAt)

  if ((provider !== "google" && provider !== "apple") || !state || !codeVerifier || !nonce) {
    return null
  }
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null

  return {
    provider,
    state,
    codeVerifier,
    nonce,
    redirectPath,
    createdAt: Math.trunc(createdAt),
  }
}

export async function exchangeOAuthCodeForToken(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string
) {
  const cfg = getOAuthConfig(provider)
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      `${provider} OAuth is not configured.`
    )
  }

  const body = new URLSearchParams()
  body.set("client_id", cfg.clientId)
  body.set("client_secret", cfg.clientSecret)
  body.set("grant_type", "authorization_code")
  body.set("code", code)
  body.set("redirect_uri", getOAuthRedirectUri(provider))
  if (provider === "google") {
    body.set("code_verifier", codeVerifier)
  }

  const res = await fetchWithTimeout(
    cfg.tokenUrl,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    getOAuthTokenHttpTimeoutMs(),
    `OAuth token exchange timed out (${provider}).`
  )

  if (!res.ok) {
    const message = await res.text()
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      `OAuth token exchange failed (${provider}): ${message || res.status}`
    )
  }

  return (await res.json()) as Record<string, unknown>
}

function parseJwtObjectPart(
  value: string,
  invalidMessage: string
): Record<string, unknown> {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8")
    const parsed = JSON.parse(decoded)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid_jwt_object")
    }
    return parsed as Record<string, unknown>
  } catch {
    throw new HttpError(HttpError.Types.INVALID_DATA, invalidMessage)
  }
}

function parseJwt(idTokenRaw: unknown) {
  const idToken = typeof idTokenRaw === "string" ? idTokenRaw : ""
  if (!idToken) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Missing id_token.")
  }

  const parts = idToken.split(".")
  if (parts.length !== 3) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Invalid id_token format.")
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Invalid id_token format.")
  }

  const header = parseJwtObjectPart(encodedHeader, "Invalid id_token header.")
  const payload = parseJwtObjectPart(encodedPayload, "Invalid id_token payload.")

  let signature = Buffer.alloc(0)
  try {
    signature = Buffer.from(encodedSignature, "base64url")
  } catch {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Invalid id_token signature.")
  }

  if (!signature.length) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Invalid id_token signature.")
  }

  return {
    idToken,
    signingInput: `${encodedHeader}.${encodedPayload}`,
    signature,
    header,
    payload,
  }
}

function parseCacheMaxAgeMillis(cacheControlRaw: string | null) {
  if (!cacheControlRaw) return OAUTH_JWKS_CACHE_TTL_MS
  const match = /(?:^|,)\s*max-age=(\d+)\b/i.exec(cacheControlRaw)
  if (!match) return OAUTH_JWKS_CACHE_TTL_MS
  const seconds = Number(match[1] || "")
  if (!Number.isFinite(seconds) || seconds <= 0) return OAUTH_JWKS_CACHE_TTL_MS
  const millis = seconds * 1000
  return Math.max(30_000, Math.min(24 * 60 * 60 * 1000, millis))
}

async function fetchProviderJwks(provider: OAuthProvider) {
  const cfg = getOAuthConfig(provider)
  const now = Date.now()
  const cached = oauthJwksCache.get(cfg.jwksUrl)
  if (cached && cached.expiresAt > now && cached.keys.length) {
    return cached.keys
  }

  const res = await fetchWithTimeout(
    cfg.jwksUrl,
    {
      method: "GET",
      headers: { accept: "application/json" },
    },
    getOAuthJwksHttpTimeoutMs(),
    `Failed to load OAuth public keys (${provider}): timed out.`
  )
  if (!res.ok) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      `Failed to load OAuth public keys (${provider}).`
    )
  }

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Invalid JWKS payload.")
  }

  const keysRaw = (body as { keys?: unknown })?.keys
  if (!Array.isArray(keysRaw)) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Invalid JWKS payload.")
  }

  const keys = keysRaw
    .filter((key): key is OAuthJwk => Boolean(key) && typeof key === "object" && !Array.isArray(key))
    .filter((key) => typeof key.kid === "string" && Boolean(key.kid.trim()))

  if (!keys.length) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "OAuth public keys are unavailable.")
  }

  oauthJwksCache.set(cfg.jwksUrl, {
    keys,
    expiresAt: now + parseCacheMaxAgeMillis(res.headers.get("cache-control")),
  })

  return keys
}

function verifyJwtSignature(
  alg: string,
  signingInput: string,
  signature: Buffer,
  jwk: OAuthJwk
) {
  try {
    const key = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" })
    if (alg === "RS256") {
      return crypto.verify("RSA-SHA256", Buffer.from(signingInput, "utf8"), key, signature)
    }
  } catch {
    return false
  }

  return false
}

function readNumericClaim(payload: Record<string, unknown>, claim: string, required = true) {
  const raw = payload[claim]
  if (raw === undefined || raw === null) {
    if (required) {
      throw new HttpError(HttpError.Types.INVALID_DATA, `Missing ${claim} claim.`)
    }
    return undefined
  }
  const value = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(value)) {
    throw new HttpError(HttpError.Types.INVALID_DATA, `Invalid ${claim} claim.`)
  }
  return value
}

function claimToStringArray(value: unknown) {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string")
  }
  return []
}

function validateIdTokenClaims(
  provider: OAuthProvider,
  payload: Record<string, unknown>,
  expectedNonce: string
) {
  const cfg = getOAuthConfig(provider)
  const iss = typeof payload.iss === "string" ? payload.iss : ""
  if (!iss || !cfg.issuers.includes(iss)) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Invalid id_token issuer.")
  }

  const audiences = claimToStringArray(payload.aud)
  if (!audiences.includes(cfg.clientId)) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Invalid id_token audience.")
  }
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : ""
  if (!sub) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Invalid id_token subject.")
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const exp = readNumericClaim(payload, "exp")
  if (exp === undefined || exp <= nowSec - OAUTH_JWT_CLOCK_TOLERANCE_SEC) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Expired id_token.")
  }

  const nbf = readNumericClaim(payload, "nbf", false)
  if (nbf !== undefined && nbf > nowSec + OAUTH_JWT_CLOCK_TOLERANCE_SEC) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "id_token is not active yet.")
  }

  const iat = readNumericClaim(payload, "iat", false)
  if (iat !== undefined && iat > nowSec + OAUTH_JWT_CLOCK_TOLERANCE_SEC) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Invalid id_token issue time.")
  }

  const nonce = typeof payload.nonce === "string" ? payload.nonce : ""
  if (!nonce || nonce !== expectedNonce) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Invalid id_token nonce.")
  }
}

export async function verifyOAuthIdTokenPayload(
  provider: OAuthProvider,
  idTokenRaw: unknown,
  expectedNonce: string
) {
  if (!expectedNonce) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Missing OAuth nonce.")
  }

  const cfg = getOAuthConfig(provider)
  const parsed = parseJwt(idTokenRaw)
  const alg = typeof parsed.header.alg === "string" ? parsed.header.alg : ""
  const kid = typeof parsed.header.kid === "string" ? parsed.header.kid.trim() : ""

  if (!alg || !cfg.allowedIdTokenAlgs.includes(alg as (typeof cfg.allowedIdTokenAlgs)[number])) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Unsupported id_token algorithm.")
  }
  if (!kid) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Missing id_token key id.")
  }

  const keys = await fetchProviderJwks(provider)
  const candidates = keys.filter((key) => {
    const keyKid = typeof key.kid === "string" ? key.kid.trim() : ""
    if (!keyKid || keyKid !== kid) return false
    if (typeof key.use === "string" && key.use !== "sig") return false
    if (typeof key.alg === "string" && key.alg !== alg) return false
    return true
  })

  if (!candidates.length) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "No matching id_token key found.")
  }

  const isValid = candidates.some((key) =>
    verifyJwtSignature(alg, parsed.signingInput, parsed.signature, key)
  )
  if (!isValid) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Invalid id_token signature.")
  }

  validateIdTokenClaims(provider, parsed.payload, expectedNonce)
  return parsed.payload
}

export function mapOAuthIdentity(payload: Record<string, unknown>) {
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : ""
  if (!email) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "OAuth provider did not return an email."
    )
  }

  const firstName =
    typeof payload.given_name === "string"
      ? payload.given_name.trim()
      : typeof payload.name === "string"
        ? payload.name.split(" ")[0]?.trim() || ""
        : "Cliente"

  const lastName =
    typeof payload.family_name === "string" ? payload.family_name.trim() : ""

  return {
    email,
    first_name: firstName || "Cliente",
    last_name: lastName,
  }
}
