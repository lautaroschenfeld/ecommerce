import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../lib/http"

import {
  getCustomerAuthService,
  mapPublicAccount,
  normalizeDocumentNumber,
  normalizePhone,
  normalizeText,
  requireCustomerAuth,
  sanitizeNotifications,
  writeAuditLog,
} from "../../_shared/customer-auth"

export async function GET(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const service = getCustomerAuthService(req)
  const addresses = await service.listCustomerAddresses(
    { account_id: account.id },
    { take: 500 }
  )

  return res.json({
    account: mapPublicAccount(account),
    addresses,
  })
}

export async function PATCH(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const body = (req.body ?? {}) as Record<string, unknown>
  const service = getCustomerAuthService(req)

  const patch: Record<string, unknown> = {}
  if (body.first_name !== undefined || body.firstName !== undefined) {
    patch["first_name"] =
      normalizeText(body.first_name ?? body.firstName, 80) || account.first_name
  }
  if (body.last_name !== undefined || body.lastName !== undefined) {
    patch["last_name"] = normalizeText(body.last_name ?? body.lastName, 80) || ""
  }
  if (body.document_number !== undefined || body.documentNumber !== undefined) {
    patch["document_number"] =
      normalizeDocumentNumber(body.document_number ?? body.documentNumber) || null
  }
  if (body.phone !== undefined) {
    patch["phone"] = normalizePhone(body.phone) || null
  }
  if (body.whatsapp !== undefined) {
    patch["whatsapp"] = normalizePhone(body.whatsapp) || null
  }
  if (body.notifications !== undefined) {
    patch["notifications"] = sanitizeNotifications(body.notifications)
  }
  if (body.email !== undefined) {
    const nextEmail = normalizeText(body.email, 160).toLowerCase()
    if (!nextEmail || !nextEmail.includes("@")) {
      throw new HttpError(HttpError.Types.INVALID_DATA, "Valid email is required.")
    }

    if (nextEmail !== String(account.email || "")) {
      const existing = await service.listCustomerAccounts(
        { email: nextEmail },
        { take: 1 }
      )
      const found = existing[0]
      if (found && found.id !== account.id) {
        return res.status(409).json({
          message: "An account with this email already exists.",
          code: "AUTH_EMAIL_ALREADY_EXISTS",
        })
      }
      patch["email"] = nextEmail
    }
  }

  await service.updateCustomerAccounts({
    selector: { id: account.id },
    data: patch,
  })

  const updated = await service.listCustomerAccounts({ id: account.id }, { take: 1 })
  const latest = updated[0] ?? account

  await writeAuditLog(req, {
    accountId: account.id,
    event: "account.profile.updated",
    success: true,
  })

  return res.json({
    account: mapPublicAccount(latest),
  })
}
