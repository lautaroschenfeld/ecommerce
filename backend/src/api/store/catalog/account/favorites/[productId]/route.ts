import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"

import {
  getCustomerAuthService,
  requireCustomerAuth,
} from "../../../_shared/customer-auth"

import {
  buildFavoriteProductsResponse,
  normalizeFavoriteProductId,
} from "../_shared"

export async function DELETE(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const productId = normalizeFavoriteProductId(req.params.productId)
  if (!productId) {
    return res.status(400).json({
      message: "productId is required.",
      code: "FAVORITE_PRODUCT_ID_REQUIRED",
    })
  }

  const service = getCustomerAuthService(req)
  await service.deleteCustomerFavoriteProducts({
    accountId: account.id,
    productIds: [productId],
  })

  const responseBody = await buildFavoriteProductsResponse(req, account.id)
  return res.json(responseBody)
}
