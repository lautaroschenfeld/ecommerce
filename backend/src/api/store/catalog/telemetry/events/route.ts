import type { HttpRequest, HttpResponse } from "../../../../../lib/http"
import { HttpError } from "../../../../../lib/http"

import {
  getSessionFromAccessCookie,
  normalizeText,
  writeAuditLog,
} from "../../_shared/customer-auth"

const MAX_METADATA_BYTES = 4096
const MAX_OBJECT_KEYS = 30
const MAX_ARRAY_ITEMS = 25
const MAX_NESTING_DEPTH = 3

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (typeof value === "string") {
    return normalizeText(value, 280)
  }

  if (depth >= MAX_NESTING_DEPTH) {
    return normalizeText(String(value), 280)
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeMetadataValue(entry, depth + 1))
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_OBJECT_KEYS
    )
    for (const [key, entryValue] of entries) {
      const safeKey = normalizeText(key, 50)
      if (!safeKey) continue
      out[safeKey] = sanitizeMetadataValue(entryValue, depth + 1)
    }
    return out
  }

  return normalizeText(String(value), 280)
}

function sanitizeMetadata(raw: unknown) {
  if (!raw || typeof raw !== "object") return {}
  const sanitized = sanitizeMetadataValue(raw, 0)
  if (!sanitized || typeof sanitized !== "object") return {}

  const json = JSON.stringify(sanitized)
  if (Buffer.byteLength(json, "utf8") > MAX_METADATA_BYTES) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "metadata is too large."
    )
  }

  return sanitized as Record<string, unknown>
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const event = normalizeText(body.event, 120)
  if (!event) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "event is required")
  }

  const auth = await getSessionFromAccessCookie(req)
  const metadata = sanitizeMetadata(body.metadata)

  await writeAuditLog(req, {
    accountId: auth?.account?.id || null,
    event: `telemetry.${event}`,
    success: true,
    metadata,
  })

  return res.status(202).json({ accepted: true })
}
