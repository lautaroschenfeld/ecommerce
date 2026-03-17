import type { HttpRequest, HttpResponse } from "../../../../../lib/http"
import { HttpError } from "../../../../../lib/http"

import {
  getCustomerAuthService,
  sanitizeCartItems,
} from "../../_shared/customer-auth"
import {
  computeCouponDiscountArs,
  normalizeCouponCode,
  percentageTenthsToValue,
  toSubtotalArs,
} from "../../../../../lib/coupon"

function asObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  const body = asObject(req.body)
  const code = normalizeCouponCode(body.code)
  if (!code) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Coupon code is required.")
  }

  const items = sanitizeCartItems(body.items)
  const subtotalFromItems = items.reduce((acc, item) => acc + item.qty * item.priceArs, 0)
  const subtotalArs = toSubtotalArs(
    body.subtotal_ars ?? body.subtotalArs,
    subtotalFromItems
  )

  const service = getCustomerAuthService(req)
  const found = await service.listCoupons({ code }, { take: 1 })
  const coupon = found[0]

  if (!coupon || !coupon.is_active) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Coupon is invalid or inactive.")
  }

  const percentageTenths = Number(coupon.percentage_tenths || 0)
  const discountArs = computeCouponDiscountArs(subtotalArs, percentageTenths)

  return res.json({
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      title: coupon.title,
      percentage: percentageTenthsToValue(percentageTenths),
      percentage_tenths: percentageTenths,
    },
    subtotal_ars: subtotalArs,
    discount_ars: discountArs,
    total_ars: Math.max(0, subtotalArs - discountArs),
  })
}
