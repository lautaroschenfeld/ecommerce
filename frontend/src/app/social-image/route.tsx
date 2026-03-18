import { Buffer } from "node:buffer";

import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import {
  absoluteUrl,
  resolveSiteName,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
} from "@/lib/seo";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";
import { getStorefrontSettingsSafe } from "@/lib/storefront-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGO_MAX_BYTES = 5_000_000;
const LOGO_FETCH_TIMEOUT_MS = 12_000;
const RAW_BACKEND_MEDIA_BASE_URLS = [
  process.env.BACKEND_INTERNAL_URL?.trim(),
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim(),
].filter(Boolean) as string[];

function parseHttpUrl(raw: string) {
  const normalized = raw.trim();
  if (!/^https?:\/\//i.test(normalized)) return null;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

function withOriginPath(origin: string, path = "") {
  const normalizedPath = path.trim().replace(/\/+$/, "");
  if (!normalizedPath || normalizedPath === "/") return origin;
  return `${origin}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

function normalizeBackendBaseVariants(raw: string) {
  const parsed = parseHttpUrl(raw);
  if (!parsed) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const pathname = parsed.pathname.replace(/\/+$/, "");
  const basePath = pathname === "/" ? "" : pathname;

  const push = (path: string) => {
    const normalized = withOriginPath(parsed.origin, path).replace(/\/+$/, "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  push(basePath);
  if (/\/api$/i.test(basePath)) {
    const withoutApi = basePath.replace(/\/api$/i, "");
    push(withoutApi);
  } else {
    push(`${basePath}/api`);
  }

  return out;
}

const BACKEND_MEDIA_BASE_URLS = (() => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of RAW_BACKEND_MEDIA_BASE_URLS) {
    for (const candidate of normalizeBackendBaseVariants(raw)) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
})();

function toAbsoluteImageUrl(raw: string, requestOrigin: string) {
  const normalized = raw.trim();
  if (!normalized) return "";
  if (/^data:/i.test(normalized)) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const safePath = normalized.startsWith("/") ? normalized : `/${normalized}`;
  if (requestOrigin) return `${requestOrigin}${safePath}`;
  return absoluteUrl(safePath);
}

function isWebpUrl(url: string) {
  return /\.webp(?:$|\?)/i.test(url.trim());
}

function joinBaseAndPath(baseUrl: string, mediaPath: string, search: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const path = mediaPath.startsWith("/") ? mediaPath : `/${mediaPath}`;
  return `${base}${path}${search}`;
}

function pushUniqueUrl(out: string[], seen: Set<string>, raw: string) {
  const normalized = raw.trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  out.push(normalized);
}

function extractCanonicalMediaPath(pathname: string) {
  const normalized = pathname.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

  let match = normalized.match(/^\/store-media\/(static|uploads)(\/.*)?$/i);
  if (match) return `/${match[1].toLowerCase()}${match[2] || ""}`;

  match = normalized.match(/^\/api\/(static|uploads)(\/.*)?$/i);
  if (match) return `/${match[1].toLowerCase()}${match[2] || ""}`;

  match = normalized.match(/^\/(static|uploads)(\/.*)?$/i);
  if (match) return `/${match[1].toLowerCase()}${match[2] || ""}`;

  return "";
}

function resolveExpandedAbsoluteSourceCandidates(sourceUrl: string, requestOrigin: string) {
  const out: string[] = [];
  const seen = new Set<string>();

  const addWithExpansion = (rawUrl: string) => {
    const absolute = toAbsoluteImageUrl(rawUrl, requestOrigin);
    pushUniqueUrl(out, seen, absolute);

    const parsed = parseHttpUrl(absolute);
    if (!parsed) return;

    const canonicalMediaPath = extractCanonicalMediaPath(parsed.pathname);
    if (!canonicalMediaPath) return;

    const search = parsed.search || "";

    pushUniqueUrl(out, seen, toAbsoluteImageUrl(`${canonicalMediaPath}${search}`, requestOrigin));
    pushUniqueUrl(out, seen, toAbsoluteImageUrl(`/api${canonicalMediaPath}${search}`, requestOrigin));
    pushUniqueUrl(
      out,
      seen,
      toAbsoluteImageUrl(`/store-media${canonicalMediaPath}${search}`, requestOrigin)
    );

    for (const backendBaseUrl of BACKEND_MEDIA_BASE_URLS) {
      pushUniqueUrl(out, seen, joinBaseAndPath(backendBaseUrl, canonicalMediaPath, search));
    }
  };

  addWithExpansion(sourceUrl);
  addWithExpansion(toStoreMediaProxyUrl(sourceUrl));

  return out;
}

function inferImageMimeFromSourceUrl(sourceUrl: string) {
  const normalized = sourceUrl.trim().toLowerCase();
  if (/\.avif(?:$|\?)/.test(normalized)) return "image/avif";
  if (/\.gif(?:$|\?)/.test(normalized)) return "image/gif";
  if (/\.jpe?g(?:$|\?)/.test(normalized)) return "image/jpeg";
  if (/\.png(?:$|\?)/.test(normalized)) return "image/png";
  if (/\.svg(?:$|\?)/.test(normalized)) return "image/svg+xml";
  if (/\.webp(?:$|\?)/.test(normalized)) return "image/webp";
  return "";
}

function resolveLogoSourceCandidates(input: {
  logoUrl: string;
  faviconUrl: string;
  requestOrigin: string;
}) {
  const rawLogo = input.logoUrl.trim();
  const rawFavicon = input.faviconUrl.trim();
  const rawCandidates =
    rawLogo && isWebpUrl(rawLogo) ? [rawFavicon, rawLogo] : [rawLogo, rawFavicon];
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const rawCandidate of rawCandidates) {
    const raw = rawCandidate.trim();
    if (!raw) continue;
    for (const expanded of resolveExpandedAbsoluteSourceCandidates(raw, input.requestOrigin)) {
      pushUniqueUrl(candidates, seen, expanded);
    }
  }

  return candidates;
}

function toSafeHeaderValue(input: string, max = 180) {
  const normalized = input
    .replace(/[\r\n]/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "none";
  return normalized.slice(0, max);
}

function summarizeSourceForHeader(sourceUrl: string) {
  const normalized = sourceUrl.trim();
  if (!normalized) return "none";

  const parsed = parseHttpUrl(normalized);
  if (!parsed) {
    const noQuery = normalized.split("?", 1)[0];
    return toSafeHeaderValue(noQuery);
  }

  return toSafeHeaderValue(`${parsed.host}${parsed.pathname}`);
}

async function loadLogoDataUrl(sourceUrl: string) {
  if (!sourceUrl) return "";
  if (sourceUrl.startsWith("data:")) return sourceUrl;

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), LOGO_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) return "";

    const headerContentType = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > LOGO_MAX_BYTES) return "";

    const inferredFromUrl = inferImageMimeFromSourceUrl(sourceUrl);
    const contentType = headerContentType.startsWith("image/") ? headerContentType : inferredFromUrl;
    if (!contentType.startsWith("image/")) return "";

    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return "";
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function resolvePalette(themeMode: string) {
  if (themeMode === "dark") {
    return {
      // Matches design token `--bg-page` for dark mode.
      background: "#121212",
      // Matches design token `--text-primary` for dark mode.
      text: "#ededed",
    };
  }

  return {
    // Matches design token `--bg-page` for light mode.
    background: "#f5f5f5",
    // Matches design token `--text-primary` for light mode.
    text: "#171717",
  };
}

export async function GET(request: NextRequest) {
  const storefront = await getStorefrontSettingsSafe();
  const siteName = resolveSiteName(storefront.storeName);
  const themeMode = storefront.themeMode === "dark" ? "dark" : "light";
  const palette = resolvePalette(themeMode);
  const requestOrigin = request.nextUrl.origin;
  const baseSize = Math.min(SOCIAL_IMAGE_WIDTH, SOCIAL_IMAGE_HEIGHT);
  const logoSize = Math.round(baseSize * 0.58);
  const fallbackTextSize = Math.max(64, Math.round(baseSize * 0.18));

  const logoSourceCandidates = resolveLogoSourceCandidates({
    logoUrl: storefront.logoUrl.trim(),
    faviconUrl: storefront.faviconUrl.trim(),
    requestOrigin,
  });
  let logoDataUrl = "";
  let loadedLogoSource = "";
  for (const logoSourceUrl of logoSourceCandidates) {
    logoDataUrl = await loadLogoDataUrl(logoSourceUrl);
    if (!logoDataUrl) continue;
    loadedLogoSource = logoSourceUrl;
    break;
  }
  const hasRenderableLogo = Boolean(logoDataUrl);
  const sourceForHeader = loadedLogoSource || logoSourceCandidates[0] || "";
  const socialImageHeaders = {
    "cache-control": "",
    "x-social-image-logo-status": hasRenderableLogo ? "loaded" : "fallback",
    "x-social-image-logo-source": summarizeSourceForHeader(sourceForHeader),
  };

  const version = request.nextUrl.searchParams.get("v")?.trim();
  const cacheControl = version && hasRenderableLogo
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, s-maxage=120, stale-while-revalidate=300";
  socialImageHeaders["cache-control"] = cacheControl;

  const renderMarkup = (imageDataUrl: string) => (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: palette.background,
        padding: 48,
      }}
    >
      {imageDataUrl ? (
        // ImageResponse requires raw <img>; next/image is not supported here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageDataUrl}
          alt={siteName}
          style={{
            width: logoSize,
            height: logoSize,
            objectFit: "contain",
          }}
        />
      ) : (
        <span
          style={{
            display: "flex",
            fontSize: fallbackTextSize,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: palette.text,
            textAlign: "center",
          }}
        >
          {siteName}
        </span>
      )}
    </div>
  );

  try {
    return new ImageResponse(renderMarkup(logoDataUrl), {
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT,
      headers: socialImageHeaders,
    });
  } catch {
    return new ImageResponse(renderMarkup(""), {
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT,
      headers: {
        ...socialImageHeaders,
        "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
        "x-social-image-logo-status": "fallback",
      },
    });
  }
}
