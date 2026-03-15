import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import {
  ensureSingleDefaultAddress,
  getCustomerAuthService,
  normalizeAddressInput,
  requireCustomerAuth,
  writeAuditLog,
} from "../../_shared/customer-auth"

export async function GET(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const service = getCustomerAuthService(req)
  const addresses = await service.listCustomerAddresses(
    { account_id: account.id },
    { take: 500 }
  )

  return res.json({ addresses })
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const service = getCustomerAuthService(req)

  const input = normalizeAddressInput(req.body ?? {})
  const created = await service.createCustomerAddresses({
    account_id: account.id,
    ...input,
  })

  await ensureSingleDefaultAddress(
    req,
    account.id,
    input.is_default ? created.id : undefined
  )

  const refreshed = await service.listCustomerAddresses(
    { account_id: account.id },
    { take: 500 }
  )

  await writeAuditLog(req, {
    accountId: account.id,
    event: "account.address.created",
    success: true,
    metadata: { address_id: created.id },
  })

  return res.status(201).json({ address: created, addresses: refreshed })
}
