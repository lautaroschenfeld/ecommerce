import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import {
  getCustomerAuthService,
  requireCustomerAuth,
} from "../../_shared/customer-auth"

import {
  listAccountListsWithCounts,
  normalizeListName,
} from "./_shared"

const MAX_ACCOUNT_LISTS = 200

export async function GET(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const lists = await listAccountListsWithCounts(req, account.id)

  return res.json({
    lists,
    count: lists.length,
  })
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)
  const service = getCustomerAuthService(req)
  const body = (req.body ?? {}) as Record<string, unknown>
  const name = normalizeListName(body.name ?? body.list_name ?? body.listName)

  if (!name) {
    return res.status(400).json({
      message: "name is required.",
      code: "LIST_NAME_REQUIRED",
    })
  }

  const existing = await service.listCustomerLists(
    { account_id: account.id },
    { take: MAX_ACCOUNT_LISTS }
  )
  const exists = existing.some((row: any) => {
    const current = normalizeListName(row?.name).toLowerCase()
    return Boolean(current) && current === name.toLowerCase()
  })
  if (exists) {
    return res.status(409).json({
      message: "List name already exists.",
      code: "LIST_NAME_ALREADY_EXISTS",
    })
  }

  const created = await service.createCustomerLists({
    account_id: account.id,
    name,
  })

  return res.status(201).json({
    list: {
      id: created?.id,
      name: normalizeListName(created?.name),
      item_count: 0,
      preview_image_url: null,
      created_at:
        typeof created?.created_at === "string" ? created.created_at : null,
      updated_at:
        typeof created?.updated_at === "string" ? created.updated_at : null,
    },
  })
}
