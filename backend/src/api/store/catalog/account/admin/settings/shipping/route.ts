import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"

import { requireCustomerAdmin } from "../../../../_shared/customer-auth"

import {
  getOrCreateShippingSettings,
  mapPublicShippingSettings,
  updateShippingSettings,
} from "../../../../_shared/shipping-settings"

function resolveThresholdInput(body: Record<string, unknown>) {
  return (
    body.free_shipping_threshold_ars ??
    body.freeShippingThresholdArs ??
    body.free_shipping_threshold ??
    body.freeShippingThreshold ??
    body.threshold_ars ??
    body.thresholdArs
  )
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const settings = await getOrCreateShippingSettings(req)
  return res.json({
    shipping: mapPublicShippingSettings(settings),
  })
}

export async function PATCH(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const body = (req.body ?? {}) as Record<string, unknown>
  const updated = await updateShippingSettings(req, resolveThresholdInput(body))
  return res.json({
    shipping: mapPublicShippingSettings(updated),
  })
}
