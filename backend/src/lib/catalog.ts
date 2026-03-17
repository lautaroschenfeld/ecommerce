export const PRIMARY_CATEGORIES = [
  "Motor",
  "Transmisión",
  "Frenos",
  "Electricidad",
  "Ruedas",
  "Accesorios",
] as const

export const ALL_CATEGORIES = [
  "Motor",
  "Transmisión",
  "Frenos",
  "Electricidad",
  "Ruedas",
  "Accesorios",
  "Lubricantes",
  "Filtros",
  "Baterías",
  "Iluminación",
  "Juntas",
  "Carburación",
  "Embrague",
  "Suspensión",
  "Rodamientos",
  "Tornillería",
] as const

function normalizeCurrencyCode(value: unknown) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
  if (/^[a-z]{3}$/.test(raw)) return raw
  return "usd"
}

function normalizeRegionName(value: unknown) {
  const raw = String(value || "").trim()
  return raw || "Region principal"
}

function normalizeCountryCode(value: unknown) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
  if (/^[a-z]{2}$/.test(raw)) return raw
  return "us"
}

export const STORE_CURRENCY_CODE = normalizeCurrencyCode(
  process.env.STORE_CURRENCY_CODE
)

export const STORE_REGION_NAME = normalizeRegionName(process.env.STORE_REGION_NAME)
export const STORE_REGION_COUNTRY_CODE = normalizeCountryCode(
  process.env.STORE_REGION_COUNTRY_CODE
)
