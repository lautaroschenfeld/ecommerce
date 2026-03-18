import crypto from "crypto"

import { HttpError, type HttpRequest } from "../../../../lib/http"
import { STORE_CURRENCY_CODE, STORE_REGION_COUNTRY_CODE } from "../../../../lib/catalog"
import { pgQuery } from "../../../../lib/pg"

import { getCustomerAuthService } from "./customer-auth"

const SETTINGS_SCOPE = "default"

export const DEFAULT_STOREFRONT_SETTINGS = {
  store_name: "Ecommerce",
  logo_url: null as string | null,
  favicon_url: null as string | null,
  theme_mode: "light" as const,
  radius_scale: 1,
  font_scale: 1,
}

const DEFAULT_BANNER_FOCUS_X = 50
const DEFAULT_BANNER_FOCUS_Y = 50
const DEFAULT_BANNER_ZOOM = 1
const MAINTENANCE_MODE_METADATA_KEY = "maintenance_mode"
const MAINTENANCE_PASSWORD_HASH_METADATA_KEY = "maintenance_password_hash"
const MAINTENANCE_PASSWORD_MIN_LENGTH = 6

const DEFAULT_CURRENCY_CODE = String(STORE_CURRENCY_CODE || "usd").toUpperCase()

function defaultLocale() {
  const cc = String(STORE_REGION_COUNTRY_CODE || "").toLowerCase()
  if (cc === "ar") return "es-AR"
  if (cc === "mx") return "es-MX"
  if (cc === "es") return "es-ES"
  if (cc === "us") return "en-US"
  return "es-AR"
}

const DEFAULT_STORE_LOCALE = defaultLocale()

const STOREFRONT_SETTINGS_TABLE = 'public.mp_storefront_setting'
const LEGACY_STORE_NAME_CONSTRAINT = "mp_storefront_setting_store_name_non_empty"
const STORE_IDENTITY_CONSTRAINT = "mp_storefront_setting_store_identity_non_empty"

let ensureStorefrontSettingsSchemaPromise: Promise<void> | null = null

async function ensureStorefrontSettingsSchema() {
  if (ensureStorefrontSettingsSchemaPromise) return ensureStorefrontSettingsSchemaPromise

  ensureStorefrontSettingsSchemaPromise = (async () => {
    const existingTable = await pgQuery<{ regclass: string | null }>(
      `select to_regclass($1) as "regclass";`,
      [STOREFRONT_SETTINGS_TABLE]
    )
    if (!existingTable[0]?.regclass) return

    // Backwards compatible patch: allow empty store_name when logo_url is present.
    await pgQuery(
      `alter table "mp_storefront_setting" drop constraint if exists "${LEGACY_STORE_NAME_CONSTRAINT}";`
    )

    const existingConstraint = await pgQuery(
      `select 1
       from pg_constraint
       where conname = $1
       limit 1;`,
      [STORE_IDENTITY_CONSTRAINT]
    )
    if (existingConstraint[0]) return

    await pgQuery(`
      alter table "mp_storefront_setting"
      add constraint "${STORE_IDENTITY_CONSTRAINT}"
      check (
        length(trim(coalesce("store_name", ''))) > 0
        or length(trim(coalesce("logo_url", ''))) > 0
      );
    `)
  })().catch((error) => {
    // Allow retry in dev if the DB wasn't ready yet.
    ensureStorefrontSettingsSchemaPromise = null
    throw error
  })

  return ensureStorefrontSettingsSchemaPromise
}

function isStorefrontSettingsTableMissing(error: unknown) {
  const rec = error && typeof error === "object" ? (error as Record<string, unknown>) : null
  const code = typeof rec?.code === "string" ? rec.code : ""
  const message = String(rec?.message ?? "").toLowerCase()

  if (code === "42P01") return true
  if (!message) return false

  return (
    message.includes("mp_storefront_setting") &&
    (message.includes("does not exist") || message.includes("no existe la relación"))
  )
}

function buildDefaultStorefrontSettingsRecord() {
  return {
    id: "default-storefront-settings",
    scope: SETTINGS_SCOPE,
    ...DEFAULT_STOREFRONT_SETTINGS,
    metadata: buildDefaultStorefrontMetadata(),
  }
}

function buildDefaultStorefrontMetadata() {
  return {
    theme_mode: DEFAULT_STOREFRONT_SETTINGS.theme_mode,
    radius_scale: DEFAULT_STOREFRONT_SETTINGS.radius_scale,
    font_scale: DEFAULT_STOREFRONT_SETTINGS.font_scale,
  }
}

function normalizeText(input: unknown, max = 120) {
  if (typeof input !== "string") return ""
  return input.replace(/\s+/g, " ").trim().slice(0, max)
}

function normalizeCurrencyCode(input: unknown, fallback: string) {
  if (typeof input !== "string") return fallback
  const raw = input.trim().toUpperCase()
  if (!raw) return fallback
  if (/^[A-Z]{3}$/.test(raw)) return raw
  return fallback
}

function normalizeLocale(input: unknown, fallback: string) {
  if (typeof input !== "string") return fallback
  const raw = input.trim()
  if (!raw) return fallback

  const match = raw.match(/^([a-zA-Z]{2})(?:[-_ ]?([a-zA-Z]{2}))?$/)
  if (!match) return fallback
  const language = match[1].toLowerCase()
  const region = match[2] ? match[2].toUpperCase() : ""
  return region ? `${language}-${region}` : language
}

function normalizeThemeMode(input: unknown, fallback: "light" | "dark") {
  const raw = typeof input === "string" ? input.trim().toLowerCase() : ""
  if (raw === "light" || raw === "dark") return raw
  return fallback
}

function normalizeRadiusScale(input: unknown, fallback: number) {
  const parsed =
    typeof input === "number"
      ? input
      : typeof input === "string" && input.trim()
        ? Number(input)
        : Number.NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(2, Math.round(parsed * 1000) / 1000))
}

function normalizeFontScale(input: unknown, fallback: number) {
  const parsed =
    typeof input === "number"
      ? input
      : typeof input === "string" && input.trim()
        ? Number(input)
        : Number.NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0.2, Math.min(2, Math.round(parsed * 1000) / 1000))
}

function normalizeLogoUrl(input: unknown) {
  if (input === null) return null
  if (typeof input !== "string") return undefined
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined
    }
    return url.toString()
  } catch {
    return undefined
  }
}

function normalizeBannerPercent(input: unknown, fallback: number) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.max(0, Math.min(100, input))
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, parsed))
    }
  }
  return fallback
}

function normalizeBannerZoom(input: unknown, fallback: number) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.max(1, Math.min(3, input))
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input)
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(3, parsed))
    }
  }
  return fallback
}

type StorefrontFontConfig = {
  provider: "google"
  family: string
  css_url: string
  specimen_url: string | null
}

export type StorefrontMaintenanceState = {
  enabled: boolean
  passwordHash: string
}

function normalizeMetadataObject(input: unknown) {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : null
}

function normalizeBooleanInput(input: unknown, fallback = false) {
  if (typeof input === "boolean") return input
  if (typeof input === "number") return input !== 0
  if (typeof input === "string") {
    const value = input.trim().toLowerCase()
    if (!value) return fallback
    if (value === "true" || value === "1" || value === "yes" || value === "on") return true
    if (value === "false" || value === "0" || value === "no" || value === "off") return false
  }
  return fallback
}

function normalizeSha256Hash(input: unknown) {
  if (typeof input !== "string") return ""
  const value = input.trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(value) ? value : ""
}

function readMaintenanceStateFromMetadata(
  metadata: Record<string, unknown>
): StorefrontMaintenanceState {
  const enabled = normalizeBooleanInput(
    metadata[MAINTENANCE_MODE_METADATA_KEY] ?? metadata.maintenanceMode,
    false
  )
  const passwordHash = normalizeSha256Hash(
    metadata[MAINTENANCE_PASSWORD_HASH_METADATA_KEY] ?? metadata.maintenancePasswordHash
  )
  return {
    enabled,
    passwordHash,
  }
}

function hashMaintenancePassword(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex")
}

function timingSafeEqualHash(leftHash: string, rightHash: string) {
  if (!leftHash || !rightHash) return false
  try {
    const left = Buffer.from(leftHash, "hex")
    const right = Buffer.from(rightHash, "hex")
    if (left.length !== right.length) return false
    return crypto.timingSafeEqual(left, right)
  } catch {
    return false
  }
}

function pickPatchAlias<T>(snakeCaseValue: T | undefined, camelCaseValue: T | undefined) {
  return snakeCaseValue !== undefined ? snakeCaseValue : camelCaseValue
}

function normalizeFontConfig(input: unknown): StorefrontFontConfig | null {
  const rec = normalizeMetadataObject(input)
  if (!rec) return null

  const provider = rec.provider === "google" ? "google" : null
  const family = normalizeText(rec.family, 80)
  const cssUrl = typeof rec.css_url === "string" ? rec.css_url.trim() : ""
  const specimenUrl = typeof rec.specimen_url === "string" ? rec.specimen_url.trim() : ""

  if (!provider || !family || !cssUrl) return null
  if (!cssUrl.startsWith("https://fonts.googleapis.com/")) return null

  return {
    provider,
    family,
    css_url: cssUrl,
    specimen_url: specimenUrl ? specimenUrl : null,
  }
}

function buildGoogleSpecimenUrl(family: string) {
  const encoded = encodeURIComponent(family.trim()).replace(/%20/g, "+")
  return `https://fonts.google.com/specimen/${encoded}`
}

function buildGoogleCssUrl(family: string) {
  const encoded = encodeURIComponent(family.trim()).replace(/%20/g, "+")
  // Keep it compatible with any Google Font by not forcing a weight axis.
  return `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`
}

function parseGoogleFontInput(input: string): StorefrontFontConfig | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    const hostname = url.hostname.toLowerCase()

    if (hostname === "fonts.google.com") {
      const parts = url.pathname.split("/").filter(Boolean)
      if (parts[0] !== "specimen") return null
      const rawFamily = parts[1] ? decodeURIComponent(parts[1]) : ""
      const family = normalizeText(rawFamily.replace(/\+/g, " "), 80)
      if (!family) return null

      return {
        provider: "google",
        family,
        css_url: buildGoogleCssUrl(family),
        specimen_url: buildGoogleSpecimenUrl(family),
      }
    }

    if (hostname === "fonts.googleapis.com") {
      if (url.protocol !== "https:") return null
      const families = url.searchParams.getAll("family")
      const first = families[0] ?? ""
      if (!first) return null

      const familyOnly = first.split(":")[0] || ""
      const family = normalizeText(decodeURIComponent(familyOnly.replace(/\+/g, " ")), 80)
      if (!family) return null

      if (!url.searchParams.get("display")) {
        url.searchParams.set("display", "swap")
      }

      return {
        provider: "google",
        family,
        css_url: url.toString(),
        specimen_url: buildGoogleSpecimenUrl(family),
      }
    }
  } catch {
    // Not a URL, fall through to "family name" parsing.
  }

  const family = normalizeText(trimmed.replace(/\+/g, " "), 80)
  if (!family) return null
  return {
    provider: "google",
    family,
    css_url: buildGoogleCssUrl(family),
    specimen_url: buildGoogleSpecimenUrl(family),
  }
}

export function mapPublicStorefrontSettings(settings: Record<string, any>) {
  const logoUrl = normalizeLogoUrl(settings?.logo_url)
  const metadata = normalizeMetadataObject(settings?.metadata) ?? {}
  const maintenance = readMaintenanceStateFromMetadata(metadata)
  const faviconUrl = normalizeLogoUrl(
    settings?.favicon_url ?? metadata.favicon_url ?? metadata.faviconUrl
  )
  const rawStoreName = normalizeText(settings?.store_name, 80)
  const storeName = rawStoreName || (logoUrl ? "" : DEFAULT_STOREFRONT_SETTINGS.store_name)
  const themeMode = normalizeThemeMode(
    metadata.theme_mode ?? metadata.themeMode ?? settings?.theme_mode ?? settings?.themeMode,
    DEFAULT_STOREFRONT_SETTINGS.theme_mode
  )
  const radiusScale = normalizeRadiusScale(
    metadata.radius_scale ?? metadata.radiusScale ?? settings?.radius_scale ?? settings?.radiusScale,
    DEFAULT_STOREFRONT_SETTINGS.radius_scale
  )
  const fontScale = normalizeFontScale(
    metadata.font_scale ?? metadata.fontScale ?? settings?.font_scale ?? settings?.fontScale,
    DEFAULT_STOREFRONT_SETTINGS.font_scale
  )
  const currencyCode = normalizeCurrencyCode(metadata.currency_code, DEFAULT_CURRENCY_CODE)
  const storeLocale = normalizeLocale(metadata.locale ?? metadata.store_locale, DEFAULT_STORE_LOCALE)
  const font = normalizeFontConfig(metadata.font)
  const hasBannerInMetadata = Object.prototype.hasOwnProperty.call(metadata, "banner")
  const banner = normalizeMetadataObject(metadata.banner) ?? {}
  const bannerUrl = hasBannerInMetadata
    ? normalizeLogoUrl(banner.image_url ?? banner.url) ?? null
    : normalizeLogoUrl(settings?.banner_url ?? banner.image_url ?? banner.url) ?? null
  const bannerFocusX = normalizeBannerPercent(
    hasBannerInMetadata ? banner.focus_x : settings?.banner_focus_x ?? banner.focus_x,
    DEFAULT_BANNER_FOCUS_X
  )
  const bannerFocusY = normalizeBannerPercent(
    hasBannerInMetadata ? banner.focus_y : settings?.banner_focus_y ?? banner.focus_y,
    DEFAULT_BANNER_FOCUS_Y
  )
  const bannerZoom = normalizeBannerZoom(
    hasBannerInMetadata ? banner.zoom : settings?.banner_zoom ?? banner.zoom,
    DEFAULT_BANNER_ZOOM
  )

  return {
    store_name: storeName,
    logo_url: logoUrl ?? null,
    favicon_url: faviconUrl ?? null,
    theme_mode: themeMode,
    radius_scale: radiusScale,
    font_scale: fontScale,
    currency_code: currencyCode,
    store_locale: storeLocale,
    font,
    banner_url: bannerUrl,
    banner_focus_x: bannerFocusX,
    banner_focus_y: bannerFocusY,
    banner_zoom: bannerZoom,
    maintenance_mode: maintenance.enabled,
  }
}

export function mapAdminStorefrontSettings(settings: Record<string, any>) {
  const publicSettings = mapPublicStorefrontSettings(settings)
  const metadata = normalizeMetadataObject(settings?.metadata) ?? {}
  const maintenance = readMaintenanceStateFromMetadata(metadata)
  return {
    ...publicSettings,
    maintenance_password_configured: Boolean(maintenance.passwordHash),
  }
}

export function readStorefrontMaintenanceState(settings: Record<string, any>): StorefrontMaintenanceState {
  const metadata = normalizeMetadataObject(settings?.metadata) ?? {}
  return readMaintenanceStateFromMetadata(metadata)
}

export async function getStorefrontMaintenanceState(req: HttpRequest) {
  const settings = await getOrCreateStorefrontSettings(req)
  return readStorefrontMaintenanceState(settings as Record<string, any>)
}

export function verifyStorefrontMaintenancePassword(password: string, expectedHash: string) {
  const normalizedExpectedHash = normalizeSha256Hash(expectedHash)
  const rawPassword = typeof password === "string" ? password : ""
  if (!rawPassword || !normalizedExpectedHash) return false
  const providedHash = hashMaintenancePassword(rawPassword)
  return timingSafeEqualHash(providedHash, normalizedExpectedHash)
}

export async function getOrCreateStorefrontSettings(req: HttpRequest) {
  const service = getCustomerAuthService(req)

  try {
    await ensureStorefrontSettingsSchema()
    const existing = await service.listStorefrontSettings(
      { scope: SETTINGS_SCOPE },
      { take: 1 }
    )

    if (existing[0]) return existing[0]

    return await service.createStorefrontSettings({
      scope: SETTINGS_SCOPE,
      ...DEFAULT_STOREFRONT_SETTINGS,
      metadata: buildDefaultStorefrontMetadata(),
    })
  } catch (error) {
    if (isStorefrontSettingsTableMissing(error)) {
      // Keep storefront usable even if the DB migration wasn't applied yet.
      return buildDefaultStorefrontSettingsRecord()
    }
    throw error
  }
}

type StorefrontSettingsPatch = {
  store_name?: unknown
  logo_url?: unknown
  favicon_url?: unknown
  faviconUrl?: unknown
  theme_mode?: unknown
  themeMode?: unknown
  radius_scale?: unknown
  radiusScale?: unknown
  font_scale?: unknown
  fontScale?: unknown
  currency_code?: unknown
  store_locale?: unknown
  locale?: unknown
  font_url?: unknown
  fontUrl?: unknown
  banner_url?: unknown
  bannerUrl?: unknown
  banner_focus_x?: unknown
  bannerFocusX?: unknown
  banner_focus_y?: unknown
  bannerFocusY?: unknown
  banner_zoom?: unknown
  bannerZoom?: unknown
  maintenance_mode?: unknown
  maintenanceMode?: unknown
  maintenance_password?: unknown
  maintenancePassword?: unknown
}

function resolveStoreName(input: unknown) {
  if (input === undefined) return undefined
  if (input === null) return ""
  if (typeof input !== "string") {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "store_name must be a string or null."
    )
  }

  return normalizeText(input, 80)
}

function resolveLogoUrl(input: unknown) {
  if (input === undefined) return undefined
  const value = normalizeLogoUrl(input)
  if (value === undefined) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "logo_url must be a valid http/https URL or null."
    )
  }
  return value
}

function resolveFaviconUrl(input: unknown) {
  if (input === undefined) return undefined
  const value = normalizeLogoUrl(input)
  if (value === undefined) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "favicon_url must be a valid http/https URL or null."
    )
  }
  return value
}

function resolveThemeMode(input: unknown) {
  if (input === undefined) return undefined
  if (input === null) return null
  if (typeof input !== "string") {
    throw new HttpError(HttpError.Types.INVALID_DATA, "theme_mode must be 'light', 'dark' or null.")
  }

  const value = input.trim().toLowerCase()
  if (!value) return null
  if (value === "light" || value === "dark") return value

  throw new HttpError(HttpError.Types.INVALID_DATA, "theme_mode must be 'light' or 'dark'.")
}

function resolveRadiusScale(input: unknown) {
  if (input === undefined) return undefined
  if (input === null) return null

  const parsed =
    typeof input === "number"
      ? input
      : typeof input === "string" && input.trim()
        ? Number(input)
        : Number.NaN

  if (!Number.isFinite(parsed)) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "radius_scale must be a number between 0 and 2 or null."
    )
  }

  return Math.max(0, Math.min(2, Math.round(parsed * 1000) / 1000))
}

function resolveFontScale(input: unknown) {
  if (input === undefined) return undefined
  if (input === null) return null

  const parsed =
    typeof input === "number"
      ? input
      : typeof input === "string" && input.trim()
        ? Number(input)
        : Number.NaN

  if (!Number.isFinite(parsed)) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "font_scale must be a number between 0.2 and 2 or null."
    )
  }

  return Math.max(0.2, Math.min(2, Math.round(parsed * 1000) / 1000))
}

function resolveCurrencyCode(input: unknown) {
  if (input === undefined) return undefined
  if (input === null) return null
  if (typeof input !== "string") {
    throw new HttpError(HttpError.Types.INVALID_DATA, "currency_code must be a 3-letter code or null.")
  }

  const trimmed = input.trim()
  if (!trimmed) return null
  const code = trimmed.toUpperCase()
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "currency_code must be a 3-letter ISO code (e.g. ARS, USD).")
  }
  return code
}

function resolveLocale(input: unknown) {
  if (input === undefined) return undefined
  if (input === null) return null
  if (typeof input !== "string") {
    throw new HttpError(HttpError.Types.INVALID_DATA, "store_locale must be a string or null.")
  }

  const trimmed = input.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^([a-zA-Z]{2})(?:[-_ ]?([a-zA-Z]{2}))?$/)
  if (!match) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "store_locale must look like es-AR or en-US.")
  }
  const language = match[1].toLowerCase()
  const region = match[2] ? match[2].toUpperCase() : ""
  return region ? `${language}-${region}` : language
}

function resolveFontUrl(input: unknown) {
  if (input === undefined) return undefined
  if (input === null) return null
  if (typeof input !== "string") {
    throw new HttpError(HttpError.Types.INVALID_DATA, "font_url must be a Google Fonts URL or null.")
  }

  const trimmed = input.trim()
  if (!trimmed) return null
  const parsed = parseGoogleFontInput(trimmed)
  if (!parsed) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "font_url must be a Google Fonts specimen URL (fonts.google.com/specimen/...) or a fonts.googleapis.com/css2 URL."
    )
  }
  return parsed
}

function resolveBannerUrl(input: unknown) {
  if (input === undefined) return undefined
  const value = normalizeLogoUrl(input)
  if (value === undefined) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "banner_url must be a valid http/https URL or null."
    )
  }
  return value
}

function resolveBannerFocus(input: unknown, field: "banner_focus_x" | "banner_focus_y") {
  if (input === undefined) return undefined
  if (input === null) return null

  const parsed =
    typeof input === "number"
      ? input
      : typeof input === "string" && input.trim()
        ? Number(input)
        : Number.NaN
  if (!Number.isFinite(parsed)) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      `${field} must be a number between 0 and 100 or null.`
    )
  }
  return Math.max(0, Math.min(100, parsed))
}

function resolveBannerZoom(input: unknown) {
  if (input === undefined) return undefined
  if (input === null) return null

  const parsed =
    typeof input === "number"
      ? input
      : typeof input === "string" && input.trim()
        ? Number(input)
        : Number.NaN
  if (!Number.isFinite(parsed)) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "banner_zoom must be a number between 1 and 3 or null."
    )
  }
  return Math.max(1, Math.min(3, parsed))
}

function resolveMaintenanceMode(input: unknown) {
  if (input === undefined) return undefined
  if (input === null) return null
  if (typeof input === "boolean") return input
  if (typeof input === "string") {
    const value = input.trim().toLowerCase()
    if (!value) return null
    if (value === "true" || value === "1" || value === "yes" || value === "on") return true
    if (value === "false" || value === "0" || value === "no" || value === "off") return false
  }
  throw new HttpError(
    HttpError.Types.INVALID_DATA,
    "maintenance_mode must be true, false or null."
  )
}

function resolveMaintenancePassword(input: unknown) {
  if (input === undefined) return undefined
  if (input === null) return null
  if (typeof input !== "string") {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "maintenance_password must be a string or null."
    )
  }

  const trimmed = input.trim()
  if (!trimmed) return null
  if (trimmed.length < MAINTENANCE_PASSWORD_MIN_LENGTH) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      `maintenance_password must have at least ${MAINTENANCE_PASSWORD_MIN_LENGTH} characters.`
    )
  }
  return trimmed
}

export async function updateStorefrontSettings(
  req: HttpRequest,
  patch: StorefrontSettingsPatch
) {
  await ensureStorefrontSettingsSchema()
  const service = getCustomerAuthService(req)
  const current = await getOrCreateStorefrontSettings(req)

  const data: Record<string, unknown> = {}
  const metadataCurrent = normalizeMetadataObject((current as any)?.metadata) ?? {}
  const metadataNext: Record<string, unknown> = { ...metadataCurrent }
  let metadataChanged = false

  const storeName = resolveStoreName(patch.store_name)
  if (storeName !== undefined) data.store_name = storeName

  const logoUrl = resolveLogoUrl(patch.logo_url)
  if (logoUrl !== undefined) data.logo_url = logoUrl

  const faviconUrl = resolveFaviconUrl(
    pickPatchAlias((patch as any).favicon_url, (patch as any).faviconUrl)
  )
  if (faviconUrl !== undefined) {
    if (faviconUrl === null) {
      if (Object.prototype.hasOwnProperty.call(metadataNext, "favicon_url")) {
        delete metadataNext.favicon_url
        metadataChanged = true
      }
    } else if (metadataNext.favicon_url !== faviconUrl) {
      metadataNext.favicon_url = faviconUrl
      metadataChanged = true
    }
  }

  const currentStoreName = normalizeText((current as any)?.store_name, 80)
  const currentLogoUrl = normalizeLogoUrl((current as any)?.logo_url)
  const nextStoreName = storeName !== undefined ? storeName : currentStoreName
  const nextLogoUrl = logoUrl !== undefined ? logoUrl : currentLogoUrl

  if (!nextStoreName && !nextLogoUrl) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "Either store_name or logo_url is required."
    )
  }

  const themeMode = resolveThemeMode(
    pickPatchAlias((patch as any).theme_mode, (patch as any).themeMode)
  )
  if (themeMode !== undefined) {
    if (themeMode === null) {
      if (Object.prototype.hasOwnProperty.call(metadataNext, "theme_mode")) {
        delete metadataNext.theme_mode
        metadataChanged = true
      }
    } else if (metadataNext.theme_mode !== themeMode) {
      metadataNext.theme_mode = themeMode
      metadataChanged = true
    }
  }

  const radiusScale = resolveRadiusScale(
    pickPatchAlias((patch as any).radius_scale, (patch as any).radiusScale)
  )
  if (radiusScale !== undefined) {
    if (radiusScale === null) {
      if (Object.prototype.hasOwnProperty.call(metadataNext, "radius_scale")) {
        delete metadataNext.radius_scale
        metadataChanged = true
      }
    } else if (metadataNext.radius_scale !== radiusScale) {
      metadataNext.radius_scale = radiusScale
      metadataChanged = true
    }
  }

  const fontScale = resolveFontScale(
    pickPatchAlias((patch as any).font_scale, (patch as any).fontScale)
  )
  if (fontScale !== undefined) {
    if (fontScale === null) {
      if (Object.prototype.hasOwnProperty.call(metadataNext, "font_scale")) {
        delete metadataNext.font_scale
        metadataChanged = true
      }
    } else if (metadataNext.font_scale !== fontScale) {
      metadataNext.font_scale = fontScale
      metadataChanged = true
    }
  }

  const currencyCode = resolveCurrencyCode(patch.currency_code)
  if (currencyCode !== undefined) {
    if (currencyCode === null) {
      if (Object.prototype.hasOwnProperty.call(metadataNext, "currency_code")) {
        delete metadataNext.currency_code
        metadataChanged = true
      }
    } else {
      if (metadataNext.currency_code !== currencyCode) {
        metadataNext.currency_code = currencyCode
        metadataChanged = true
      }
    }
  }

  const localeInput = resolveLocale(pickPatchAlias(patch.store_locale, patch.locale))
  if (localeInput !== undefined) {
    if (localeInput === null) {
      if (Object.prototype.hasOwnProperty.call(metadataNext, "locale")) {
        delete metadataNext.locale
        metadataChanged = true
      }
    } else {
      if (metadataNext.locale !== localeInput) {
        metadataNext.locale = localeInput
        metadataChanged = true
      }
    }
  }

  const font = resolveFontUrl(
    pickPatchAlias((patch as any).font_url, (patch as any).fontUrl)
  )
  if (font !== undefined) {
    if (font === null) {
      if (Object.prototype.hasOwnProperty.call(metadataNext, "font")) {
        delete metadataNext.font
        metadataChanged = true
      }
    } else {
      metadataNext.font = font
      metadataChanged = true
    }
  }

  const maintenanceMode = resolveMaintenanceMode(
    pickPatchAlias((patch as any).maintenance_mode, (patch as any).maintenanceMode)
  )
  if (maintenanceMode !== undefined) {
    if (maintenanceMode === null) {
      if (Object.prototype.hasOwnProperty.call(metadataNext, MAINTENANCE_MODE_METADATA_KEY)) {
        delete metadataNext[MAINTENANCE_MODE_METADATA_KEY]
        metadataChanged = true
      }
    } else if (metadataNext[MAINTENANCE_MODE_METADATA_KEY] !== maintenanceMode) {
      metadataNext[MAINTENANCE_MODE_METADATA_KEY] = maintenanceMode
      metadataChanged = true
    }
  }

  const maintenancePassword = resolveMaintenancePassword(
    pickPatchAlias((patch as any).maintenance_password, (patch as any).maintenancePassword)
  )
  if (maintenancePassword !== undefined) {
    if (maintenancePassword === null) {
      if (
        Object.prototype.hasOwnProperty.call(metadataNext, MAINTENANCE_PASSWORD_HASH_METADATA_KEY)
      ) {
        delete metadataNext[MAINTENANCE_PASSWORD_HASH_METADATA_KEY]
        metadataChanged = true
      }
    } else {
      const hashedPassword = hashMaintenancePassword(maintenancePassword)
      if (metadataNext[MAINTENANCE_PASSWORD_HASH_METADATA_KEY] !== hashedPassword) {
        metadataNext[MAINTENANCE_PASSWORD_HASH_METADATA_KEY] = hashedPassword
        metadataChanged = true
      }
    }
  }

  const maintenancePatched = maintenanceMode !== undefined || maintenancePassword !== undefined
  if (maintenancePatched) {
    const nextMaintenance = readMaintenanceStateFromMetadata(metadataNext)
    if (nextMaintenance.enabled && !nextMaintenance.passwordHash) {
      throw new HttpError(
        HttpError.Types.INVALID_DATA,
        "maintenance_password is required when maintenance_mode is enabled."
      )
    }
  }

  const bannerUrl = resolveBannerUrl(
    pickPatchAlias((patch as any).banner_url, (patch as any).bannerUrl)
  )
  const bannerFocusX = resolveBannerFocus(
    pickPatchAlias((patch as any).banner_focus_x, (patch as any).bannerFocusX),
    "banner_focus_x"
  )
  const bannerFocusY = resolveBannerFocus(
    pickPatchAlias((patch as any).banner_focus_y, (patch as any).bannerFocusY),
    "banner_focus_y"
  )
  const bannerZoom = resolveBannerZoom(
    pickPatchAlias((patch as any).banner_zoom, (patch as any).bannerZoom)
  )
  const hasBannerPatch =
    bannerUrl !== undefined ||
    bannerFocusX !== undefined ||
    bannerFocusY !== undefined ||
    bannerZoom !== undefined

  if (hasBannerPatch) {
    if (bannerUrl === null) {
      if (!Object.prototype.hasOwnProperty.call(metadataNext, "banner") || metadataNext.banner !== null) {
        metadataNext.banner = null
        metadataChanged = true
      }
    } else {
      const bannerCurrent = normalizeMetadataObject(metadataNext.banner) ?? {}
      const bannerNext: Record<string, unknown> = { ...bannerCurrent }

      if (bannerUrl !== undefined) bannerNext.image_url = bannerUrl
      if (bannerFocusX !== undefined) {
        if (bannerFocusX === null) {
          delete bannerNext.focus_x
        } else {
          bannerNext.focus_x = bannerFocusX
        }
      }
      if (bannerFocusY !== undefined) {
        if (bannerFocusY === null) {
          delete bannerNext.focus_y
        } else {
          bannerNext.focus_y = bannerFocusY
        }
      }
      if (bannerZoom !== undefined) {
        if (bannerZoom === null) {
          delete bannerNext.zoom
        } else {
          bannerNext.zoom = bannerZoom
        }
      }

      const hasBannerUrl =
        typeof bannerNext.image_url === "string" && bannerNext.image_url.trim().length > 0
      if (!hasBannerUrl) {
        if (!Object.prototype.hasOwnProperty.call(metadataNext, "banner") || metadataNext.banner !== null) {
          metadataNext.banner = null
          metadataChanged = true
        }
      } else {
        metadataNext.banner = bannerNext
        metadataChanged = true
      }
    }
  }

  if (metadataChanged) {
    data.metadata = metadataNext
  }

  if (Object.keys(data).length === 0) return current

  if (current.id === "default-storefront-settings") {
    return { ...current, ...data }
  }

  try {
    await service.updateStorefrontSettings({
      selector: { id: current.id },
      data,
    })

    const updated = await service.listStorefrontSettings({ id: current.id }, { take: 1 })
    return updated[0] ?? current
  } catch (error) {
    if (isStorefrontSettingsTableMissing(error)) {
      return { ...current, ...data }
    }
    throw error
  }
}
