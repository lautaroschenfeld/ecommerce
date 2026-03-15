import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"
import crypto from "crypto"

import {
  clearFailedLoginState,
  findAccountByEmail,
  getCustomerAuthService,
  hashPassword,
  issueSessionForAccount,
  writeAuditLog,
} from "../../../../_shared/customer-auth"
import { CUSTOMER_ROLE_USER } from "../../../../../../../lib/customer-auth/constants"
import {
  clearOAuthStateCookie,
  exchangeOAuthCodeForToken,
  getFrontendUrl,
  getOAuthProvider,
  mapOAuthIdentity,
  readAndValidateOAuthState,
  verifyOAuthIdTokenPayload,
} from "../../shared"

function buildRedirectUrl(path: string) {
  const base = getFrontendUrl().replace(/\/+$/, "")
  const safePath = path.startsWith("/") ? path : "/cuenta"
  return `${base}${safePath}`
}

function sanitizeOAuthErrorCode(raw: unknown) {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase()
  if (!normalized) return "oauth_failed"

  const safe = normalized.replace(/[^a-z0-9._-]/g, "_").slice(0, 120)
  return safe || "oauth_failed"
}

function mapOAuthCallbackErrorToCode(error: unknown) {
  const message = sanitizeOAuthErrorCode(error instanceof Error ? error.message : String(error || ""))

  if (message.includes("access_denied")) return "access_denied"
  if (message.includes("timeout") || message.includes("timed_out")) return "provider_timeout"
  if (message.includes("not_configured")) return "provider_not_configured"
  if (message.includes("state") || message.includes("nonce")) return "invalid_state"
  if (message.includes("id_token") || message.includes("jwks") || message.includes("token_exchange")) {
    return "provider_invalid_response"
  }
  return "oauth_failed"
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  const provider = getOAuthProvider(req.params.provider)
  const code = typeof req.query.code === "string" ? req.query.code : ""
  const state = typeof req.query.state === "string" ? req.query.state : ""
  const error = typeof req.query.error === "string" ? req.query.error : ""

  if (error) {
    clearOAuthStateCookie(res)
    const errorCode = sanitizeOAuthErrorCode(error)
    return res.redirect(buildRedirectUrl(`/ingresar?oauth_error=${encodeURIComponent(errorCode)}`))
  }

  if (!code || !state) {
    clearOAuthStateCookie(res)
    return res.redirect(buildRedirectUrl("/ingresar?oauth_error=missing_code"))
  }

  let redirectPath = "/cuenta"

  try {
    const oauthState = readAndValidateOAuthState(req, provider, state)
    redirectPath = oauthState.redirectPath || "/cuenta"

    const tokenData = await exchangeOAuthCodeForToken(
      provider,
      code,
      oauthState.codeVerifier
    )
    const payload = await verifyOAuthIdTokenPayload(
      provider,
      tokenData.id_token,
      oauthState.nonce
    )
    const identity = mapOAuthIdentity(payload)

    const service = getCustomerAuthService(req)
    let account = await findAccountByEmail(req, identity.email)
    let accountCreated = false

    if (!account) {
      account = await service.createCustomerAccounts({
        email: identity.email,
        password_hash: await hashPassword(crypto.randomBytes(32).toString("hex")),
        first_name: identity.first_name,
        last_name: identity.last_name,
        phone: null,
        whatsapp: null,
        notifications: { email: true, whatsapp: false },
        role: CUSTOMER_ROLE_USER,
        failed_login_count: 0,
        blocked_until: null,
        last_login_at: new Date(),
      })
      accountCreated = true
    }

    await clearFailedLoginState(req, account)
    await issueSessionForAccount(req, res, account, `oauth_${provider}`)

    await writeAuditLog(req, {
      accountId: account.id,
      event: accountCreated ? "auth.oauth.register" : "auth.oauth.login",
      success: true,
      metadata: { provider },
    })

    clearOAuthStateCookie(res)
    return res.redirect(buildRedirectUrl(redirectPath))
  } catch (e) {
    clearOAuthStateCookie(res)
    const message = e instanceof Error ? e.message : String(e)
    console.error("[oauth.callback] failed", {
      provider,
      message,
      requestId: (req as any)?.requestId,
    })
    const errorCode = mapOAuthCallbackErrorToCode(e)
    return res.redirect(
      buildRedirectUrl(`/ingresar?oauth_error=${encodeURIComponent(errorCode)}`)
    )
  }
}
