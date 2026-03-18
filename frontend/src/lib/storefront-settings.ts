import { fetchJson, fetchJsonWithAuthRetry } from "@/lib/store-client";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";

export type StorefrontFontConfig = {
  provider: "google";
  family: string;
  cssUrl: string;
  specimenUrl: string | null;
};

export type StorefrontBannerConfig = {
  imageUrl: string;
  focusX: number;
  focusY: number;
  zoom: number;
};

export type StorefrontThemeMode = "light" | "dark";

export type StorefrontSettings = {
  storeName: string;
  logoUrl: string;
  faviconUrl: string;
  themeMode: StorefrontThemeMode;
  radiusScale: number;
  fontScale: number;
  currencyCode: string;
  storeLocale: string;
  font: StorefrontFontConfig | null;
  heroBanner: StorefrontBannerConfig;
  maintenanceMode: boolean;
};

export type AdminStorefrontSettings = StorefrontSettings & {
  maintenancePasswordConfigured: boolean;
};

export const STOREFRONT_RUNTIME_UPDATED_EVENT = "storefront:runtime:updated";

export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettings = {
  storeName: process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "FR Motos",
  logoUrl: "",
  faviconUrl: "",
  themeMode: "light",
  radiusScale: 1,
  fontScale: 1,
  currencyCode:
    process.env.NEXT_PUBLIC_STORE_CURRENCY_CODE?.trim().toUpperCase() || "USD",
  storeLocale: process.env.NEXT_PUBLIC_STORE_LOCALE?.trim() || "es-AR",
  font: null,
  heroBanner: {
    imageUrl: "",
    focusX: 50,
    focusY: 50,
    zoom: 1,
  },
  maintenanceMode: false,
};

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";
}

function normalizeText(input: unknown, max = 120) {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeThemeMode(input: unknown, fallback: StorefrontThemeMode): StorefrontThemeMode {
  const raw = typeof input === "string" ? input.trim().toLowerCase() : "";
  return raw === "dark" || raw === "light" ? raw : fallback;
}

function normalizeUrl(input: unknown) {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeMediaUrl(input: unknown) {
  return toStoreMediaProxyUrl(input);
}

function asRecord(input: unknown) {
  if (!input || typeof input !== "object") return null;
  return input as Record<string, unknown>;
}

function normalizeCurrencyCode(input: unknown, fallback: string) {
  if (typeof input !== "string") return fallback;
  const raw = input.trim().toUpperCase();
  if (!raw) return fallback;
  return /^[A-Z]{3}$/.test(raw) ? raw : fallback;
}

function normalizeLocale(input: unknown, fallback: string) {
  if (typeof input !== "string") return fallback;
  const raw = input.trim();
  if (!raw) return fallback;

  const match = raw.match(/^([a-zA-Z]{2})(?:[-_ ]?([a-zA-Z]{2}))?$/);
  if (!match) return fallback;
  const language = match[1].toLowerCase();
  const region = match[2] ? match[2].toUpperCase() : "";
  return region ? `${language}-${region}` : language;
}

function normalizePercent(input: unknown, fallback: number) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.max(0, Math.min(100, input));
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, parsed));
    }
  }
  return fallback;
}

function normalizeZoom(input: unknown, fallback: number) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.max(1, Math.min(3, input));
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(3, parsed));
    }
  }
  return fallback;
}

function normalizeRadiusScale(input: unknown, fallback: number) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.max(0, Math.min(2, Math.round(input * 1000) / 1000));
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input.replace(",", "."));
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(2, Math.round(parsed * 1000) / 1000));
    }
  }
  return fallback;
}

function normalizeFontScale(input: unknown, fallback: number) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.max(0.2, Math.min(2, Math.round(input * 1000) / 1000));
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input.replace(",", "."));
    if (Number.isFinite(parsed)) {
      return Math.max(0.2, Math.min(2, Math.round(parsed * 1000) / 1000));
    }
  }
  return fallback;
}

function roundRadiusMetric(value: number) {
  return Math.round(value * 1000) / 1000;
}

function scaledRem(baseRem: number, scale: number) {
  return `${roundRadiusMetric(baseRem * scale)}rem`;
}

function scaledPx(basePx: number, scale: number) {
  return `${roundRadiusMetric(basePx * scale)}px`;
}

export function radiusScaleCssVars(rawScale: number) {
  const scale = normalizeRadiusScale(rawScale, DEFAULT_STOREFRONT_SETTINGS.radiusScale);

  return {
    "--radius-scale": String(scale),
    "--radius": scaledRem(0.75, scale),
    "--radius-pill": scaledPx(999, scale),
    "--field-radius": scaledRem(0.85, scale),
    "--field-radius-sm": scaledRem(0.75, scale),
    "--field-radius-xs": scaledRem(0.65, scale),
    "--native-select-radius": scaledRem(0.95, scale),
    "--admin-panel-surface-radius": scaledRem(1.6, scale),
    "--admin-panel-content-radius": scaledRem(1.6, scale),
    "--admin-radius-xs": scaledRem(0.95, scale),
    "--admin-radius-sm": scaledRem(1.05, scale),
    "--admin-radius-md": scaledRem(1.15, scale),
    "--admin-radius-lg": scaledRem(1.25, scale),
    "--admin-radius-xl": scaledRem(1.35, scale),
    "--admin-radius-pill": scaledPx(999, scale),
  } as Record<string, string>;
}

export function fontScaleCssVars(rawScale: number) {
  const scale = normalizeFontScale(rawScale, DEFAULT_STOREFRONT_SETTINGS.fontScale);
  return {
    "--font-scale": String(scale),
  } as Record<string, string>;
}

function normalizeBoolean(input: unknown, fallback: boolean) {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;
  if (typeof input === "string") {
    const raw = input.trim().toLowerCase();
    if (!raw) return fallback;
    if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
    if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  }
  return fallback;
}

function mapFontConfig(raw: unknown): StorefrontFontConfig | null {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!rec) return null;

  const provider = rec.provider === "google" ? "google" : null;
  const family = normalizeText(rec.family, 80);
  const cssUrl = normalizeUrl(rec.css_url ?? rec.cssUrl);
  const specimenUrl = normalizeUrl(rec.specimen_url ?? rec.specimenUrl);

  if (!provider || !family || !cssUrl) return null;
  if (!cssUrl.startsWith("https://fonts.googleapis.com/")) return null;

  return {
    provider,
    family,
    cssUrl,
    specimenUrl: specimenUrl || null,
  };
}

function mapStorefrontSettings(raw: unknown): StorefrontSettings {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

  const logoUrl = normalizeMediaUrl(rec?.logo_url ?? rec?.logoUrl);
  const metadata = asRecord(rec?.metadata) ?? {};
  const faviconUrl = normalizeMediaUrl(
    rec?.favicon_url ??
      rec?.faviconUrl ??
      metadata?.["favicon_url"] ??
      metadata?.["faviconUrl"]
  );
  const bannerRec = asRecord(metadata["banner"]);
  const rawStoreName = normalizeText(rec?.store_name ?? rec?.storeName, 80);
  const storeName =
    rawStoreName || (logoUrl ? "" : DEFAULT_STOREFRONT_SETTINGS.storeName);
  const bannerUrl = normalizeMediaUrl(
    rec?.banner_url ??
      rec?.bannerUrl ??
      bannerRec?.["image_url"] ??
      bannerRec?.["url"]
  );
  const bannerFocusX = normalizePercent(
    rec?.banner_focus_x ?? rec?.bannerFocusX ?? bannerRec?.["focus_x"],
    DEFAULT_STOREFRONT_SETTINGS.heroBanner.focusX
  );
  const bannerFocusY = normalizePercent(
    rec?.banner_focus_y ?? rec?.bannerFocusY ?? bannerRec?.["focus_y"],
    DEFAULT_STOREFRONT_SETTINGS.heroBanner.focusY
  );
  const bannerZoom = normalizeZoom(
    rec?.banner_zoom ?? rec?.bannerZoom ?? bannerRec?.["zoom"],
    DEFAULT_STOREFRONT_SETTINGS.heroBanner.zoom
  );
  const themeMode = normalizeThemeMode(
    metadata?.["theme_mode"] ??
      metadata?.["themeMode"] ??
      rec?.theme_mode ??
      rec?.themeMode,
    DEFAULT_STOREFRONT_SETTINGS.themeMode
  );
  const radiusScale = normalizeRadiusScale(
    metadata?.["radius_scale"] ??
      metadata?.["radiusScale"] ??
      rec?.radius_scale ??
      rec?.radiusScale,
    DEFAULT_STOREFRONT_SETTINGS.radiusScale
  );
  const fontScale = normalizeFontScale(
    metadata?.["font_scale"] ??
      metadata?.["fontScale"] ??
      rec?.font_scale ??
      rec?.fontScale,
    DEFAULT_STOREFRONT_SETTINGS.fontScale
  );

  return {
    storeName,
    logoUrl,
    faviconUrl,
    themeMode,
    radiusScale,
    fontScale,
    currencyCode: normalizeCurrencyCode(
      rec?.currency_code ?? rec?.currencyCode,
      DEFAULT_STOREFRONT_SETTINGS.currencyCode
    ),
    storeLocale: normalizeLocale(
      rec?.store_locale ?? rec?.storeLocale,
      DEFAULT_STOREFRONT_SETTINGS.storeLocale
    ),
    font: mapFontConfig(rec?.font),
    heroBanner: {
      imageUrl: bannerUrl,
      focusX: bannerFocusX,
      focusY: bannerFocusY,
      zoom: bannerZoom,
    },
    maintenanceMode: normalizeBoolean(
      rec?.maintenance_mode ?? rec?.maintenanceMode,
      DEFAULT_STOREFRONT_SETTINGS.maintenanceMode
    ),
  };
}

function mapAdminStorefrontSettings(raw: unknown): AdminStorefrontSettings {
  const base = mapStorefrontSettings(raw);
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  return {
    ...base,
    maintenancePasswordConfigured: normalizeBoolean(
      rec?.maintenance_password_configured ?? rec?.maintenancePasswordConfigured,
      false
    ),
  };
}

export async function getStorefrontSettings() {
  const data = await fetchJson<{ storefront?: unknown }>(
    "/store/catalog/settings/storefront",
    {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: getPublishableKey() ? { "x-publishable-api-key": getPublishableKey() } : {},
    }
  );
  return mapStorefrontSettings(data.storefront);
}

export async function getStorefrontSettingsSafe() {
  try {
    return await getStorefrontSettings();
  } catch {
    return DEFAULT_STOREFRONT_SETTINGS;
  }
}

export async function getAdminStorefrontSettings() {
  const data = await fetchJsonWithAuthRetry<{ storefront?: unknown }>(
    "/store/catalog/account/admin/settings/storefront",
    {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    }
  );
  return mapAdminStorefrontSettings(data.storefront);
}

export type StorefrontSettingsPatchInput = Partial<StorefrontSettings> & {
  fontUrl?: string | null;
  bannerUrl?: string | null;
  bannerFocusX?: number | null;
  bannerFocusY?: number | null;
  bannerZoom?: number | null;
  maintenanceMode?: boolean;
  maintenancePassword?: string | null;
};

export async function updateAdminStorefrontSettings(
  input: StorefrontSettingsPatchInput
) {
  const data = await fetchJsonWithAuthRetry<{ storefront?: unknown }>(
    "/store/catalog/account/admin/settings/storefront",
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        store_name:
          typeof input.storeName === "string" ? input.storeName.trim() : undefined,
        logo_url:
          typeof input.logoUrl === "string" ? input.logoUrl.trim() : undefined,
        favicon_url:
          typeof input.faviconUrl === "string"
            ? input.faviconUrl.trim()
            : undefined,
        theme_mode:
          input.themeMode === "dark" || input.themeMode === "light"
            ? input.themeMode
            : undefined,
        radius_scale:
          typeof input.radiusScale === "number"
            ? normalizeRadiusScale(input.radiusScale, DEFAULT_STOREFRONT_SETTINGS.radiusScale)
            : undefined,
        font_scale:
          typeof input.fontScale === "number"
            ? normalizeFontScale(input.fontScale, DEFAULT_STOREFRONT_SETTINGS.fontScale)
            : undefined,
        currency_code:
          typeof input.currencyCode === "string"
            ? input.currencyCode.trim()
            : undefined,
        store_locale:
          typeof input.storeLocale === "string"
            ? input.storeLocale.trim()
            : undefined,
        font_url: typeof input.fontUrl === "string" ? input.fontUrl.trim() : undefined,
        banner_url:
          input.bannerUrl === null
            ? null
            : typeof input.bannerUrl === "string"
              ? input.bannerUrl.trim()
              : undefined,
        banner_focus_x:
          input.bannerFocusX === null
            ? null
            : typeof input.bannerFocusX === "number"
              ? input.bannerFocusX
              : undefined,
        banner_focus_y:
          input.bannerFocusY === null
            ? null
            : typeof input.bannerFocusY === "number"
              ? input.bannerFocusY
              : undefined,
        banner_zoom:
          input.bannerZoom === null
            ? null
            : typeof input.bannerZoom === "number"
              ? input.bannerZoom
              : undefined,
        maintenance_mode:
          typeof input.maintenanceMode === "boolean"
            ? input.maintenanceMode
            : undefined,
        maintenance_password:
          input.maintenancePassword === null
            ? null
            : typeof input.maintenancePassword === "string"
              ? input.maintenancePassword.trim()
              : undefined,
      }),
    }
  );
  return mapAdminStorefrontSettings(data.storefront);
}

export function storefrontCssVars(settings: StorefrontSettings) {
  const vars = {
    ...fontScaleCssVars(settings.fontScale),
    ...radiusScaleCssVars(settings.radiusScale),
  };

  if (settings.font?.family) {
    // Keep the default `--font-sans` stack as fallback (Next/font sets it).
    const family = settings.font.family.replace(/"/g, '\\"').trim();
    vars["--font-sans-custom"] = `"${family}", var(--font-sans)`;
  }

  return vars;
}

export function applyStorefrontRuntimeSettings(settings: StorefrontSettings) {
  if (typeof document === "undefined") return;

  const vars = storefrontCssVars(settings);
  const rootStyle = document.documentElement.style;
  const bodyStyle = document.body.style;
  for (const [name, value] of Object.entries(vars)) {
    rootStyle.setProperty(name, value);
    bodyStyle.setProperty(name, value);
  }

  const themeMode = normalizeThemeMode(settings.themeMode, DEFAULT_STOREFRONT_SETTINGS.themeMode);
  document.documentElement.dataset.themeMode = themeMode;
  document.body.dataset.themeMode = themeMode;
  document.documentElement.style.colorScheme = themeMode;
  document.body.style.colorScheme = themeMode;

  if (settings.storeLocale) {
    document.documentElement.lang = settings.storeLocale;
    document.body.dataset.storeLocale = settings.storeLocale;
  } else {
    delete document.body.dataset.storeLocale;
  }

  if (settings.currencyCode) {
    document.body.dataset.storeCurrencyCode = settings.currencyCode;
  } else {
    delete document.body.dataset.storeCurrencyCode;
  }
}

export function emitStorefrontRuntimeUpdated(settings: StorefrontSettings) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<StorefrontSettings>(STOREFRONT_RUNTIME_UPDATED_EVENT, {
      detail: settings,
    })
  );
}

