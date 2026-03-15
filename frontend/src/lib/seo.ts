const FALLBACK_SITE_URL = "http://localhost:3000";

export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "Ecommerce";
export const SITE_DESCRIPTION =
  "Catálogo ecommerce moderno con búsqueda, filtros, carrito y finalización de compra rápida.";

function normalizeSiteUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return FALLBACK_SITE_URL;

  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.origin.replace(/\/$/, "");
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export function getSiteUrl() {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL?.trim() || FALLBACK_SITE_URL);
}

export function absoluteUrl(path = "/") {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${safePath}`;
}

export function cleanMetaText(input: string, max = 160) {
  return input.replace(/\s+/g, " ").trim().slice(0, max);
}
