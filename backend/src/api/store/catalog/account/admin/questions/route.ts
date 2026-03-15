import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"

import type {
  AdminProductQuestionSort,
  ProductQuestionStatus,
} from "../../../../../../lib/product-questions-pg"
import {
  listAdminProductQuestions,
  normalizeAdminProductQuestionSort,
} from "../../../../../../lib/product-questions-pg"
import { normalizeText, requireCustomerAdmin } from "../../../_shared/customer-auth"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MAX_OFFSET = 1_000_000

const VALID_STATUS_FILTERS = new Set([
  "all",
  "pending",
  "answered",
])

function readQueryString(req: HttpRequest, key: string, max = 180) {
  const raw = (req.query as Record<string, unknown>)?.[key]
  if (typeof raw === "string") return normalizeText(raw, max)
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === "string")
    return typeof first === "string" ? normalizeText(first, max) : ""
  }
  return ""
}

function parseBoundedInt(
  input: unknown,
  fallback: number,
  min: number,
  max: number
) {
  if (typeof input === "string" && !input.trim()) return fallback
  const value = typeof input === "number" ? input : Number(input)
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function parseStatusFilter(value: string): ProductQuestionStatus | "all" {
  const normalized = normalizeText(value, 40).toLowerCase()
  if (VALID_STATUS_FILTERS.has(normalized)) {
    return normalized as ProductQuestionStatus | "all"
  }
  return "all"
}

function parseSortFilter(value: string): AdminProductQuestionSort {
  return normalizeAdminProductQuestionSort(value)
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const limit = parseBoundedInt(
    readQueryString(req, "limit", 20),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT
  )
  const offset = parseBoundedInt(readQueryString(req, "offset", 20), 0, 0, MAX_OFFSET)

  const q = normalizeText(
    readQueryString(req, "q", 180) || readQueryString(req, "search", 180),
    180
  )
  const productId = normalizeText(
    readQueryString(req, "product_id", 140) || readQueryString(req, "productId", 140),
    140
  )
  const status = parseStatusFilter(readQueryString(req, "status", 40))
  const sort = parseSortFilter(readQueryString(req, "sort", 40))

  const { questions, count } = await listAdminProductQuestions({
    q,
    status,
    productId,
    sort,
    limit,
    offset,
  })

  return res.json({
    questions: questions.map((question) => ({
      id: question.id,
      product_id: question.product_id,
      product_title: question.product_title || null,
      product_handle: question.product_handle || null,
      question: question.question,
      answer: question.answer,
      status: question.status,
      customer_name: question.customer_name,
      customer_email: question.customer_email,
      answered_by_account_id: question.answered_by_account_id,
      answered_at: question.answered_at,
      metadata: question.metadata ?? {},
      created_at: question.created_at,
      updated_at: question.updated_at,
    })),
    count,
    limit,
    offset,
    sort,
  })
}
