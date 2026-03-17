import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import { getCustomerAuthService, requireCustomerAuth } from "../../_shared/customer-auth"

export async function GET(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const service = getCustomerAuthService(req)

  const rawLimit =
    typeof req.query.limit === "string" ? Number(req.query.limit) : Number.NaN
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(100, Math.trunc(rawLimit)))
    : 50

  const orders = await service.listCustomerOrders(
    { account_id: account.id },
    {
      take: limit,
      order: { created_at: "DESC" },
    }
  )

  return res.json({
    orders,
    count: orders.length,
  })
}
