import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../lib/http"

import {
  assertPasswordStrength,
  findAccountById,
  getCustomerAuthService,
  hashPassword,
  hashToken,
  writeAuditLog,
} from "../../_shared/customer-auth"

function parseDate(value: unknown) {
  if (!value) return null
  const date = new Date(value as string)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const token = typeof body.token === "string" ? body.token.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""

  if (!token || !password) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "token and password are required."
    )
  }
  assertPasswordStrength(password)

  const service = getCustomerAuthService(req)
  const tokenHash = hashToken(token)

  const list = await service.listPasswordResetTokens(
    { token_hash: tokenHash },
    { take: 1 }
  )
  const reset = list[0]
  if (!reset) {
    return res.status(400).json({
      message: "Invalid or expired token.",
      code: "AUTH_RESET_INVALID_TOKEN",
    })
  }

  if (reset.used_at) {
    return res.status(400).json({
      message: "Token has already been used.",
      code: "AUTH_RESET_USED_TOKEN",
    })
  }

  const expiresAt = parseDate(reset.expires_at)
  if (!expiresAt || expiresAt.getTime() <= Date.now()) {
    return res.status(400).json({
      message: "Token has expired.",
      code: "AUTH_RESET_EXPIRED_TOKEN",
    })
  }

  const account = await findAccountById(req, reset.account_id)
  if (!account) {
    return res.status(400).json({
      message: "Invalid token account.",
      code: "AUTH_RESET_INVALID_ACCOUNT",
    })
  }

  await service.updateCustomerAccounts({
    selector: { id: account.id },
    data: {
      password_hash: await hashPassword(password),
      failed_login_count: 0,
      blocked_until: null,
    },
  })

  await service.updatePasswordResetTokens({
    selector: { id: reset.id },
    data: { used_at: new Date() },
  })

  const sessions = await service.listCustomerSessions(
    { account_id: account.id },
    { take: 500 }
  )
  for (const session of sessions) {
    if (!session.revoked_at) {
      await service.updateCustomerSessions({
        selector: { id: session.id },
        data: { revoked_at: new Date() },
      })
    }
  }

  await writeAuditLog(req, {
    accountId: account.id,
    event: "auth.reset_password.success",
    success: true,
  })

  return res.status(200).json({ ok: true })
}
