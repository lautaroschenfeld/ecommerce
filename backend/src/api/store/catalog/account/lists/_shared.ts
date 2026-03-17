import type { HttpRequest } from "../../../../../lib/http"

import { getCustomerAuthService, normalizeText } from "../../_shared/customer-auth"
import {
  buildSavedProductsFromIds,
  normalizeFavoriteProductId,
} from "../favorites/_shared"

const ACCOUNT_LISTS_MAX_TAKE = 200
const ACCOUNT_LIST_ITEMS_MAX_TAKE = 5000

type AccountListSummary = {
  id: string
  name: string
  item_count: number
  preview_image_url: string | null
  created_at: string | null
  updated_at: string | null
}

function uniq(values: string[]) {
  return Array.from(new Set(values))
}

export function normalizeListName(raw: unknown) {
  return normalizeText(raw, 80)
}

export function normalizeListId(raw: unknown) {
  return normalizeText(raw, 140)
}

export function normalizeListIdsInput(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[]
  return uniq(raw.map((entry) => normalizeListId(entry)).filter(Boolean))
}

function mapAccountListRow(input: {
  row: any
  itemCount: number
  previewImageUrl: string | null
}): AccountListSummary {
  return {
    id: normalizeListId(input.row?.id),
    name: normalizeListName(input.row?.name),
    item_count: Math.max(0, Math.trunc(input.itemCount)),
    preview_image_url:
      typeof input.previewImageUrl === "string" && input.previewImageUrl.trim()
        ? input.previewImageUrl.trim()
        : null,
    created_at:
      typeof input.row?.created_at === "string" ? input.row.created_at : null,
    updated_at:
      typeof input.row?.updated_at === "string" ? input.row.updated_at : null,
  }
}

export async function listAccountListsBasic(req: HttpRequest, accountId: string) {
  const service = getCustomerAuthService(req)
  const rows = await service.listCustomerLists(
    { account_id: accountId },
    {
      take: ACCOUNT_LISTS_MAX_TAKE,
      order: { updated_at: "DESC" },
    }
  )

  return rows
    .map((row: any) => ({
      id: normalizeListId(row?.id),
      name: normalizeListName(row?.name),
      created_at: typeof row?.created_at === "string" ? row.created_at : null,
      updated_at: typeof row?.updated_at === "string" ? row.updated_at : null,
    }))
    .filter((row) => row.id && row.name)
}

export async function listAccountListsWithCounts(req: HttpRequest, accountId: string) {
  const service = getCustomerAuthService(req)
  const rawLists = await service.listCustomerLists(
    { account_id: accountId },
    {
      take: ACCOUNT_LISTS_MAX_TAKE,
      order: { updated_at: "DESC" },
    }
  )
  if (!rawLists.length) return [] as AccountListSummary[]

  const items = await service.listCustomerListItems(
    { account_id: accountId },
    {
      take: ACCOUNT_LIST_ITEMS_MAX_TAKE,
      order: { updated_at: "DESC" },
    }
  )

  const countByListId = new Map<string, number>()
  const previewProductByListId = new Map<string, string>()
  for (const item of items) {
    const listId = normalizeListId(item?.list_id)
    const productId = normalizeFavoriteProductId(item?.product_id)
    if (!listId || !productId) continue

    countByListId.set(listId, (countByListId.get(listId) ?? 0) + 1)
    if (!previewProductByListId.has(listId)) {
      previewProductByListId.set(listId, productId)
    }
  }

  const previewIds = uniq(Array.from(previewProductByListId.values()))
  const previewProducts = await buildSavedProductsFromIds(previewIds)
  const previewImageByProductId = new Map<string, string>()
  for (const product of previewProducts.products) {
    if (!product.id) continue
    if (typeof product.imageUrl === "string" && product.imageUrl.trim()) {
      previewImageByProductId.set(product.id, product.imageUrl.trim())
    }
  }

  return rawLists
    .map((row: any) => {
      const id = normalizeListId(row?.id)
      if (!id) return null
      const previewProductId = previewProductByListId.get(id)
      const previewImageUrl = previewProductId
        ? previewImageByProductId.get(previewProductId) || null
        : null

      return mapAccountListRow({
        row,
        itemCount: countByListId.get(id) ?? 0,
        previewImageUrl,
      })
    })
    .filter((item): item is AccountListSummary => Boolean(item))
}

export async function getAccountListById(
  req: HttpRequest,
  accountId: string,
  listId: string
) {
  const service = getCustomerAuthService(req)
  const rows = await service.listCustomerLists(
    {
      id: listId,
      account_id: accountId,
    },
    { take: 1 }
  )
  const row = rows[0]
  if (!row) return null

  const id = normalizeListId(row.id)
  const name = normalizeListName(row.name)
  if (!id || !name) return null

  return {
    id,
    name,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
  }
}

export async function listProductIdsForList(
  req: HttpRequest,
  accountId: string,
  listId: string
) {
  const service = getCustomerAuthService(req)
  const rows = await service.listCustomerListItems(
    {
      account_id: accountId,
      list_id: listId,
    },
    {
      take: ACCOUNT_LIST_ITEMS_MAX_TAKE,
      order: { updated_at: "DESC" },
    }
  )

  return uniq(
    rows
      .map((row: any) => normalizeFavoriteProductId(row?.product_id))
      .filter(Boolean)
  )
}

export async function listListIdsByProduct(
  req: HttpRequest,
  accountId: string,
  productId: string
) {
  const service = getCustomerAuthService(req)
  const rows = await service.listCustomerListItems(
    {
      account_id: accountId,
      product_id: productId,
    },
    {
      take: ACCOUNT_LIST_ITEMS_MAX_TAKE,
      order: { updated_at: "DESC" },
    }
  )

  return uniq(
    rows
      .map((row: any) => normalizeListId(row?.list_id))
      .filter(Boolean)
  )
}
