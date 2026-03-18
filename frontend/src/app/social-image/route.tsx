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
const BACKEND_MEDIA_BASE_CANDIDATES = [
  process.env.BACKEND_INTERNAL_URL?.trim(),
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim(),
]
  .filter(Boolean)
  .map((value) => value!.replace(/\/+$/, ""));

function toAbsoluteImageUrl(raw: string, requestOrigin: string) {
  const normalized = raw.trim();
  if (!normalized) return "";
  if (/^data:/i.test(normalized)) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const safePath = normalized.startsWith("/") ? normalized : `/${normalized}`;
  if (requestOrigin) return `${requestOrigin}${safePath}`;
  return absoluteUrl(safePath);
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

function decodeAsciiSlice(bytes: Uint8Array, start: number, end: number) {
  let out = "";
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(bytes.length, end);
  for (let index = safeStart; index < safeEnd; index += 1) {
    out += String.fromCharCode(bytes[index]);
  }
  return out;
}

function inferImageMimeFromBytes(bytes: Uint8Array) {
  if (bytes.length >= 8) {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47];
    const isPng = pngSignature.every((value, index) => bytes[index] === value);
    if (isPng) return "image/png";
  }

  if (bytes.length >= 3) {
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (isJpeg) return "image/jpeg";
  }

  if (bytes.length >= 6) {
    const gifHeader = decodeAsciiSlice(bytes, 0, 6);
    if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return "image/gif";
  }

  if (bytes.length >= 12) {
    const riff = decodeAsciiSlice(bytes, 0, 4);
    const webp = decodeAsciiSlice(bytes, 8, 12);
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  }

  const prefix = decodeAsciiSlice(bytes, 0, Math.min(bytes.length, 256)).trimStart().toLowerCase();
  if (prefix.includes("<svg")) return "image/svg+xml";
  return "";
}

function normalizeProxyableMediaPath(pathname: string) {
  const normalized = pathname.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  const apiMatch = normalized.match(/^\/api\/(static|uploads)(\/.+)$/i);
  if (apiMatch) return `/${apiMatch[1].toLowerCase()}${apiMatch[2]}`;

  const directMatch = normalized.match(/^\/(static|uploads)(\/.+)$/i);
  if (directMatch) return `/${directMatch[1].toLowerCase()}${directMatch[2]}`;

  return "";
}

function splitPathAndSearch(raw: string) {
  const [pathname, query = ""] = raw.split("?", 2);
  return {
    pathname,
    search: query ? `?${query}` : "",
  };
}

function extractProxyableMediaPath(rawUrl: string) {
  const normalized = rawUrl.trim();
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const pathname = normalizeProxyableMediaPath(parsed.pathname);
    if (!pathname) return null;
    return {
      pathname,
      search: parsed.search || "",
    };
  } catch {
    const parts = splitPathAndSearch(normalized);
    const pathname = normalizeProxyableMediaPath(parts.pathname);
    if (!pathname) return null;
    return {
      pathname,
      search: parts.search,
    };
  }
}

function buildLogoSourceUrls(input: {
  logoUrl: string;
  faviconUrl: string;
  requestOrigin: string;
}) {
  const sources = new Set<string>();

  const pushSource = (raw: string) => {
    const absolute = toAbsoluteImageUrl(raw, input.requestOrigin);
    if (absolute) sources.add(absolute);
  };

  const rawLogo = input.logoUrl.trim();
  const rawFavicon = input.faviconUrl.trim();

  pushSource(rawLogo);
  pushSource(toStoreMediaProxyUrl(rawLogo));
  pushSource(rawFavicon);
  pushSource(toStoreMediaProxyUrl(rawFavicon));

  const initialSources = Array.from(sources);
  for (const source of initialSources) {
    const proxyable = extractProxyableMediaPath(source);
    if (!proxyable) continue;

    if (input.requestOrigin) {
      sources.add(`${input.requestOrigin}/store-media${proxyable.pathname}${proxyable.search}`);
      sources.add(`${input.requestOrigin}${proxyable.pathname}${proxyable.search}`);
    }

    for (const baseUrl of BACKEND_MEDIA_BASE_CANDIDATES) {
      sources.add(`${baseUrl}${proxyable.pathname}${proxyable.search}`);
    }
  }

  return Array.from(sources);
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

    const inferredFromBytes = inferImageMimeFromBytes(bytes);
    const inferredFromUrl = inferImageMimeFromSourceUrl(sourceUrl);
    const contentType = headerContentType.startsWith("image/")
      ? headerContentType
      : inferredFromBytes || inferredFromUrl;
    if (!contentType.startsWith("image/")) return "";

    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return "";
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function loadFirstAvailableLogoDataUrl(sourceUrls: string[]) {
  for (const sourceUrl of sourceUrls) {
    const dataUrl = await loadLogoDataUrl(sourceUrl);
    if (dataUrl) return dataUrl;
  }
  return "";
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

  const logoSourceUrls = buildLogoSourceUrls({
    logoUrl: storefront.logoUrl.trim(),
    faviconUrl: storefront.faviconUrl.trim(),
    requestOrigin,
  });
  const logoDataUrl = await loadFirstAvailableLogoDataUrl(logoSourceUrls);
  const hasRenderableLogo = Boolean(logoDataUrl);

  const version = request.nextUrl.searchParams.get("v")?.trim();
  const cacheControl = version && hasRenderableLogo
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, s-maxage=120, stale-while-revalidate=300";

  return new ImageResponse(
    (
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
        {logoDataUrl ? (
          // ImageResponse requires raw <img>; next/image is not supported here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUrl}
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
    ),
    {
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT,
      headers: {
        "cache-control": cacheControl,
      },
    }
  );
}
