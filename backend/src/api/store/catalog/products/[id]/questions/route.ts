import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"

import {
  getClientIp,
  getUserAgent,
  requireCustomerAuth,
} from "../../../_shared/customer-auth"
import { publishAdminNotification } from "../../../../../../lib/admin-notifications"
import {
  createProductQuestion,
  findPublishedProductSummary,
  listStorefrontProductQuestions,
  normalizeOptionalEmail,
  normalizeOptionalText,
  normalizeQuestionText,
} from "../../../../../../lib/product-questions-pg"

const DEFAULT_LIMIT = 3
const MAX_LIMIT = 100
const MAX_OFFSET = 1_000_000
const STORE_PRODUCT_QUESTION_MAX_CHARS = 120

function parseBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  if (typeof value === "string" && !value.trim()) return fallback
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  const productIdParam =
    typeof req.params.id === "string" ? req.params.id.trim() : ""
  if (!productIdParam) {
    return res.status(404).json({ message: "Not found" })
  }

  const product = await findPublishedProductSummary(productIdParam)
  if (!product) {
    return res.status(404).json({ message: "Not found" })
  }

  const limit = parseBoundedInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
  const offset = parseBoundedInt(req.query.offset, 0, 0, MAX_OFFSET)

  const { questions, count } = await listStorefrontProductQuestions({
    productId: product.id,
    limit,
    offset,
  })

  return res.json({
    questions: questions.map((item) => ({
      id: item.id,
      question: item.question,
      answer: item.answer,
      status: item.status,
      createdAt: item.created_at,
      answeredAt: item.answered_at,
    })),
    count,
    limit,
    offset,
  })
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  const productIdParam =
    typeof req.params.id === "string" ? req.params.id.trim() : ""
  if (!productIdParam) {
    return res.status(404).json({ message: "Not found" })
  }

  const product = await findPublishedProductSummary(productIdParam)
  if (!product) {
    return res.status(404).json({ message: "Not found" })
  }

  const ctx = await requireCustomerAuth(req, res)
  const body = asRecord(req.body) ?? {}
  const question = normalizeQuestionText(
    body.question ?? body.pregunta,
    STORE_PRODUCT_QUESTION_MAX_CHARS
  )
  if (!question || question.length < 8) {
    return res
      .status(400)
      .json({ message: "question is required (minimum 8 characters)" })
  }

  const accountFirstName = normalizeQuestionText(
    ctx.account?.first_name ?? ctx.account?.firstName,
    80
  )
  const accountLastName = normalizeQuestionText(
    ctx.account?.last_name ?? ctx.account?.lastName,
    80
  )
  const accountFullName = `${accountFirstName} ${accountLastName}`.trim()
  const customerName =
    normalizeOptionalText(accountFullName, 120) ??
    normalizeOptionalText(
      body.customerName ?? body.customer_name ?? body.nombre,
      120
    )
  const customerEmail =
    normalizeOptionalEmail(ctx.account?.email, 160) ??
    normalizeOptionalEmail(
      body.customerEmail ?? body.customer_email ?? body.email,
      160
    )

  const created = await createProductQuestion({
    productId: product.id,
    question,
    customerName,
    customerEmail,
    metadata: {
      source: "storefront",
      ip_address: getClientIp(req),
      user_agent: getUserAgent(req),
    },
  })

  if (!created) {
    return res.status(500).json({ message: "No se pudo crear la pregunta." })
  }

  try {
    publishAdminNotification({
      type: "product_question.created",
      payload: {
        id: created.id,
        productId: created.product_id,
        productTitle: product.title,
        productHandle: product.handle,
        status: created.status,
        createdAt: created.created_at,
      },
    })
  } catch (error) {
    console.error("[product.questions] Failed to publish admin notification", {
      questionId: created.id,
      productId: created.product_id,
      error,
    })
  }

  return res.status(201).json({
    question: {
      id: created.id,
      productId: created.product_id,
      question: created.question,
      status: created.status,
      createdAt: created.created_at,
    },
  })
}
