import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"

import { requireCustomerAuth } from "../../../_shared/customer-auth"
import { buildSavedProductsFromIds } from "../../favorites/_shared"

import {
  getAccountListById,
  listProductIdsForList,
  normalizeListId,
} from "../_shared"

export async function GET(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const listId = normalizeListId(req.params.id)
  if (!listId) {
    return res.status(400).json({
      message: "list id is required.",
      code: "LIST_ID_REQUIRED",
    })
  }

  const list = await getAccountListById(req, account.id, listId)
  if (!list) {
    return res.status(404).json({
      message: "List not found.",
      code: "LIST_NOT_FOUND",
    })
  }

  const productIds = await listProductIdsForList(req, account.id, listId)
  const products = await buildSavedProductsFromIds(productIds)

  return res.json({
    list: {
      ...list,
      item_count: productIds.length,
    },
    ...products,
  })
}
