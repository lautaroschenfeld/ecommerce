import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../lib/http"

import {
  clearFailedLoginState,
  findAccountByEmail,
  getCustomerAuthService,
  issueSessionForAccount,
  mapPublicAccount,
  mergeCartItemsWithSessionPriority,
  registerFailedLoginAttempt,
  replaceServerCartItems,
  sanitizeCartItems,
  verifyPassword,
  writeAuditLog,
} from "../../_shared/customer-auth"
import { CART_MERGE_RULE } from "../../../../../lib/customer-auth/constants"

function parseDate(value: unknown) {
  if (!value) return null
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const guestItems = sanitizeCartItems(body.guest_cart_items ?? body.guestCartItems)

  if (!email || !password) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "Email y contrasena son obligatorios."
    )
  }

  const account = await findAccountByEmail(req, email)
  if (!account) {
    await writeAuditLog(req, {
      event: "auth.login.failed_unknown_email",
      success: false,
      metadata: { email },
    })
    return res.status(401).json({
      message: "Credenciales invalidas.",
      code: "AUTH_INVALID_CREDENTIALS",
    })
  }

  const blockedUntil = parseDate(account.blocked_until)
  if (blockedUntil && blockedUntil.getTime() > Date.now()) {
    await writeAuditLog(req, {
      accountId: account.id,
      event: "auth.login.blocked",
      success: false,
      metadata: { blocked_until: blockedUntil.toISOString() },
    })
    return res.status(423).json({
      message: "La cuenta esta bloqueada temporalmente por intentos fallidos.",
      code: "AUTH_ACCOUNT_LOCKED",
      blocked_until: blockedUntil.toISOString(),
    })
  }

  const valid = await verifyPassword(password, String(account.password_hash || ""))
  if (!valid) {
    await registerFailedLoginAttempt(req, account, { email })
    return res.status(401).json({
      message: "Credenciales invalidas.",
      code: "AUTH_INVALID_CREDENTIALS",
    })
  }

  await clearFailedLoginState(req, account)
  await issueSessionForAccount(req, res, account, "password")

  const service = getCustomerAuthService(req)
  const existingCart = await service.listCustomerCarts(
    { account_id: account.id },
    { take: 1 }
  )
  const sessionItems = existingCart[0]?.items ?? []
  const mergedItems = mergeCartItemsWithSessionPriority(sessionItems, guestItems)
  const cart = await replaceServerCartItems(req, account.id, mergedItems)
  const cartItems = sanitizeCartItems(cart.items)

  await writeAuditLog(req, {
    accountId: account.id,
    event: "auth.login.success",
    success: true,
    metadata: { merged_cart_items: cartItems.length },
  })

  return res.json({
    account: mapPublicAccount(account),
    cart: {
      items: cartItems,
      merge_rule: CART_MERGE_RULE,
    },
  })
}
