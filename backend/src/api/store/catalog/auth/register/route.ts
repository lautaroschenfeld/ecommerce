import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../lib/http"

import {
  assertPasswordStrength,
  clearFailedLoginState,
  findAccountByEmail,
  getCustomerAuthService,
  hashPassword,
  issueSessionForAccount,
  mapPublicAccount,
  mergeCartItemsWithSessionPriority,
  normalizeDocumentNumber,
  normalizePhone,
  normalizeText,
  replaceServerCartItems,
  sanitizeCartItems,
  sanitizeNotifications,
  writeAuditLog,
} from "../../_shared/customer-auth"
import {
  CART_MERGE_RULE,
  CUSTOMER_ROLE_USER,
} from "../../../../../lib/customer-auth/constants"

export async function POST(req: HttpRequest, res: HttpResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>

  const email = normalizeText(body.email, 160).toLowerCase()
  const password = String(body.password || "")
  const firstName = normalizeText(body.first_name ?? body.firstName, 80)
  const lastName = normalizeText(body.last_name ?? body.lastName, 80)
  const documentNumber = normalizeDocumentNumber(
    body.document_number ?? body.documentNumber ?? body.dni ?? body.cuit
  )
  const phone = normalizePhone(body.phone)
  const whatsapp = normalizePhone(body.whatsapp)
  const notifications = sanitizeNotifications(body.notifications)
  const guestItems = sanitizeCartItems(body.guest_cart_items ?? body.guestCartItems)

  if (!email || !email.includes("@")) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Valid email is required.")
  }
  if (!firstName) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "First name is required.")
  }
  if (!lastName) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Last name is required.")
  }
  assertPasswordStrength(password)

  const existing = await findAccountByEmail(req, email)
  if (existing) {
    await writeAuditLog(req, {
      accountId: existing.id,
      event: "auth.register.conflict",
      success: false,
      metadata: { email },
    })
    return res.status(409).json({
      message: "An account with this email already exists.",
      code: "AUTH_EMAIL_ALREADY_EXISTS",
    })
  }

  const service = getCustomerAuthService(req)
  const account = await service.createCustomerAccounts({
    email,
    password_hash: await hashPassword(password),
    first_name: firstName,
    last_name: lastName,
    document_number: documentNumber || null,
    phone: phone || null,
    whatsapp: whatsapp || null,
    notifications,
    role: CUSTOMER_ROLE_USER,
    failed_login_count: 0,
    blocked_until: null,
    last_login_at: new Date(),
  })

  await clearFailedLoginState(req, account)
  await issueSessionForAccount(req, res, account, "register")

  const cart = await replaceServerCartItems(
    req,
    account.id,
    mergeCartItemsWithSessionPriority([], guestItems)
  )
  const cartItems = sanitizeCartItems(cart.items)

  await writeAuditLog(req, {
    accountId: account.id,
    event: "auth.register.success",
    success: true,
    metadata: { email, merged_cart_items: cartItems.length },
  })

  return res.status(201).json({
    account: mapPublicAccount(account),
    cart: {
      items: cartItems,
      merge_rule: CART_MERGE_RULE,
    },
  })
}
