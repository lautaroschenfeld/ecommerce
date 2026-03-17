import path from "path"

import dotenv from "dotenv"

let loaded = false
let runtimeSecurityChecksExecuted = false

const COMMON_WEAK_SECRETS = new Set([
  "",
  "change_me",
  "changeme",
  "default",
  "secret",
  "test",
  "development",
])

function normalizeSecret(value: unknown) {
  return String(value || "").trim()
}

function isWeakSecret(value: unknown) {
  const normalized = normalizeSecret(value)
  if (!normalized) return true
  if (normalized.length < 32) return true
  return COMMON_WEAK_SECRETS.has(normalized.toLowerCase())
}

function isFlagEnabled(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on"
}

export function loadEnv() {
  if (loaded) return
  loaded = true

  // Match previous behavior: load `backend/.env` relative to cwd.
  // This keeps local scripts and the HTTP server consistent.
  const envPath = path.resolve(process.cwd(), ".env")
  dotenv.config({ path: envPath })
}

export function assertSecureRuntimeEnv() {
  if (runtimeSecurityChecksExecuted) return
  runtimeSecurityChecksExecuted = true

  const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production"
  if (!isProduction) return

  if (isFlagEnabled(process.env.ALLOW_DEV_RESET_TOKEN)) {
    throw new Error("ALLOW_DEV_RESET_TOKEN must be disabled in production.")
  }

  if (isWeakSecret(process.env.JWT_SECRET)) {
    throw new Error(
      "JWT_SECRET is missing or weak. Use a random secret with at least 32 characters."
    )
  }

  if (isWeakSecret(process.env.COOKIE_SECRET)) {
    throw new Error(
      "COOKIE_SECRET is missing or weak. Use a random secret with at least 32 characters."
    )
  }

  const bootstrapTokenPlain = normalizeSecret(process.env.CUSTOMER_BOOTSTRAP_ADMIN_TOKEN)
  if (bootstrapTokenPlain) {
    throw new Error(
      "CUSTOMER_BOOTSTRAP_ADMIN_TOKEN must not be set in production. Use CUSTOMER_BOOTSTRAP_ADMIN_TOKEN_HASH."
    )
  }

  const googleClientId = normalizeSecret(process.env.GOOGLE_OAUTH_CLIENT_ID)
  const googleClientSecret = normalizeSecret(process.env.GOOGLE_OAUTH_CLIENT_SECRET)
  const appleClientId = normalizeSecret(process.env.APPLE_OAUTH_CLIENT_ID)
  const appleClientSecret = normalizeSecret(process.env.APPLE_OAUTH_CLIENT_SECRET)

  if ((googleClientId && !googleClientSecret) || (!googleClientId && googleClientSecret)) {
    throw new Error(
      "Google OAuth requires both GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in production."
    )
  }

  if ((appleClientId && !appleClientSecret) || (!appleClientId && appleClientSecret)) {
    throw new Error(
      "Apple OAuth requires both APPLE_OAUTH_CLIENT_ID and APPLE_OAUTH_CLIENT_SECRET in production."
    )
  }

  const oauthEnabled = Boolean(
    (googleClientId && googleClientSecret) || (appleClientId && appleClientSecret)
  )
  if (oauthEnabled) {
    const oauthStateSecret = normalizeSecret(process.env.OAUTH_STATE_SECRET)
    if (oauthStateSecret.length < 32) {
      throw new Error(
        "OAUTH_STATE_SECRET must be configured with at least 32 characters in production when OAuth is enabled."
      )
    }
  }
}

// Load eagerly for entrypoints that import modules reading env at module init.
loadEnv()
