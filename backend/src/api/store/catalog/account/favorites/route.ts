import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import {
  getCustomerAuthService,
  requireCustomerAuth,
} from "../../_shared/customer-auth"

import {
  buildFavoriteProductsResponse,
  isPublishedStoreProduct,
  normalizeFavoriteProductId,
} from "./_shared"

function readBodyProductId(body: Record<string, unknown>) {
  return normalizeFavoriteProductId(
    body.product_id ?? body.productId ?? body.id
  )
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const responseBody = await buildFavoriteProductsResponse(req, account.id)
  return res.json(responseBody)
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const body = (req.body ?? {}) as Record<string, unknown>
  const productId = readBodyProductId(body)

  if (!productId) {
    return res.status(400).json({
      message: "product_id is required.",
      code: "FAVORITE_PRODUCT_ID_REQUIRED",
    })
  }

  const exists = await isPublishedStoreProduct(productId)
  if (!exists) {
    return res.status(404).json({
      message: "Product not found.",
      code: "FAVORITE_PRODUCT_NOT_FOUND",
    })
  }

  const service = getCustomerAuthService(req)
  await service.createCustomerFavoriteProducts({
    account_id: account.id,
    product_id: productId,
  })

  const responseBody = await buildFavoriteProductsResponse(req, account.id)
  return res.status(201).json(responseBody)
}
