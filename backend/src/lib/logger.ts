import os from "os"

type LogLevel = "info" | "warn" | "error"

type LogPayload = {
  ts: string
  level: LogLevel
  service: string
  msg: string
  [key: string]: unknown
}

function sanitizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  if (typeof value === "bigint") return Number(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeValue(current)
    }
    return out
  }
  return value
}

function writeLog(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  const payload: LogPayload = {
    ts: new Date().toISOString(),
    level,
    service: "store-backend",
    msg,
    host: os.hostname(),
    pid: process.pid,
    ...(fields ? (sanitizeValue(fields) as Record<string, unknown>) : {}),
  }

  const line = JSON.stringify(payload)
  if (level === "error") {
    console.error(line)
    return
  }
  if (level === "warn") {
    console.warn(line)
    return
  }
  console.log(line)
}

export function logInfo(msg: string, fields?: Record<string, unknown>) {
  writeLog("info", msg, fields)
}

export function logWarn(msg: string, fields?: Record<string, unknown>) {
  writeLog("warn", msg, fields)
}

export function logError(msg: string, fields?: Record<string, unknown>) {
  writeLog("error", msg, fields)
}
