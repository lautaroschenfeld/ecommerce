type HttpRequestMetricInput = {
  method: string
  path: string
  status: number
  durationMs: number
}

const startedAtMs = Date.now()
const counterByStatusClass = new Map<string, number>()
const counterByMethodPathAndStatus = new Map<string, number>()
let requestsTotal = 0
let requestDurationMsSum = 0
let requestDurationMsMax = 0

function sanitizeLabelValue(input: unknown, max = 160) {
  return String(input || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, " ")
    .replace(/"/g, '\\"')
    .trim()
    .slice(0, max)
}

function normalizePath(input: unknown) {
  const raw = String(input || "")
  const clean = raw.split("?")[0] || "/"

  const segments = clean
    .split("/")
    .map((segment) => {
      if (!segment) return ""
      if (/^\d+$/.test(segment)) return ":id"
      if (/^[a-f0-9]{8,}$/i.test(segment)) return ":id"
      if (/^[a-z0-9_-]{24,}$/i.test(segment)) return ":param"
      return segment
    })
    .filter((segment, index) => !(index > 0 && segment === ""))

  const joined = `/${segments.filter(Boolean).join("/")}`
  return joined || "/"
}

function normalizeMethod(input: unknown) {
  const method = String(input || "GET").trim().toUpperCase()
  return method || "GET"
}

function statusClass(status: number) {
  if (status >= 100 && status < 200) return "1xx"
  if (status >= 200 && status < 300) return "2xx"
  if (status >= 300 && status < 400) return "3xx"
  if (status >= 400 && status < 500) return "4xx"
  if (status >= 500 && status < 600) return "5xx"
  return "0xx"
}

function incrementCounter(map: Map<string, number>, key: string, maxKeys = 600) {
  map.set(key, (map.get(key) || 0) + 1)

  if (map.size <= maxKeys) return
  const first = map.keys().next().value
  if (typeof first === "string") {
    map.delete(first)
  }
}

export function recordHttpRequestMetric(input: HttpRequestMetricInput) {
  const durationMs = Number.isFinite(input.durationMs)
    ? Math.max(0, input.durationMs)
    : 0
  const status = Number.isFinite(input.status) ? Math.trunc(input.status) : 0
  const cls = statusClass(status)
  const method = normalizeMethod(input.method)
  const path = normalizePath(input.path)

  requestsTotal += 1
  requestDurationMsSum += durationMs
  requestDurationMsMax = Math.max(requestDurationMsMax, durationMs)

  incrementCounter(counterByStatusClass, cls, 12)
  incrementCounter(counterByMethodPathAndStatus, `${method}|${path}|${cls}`, 800)
}

function linesForMethodPathAndStatus() {
  const lines: string[] = []
  const sorted = [...counterByMethodPathAndStatus.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )

  for (const [key, value] of sorted) {
    const [method, path, cls] = key.split("|")
    lines.push(
      `store_http_requests_total_by_route{method="${sanitizeLabelValue(method, 16)}",path="${sanitizeLabelValue(path, 180)}",status_class="${sanitizeLabelValue(cls, 8)}"} ${value}`
    )
  }

  return lines
}

export function renderPrometheusMetrics() {
  const uptimeSeconds = Math.max(0, (Date.now() - startedAtMs) / 1000)
  const mem = process.memoryUsage()
  const lines: string[] = []

  lines.push("# HELP store_process_uptime_seconds Uptime in seconds for backend process")
  lines.push("# TYPE store_process_uptime_seconds gauge")
  lines.push(`store_process_uptime_seconds ${uptimeSeconds.toFixed(3)}`)

  lines.push("# HELP store_process_memory_bytes Resident memory bytes")
  lines.push("# TYPE store_process_memory_bytes gauge")
  lines.push(`store_process_memory_bytes ${mem.rss}`)

  lines.push("# HELP store_http_requests_total Total number of served HTTP requests")
  lines.push("# TYPE store_http_requests_total counter")
  lines.push(`store_http_requests_total ${requestsTotal}`)

  lines.push("# HELP store_http_request_duration_ms_sum Sum of request duration in milliseconds")
  lines.push("# TYPE store_http_request_duration_ms_sum counter")
  lines.push(`store_http_request_duration_ms_sum ${requestDurationMsSum.toFixed(3)}`)

  lines.push("# HELP store_http_request_duration_ms_max Max request duration in milliseconds")
  lines.push("# TYPE store_http_request_duration_ms_max gauge")
  lines.push(`store_http_request_duration_ms_max ${requestDurationMsMax.toFixed(3)}`)

  lines.push("# HELP store_http_requests_total_by_status_class Request counts by status class")
  lines.push("# TYPE store_http_requests_total_by_status_class counter")
  for (const [cls, count] of [...counterByStatusClass.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    lines.push(
      `store_http_requests_total_by_status_class{status_class="${sanitizeLabelValue(cls, 8)}"} ${count}`
    )
  }

  lines.push("# HELP store_http_requests_total_by_route Request counts by method, normalized path and status class")
  lines.push("# TYPE store_http_requests_total_by_route counter")
  lines.push(...linesForMethodPathAndStatus())

  return `${lines.join("\n")}\n`
}
