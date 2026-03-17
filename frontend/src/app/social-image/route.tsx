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

function toAbsoluteImageUrl(raw: string, requestOrigin: string) {
  const normalized = raw.trim();
  if (!normalized) return "";
  if (/^data:/i.test(normalized)) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const safePath = normalized.startsWith("/") ? normalized : `/${normalized}`;
  if (requestOrigin) return `${requestOrigin}${safePath}`;
  return absoluteUrl(safePath);
}

async function loadLogoDataUrl(sourceUrl: string) {
  if (!sourceUrl) return "";
  if (sourceUrl.startsWith("data:")) return sourceUrl;

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) return "";

    const contentType = (response.headers.get("content-type") || "image/png")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith("image/")) return "";

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > LOGO_MAX_BYTES) return "";

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
      background: "#121212",
      panel: "#1c1c1c",
      border: "rgba(255,255,255,0.20)",
      shadow: "rgba(0,0,0,0.45)",
      text: "#ededed",
      glow: "rgba(255,255,255,0.10)",
    };
  }

  return {
    background: "#f5f5f5",
    panel: "#ffffff",
    border: "rgba(23,23,23,0.16)",
    shadow: "rgba(0,0,0,0.14)",
    text: "#171717",
    glow: "rgba(0,0,0,0.08)",
  };
}

export async function GET(request: NextRequest) {
  const storefront = await getStorefrontSettingsSafe();
  const siteName = resolveSiteName(storefront.storeName);
  const themeMode = storefront.themeMode === "dark" ? "dark" : "light";
  const palette = resolvePalette(themeMode);
  const requestOrigin = request.nextUrl.origin;
  const panelSize = Math.round(Math.min(SOCIAL_IMAGE_WIDTH, SOCIAL_IMAGE_HEIGHT) * 0.68);
  const panelRadius = Math.max(22, Math.round(panelSize * 0.09));
  const logoSize = Math.round(panelSize * 0.72);
  const labelSize = Math.max(24, Math.round(panelSize * 0.12));
  const labelBottom = Math.max(24, Math.round(SOCIAL_IMAGE_HEIGHT * 0.06));
  const glowSize = Math.max(180, Math.round(panelSize * 0.68));

  const logoProxyUrl = toStoreMediaProxyUrl(storefront.logoUrl.trim());
  const logoUrl = toAbsoluteImageUrl(logoProxyUrl, requestOrigin);
  const logoDataUrl = await loadLogoDataUrl(logoUrl);

  const version = request.nextUrl.searchParams.get("v")?.trim();
  const cacheControl = version
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, s-maxage=300, stale-while-revalidate=300";

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
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(900px circle at 15% -10%, rgba(127,127,127,0.14), transparent 58%), radial-gradient(760px circle at 88% 112%, rgba(127,127,127,0.12), transparent 62%)",
          }}
        />
        <div
          style={{
            width: panelSize,
            height: panelSize,
            borderRadius: panelRadius,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: palette.panel,
            border: `1px solid ${palette.border}`,
            boxShadow: `0 24px 60px ${palette.shadow}`,
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
                fontSize: 72,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: palette.text,
              }}
            >
              {siteName}
            </span>
          )}
        </div>
        <span
          style={{
            position: "absolute",
            bottom: labelBottom,
            fontSize: labelSize,
            color: palette.text,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}
        >
          {siteName}
        </span>
        <div
          style={{
            position: "absolute",
            top: -Math.round(glowSize * 0.35),
            right: -Math.round(glowSize * 0.24),
            width: glowSize,
            height: glowSize,
            borderRadius: "999px",
            background: palette.glow,
          }}
        />
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
