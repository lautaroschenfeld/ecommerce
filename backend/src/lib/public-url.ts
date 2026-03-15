function toValidHttpUrl(input: string, label: string) {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error(`${label} must be a valid absolute URL.`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https.`)
  }

  parsed.username = ""
  parsed.password = ""
  parsed.search = ""
  parsed.hash = ""

  const normalizedPath = parsed.pathname.replace(/\/+$/, "")
  const basePath = normalizedPath === "/" ? "" : normalizedPath
  return `${parsed.origin}${basePath}`
}

function getBackendFallbackUrl() {
  const port = String(process.env.PORT || "9000").trim() || "9000"
  return `http://localhost:${port}`
}

function normalizeConfiguredUrl(configuredRaw: unknown, fallback: string, label: string) {
  const configured = typeof configuredRaw === "string" ? configuredRaw.trim() : ""
  if (!configured) return toValidHttpUrl(fallback, label)
  return toValidHttpUrl(configured, label)
}

export function getCanonicalBackendBaseUrl() {
  return normalizeConfiguredUrl(
    process.env.BACKEND_PUBLIC_URL,
    getBackendFallbackUrl(),
    "BACKEND_PUBLIC_URL"
  )
}

export function getCanonicalStorefrontBaseUrl() {
  return normalizeConfiguredUrl(
    process.env.STOREFRONT_URL,
    "http://localhost:3000",
    "STOREFRONT_URL"
  )
}

export function appendPathToBaseUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "")
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${base}${suffix}`
}
