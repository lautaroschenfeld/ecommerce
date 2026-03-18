import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import {
  getCustomerAuthService,
  getSessionFromAccessCookie,
  mapPublicAccount,
  sanitizeCartItems,
} from "../../_shared/customer-auth"
import { CART_MERGE_RULE } from "../../../../../lib/customer-auth/constants"

export async function GET(req: HttpRequest, res: HttpResponse) {
  const ctx = await getSessionFromAccessCookie(req)
  if (!ctx) {
    return res.status(401).json({
      account: null,
      cart: { items: [], merge_rule: CART_MERGE_RULE },
      addresses: [],
      authenticated: false,
    })
  }

  const service = getCustomerAuthService(req)
  const cart = await service.listCustomerCarts(
    { account_id: ctx.account.id },
    { take: 1 }
  )
  const addresses = await service.listCustomerAddresses(
    { account_id: ctx.account.id },
    { take: 500 }
  )

  return res.status(200).json({
    authenticated: true,
    account: mapPublicAccount(ctx.account),
    cart: {
      items: sanitizeCartItems(cart[0]?.items ?? []),
      merge_rule: CART_MERGE_RULE,
    },
    addresses,
  })
}
