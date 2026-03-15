import {
  applyStorefrontRuntimeSettings,
  emitStorefrontRuntimeUpdated,
  DEFAULT_STOREFRONT_SETTINGS,
  type StorefrontThemeMode,
  type StorefrontSettings,
} from "@/lib/storefront-settings";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";
import { mapFriendlyError } from "@/lib/user-facing-errors";

export type StorefrontFormState = {
  storeName: string;
  logoUrl: string;
  faviconUrl: string;
  bannerUrl: string;
  bannerFocusX: number;
  bannerFocusY: number;
  bannerZoom: number;
  themeMode: StorefrontThemeMode;
  radiusScale: string;
  currencyCode: string;
  fontUrl: string;
};

export const ALLOWED_IMAGE_UPLOAD_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function detectFaviconType(href: string) {
  const normalized = href.trim().toLowerCase();
  if (normalized.startsWith("data:image/")) {
    const end = normalized.indexOf(";");
    return end > 0 ? normalized.slice(5, end) : undefined;
  }
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".ico")) return "image/x-icon";
  return undefined;
}

function withCacheBust(href: string) {
  if (typeof window === "undefined") return href;
  if (!href || href === "/favicon.ico" || href.startsWith("data:")) return href;

  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.set("v", String(Date.now()));
    return url.toString();
  } catch {
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}v=${Date.now()}`;
  }
}

function syncRuntimeFavicon(nextUrl: string) {
  if (typeof document === "undefined") return;
  const normalized = toStoreMediaProxyUrl(nextUrl.trim()) || nextUrl.trim() || "/favicon.ico";
  const href = withCacheBust(normalized);
  const type = detectFaviconType(normalized);

  const existing = document.querySelectorAll(
    'link[data-storefront-favicon="true"]'
  ) as NodeListOf<HTMLLinkElement>;

  existing.forEach((item) => item.remove());

  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.href = href;
  if (type) icon.type = type;
  icon.setAttribute("data-storefront-favicon", "true");
  document.head.append(icon);

  const shortcut = document.createElement("link");
  shortcut.rel = "shortcut icon";
  shortcut.href = href;
  if (type) shortcut.type = type;
  shortcut.setAttribute("data-storefront-favicon", "true");
  document.head.append(shortcut);
}

export function syncRuntimeStorefront(updated: StorefrontSettings) {
  if (typeof document === "undefined") return;

  applyStorefrontRuntimeSettings(updated);
  emitStorefrontRuntimeUpdated(updated);
  syncRuntimeFavicon(updated.faviconUrl);

  const font = updated.font;
  const stylesheet = document.querySelector(
    'link[data-storefront-font]'
  ) as HTMLLinkElement | null;

  if (font?.cssUrl) {
    if (stylesheet) {
      stylesheet.href = font.cssUrl;
    } else {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = font.cssUrl;
      link.setAttribute("data-storefront-font", "true");
      document.head.append(link);
    }

    const family = font.family.replace(/"/g, '\\"').trim();
    if (family) {
      document.documentElement.style.setProperty(
        "--font-sans-custom",
        `"${family}", var(--font-sans)`
      );
      document.body.style.setProperty("--font-sans-custom", `"${family}", var(--font-sans)`);
    }
  } else {
    if (stylesheet) stylesheet.remove();
    document.documentElement.style.removeProperty("--font-sans-custom");
    document.body.style.removeProperty("--font-sans-custom");
  }
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, value));
}

export function clampZoom(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(3, value));
}

export function clampRadiusScale(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_STOREFRONT_SETTINGS.radiusScale;
  return Math.max(0, Math.min(2, Math.round(value * 1000) / 1000));
}

export function parseRadiusScale(input: string) {
  const normalized = input.trim().replace(",", ".");
  if (!normalized) return DEFAULT_STOREFRONT_SETTINGS.radiusScale;
  const parsed = Number(normalized);
  return clampRadiusScale(parsed);
}

export function mapPanelError(error: unknown, fallback: string) {
  return mapFriendlyError(error, fallback);
}
