import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"

import { requireCustomerAdmin } from "../../../../_shared/customer-auth"

import {
  getOrCreateStorefrontSettings,
  mapAdminStorefrontSettings,
  updateStorefrontSettings,
} from "../../../../_shared/storefront-settings"

function hasOwnField(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key)
}

function readPatchField(
  body: Record<string, unknown>,
  snakeKey: string,
  camelKey?: string
) {
  if (hasOwnField(body, snakeKey)) return body[snakeKey]
  if (camelKey && hasOwnField(body, camelKey)) return body[camelKey]
  return undefined
}

function resolvePatch(body: Record<string, unknown>) {
  return {
    store_name: readPatchField(body, "store_name", "storeName"),
    logo_url: readPatchField(body, "logo_url", "logoUrl"),
    favicon_url: readPatchField(body, "favicon_url", "faviconUrl"),
    faviconUrl: readPatchField(body, "faviconUrl"),
    theme_mode: readPatchField(body, "theme_mode", "themeMode"),
    themeMode: readPatchField(body, "themeMode"),
    radius_scale: readPatchField(body, "radius_scale", "radiusScale"),
    radiusScale: readPatchField(body, "radiusScale"),
    currency_code: readPatchField(body, "currency_code", "currencyCode"),
    store_locale: readPatchField(body, "store_locale", "storeLocale"),
    locale: readPatchField(body, "locale"),
    font_url: readPatchField(body, "font_url", "fontUrl"),
    fontUrl: readPatchField(body, "fontUrl"),
    banner_url: readPatchField(body, "banner_url", "bannerUrl"),
    bannerUrl: readPatchField(body, "bannerUrl"),
    banner_focus_x: readPatchField(body, "banner_focus_x", "bannerFocusX"),
    bannerFocusX: readPatchField(body, "bannerFocusX"),
    banner_focus_y: readPatchField(body, "banner_focus_y", "bannerFocusY"),
    bannerFocusY: readPatchField(body, "bannerFocusY"),
    banner_zoom: readPatchField(body, "banner_zoom", "bannerZoom"),
    bannerZoom: readPatchField(body, "bannerZoom"),
    maintenance_mode: readPatchField(body, "maintenance_mode", "maintenanceMode"),
    maintenanceMode: readPatchField(body, "maintenanceMode"),
    maintenance_password: readPatchField(body, "maintenance_password", "maintenancePassword"),
    maintenancePassword: readPatchField(body, "maintenancePassword"),
  }
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const settings = await getOrCreateStorefrontSettings(req)
  return res.json({
    storefront: mapAdminStorefrontSettings(settings),
  })
}

export async function PATCH(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const body = (req.body ?? {}) as Record<string, unknown>
  const updated = await updateStorefrontSettings(req, resolvePatch(body))
  return res.json({
    storefront: mapAdminStorefrontSettings(updated),
  })
}
