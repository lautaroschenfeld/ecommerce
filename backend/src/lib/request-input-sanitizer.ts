const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"])

const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const BIDI_CONTROL_REGEX = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g

const MAX_SANITIZE_DEPTH = 24

function sanitizeText(input: string) {
  return input
    .replace(CONTROL_CHARS_REGEX, "")
    .replace(BIDI_CONTROL_REGEX, "")
}

function sanitizeInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_SANITIZE_DEPTH) return null

  if (typeof value === "string") return sanitizeText(value)
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "boolean" || value === null) return value

  if (Array.isArray(value)) {
    if (seen.has(value)) return null
    seen.add(value)
    return value.map((entry) => sanitizeInternal(entry, depth + 1, seen))
  }

  if (value && typeof value === "object") {
    if (value instanceof Date) return value
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return value

    if (seen.has(value)) return null
    seen.add(value)

    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      const safeKey = sanitizeText(key)
      if (!safeKey || FORBIDDEN_OBJECT_KEYS.has(safeKey)) continue
      out[safeKey] = sanitizeInternal(entry, depth + 1, seen)
    }
    return out
  }

  return value
}

export function sanitizeUnknownInput<T>(value: T): T {
  const sanitized = sanitizeInternal(value, 0, new WeakSet())
  return sanitized as T
}

export function sanitizeExpressRequestInputs(req: any) {
  if (!req || typeof req !== "object") return

  req.query = sanitizeUnknownInput(req.query)
  req.body = sanitizeUnknownInput(req.body)
  req.params = sanitizeUnknownInput(req.params)
}
