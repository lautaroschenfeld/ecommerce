"use client";

import { fetchJsonWithAuthRetry as fetchJson } from "@/lib/store-client";

const SESSION_START_KEY = "store:telemetry:session-started:v1";
const MAX_EVENT_LEN = 120;
const MAX_STRING_LEN = 240;
const MAX_OBJECT_KEYS = 30;
const MAX_ARRAY_ITEMS = 20;
const MAX_METADATA_JSON_BYTES = 4096;

function normalizeText(value: unknown, max = MAX_STRING_LEN) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (depth >= 3) {
    return normalizeText(String(value));
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeMetadataValue(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_OBJECT_KEYS
    );
    const out: Record<string, unknown> = {};
    for (const [rawKey, entryValue] of entries) {
      const key = normalizeText(rawKey, 60);
      if (!key) continue;
      out[key] = sanitizeMetadataValue(entryValue, depth + 1);
    }
    return out;
  }

  return normalizeText(String(value));
}

function sanitizeMetadata(metadata?: Record<string, unknown>) {
  const safe =
    metadata && typeof metadata === "object"
      ? (sanitizeMetadataValue(metadata, 0) as Record<string, unknown>)
      : {};

  try {
    const size = new TextEncoder().encode(JSON.stringify(safe)).length;
    if (size <= MAX_METADATA_JSON_BYTES) return safe;
  } catch {
    // fallback below
  }

  return {};
}

export async function trackStoreTelemetry(
  event: string,
  metadata?: Record<string, unknown>
) {
  const safeEvent = normalizeText(event, MAX_EVENT_LEN);
  if (!safeEvent) return;

  try {
    await fetchJson("/store/catalog/telemetry/events", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        event: safeEvent,
        metadata: sanitizeMetadata(metadata),
      }),
    });
  } catch {
    // non-blocking
  }
}

export function ensureStoreTelemetrySessionStarted(
  metadata?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;

  try {
    const existing = window.sessionStorage.getItem(SESSION_START_KEY);
    if (existing === "1") return;
    window.sessionStorage.setItem(SESSION_START_KEY, "1");
  } catch {
    // ignore storage failures and still emit best effort
  }

  void trackStoreTelemetry("session_start", metadata);
}
