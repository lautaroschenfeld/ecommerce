import type { Metadata } from "next";

const LOCAL_FALLBACK_SITE_URL = "http://localhost:3000";
const DEPLOYMENT_FALLBACK_SITE_URL =
  process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
  process.env.VERCEL_URL?.trim() ||
  "";

const DEFAULT_SITE_NAME = "FR Motos";

function isGenericSiteName(input: string) {
  return /^ecommerce$/i.test(input.trim());
}

const configuredSiteName = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "";
export const SITE_NAME =
  configuredSiteName && !isGenericSiteName(configuredSiteName)
    ? configuredSiteName
    : DEFAULT_SITE_NAME;
export const SITE_DESCRIPTION =
  process.env.NEXT_PUBLIC_SITE_DESCRIPTION?.trim() ||
  "Repuestos, accesorios e indumentaria para motos con stock actualizado, marcas lideres y compra online segura en FR Motos.";
export const SOCIAL_IMAGE_PATH = "/social-image";
export const SOCIAL_IMAGE_WIDTH = 600;
export const SOCIAL_IMAGE_HEIGHT = 600;

export type SeoStorefrontSnapshot = {
  storeName?: string | null;
  storeLocale?: string | null;
  themeMode?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
};

function normalizeSiteUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return LOCAL_FALLBACK_SITE_URL;

  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.origin.replace(/\/$/, "");
  } catch {
    return LOCAL_FALLBACK_SITE_URL;
  }
}

const FALLBACK_SITE_URL = normalizeSiteUrl(
  DEPLOYMENT_FALLBACK_SITE_URL || LOCAL_FALLBACK_SITE_URL
);

function isAbsoluteHttpUrl(input: string) {
  return /^https?:\/\//i.test(input.trim());
}

function toSafePath(path = "/") {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeCanonical(canonical: string) {
  const trimmed = canonical.trim();
  if (!trimmed) return "/";
  return isAbsoluteHttpUrl(trimmed) ? trimmed : toSafePath(trimmed);
}

function hashStable(value: string) {
  let hash = 2166136261;
  for (let idx = 0; idx < value.length; idx += 1) {
    hash ^= value.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getSiteUrl() {
  return normalizeSiteUrl(
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      process.env.STOREFRONT_URL?.trim() ||
      FALLBACK_SITE_URL
  );
}

export function absoluteUrl(path = "/") {
  const safePath = toSafePath(path);
  return `${getSiteUrl()}${safePath}`;
}

export function toAbsolutePublicUrl(raw: string) {
  const normalized = raw.trim();
  if (!normalized) return absoluteUrl("/");
  if (isAbsoluteHttpUrl(normalized)) return normalized;
  return absoluteUrl(toSafePath(normalized));
}

export function cleanMetaText(input: string, max = 160) {
  return input.replace(/\s+/g, " ").trim().slice(0, max);
}

export function resolveSiteName(storeName?: string | null) {
  const normalized = cleanMetaText(storeName ?? "", 80);
  if (!normalized || isGenericSiteName(normalized)) return SITE_NAME;
  return normalized;
}

export function toOpenGraphLocale(locale?: string | null) {
  const raw = (locale ?? "").trim();
  if (!raw) return "es_AR";

  const match = raw.replace(/_/g, "-").match(/^([a-zA-Z]{2})(?:-([a-zA-Z]{2}))?$/);
  if (!match) return "es_AR";

  const language = match[1].toLowerCase();
  const region = (match[2] || "AR").toUpperCase();
  return `${language}_${region}`;
}

export function buildStorefrontSeoVersion(storefront?: SeoStorefrontSnapshot) {
  const siteName = resolveSiteName(storefront?.storeName);
  const locale = (storefront?.storeLocale ?? "").trim().toLowerCase();
  const themeMode = (storefront?.themeMode ?? "light").trim().toLowerCase();
  const logoUrl = (storefront?.logoUrl ?? "").trim();
  const faviconUrl = (storefront?.faviconUrl ?? "").trim();
  const payload = [siteName, locale, themeMode, logoUrl, faviconUrl, getSiteUrl()].join("|");
  return hashStable(payload);
}

export function buildStorefrontSocialImageUrl(storefront?: SeoStorefrontSnapshot) {
  const params = new URLSearchParams();
  params.set("v", buildStorefrontSeoVersion(storefront));
  return `${SOCIAL_IMAGE_PATH}?${params.toString()}`;
}

type BuildSocialMetadataInput = {
  title: string;
  description: string;
  canonical: string;
  storefront?: SeoStorefrontSnapshot;
  imageUrl?: string;
  imageAlt?: string;
  type?: "website" | "article";
};

export function buildSocialMetadata(
  input: BuildSocialMetadataInput
): Pick<Metadata, "alternates" | "openGraph" | "twitter"> {
  const canonical = normalizeCanonical(input.canonical);
  const siteName = resolveSiteName(input.storefront?.storeName);
  const locale = toOpenGraphLocale(input.storefront?.storeLocale);
  const title = cleanMetaText(input.title, 110);
  const description = cleanMetaText(input.description, 200);
  const imageUrl = input.imageUrl?.trim()
    ? toAbsolutePublicUrl(input.imageUrl)
    : buildStorefrontSocialImageUrl(input.storefront);
  const imageAlt = cleanMetaText(input.imageAlt || `${siteName} vista previa`, 120);

  return {
    alternates: {
      canonical,
    },
    openGraph: {
      type: input.type || "website",
      locale,
      url: canonical,
      siteName,
      title,
      description,
      images: [
        {
          url: imageUrl,
          width: SOCIAL_IMAGE_WIDTH,
          height: SOCIAL_IMAGE_HEIGHT,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [imageUrl],
    },
  };
}
