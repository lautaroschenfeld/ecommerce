import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"

import { HttpError } from "../../../../../../lib/http"

import {
  getCustomerAuthService,
  normalizeText,
  requireCustomerAdmin,
} from "../../../_shared/customer-auth"
import {
  normalizeCouponCode,
  parsePercentageTenths,
  percentageTenthsToValue,
} from "../../../../../../lib/coupon"

function toBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

function readQueryString(req: HttpRequest, key: string, max = 40) {
  const raw = (req.query as Record<string, unknown>)?.[key]
  if (typeof raw === "string") return normalizeText(raw, max)
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === "string")
    return typeof first === "string" ? normalizeText(first, max) : ""
  }
  return ""
}

function parseBoundedInt(input: unknown, fallback: number, min: number, max: number) {
  if (typeof input === "string" && !input.trim()) return fallback
  const value = typeof input === "number" ? input : Number(input)
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function mapCoupon(coupon: Record<string, any>) {
  const percentageTenths = Number(coupon.percentage_tenths || 0)

  return {
    id: coupon.id,
    code: coupon.code,
    title: coupon.title,
    percentage: percentageTenthsToValue(percentageTenths),
    percentage_tenths: percentageTenths,
    active: Boolean(coupon.is_active),
    used_count: Number(coupon.used_count || 0),
    created_at: coupon.created_at,
    updated_at: coupon.updated_at,
  }
}

function parsePercentageFromBody(body: Record<string, unknown>) {
  return parsePercentageTenths(
    body.percentage ??
      body.percent ??
      body.discount_percent ??
      body.discount_percentage ??
      body.percentage_tenths
  )
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const service = getCustomerAuthService(req)
  const limit = parseBoundedInt(readQueryString(req, "limit", 20), 50, 1, 200)
  const offset = parseBoundedInt(readQueryString(req, "offset", 20), 0, 0, 1_000_000)

  const [list, count] = await Promise.all([
    service.listCoupons({}, { take: limit, skip: offset, order: { updated_at: "desc" } }),
    service.countCoupons({}),
  ])

  return res.json({
    coupons: list.map((coupon: Record<string, any>) => mapCoupon(coupon)),
    count,
    limit,
    offset,
  })
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const service = getCustomerAuthService(req)
  const body = (req.body ?? {}) as Record<string, unknown>

  const code = normalizeCouponCode(body.code)
  if (!code) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "code is required (A-Z, 0-9, -, _)."
    )
  }

  const title = normalizeText(body.title, 140)
  if (!title) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "title is required.")
  }

  const percentageTenths = parsePercentageFromBody(body)
  if (percentageTenths === undefined) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "percentage must be > 0 and <= 100 with up to 1 decimal."
    )
  }

  const existing = await service.listCoupons({ code }, { take: 1 })
  if (existing[0]) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "A coupon with this code already exists."
    )
  }

  const created = await service.createCoupons({
    code,
    title,
    percentage_tenths: percentageTenths,
    is_active: toBoolean(body.active ?? body.is_active, true),
    used_count: 0,
    metadata: {},
  })

  return res.status(201).json({ coupon: mapCoupon(created) })
}
