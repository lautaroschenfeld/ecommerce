import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import {
  findAccountByEmail,
  getCustomerAuthService,
  hashToken,
  newToken,
  passwordResetExpiryDate,
  writeAuditLog,
} from "../../_shared/customer-auth"

export async function POST(req: HttpRequest, res: HttpResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : ""

  if (!email) {
    return res.status(200).json({
      ok: true,
      message:
        "If this email exists, a password reset link will be sent.",
    })
  }

  const account = await findAccountByEmail(req, email)
  if (!account) {
    await writeAuditLog(req, {
      event: "auth.forgot_password.unknown_email",
      success: true,
      metadata: { email },
    })
    return res.status(200).json({
      ok: true,
      message:
        "If this email exists, a password reset link will be sent.",
    })
  }

  const service = getCustomerAuthService(req)

  const existing = await service.listPasswordResetTokens(
    { account_id: account.id },
    { take: 200 }
  )
  for (const token of existing) {
    if (!token.used_at) {
      await service.updatePasswordResetTokens({
        selector: { id: token.id },
        data: { used_at: new Date() },
      })
    }
  }

  const rawToken = newToken(32)
  const expiresAt = passwordResetExpiryDate()

  await service.createPasswordResetTokens({
    account_id: account.id,
    token_hash: hashToken(rawToken),
    expires_at: expiresAt,
    used_at: null,
    requested_ip: req.ip || null,
    requested_user_agent:
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"]
        : null,
  })

  await writeAuditLog(req, {
    accountId: account.id,
    event: "auth.forgot_password.requested",
    success: true,
  })

  const payload: Record<string, unknown> = {
    ok: true,
    message:
      "If this email exists, a password reset link will be sent.",
  }

  const allowDevResetToken =
    (process.env.NODE_ENV || "development") !== "production" &&
    String(process.env.ALLOW_DEV_RESET_TOKEN || "").toLowerCase() === "true"

  if (allowDevResetToken) {
    payload["dev_reset_token"] = rawToken
    payload["dev_reset_expires_at"] = expiresAt.toISOString()
  }

  return res.status(200).json(payload)
}
