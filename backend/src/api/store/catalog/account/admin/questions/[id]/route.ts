import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"

import { publishAdminNotification } from "../../../../../../../lib/admin-notifications"
import type { ProductQuestionStatus } from "../../../../../../../lib/product-questions-pg"
import {
  deleteProductQuestion,
  getProductQuestionById,
  normalizeQuestionStatus,
  normalizeQuestionText,
  updateProductQuestion,
} from "../../../../../../../lib/product-questions-pg"
import { normalizeText, requireCustomerAdmin } from "../../../../_shared/customer-auth"

const VALID_STATUSES = new Set<ProductQuestionStatus>([
  "pending",
  "answered",
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function parseStatusInput(value: unknown) {
  const normalized = normalizeQuestionStatus(value, "pending")
  const raw = typeof value === "string" ? normalizeText(value, 40).toLowerCase() : ""
  if (!raw) return null
  if (!VALID_STATUSES.has(normalized)) return null
  if (!VALID_STATUSES.has(raw as ProductQuestionStatus)) return null
  return normalized
}

export async function PATCH(req: HttpRequest, res: HttpResponse) {
  const ctx = await requireCustomerAdmin(req, res)

  const questionId =
    typeof req.params.id === "string"
      ? normalizeQuestionText(req.params.id, 120)
      : ""
  if (!questionId) {
    return res.status(404).json({ message: "Not found" })
  }

  const body = asRecord(req.body) ?? {}
  const hasStatus = hasOwn(body, "status")
  const hasAnswer = hasOwn(body, "answer")
  if (!hasStatus && !hasAnswer) {
    return res.status(400).json({ message: "status or answer is required" })
  }

  const current = await getProductQuestionById(questionId)
  if (!current) {
    return res.status(404).json({ message: "Not found" })
  }
  const currentStatus = normalizeQuestionStatus(current.status, "pending")

  if (currentStatus === "answered" && hasAnswer) {
    const incomingAnswer = normalizeQuestionText(body.answer, 2400) || null
    const savedAnswer = normalizeQuestionText(current.answer, 2400) || null
    if ((incomingAnswer ?? "") !== (savedAnswer ?? "")) {
      return res.status(409).json({
        message: "La respuesta ya fue enviada y no puede editarse.",
      })
    }
  }

  const nextAnswer = hasAnswer
    ? normalizeQuestionText(body.answer, 2400) || null
    : current.answer ?? null

  let nextStatus: ProductQuestionStatus = currentStatus

  if (hasStatus) {
    const parsedStatus = parseStatusInput(body.status)
    if (!parsedStatus) {
      return res.status(400).json({ message: "status is invalid" })
    }
    if (currentStatus === "answered" && parsedStatus === "pending") {
      return res.status(409).json({
        message: "La pregunta ya fue respondida y no puede volver a pendiente.",
      })
    }
    nextStatus = parsedStatus
  } else if (hasAnswer && nextAnswer) {
    nextStatus = "answered"
  } else if (hasAnswer && !nextAnswer && nextStatus === "answered") {
    nextStatus = "pending"
  }

  if (nextStatus === "answered" && !nextAnswer) {
    return res
      .status(400)
      .json({ message: "answer is required when status is answered" })
  }

  const answeredByAccountId =
    nextStatus === "answered"
      ? normalizeQuestionText(ctx.account?.id, 120) || null
      : null
  const answeredAt =
    nextStatus === "answered" ? current.answered_at ?? new Date() : null

  const updated = await updateProductQuestion({
    id: questionId,
    status: nextStatus,
    answer: nextAnswer,
    answeredByAccountId,
    answeredAt,
  })

  if (!updated) {
    return res.status(404).json({ message: "Not found" })
  }

  try {
    publishAdminNotification({
      type: "product_question.updated",
      payload: {
        id: updated.id,
        productId: updated.product_id,
        previousStatus: currentStatus,
        status: updated.status,
        answeredAt: updated.answered_at,
        updatedAt: updated.updated_at,
      },
    })
  } catch (error) {
    console.error("[admin.questions] Failed to publish admin notification", {
      questionId: updated.id,
      productId: updated.product_id,
      error,
    })
  }

  return res.json({
    question: {
      id: updated.id,
      product_id: updated.product_id,
      question: updated.question,
      answer: updated.answer,
      status: updated.status,
      customer_name: updated.customer_name,
      customer_email: updated.customer_email,
      answered_by_account_id: updated.answered_by_account_id,
      answered_at: updated.answered_at,
      metadata: updated.metadata ?? {},
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    },
  })
}

export async function DELETE(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const questionId =
    typeof req.params.id === "string"
      ? normalizeQuestionText(req.params.id, 120)
      : ""
  if (!questionId) {
    return res.status(404).json({ message: "Not found" })
  }

  const current = await getProductQuestionById(questionId)
  if (!current) {
    return res.status(404).json({ message: "Not found" })
  }

  const deleted = await deleteProductQuestion(questionId)
  if (!deleted) {
    return res.status(404).json({ message: "Not found" })
  }

  try {
    publishAdminNotification({
      type: "product_question.deleted",
      payload: {
        id: deleted.id,
        productId: deleted.product_id,
        previousStatus: current.status,
        deletedAt: Date.now(),
      },
    })
  } catch (error) {
    console.error("[admin.questions] Failed to publish delete notification", {
      questionId: deleted.id,
      productId: deleted.product_id,
      error,
    })
  }

  return res.sendStatus(204)
}
