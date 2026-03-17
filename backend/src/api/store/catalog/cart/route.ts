import type { HttpRequest, HttpResponse } from "../../../../lib/http"

import {
  getOrCreateServerCart,
  replaceServerCartItems,
  requireCustomerAuth,
  sanitizeCartItems,
  writeAuditLog,
} from "../_shared/customer-auth"

export async function GET(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const cart = await getOrCreateServerCart(req, account.id)

  return res.json({
    cart: {
      id: cart.id,
      items: sanitizeCartItems(cart.items),
      updated_at: cart.updated_at_override || cart.updated_at,
    },
  })
}

export async function PUT(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const body = (req.body ?? {}) as Record<string, unknown>
  const nextItems = sanitizeCartItems(body.items)
  const updated = await replaceServerCartItems(req, account.id, nextItems)

  await writeAuditLog(req, {
    accountId: account.id,
    event: "cart.synced",
    success: true,
    metadata: { item_count: nextItems.length },
  })

  return res.json({
    cart: {
      id: updated.id,
      items: sanitizeCartItems(updated.items),
      updated_at: updated.updated_at_override || updated.updated_at,
    },
  })
}
