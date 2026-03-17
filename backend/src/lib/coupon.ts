function toFiniteNumber(value: unknown) {
  const parsed =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

export function normalizeCouponCode(value: unknown) {
  if (typeof value !== "string") return ""
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "")
  if (!normalized) return ""
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(normalized)) return ""
  return normalized
}

export function parsePercentageTenths(value: unknown) {
  const n = toFiniteNumber(value)
  if (n === undefined) return undefined
  if (n <= 0 || n > 100) return undefined

  const scaled = n * 10
  const rounded = Math.round(scaled)
  if (Math.abs(scaled - rounded) > 1e-7) {
    return undefined
  }

  return rounded
}

export function percentageTenthsToValue(percentageTenths: number) {
  return percentageTenths / 10
}

export function computeCouponDiscountArs(
  subtotalArs: number,
  percentageTenths: number
) {
  const subtotal = Number.isFinite(subtotalArs) ? Math.max(0, subtotalArs) : 0
  const percentTenths = Number.isFinite(percentageTenths)
    ? Math.max(0, Math.trunc(percentageTenths))
    : 0

  return Math.max(0, Math.trunc((subtotal * percentTenths) / 1000))
}

export function toSubtotalArs(
  value: unknown,
  fallback: number
) {
  const n = toFiniteNumber(value)
  if (n === undefined) return Math.max(0, Math.trunc(fallback))
  return Math.max(0, Math.trunc(n))
}
