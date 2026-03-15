import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../../lib/http"

import {
  ensureSingleDefaultAddress,
  getCustomerAuthService,
  normalizeAddressInput,
  requireCustomerAuth,
  writeAuditLog,
} from "../../../_shared/customer-auth"

export async function PATCH(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const service = getCustomerAuthService(req)

  const addressId = req.params.id
  const existing = await service.listCustomerAddresses(
    { id: addressId, account_id: account.id },
    { take: 1 }
  )
  const address = existing[0]
  if (!address) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Address not found.")
  }

  const input = normalizeAddressInput({
    ...address,
    ...(req.body ?? {}),
  })

  await service.updateCustomerAddresses({
    selector: { id: addressId },
    data: input,
  })

  await ensureSingleDefaultAddress(
    req,
    account.id,
    input.is_default ? addressId : undefined
  )

  const refreshed = await service.listCustomerAddresses(
    { account_id: account.id },
    { take: 500 }
  )

  await writeAuditLog(req, {
    accountId: account.id,
    event: "account.address.updated",
    success: true,
    metadata: { address_id: addressId },
  })

  return res.json({ addresses: refreshed })
}

export async function DELETE(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const service = getCustomerAuthService(req)
  const addressId = req.params.id

  const existing = await service.listCustomerAddresses(
    { id: addressId, account_id: account.id },
    { take: 1 }
  )
  const address = existing[0]
  if (!address) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Address not found.")
  }

  await service.deleteCustomerAddresses([addressId])
  await ensureSingleDefaultAddress(req, account.id)

  await writeAuditLog(req, {
    accountId: account.id,
    event: "account.address.deleted",
    success: true,
    metadata: { address_id: addressId },
  })

  return res.sendStatus(204)
}
