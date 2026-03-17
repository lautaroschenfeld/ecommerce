import type { HttpResponse } from "./http"

function appendVary(existing: unknown, value: string) {
  const current = typeof existing === "string" ? existing : ""
  const parts = current
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (!parts.includes(value)) {
    parts.push(value)
  }
  return parts.join(", ")
}

function toPositiveInt(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  const rounded = Math.trunc(value)
  return rounded > 0 ? rounded : fallback
}

export function setStorefrontPublicCacheHeaders(
  res: HttpResponse,
  input: {
    maxAgeSeconds: number
    staleWhileRevalidateSeconds?: number
  }
) {
  const maxAgeSeconds = toPositiveInt(input.maxAgeSeconds, 30)
  const staleWhileRevalidateSeconds = toPositiveInt(
    input.staleWhileRevalidateSeconds ?? Math.max(60, maxAgeSeconds * 3),
    Math.max(60, maxAgeSeconds * 3)
  )

  res.setHeader(
    "Cache-Control",
    `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`
  )

  const vary = appendVary(res.getHeader("Vary"), "x-publishable-api-key")
  if (vary) {
    res.setHeader("Vary", vary)
  }
}

