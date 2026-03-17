import { HttpError, type HttpRequest } from "../../../../lib/http"

import { getCustomerAuthService } from "./customer-auth"

export const DEFAULT_FREE_SHIPPING_THRESHOLD = 50000
export const STANDARD_SHIPPING_AMOUNT = 8500
export const EXPRESS_SHIPPING_AMOUNT = 14500
export const EXPRESS_DISCOUNTED_SHIPPING_AMOUNT = 6500

const SETTINGS_SCOPE = "default"

function toNonNegativeInt(value: unknown, fallback?: number) {
  const parsed =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN

  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.trunc(parsed))
}

function normalizeDeliveryMethod(value: unknown) {
  if (typeof value !== "string") return "standard"
  const normalized = value.trim().toLowerCase()
  if (normalized === "pickup") return "pickup"
  if (normalized === "express") return "express"
  return "standard"
}

export function mapPublicShippingSettings(settings: Record<string, any>) {
  const freeShippingThresholdArs = toNonNegativeInt(
    settings?.free_shipping_threshold_ars,
    DEFAULT_FREE_SHIPPING_THRESHOLD
  )

  return {
    free_shipping_threshold_ars: freeShippingThresholdArs,
    standard_shipping_ars: STANDARD_SHIPPING_AMOUNT,
    express_shipping_ars: EXPRESS_SHIPPING_AMOUNT,
    express_discounted_shipping_ars: EXPRESS_DISCOUNTED_SHIPPING_AMOUNT,
  }
}

export async function getOrCreateShippingSettings(req: HttpRequest) {
  const service = getCustomerAuthService(req)
  const existing = await service.listShippingSettings(
    { scope: SETTINGS_SCOPE },
    { take: 1 }
  )

  if (existing[0]) return existing[0]

  return await service.createShippingSettings({
    scope: SETTINGS_SCOPE,
    free_shipping_threshold_ars: DEFAULT_FREE_SHIPPING_THRESHOLD,
    metadata: {},
  })
}

export async function updateShippingSettings(
  req: HttpRequest,
  nextThresholdArsInput: unknown
) {
  const service = getCustomerAuthService(req)
  const current = await getOrCreateShippingSettings(req)
  const nextThresholdArs = toNonNegativeInt(nextThresholdArsInput)

  if (nextThresholdArs === undefined) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "free_shipping_threshold_ars must be a non-negative number."
    )
  }

  await service.updateShippingSettings({
    selector: { id: current.id },
    data: { free_shipping_threshold_ars: nextThresholdArs },
  })

  const updated = await service.listShippingSettings({ id: current.id }, { take: 1 })
  return updated[0] ?? current
}

export function computeShippingArs(input: {
  subtotalArs: number
  deliveryMethod: unknown
  freeShippingThresholdArs: unknown
}) {
  const subtotalArs = Math.max(0, Math.trunc(Number(input.subtotalArs) || 0))
  const method = normalizeDeliveryMethod(input.deliveryMethod)
  const thresholdArs = toNonNegativeInt(
    input.freeShippingThresholdArs,
    DEFAULT_FREE_SHIPPING_THRESHOLD
  ) as number

  if (method === "pickup") return 0

  const qualifiesForFreeStandard = subtotalArs >= thresholdArs
  if (method === "standard") {
    return qualifiesForFreeStandard ? 0 : STANDARD_SHIPPING_AMOUNT
  }

  return qualifiesForFreeStandard
    ? EXPRESS_DISCOUNTED_SHIPPING_AMOUNT
    : EXPRESS_SHIPPING_AMOUNT
}
