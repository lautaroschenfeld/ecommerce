import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"

import { pgQuery } from "../../../../../../../lib/pg"
import { requireCustomerAdmin } from "../../../../_shared/customer-auth"
import {
  type AdminProductsBulkAction,
  createBulkJob,
} from "./_state"
import { ensureBulkJobsDrain } from "./_drain"

const ALLOWED_ACTIONS = new Set<AdminProductsBulkAction>([
  "publish",
  "delete",
  "change_category",
  "adjust_stock",
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown, max = 160) {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function toInteger(value: unknown) {
  const n =
    typeof value === "string" || typeof value === "number"
      ? Number(value)
      : Number.NaN
  if (!Number.isFinite(n)) return undefined
  return Math.trunc(n)
}

function parseProductIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  const out: string[] = []
  const seen = new Set<string>()

  for (const current of value) {
    const id = text(current, 160)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }

  return out
}

async function getCategoryIdByName(name: string) {
  const rows = await pgQuery<{ id: string }>(
    `select "id"
     from "product_category"
     where "deleted_at" is null and "name" = $1
     limit 1;`,
    [name]
  )
  const id = rows[0]?.id
  return typeof id === "string" ? id.trim() : ""
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const body = asRecord(req.body) ?? {}
  const actionRaw = text(body.action, 80).toLowerCase()
  if (!ALLOWED_ACTIONS.has(actionRaw as AdminProductsBulkAction)) {
    return res.status(400).json({ message: "action is invalid" })
  }
  const action = actionRaw as AdminProductsBulkAction
  const productIds = parseProductIds(body.productIds ?? body.product_ids)

  if (!productIds.length) {
    return res.status(400).json({ message: "productIds is required" })
  }
  if (productIds.length > 10_000) {
    return res.status(400).json({ message: "max 10000 product ids" })
  }

  let categoryId = ""
  let categoryName = ""
  if (action === "change_category") {
    categoryName = text(body.category ?? body.category_name, 140)
    if (!categoryName) {
      return res.status(400).json({ message: "category is required" })
    }
    categoryId = await getCategoryIdByName(categoryName)
    if (!categoryId) {
      return res.status(400).json({ message: "category is invalid" })
    }
  }

  let stockDelta: number | undefined = undefined
  if (action === "adjust_stock") {
    stockDelta = toInteger(body.stockDelta ?? body.stock_delta)
    if (stockDelta === undefined || stockDelta === 0) {
      return res.status(400).json({ message: "stockDelta must be a non-zero integer" })
    }
  }

  const job = await createBulkJob({
    action,
    total: productIds.length,
    parameters: {
      productIds,
      category: categoryName || undefined,
      categoryId: categoryId || undefined,
      stockDelta: stockDelta ?? undefined,
    },
  })

  ensureBulkJobsDrain()

  return res.status(202).json({ job })
}

