import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../lib/http"

import {
  assertPasswordStrength,
  getCustomerAuthService,
  hashPassword,
  requireCustomerAuth,
  verifyPassword,
  writeAuditLog,
} from "../../_shared/customer-auth"

export async function POST(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const body = (req.body ?? {}) as Record<string, unknown>

  const currentPassword =
    typeof body.current_password === "string" ? body.current_password : ""
  const newPassword = typeof body.new_password === "string" ? body.new_password : ""

  if (!currentPassword || !newPassword) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "current_password and new_password are required."
    )
  }

  const valid = await verifyPassword(currentPassword, String(account.password_hash || ""))
  if (!valid) {
    throw new HttpError(
      HttpError.Types.UNAUTHORIZED,
      "Current password is invalid."
    )
  }

  assertPasswordStrength(newPassword)

  const service = getCustomerAuthService(req)
  await service.updateCustomerAccounts({
    selector: { id: account.id },
    data: { password_hash: await hashPassword(newPassword) },
  })

  await writeAuditLog(req, {
    accountId: account.id,
    event: "account.password.updated",
    success: true,
  })

  return res.status(200).json({ ok: true })
}
