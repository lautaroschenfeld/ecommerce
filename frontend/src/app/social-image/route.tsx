import { Buffer } from "node:buffer";

import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

import { absoluteUrl, resolveSiteName } from "@/lib/seo";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";
import { getStorefrontSettingsSafe } from "@/lib/storefront-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1200;
const HEIGHT = 630;
const LOGO_MAX_BYTES = 2_000_000;

function toAbsoluteImageUrl(raw: string) {
  const normalized = raw.trim();
  if (!normalized) return "";
  if (/^data:/i.test(normalized)) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const safePath = normalized.startsWith("/") ? normalized : `/${normalized}`;
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

  const logoProxyUrl = toStoreMediaProxyUrl(storefront.logoUrl.trim());
  const logoUrl = toAbsoluteImageUrl(logoProxyUrl);
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
            width: 760,
            height: 360,
            borderRadius: 36,
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
                width: 340,
                height: 340,
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
            bottom: 42,
            fontSize: 36,
            color: palette.text,
            opacity: 0.84,
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}
        >
          {siteName}
        </span>
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -80,
            width: 340,
            height: 340,
            borderRadius: "999px",
            background: palette.glow,
          }}
        />
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        "cache-control": cacheControl,
      },
    }
  );
}
