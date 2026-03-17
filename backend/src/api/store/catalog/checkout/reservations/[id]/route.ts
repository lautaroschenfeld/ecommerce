import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"

import {
  getSessionFromAccessCookie,
  normalizeText,
} from "../../../_shared/customer-auth"
import { releaseStockReservation, StockError } from "../../../../../../lib/stock"

function mapStockErrorToResponse(res: HttpResponse, error: StockError) {
  return res.status(error.status).json({
    message: error.message,
    code: error.code,
    ...(error.payload ? error.payload : {}),
  })
}

function normalizeEmailCandidate(value: unknown) {
  if (typeof value === "string") {
    return normalizeText(value, 160).toLowerCase()
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string") continue
      const normalized = normalizeText(item, 160).toLowerCase()
      if (normalized) return normalized
    }
  }
  return ""
}

export async function DELETE(req: HttpRequest, res: HttpResponse) {
  const reservationId = req.params.id
  const auth = await getSessionFromAccessCookie(req)
  const accountId = normalizeText(auth?.account?.id, 120)

  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : {}

  const email =
    normalizeEmailCandidate(body.email) ||
    normalizeEmailCandidate(body.reservation_email) ||
    normalizeEmailCandidate(body.reservationEmail) ||
    normalizeEmailCandidate(req.query.email) ||
    normalizeEmailCandidate(req.headers["x-reservation-email"]) ||
    normalizeEmailCandidate(auth?.account?.email)

  if (!accountId && !email) {
    return res.status(401).json({
      message: "Reservation owner identity is required.",
      code: "STOCK_RESERVATION_OWNER_REQUIRED",
    })
  }

  try {
    const reservation = await releaseStockReservation(reservationId, {
      expectedAccountId: accountId || null,
      expectedEmail: accountId ? null : email || null,
    })
    return res.status(200).json({ reservation })
  } catch (error) {
    if (error instanceof StockError) {
      return mapStockErrorToResponse(res, error)
    }
    throw error
  }
}
