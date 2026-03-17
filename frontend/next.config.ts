import type { NextConfig } from "next"

type RemotePattern = {
  protocol: "http" | "https"
  hostname: string
  port?: string
  pathname: string
}

function parseBackendRemotePattern(raw: string | undefined): RemotePattern | null {
  const value = String(raw || "").trim()
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null

    return {
      protocol: url.protocol === "https:" ? "https" : "http",
      hostname: url.hostname,
      port: url.port || undefined,
      pathname: "/**",
    }
  } catch {
    return null
  }
}

function uniqRemotePatterns(patterns: Array<RemotePattern | null>) {
  const out: RemotePattern[] = []
  const seen = new Set<string>()

  for (const pattern of patterns) {
    if (!pattern) continue

    const key = `${pattern.protocol}|${pattern.hostname}|${pattern.port || ""}|${pattern.pathname}`
    if (seen.has(key)) continue

    seen.add(key)
    out.push(pattern)
  }

  return out
}

const backendPattern = parseBackendRemotePattern(process.env.NEXT_PUBLIC_BACKEND_URL)

const nextConfig: NextConfig = {
  // Avoid Next.js picking an unrelated parent lockfile as the workspace root.
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: uniqRemotePatterns([
      backendPattern,
      { protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" },
      { protocol: "http", hostname: "127.0.0.1", port: "9000", pathname: "/**" },
      { protocol: "http", hostname: "backend", port: "9000", pathname: "/**" },
      // Store logos/banners can come from external CDNs.
      { protocol: "http", hostname: "**", pathname: "/**" },
      { protocol: "https", hostname: "**", pathname: "/**" },
    ]),
  },
}

export default nextConfig
