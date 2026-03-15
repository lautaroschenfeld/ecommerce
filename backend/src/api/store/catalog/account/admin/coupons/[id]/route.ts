import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"
import { HttpError } from "../../../../../../../lib/http"

import {
  getCustomerAuthService,
  normalizeText,
  requireCustomerAdmin,
} from "../../../../_shared/customer-auth"
import {
  normalizeCouponCode,
  parsePercentageTenths,
  percentageTenthsToValue,
} from "../../../../../../../lib/coupon"

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

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key)
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
  const couponId = req.params.id

  const found = await service.listCoupons({ id: couponId }, { take: 1 })
  const coupon = found[0]
  if (!coupon) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Coupon not found.")
  }

  return res.json({ coupon: mapCoupon(coupon) })
}

export async function PATCH(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const service = getCustomerAuthService(req)
  const couponId = req.params.id
  const body = (req.body ?? {}) as Record<string, unknown>

  const found = await service.listCoupons({ id: couponId }, { take: 1 })
  const current = found[0]
  if (!current) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Coupon not found.")
  }

  const data: Record<string, unknown> = {}

  if (hasOwn(body, "code")) {
    const code = normalizeCouponCode(body.code)
    if (!code) {
      throw new HttpError(
        HttpError.Types.INVALID_DATA,
        "code is invalid (A-Z, 0-9, -, _)."
      )
    }
    const conflict = await service.listCoupons({ code }, { take: 1 })
    if (conflict[0] && conflict[0].id !== couponId) {
      throw new HttpError(
        HttpError.Types.INVALID_DATA,
        "Another coupon already uses this code."
      )
    }
    data.code = code
  }

  if (hasOwn(body, "title")) {
    const title = normalizeText(body.title, 140)
    if (!title) {
      throw new HttpError(HttpError.Types.INVALID_DATA, "title is required.")
    }
    data.title = title
  }

  if (
    hasOwn(body, "percentage") ||
    hasOwn(body, "percent") ||
    hasOwn(body, "discount_percent") ||
    hasOwn(body, "discount_percentage") ||
    hasOwn(body, "percentage_tenths")
  ) {
    const percentageTenths = parsePercentageFromBody(body)
    if (percentageTenths === undefined) {
      throw new HttpError(
        HttpError.Types.INVALID_DATA,
        "percentage must be > 0 and <= 100 with up to 1 decimal."
      )
    }
    data.percentage_tenths = percentageTenths
  }

  if (hasOwn(body, "active") || hasOwn(body, "is_active")) {
    const active = body.active ?? body.is_active
    if (typeof active !== "boolean") {
      throw new HttpError(HttpError.Types.INVALID_DATA, "active must be boolean.")
    }
    data.is_active = active
  }

  if (Object.keys(data).length) {
    await service.updateCoupons({
      selector: { id: couponId },
      data,
    })
  }

  const refreshed = await service.listCoupons({ id: couponId }, { take: 1 })
  const coupon = refreshed[0]
  if (!coupon) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Coupon not found.")
  }

  return res.json({ coupon: mapCoupon(coupon) })
}

export async function DELETE(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const service = getCustomerAuthService(req)
  const couponId = req.params.id

  const found = await service.listCoupons({ id: couponId }, { take: 1 })
  if (!found[0]) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Coupon not found.")
  }

  await service.deleteCoupons([couponId])
  return res.sendStatus(204)
}
