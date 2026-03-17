import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../../../../lib/http"

import {
  getCustomerAuthService,
  mapPublicAccount,
  normalizeCustomerRole,
  normalizeText,
  requireCustomerAdministrator,
} from "../../../../../_shared/customer-auth"

const ROLE_ADMINISTRATOR = "administrator"
const ROLE_EMPLOYEE = "employee"
const ROLE_USER = "user"

function parseRole(raw: unknown) {
  const value = normalizeText(raw, 24).toLowerCase()
  if (!value) return null
  if (value === ROLE_ADMINISTRATOR) return ROLE_ADMINISTRATOR
  if (value === ROLE_EMPLOYEE) return ROLE_EMPLOYEE
  if (value === ROLE_USER) return ROLE_USER
  return null
}

export async function PATCH(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdministrator(req, res)

  const service = getCustomerAuthService(req)
  const accountId = normalizeText(req.params.id, 120)
  if (!accountId) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Account id is required.")
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const nextRole = parseRole(body.role ?? body.rol)
  if (!nextRole) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "role must be one of: administrator, employee, user."
    )
  }

  const found = await service.listCustomerAccounts({ id: accountId }, { take: 1 })
  const target = found[0]
  if (!target) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Account not found.")
  }

  const currentRole = normalizeCustomerRole(target.role)
  if (currentRole === nextRole) {
    return res.json({ account: mapPublicAccount(target) })
  }

  if (currentRole === ROLE_ADMINISTRATOR && nextRole !== ROLE_ADMINISTRATOR) {
    const administrators = await service.listCustomerAccounts(
      { role: ROLE_ADMINISTRATOR },
      { take: 500 }
    )
    if (administrators.length <= 1) {
      throw new HttpError(
        HttpError.Types.INVALID_DATA,
        "At least one administrator account is required."
      )
    }
  }

  await service.updateCustomerAccounts({
    selector: { id: accountId },
    data: { role: nextRole },
  })

  const refreshed = await service.listCustomerAccounts({ id: accountId }, { take: 1 })
  const account = refreshed[0]
  if (!account) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Account not found.")
  }

  return res.json({ account: mapPublicAccount(account) })
}
