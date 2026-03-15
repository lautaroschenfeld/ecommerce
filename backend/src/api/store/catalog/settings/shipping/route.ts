import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import {
  getOrCreateShippingSettings,
  mapPublicShippingSettings,
} from "../../_shared/shipping-settings"

export async function GET(req: HttpRequest, res: HttpResponse) {
  const settings = await getOrCreateShippingSettings(req)
  return res.json({
    shipping: mapPublicShippingSettings(settings),
  })
}

