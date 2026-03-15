import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import {
  getClientIp,
  getSessionFromAccessCookie,
  getUserAgent,
  normalizeText,
  sanitizeCartItems,
} from "../../_shared/customer-auth"
import { createStockReservation, StockError } from "../../../../../lib/stock"

function mapStockErrorToResponse(res: HttpResponse, error: StockError) {
  return res.status(error.status).json({
    message: error.message,
    code: error.code,
    ...(error.payload ? error.payload : {}),
  })
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const holdMinutesRaw =
    typeof body.hold_minutes === "number" || typeof body.hold_minutes === "string"
      ? Number(body.hold_minutes)
      : Number.NaN

  const auth = await getSessionFromAccessCookie(req)
  const account = auth?.account ?? null
  const email =
    normalizeText(body.email, 160).toLowerCase() ||
    (typeof account?.email === "string" ? account.email : "")

  if (!account?.id && !email) {
    return res.status(400).json({
      message: "Guest reservation requires a valid email.",
      code: "STOCK_RESERVATION_OWNER_REQUIRED",
    })
  }

  try {
    const reservation = await createStockReservation({
      items: sanitizeCartItems(body.items),
      holdMinutes: Number.isFinite(holdMinutesRaw) ? holdMinutesRaw : undefined,
      accountId: account?.id || null,
      email: email || null,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req) || null,
      metadata: {
        source: "store_checkout_reserve",
      },
    })

    return res.status(201).json({
      reservation,
    })
  } catch (error) {
    if (error instanceof StockError) {
      return mapStockErrorToResponse(res, error)
    }
    throw error
  }
}
