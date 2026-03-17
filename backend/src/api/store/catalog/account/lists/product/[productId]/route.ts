import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"

import {
  getCustomerAuthService,
  requireCustomerAuth,
} from "../../../../_shared/customer-auth"
import { isPublishedStoreProduct, normalizeFavoriteProductId } from "../../../favorites/_shared"

import {
  listAccountListsBasic,
  listListIdsByProduct,
  normalizeListIdsInput,
} from "../../_shared"

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value > 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true
    if (normalized === "false" || normalized === "0" || normalized === "no") return false
  }
  return fallback
}

async function buildSelectionPayload(
  req: HttpRequest,
  accountId: string,
  productId: string
) {
  const service = getCustomerAuthService(req)
  const [favoriteRows, listIds, lists] = await Promise.all([
    service.listCustomerFavoriteProducts(
      { account_id: accountId, product_id: productId },
      { take: 1 }
    ),
    listListIdsByProduct(req, accountId, productId),
    listAccountListsBasic(req, accountId),
  ])

  return {
    product_id: productId,
    favorite: Boolean(favoriteRows[0]),
    list_ids: listIds,
    lists: lists.map((list) => ({
      id: list.id,
      name: list.name,
    })),
  }
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const productId = normalizeFavoriteProductId(req.params.productId)
  if (!productId) {
    return res.status(400).json({
      message: "productId is required.",
      code: "LIST_PRODUCT_ID_REQUIRED",
    })
  }

  const exists = await isPublishedStoreProduct(productId)
  if (!exists) {
    return res.status(404).json({
      message: "Product not found.",
      code: "LIST_PRODUCT_NOT_FOUND",
    })
  }

  const payload = await buildSelectionPayload(req, account.id, productId)
  return res.json(payload)
}

export async function PUT(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const productId = normalizeFavoriteProductId(req.params.productId)
  if (!productId) {
    return res.status(400).json({
      message: "productId is required.",
      code: "LIST_PRODUCT_ID_REQUIRED",
    })
  }

  const exists = await isPublishedStoreProduct(productId)
  if (!exists) {
    return res.status(404).json({
      message: "Product not found.",
      code: "LIST_PRODUCT_NOT_FOUND",
    })
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const wantsFavorite = parseBoolean(
    body.favorite ?? body.is_favorite ?? body.isFavorite,
    false
  )
  const requestedListIds = normalizeListIdsInput(
    body.list_ids ?? body.listIds ?? body.lists
  )

  const service = getCustomerAuthService(req)
  const [availableLists, currentListIds] = await Promise.all([
    listAccountListsBasic(req, account.id),
    listListIdsByProduct(req, account.id, productId),
  ])

  const allowedListIds = new Set(availableLists.map((list) => list.id))
  const selectedListIds = requestedListIds.filter((listId) => allowedListIds.has(listId))

  if (wantsFavorite) {
    await service.createCustomerFavoriteProducts({
      account_id: account.id,
      product_id: productId,
    })
  } else {
    await service.deleteCustomerFavoriteProducts({
      accountId: account.id,
      productIds: [productId],
    })
  }

  if (selectedListIds.length) {
    await Promise.all(
      selectedListIds.map((listId) =>
        service.createCustomerListItems({
          account_id: account.id,
          list_id: listId,
          product_id: productId,
        })
      )
    )
  }

  const selectedSet = new Set(selectedListIds)
  const listIdsToRemove = currentListIds.filter((listId) => !selectedSet.has(listId))
  if (listIdsToRemove.length) {
    await service.deleteCustomerListItems({
      accountId: account.id,
      listIds: listIdsToRemove,
      productIds: [productId],
    })
  }

  const payload = await buildSelectionPayload(req, account.id, productId)
  return res.json(payload)
}
