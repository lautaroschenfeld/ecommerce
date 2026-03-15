const STORE_MEDIA_BASE_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
  process.env.BACKEND_INTERNAL_URL?.trim() ||
  "http://localhost:9000"
).replace(/\/+$/, "");
const STORE_MEDIA_PROXY_PREFIX = "/store-media";
const STORE_MEDIA_INTERNAL_BASE_URL = (
  process.env.BACKEND_INTERNAL_URL?.trim() || ""
).replace(/\/+$/, "");

function readOrigin(raw: string) {
  const normalized = raw.trim();
  if (!normalized) return "";
  try {
    return new URL(normalized).origin.toLowerCase();
  } catch {
    return "";
  }
}

const STORE_MEDIA_PUBLIC_ORIGIN = readOrigin(STORE_MEDIA_BASE_URL);
const STORE_MEDIA_INTERNAL_ORIGIN = readOrigin(STORE_MEDIA_INTERNAL_BASE_URL);

function withBaseUrl(path: string) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${STORE_MEDIA_BASE_URL}${safePath}`;
}

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function resolveEmbeddedStaticPath(value: string) {
  const lowered = value.toLowerCase();
  const staticIdx = lowered.lastIndexOf("/static/");
  if (staticIdx >= 0) return value.slice(staticIdx);

  const uploadsIdx = lowered.lastIndexOf("/uploads/");
  if (uploadsIdx >= 0) return value.slice(uploadsIdx);

  return "";
}

function isLikelyInternalHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "backend" ||
    normalized === "host.docker.internal"
  ) {
    return true;
  }
  return !normalized.includes(".");
}

function maybeRewriteAbsoluteStoreMediaUrl(raw: string) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return raw;

    const pathnameLower = parsed.pathname.toLowerCase();
    const isStoreMediaPath =
      pathnameLower.startsWith("/static/") || pathnameLower.startsWith("/uploads/");
    if (!isStoreMediaPath) return parsed.toString();

    const origin = parsed.origin.toLowerCase();
    const fromPublicOrigin =
      Boolean(STORE_MEDIA_PUBLIC_ORIGIN) && origin === STORE_MEDIA_PUBLIC_ORIGIN;
    if (fromPublicOrigin) return parsed.toString();

    const fromInternalOrigin =
      Boolean(STORE_MEDIA_INTERNAL_ORIGIN) && origin === STORE_MEDIA_INTERNAL_ORIGIN;
    const internalHost = isLikelyInternalHost(parsed.hostname);
    if (!fromInternalOrigin && !internalHost) return parsed.toString();

    return `${STORE_MEDIA_BASE_URL}${parsed.pathname}${parsed.search}`;
  } catch {
    return raw;
  }
}

function sanitizeStoreMediaPath(pathname: string) {
  if (!pathname) return "";
  const normalized = pathname.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!normalized.startsWith("/")) return "";
  if (!/^\/(static|uploads)(\/|$)/i.test(normalized)) return "";
  return normalized;
}

function extractStoreMediaPath(normalizedUrl: string) {
  if (!normalizedUrl) return null;

  try {
    const parsed = new URL(normalizedUrl);
    const pathname = sanitizeStoreMediaPath(parsed.pathname);
    if (!pathname) return null;
    return { pathname, search: parsed.search || "" };
  } catch {
    // Fall through for relative URLs.
  }

  const [rawPath, rawQuery = ""] = normalizedUrl.split("?", 2);
  const pathname = sanitizeStoreMediaPath(rawPath);
  if (!pathname) return null;
  return { pathname, search: rawQuery ? `?${rawQuery}` : "" };
}

export function normalizeStoreMediaUrl(raw: unknown) {
  if (typeof raw !== "string") return "";

  let normalized = stripWrappingQuotes(raw);
  if (!normalized) return "";

  normalized = normalized.replace(/\\/g, "/").replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const lowered = normalized.toLowerCase();
  if (
    lowered === "null" ||
    lowered === "undefined" ||
    lowered === "none" ||
    lowered === "n/a" ||
    lowered === "na"
  ) {
    return "";
  }

  if (
    lowered.startsWith("http://") ||
    lowered.startsWith("https://") ||
    lowered.startsWith("data:")
  ) {
    return maybeRewriteAbsoluteStoreMediaUrl(normalized);
  }

  if (normalized.startsWith("//")) return `https:${normalized}`;
  if (lowered.startsWith("www.")) return `https://${normalized}`;

  const embeddedPath = resolveEmbeddedStaticPath(normalized);
  if (embeddedPath) return withBaseUrl(embeddedPath);

  normalized = normalized.replace(/^(\.\/)+/, "");
  normalized = normalized.replace(/^(?:\.\.\/)+/, "");

  if (/^\/(static|uploads)(\/|$)/i.test(normalized)) {
    return withBaseUrl(normalized);
  }

  if (/^(static|uploads)(\/|$)/i.test(normalized)) {
    return withBaseUrl(normalized);
  }

  if (/^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(normalized)) {
    return `http://${normalized}`;
  }

  if (/^[^/]+\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?$/i.test(normalized)) {
    return withBaseUrl(`/static/${normalized}`);
  }

  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/|$)/i.test(normalized)) {
    return `https://${normalized}`;
  }

  if (normalized.startsWith("/")) return normalized;

  return `/${normalized.replace(/^\/+/, "")}`;
}

export function toStoreMediaProxyUrl(raw: unknown) {
  const normalized = normalizeStoreMediaUrl(raw);
  if (!normalized) return "";
  if (normalized.startsWith(`${STORE_MEDIA_PROXY_PREFIX}/`)) return normalized;
  if (normalized.startsWith("data:")) return normalized;

  const mediaPath = extractStoreMediaPath(normalized);
  if (!mediaPath) return normalized;

  return `${STORE_MEDIA_PROXY_PREFIX}${mediaPath.pathname}${mediaPath.search}`;
}

export function normalizeStoreMediaUrlList(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = toStoreMediaProxyUrl(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}
