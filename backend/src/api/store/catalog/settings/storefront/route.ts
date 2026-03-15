import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import {
  getOrCreateStorefrontSettings,
  mapPublicStorefrontSettings,
} from "../../_shared/storefront-settings"

export async function GET(req: HttpRequest, res: HttpResponse) {
  const settings = await getOrCreateStorefrontSettings(req)
  return res.json({
    storefront: mapPublicStorefrontSettings(settings),
  })
}
