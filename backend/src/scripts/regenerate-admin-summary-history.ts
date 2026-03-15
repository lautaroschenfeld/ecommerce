import "../lib/env"

import { runAppMigrations } from "../lib/db-migrations"
import { prefixedNanoId } from "../lib/id"
import { pgQuery, pgTransaction } from "../lib/pg"

type ProductApi = {
  id?: unknown
  name?: unknown
  brand?: unknown
  category?: unknown
  priceArs?: unknown
  imageUrl?: unknown
}

type CatalogProduct = {
  id: string
  name: string
  brand: string
  category: string
  priceArs: number
  imageUrl: string | null
  weight: number
}

type CustomerProfile = {
  firstName: string
  lastName: string
  email: string
  phone: string
  documentNumber: string
  addressLine1: string
  city: string
  province: string
  postalCode: string
}

type DayPlan = {
  dayStart: Date
  visits: number
  cartAdds: number
  beginCheckout: number
  purchases: number
}

type OrderScenario =
  | "paid_delivered_on_time"
  | "paid_delivered_delayed"
  | "paid_in_transit"
  | "paid_out_for_delivery"
  | "pending_processing"
  | "failed_cancelled"
  | "refunded_delivered"

type OrderShape = {
  id: string
  totalArs: number
  metadata: Record<string, unknown>
}

type TimelineEvent = {
  id: string
  at: string
  type: string
  message: string
}

const FIRST_NAMES = [
  "Sofia",
  "Valentina",
  "Martina",
  "Camila",
  "Mia",
  "Lucia",
  "Paula",
  "Julieta",
  "Milagros",
  "Ana",
  "Lautaro",
  "Franco",
  "Tomas",
  "Mateo",
  "Thiago",
  "Juan",
  "Benjamin",
  "Santiago",
  "Nicolas",
  "Lucas",
] as const

const LAST_NAMES = [
  "Gomez",
  "Fernandez",
  "Lopez",
  "Martinez",
  "Diaz",
  "Rodriguez",
  "Perez",
  "Sosa",
  "Romero",
  "Alvarez",
  "Benitez",
  "Suarez",
  "Gonzalez",
  "Molina",
  "Rojas",
  "Castro",
  "Acosta",
  "Ruiz",
  "Navarro",
  "Dominguez",
] as const

const ADDRESS_BOOK = [
  { city: "CABA", province: "Buenos Aires", postal: "C1000", line: "Av. Corrientes 1450" },
  { city: "La Plata", province: "Buenos Aires", postal: "B1900", line: "Calle 12 834" },
  { city: "Mar del Plata", province: "Buenos Aires", postal: "B7600", line: "Av. Colon 2241" },
  { city: "Rosario", province: "Santa Fe", postal: "S2000", line: "San Martin 1190" },
  { city: "Cordoba", province: "Cordoba", postal: "X5000", line: "Av. General Paz 820" },
  { city: "Mendoza", province: "Mendoza", postal: "M5500", line: "Belgrano 455" },
  { city: "Tucuman", province: "Tucuman", postal: "T4000", line: "25 de Mayo 982" },
  { city: "Neuquen", province: "Neuquen", postal: "Q8300", line: "Diagonal 9 de Julio 480" },
  { city: "Salta", province: "Salta", postal: "A4400", line: "Caseros 710" },
  { city: "San Juan", province: "San Juan", postal: "J5400", line: "Mitre 1660" },
] as const

const SHIPPING_METHODS = [
  { value: "standard", weight: 56 },
  { value: "express", weight: 29 },
  { value: "pickup", weight: 15 },
] as const

const PAYMENT_METHODS = [
  { value: "credit_card", weight: 48 },
  { value: "debit_card", weight: 16 },
  { value: "bank_transfer", weight: 20 },
  { value: "cash", weight: 8 },
  { value: "mercado_pago", weight: 8 },
] as const

const SALES_CHANNELS = [
  { value: "web", weight: 43 },
  { value: "instagram", weight: 16 },
  { value: "facebook", weight: 10 },
  { value: "ads", weight: 20 },
  { value: "whatsapp", weight: 11 },
] as const

function readArg(name: string, fallback = "") {
  const key = `--${name}`
  const idx = process.argv.findIndex((entry) => entry === key)
  if (idx < 0) return fallback
  const value = process.argv[idx + 1]
  if (!value || value.startsWith("--")) return fallback
  return String(value).trim()
}

function toInt(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.trunc(parsed)
}

function toText(value: unknown, max = 200) {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return function random() {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted<T extends { weight: number }>(
  list: readonly T[],
  random: () => number
) {
  const total = list.reduce((acc, entry) => acc + Math.max(0, entry.weight), 0)
  if (total <= 0) return list[0]
  let cursor = random() * total
  for (const entry of list) {
    cursor -= Math.max(0, entry.weight)
    if (cursor <= 0) return entry
  }
  return list[list.length - 1]
}

function addDays(base: Date, days: number) {
  const out = new Date(base.getTime())
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

function addHours(base: Date, hours: number) {
  return new Date(base.getTime() + Math.round(hours * 60 * 60 * 1000))
}

function addMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + Math.round(minutes * 60 * 1000))
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function clampDate(date: Date, minDate: Date, maxDate: Date) {
  const ts = Math.max(minDate.getTime(), Math.min(maxDate.getTime(), date.getTime()))
  return new Date(ts)
}

function randomMomentInDay(dayStart: Date, dayIndex: number, random: () => number, now: Date) {
  const dayEnd = addDays(dayStart, 1)
  const max = dayEnd.getTime() > now.getTime() ? now.getTime() : dayEnd.getTime()
  const min = dayStart.getTime()
  if (max <= min + 60_000) return new Date(min + 60_000)

  // Normal traffic peak around afternoon-evening.
  const startHour = 8
  const endHour = 22
  const windowStart = Math.max(min, addHours(dayStart, startHour).getTime())
  const windowEnd = Math.max(windowStart + 60_000, Math.min(max, addHours(dayStart, endHour).getTime()))
  const bell = (random() + random() + random()) / 3
  const ts = windowStart + bell * (windowEnd - windowStart)
  const withMinuteNoise = ts + Math.round((random() - 0.5) * 42 * 60 * 1000)
  return clampDate(new Date(withMinuteNoise), new Date(min + 60_000), new Date(max))
}

async function resolvePublishableKey() {
  const envCandidates = [
    process.env.PUBLISHABLE_API_KEY,
    process.env.STORE_PUBLISHABLE_API_KEY,
    process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
  if (envCandidates.length) return envCandidates[0] as string

  const rows = await pgQuery<{ token: string | null }>(
    `select "token"
     from "api_key"
     where "deleted_at" is null
       and "revoked_at" is null
       and "type" = 'publishable'
     order by "created_at" asc
     limit 1;`
  )
  const token = toText(rows[0]?.token, 400)
  if (!token) {
    throw new Error("No publishable API key found. Run `npm run seed` first.")
  }
  return token
}

async function apiJson<T>(input: string, init: RequestInit) {
  const response = await fetch(input, init)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`API ${response.status} ${response.statusText} -> ${text.slice(0, 360)}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

async function listProductsFromApi(baseUrl: string, publishableKey: string) {
  const products: CatalogProduct[] = []
  const limit = 100
  let offset = 0
  let total = 0
  let loops = 0

  while (loops < 100) {
    loops += 1
    const data = await apiJson<{
      products?: ProductApi[]
      count?: number
      limit?: number
      offset?: number
    }>(`${baseUrl}/store/catalog/products?limit=${limit}&offset=${offset}`, {
      method: "GET",
      headers: {
        "x-publishable-api-key": publishableKey,
        accept: "application/json",
      },
    })

    const page = Array.isArray(data.products) ? data.products : []
    total = Math.max(total, toInt(data.count, 0))

    for (const raw of page) {
      const rec = asRecord(raw)
      const id = toText(rec.id, 120)
      const name = toText(rec.name, 180) || "Producto"
      const brandObj = asRecord(rec.brand)
      const categoryObj = asRecord(rec.category)
      const brand = toText(brandObj.name, 120) || "Generico"
      const category = toText(categoryObj.name, 120) || "General"
      const priceArs = Math.max(0, toInt(rec.priceArs, 0))
      if (!id || priceArs <= 0) continue
      const imageUrl = toText(rec.imageUrl, 900) || null
      const affordability = Math.max(0.35, Math.min(2.2, 150_000 / Math.max(10_000, priceArs)))
      const weight = Math.round(10 + affordability * 22)

      products.push({
        id,
        name,
        brand,
        category,
        priceArs,
        imageUrl,
        weight,
      })
    }

    offset += limit
    if (!page.length) break
    if (total > 0 && offset >= total) break
  }

  if (!products.length) {
    throw new Error("No products available from API. Seed products first.")
  }

  return products
}

function buildCustomers(total: number, random: () => number) {
  const out: CustomerProfile[] = []
  for (let i = 0; i < total; i += 1) {
    const firstName = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)] || "Cliente"
    const lastName = LAST_NAMES[Math.floor(random() * LAST_NAMES.length)] || "Demo"
    const place = ADDRESS_BOOK[Math.floor(random() * ADDRESS_BOOK.length)] || ADDRESS_BOOK[0]
    const suffix = String(1000 + i).padStart(4, "0")
    out.push({
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${suffix}@demo.local`,
      phone: `11${String(5_000_000 + Math.floor(random() * 4_000_000))}`,
      documentNumber: String(20_000_000 + Math.floor(random() * 27_000_000)),
      addressLine1: `${place.line} ${1 + Math.floor(random() * 2200)}`,
      city: place.city,
      province: place.province,
      postalCode: place.postal,
    })
  }
  return out
}

function buildDayPlans(days: number, random: () => number) {
  const now = new Date()
  const start = startOfUtcDay(addDays(now, -(days - 1)))
  const plans: DayPlan[] = []

  for (let i = 0; i < days; i += 1) {
    const dayStart = addDays(start, i)
    const progress = i / Math.max(1, days - 1)
    const trend = 0.74 + progress * 0.72
    const dow = dayStart.getUTCDay()
    const dowFactor =
      dow === 5 ? 1.2 :
      dow === 6 ? 1.1 :
      dow === 0 ? 0.88 :
      dow === 1 ? 0.93 :
      1
    const wave = 1 + Math.sin((i / Math.max(1, days - 1)) * Math.PI * 2.4) * 0.11
    const noise = 0.88 + random() * 0.24
    const visits = Math.max(14, Math.round(48 * trend * dowFactor * wave * noise))
    const cartRate = 0.17 + random() * 0.09
    const carts = Math.max(4, Math.min(visits - 1, Math.round(visits * cartRate)))
    const beginCheckout = Math.max(2, Math.min(carts, Math.round(carts * (0.48 + random() * 0.2))))
    const purchaseRate = 0.25 + random() * 0.14
    const purchases = Math.max(1, Math.min(carts, Math.round(carts * purchaseRate)))

    plans.push({
      dayStart,
      visits,
      cartAdds: carts,
      beginCheckout,
      purchases,
    })
  }

  return plans
}

async function resetSummaryData(productIds: string[]) {
  await pgTransaction(async (client) => {
    await client.query(`delete from "mp_checkout_idempotency";`)
    await client.query(`delete from "mp_stock_reservation_item";`)
    await client.query(`delete from "mp_stock_reservation";`)
    await client.query(`delete from "mp_customer_order";`)
    await client.query(
      `delete from "mp_auth_audit_log"
       where "event" = 'checkout.finalized'
          or "event" = 'cart.synced'
          or "event" like 'telemetry.%';`
    )
    await client.query(`delete from "mp_rate_limit_bucket" where "bucket_key" like 'telemetry:%';`)

    if (productIds.length) {
      await client.query(
        `insert into "mp_product_stock"
          ("id","product_id","available_qty","reserved_qty","sold_qty","low_stock_threshold","allow_backorder","created_at","updated_at")
         select
           concat('mpstk_', substr(md5(pid || random()::text || clock_timestamp()::text), 1, 24)),
           pid,
           0,
           0,
           0,
           3,
           false,
           now(),
           now()
         from unnest($1::text[]) as pid
         on conflict ("product_id") do nothing;`,
        [productIds]
      )

      await client.query(
        `update "mp_product_stock"
         set "available_qty" = 7000,
             "reserved_qty" = 0,
             "sold_qty" = 0,
             "updated_at" = now()
         where "product_id" = any($1::text[]);`,
        [productIds]
      )
    }
  })
}

async function insertAuditRows(rows: Array<{
  id: string
  event: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}>) {
  const chunkSize = 400
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize)
    const values: string[] = []
    const params: unknown[] = []
    for (let index = 0; index < chunk.length; index += 1) {
      const row = chunk[index]
      const base = index * 9
      params.push(
        row.id,
        null,
        row.event,
        true,
        "127.0.0.1",
        "summary-history-seed/1.0",
        JSON.stringify(row.metadata),
        row.createdAt.toISOString(),
        row.updatedAt.toISOString()
      )
      values.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7}::jsonb,$${base + 8},$${base + 9},null)`
      )
    }

    await pgQuery(
      `insert into "mp_auth_audit_log"
        ("id","account_id","event","success","ip_address","user_agent","metadata","created_at","updated_at","deleted_at")
       values ${values.join(",")};`,
      params
    )
  }
}

function buildTelemetryRows(
  plans: DayPlan[],
  random: () => number,
  batchId: string
) {
  const rows: Array<{
    id: string
    event: string
    metadata: Record<string, unknown>
    createdAt: Date
    updatedAt: Date
  }> = []
  const now = new Date()

  for (let dayIndex = 0; dayIndex < plans.length; dayIndex += 1) {
    const plan = plans[dayIndex]
    const pushRows = (event: string, count: number) => {
      for (let i = 0; i < count; i += 1) {
        const at = randomMomentInDay(plan.dayStart, dayIndex, random, now)
        rows.push({
          id: prefixedNanoId("caud"),
          event,
          metadata: {
            seed_batch: batchId,
            seed_type: "summary_history",
            seed_day_index: dayIndex,
          },
          createdAt: at,
          updatedAt: at,
        })
      }
    }

    pushRows("telemetry.session_start", plan.visits)
    pushRows("telemetry.add_to_cart", plan.cartAdds)
    pushRows("telemetry.begin_checkout", plan.beginCheckout)
  }

  return rows
}

function pickProductsForOrder(products: CatalogProduct[], random: () => number) {
  const linesRaw = pickWeighted(
    [
      { value: 1, weight: 57 },
      { value: 2, weight: 29 },
      { value: 3, weight: 11 },
      { value: 4, weight: 3 },
    ] as const,
    random
  ).value

  const lines = Math.max(1, Math.min(linesRaw, products.length))
  const selected = new Map<
    string,
    {
      id: string
      qty: number
      name: string
      brand: string
      category: string
      priceArs: number
      imageUrl?: string
    }
  >()

  for (let i = 0; i < lines; i += 1) {
    const product = pickWeighted(products, random)
    if (!product) continue
    const qty = pickWeighted(
      [
        { value: 1, weight: 74 },
        { value: 2, weight: 21 },
        { value: 3, weight: 5 },
      ] as const,
      random
    ).value
    const current = selected.get(product.id)
    if (!current) {
      selected.set(product.id, {
        id: product.id,
        qty,
        name: product.name,
        brand: product.brand,
        category: product.category,
        priceArs: product.priceArs,
        imageUrl: product.imageUrl || undefined,
      })
      continue
    }
    current.qty = Math.min(5, current.qty + qty)
  }

  const out = Array.from(selected.values())
  if (!out.length) {
    const fallback = products[0]!
    out.push({
      id: fallback.id,
      qty: 1,
      name: fallback.name,
      brand: fallback.brand,
      category: fallback.category,
      priceArs: fallback.priceArs,
      imageUrl: fallback.imageUrl || undefined,
    })
  }
  return out
}

function pickScenario(orderAgeDays: number, random: () => number): OrderScenario {
  if (orderAgeDays <= 0) {
    return pickWeighted(
      [
        { value: "pending_processing" as const, weight: 46 },
        { value: "paid_in_transit" as const, weight: 18 },
        { value: "paid_out_for_delivery" as const, weight: 8 },
        { value: "failed_cancelled" as const, weight: 16 },
        { value: "paid_delivered_on_time" as const, weight: 8 },
        { value: "refunded_delivered" as const, weight: 4 },
      ],
      random
    ).value
  }

  if (orderAgeDays <= 3) {
    return pickWeighted(
      [
        { value: "paid_delivered_on_time" as const, weight: 44 },
        { value: "paid_out_for_delivery" as const, weight: 18 },
        { value: "paid_in_transit" as const, weight: 14 },
        { value: "pending_processing" as const, weight: 12 },
        { value: "failed_cancelled" as const, weight: 7 },
        { value: "refunded_delivered" as const, weight: 5 },
      ],
      random
    ).value
  }

  return pickWeighted(
    [
      { value: "paid_delivered_on_time" as const, weight: 57 },
      { value: "paid_delivered_delayed" as const, weight: 10 },
      { value: "paid_in_transit" as const, weight: 7 },
      { value: "pending_processing" as const, weight: 9 },
      { value: "failed_cancelled" as const, weight: 9 },
      { value: "refunded_delivered" as const, weight: 8 },
    ],
    random
  ).value
}

function makeTimelineEvent(at: Date, type: string, message: string): TimelineEvent {
  return {
    id: prefixedNanoId("tl", 12),
    at: at.toISOString(),
    type,
    message,
  }
}

function scenarioShape(input: {
  createdAt: Date
  now: Date
  scenario: OrderScenario
  totalArs: number
  random: () => number
}) {
  const { createdAt, now, scenario, totalArs, random } = input
  const timeline: TimelineEvent[] = []
  const cap = (date: Date) => clampDate(date, createdAt, now)

  const pushStatus = (status: string, at: Date) => {
    timeline.push(makeTimelineEvent(cap(at), "order.status.changed", `Estado actualizado a ${status}.`))
  }
  const pushPayment = (payment: string, at: Date) => {
    timeline.push(makeTimelineEvent(cap(at), "order.payment.changed", `Pago actualizado a ${payment}.`))
  }

  let finalStatus = "processing"
  let finalPayment = "pending"
  let refundedArs = 0
  let updatedAt = addMinutes(createdAt, 25)

  if (scenario === "pending_processing") {
    pushStatus("processing", addMinutes(createdAt, 12))
    finalStatus = "processing"
    finalPayment = "pending"
    updatedAt = addHours(createdAt, 2.5 + random() * 10)
  } else if (scenario === "failed_cancelled") {
    pushStatus("processing", addMinutes(createdAt, 10))
    pushPayment("failed", addMinutes(createdAt, 35))
    pushStatus("cancelled", addMinutes(createdAt, 45))
    finalStatus = "cancelled"
    finalPayment = "failed"
    updatedAt = addHours(createdAt, 1 + random() * 12)
  } else if (scenario === "paid_in_transit") {
    const dispatchAt = addHours(createdAt, 5 + random() * 14)
    pushStatus("preparing", addMinutes(createdAt, 30))
    pushPayment("paid", addMinutes(createdAt, 45))
    pushStatus("ready_to_dispatch", addHours(dispatchAt, -1))
    pushStatus("dispatched", dispatchAt)
    pushStatus("in_transit", addHours(dispatchAt, 6 + random() * 18))
    finalStatus = "in_transit"
    finalPayment = "paid"
    updatedAt = addHours(dispatchAt, 8 + random() * 20)
  } else if (scenario === "paid_out_for_delivery") {
    const dispatchAt = addHours(createdAt, 4 + random() * 10)
    const outAt = addHours(dispatchAt, 10 + random() * 24)
    pushStatus("preparing", addMinutes(createdAt, 35))
    pushPayment("paid", addMinutes(createdAt, 40))
    pushStatus("ready_to_dispatch", addHours(dispatchAt, -0.8))
    pushStatus("dispatched", dispatchAt)
    pushStatus("in_transit", addHours(dispatchAt, 5 + random() * 10))
    pushStatus("out_for_delivery", outAt)
    finalStatus = "out_for_delivery"
    finalPayment = "paid"
    updatedAt = addHours(outAt, 2 + random() * 8)
  } else if (scenario === "paid_delivered_delayed") {
    const dispatchAt = addHours(createdAt, 12 + random() * 30)
    const deliveredAt = addHours(createdAt, 24 * (4.2 + random() * 3.3))
    pushStatus("preparing", addMinutes(createdAt, 35))
    pushPayment("paid", addMinutes(createdAt, 44))
    pushStatus("ready_to_dispatch", addHours(dispatchAt, -1.2))
    pushStatus("dispatched", dispatchAt)
    pushStatus("in_transit", addHours(dispatchAt, 7 + random() * 18))
    pushStatus("out_for_delivery", addHours(deliveredAt, -5))
    pushStatus("delivered", deliveredAt)
    finalStatus = "delivered"
    finalPayment = "paid"
    updatedAt = addHours(deliveredAt, 2 + random() * 12)
  } else if (scenario === "refunded_delivered") {
    const dispatchAt = addHours(createdAt, 5 + random() * 16)
    const deliveredAt = addHours(createdAt, 24 * (1.4 + random() * 2.6))
    const refundedAt = addHours(deliveredAt, 6 + random() * 48)
    pushStatus("preparing", addMinutes(createdAt, 28))
    pushPayment("paid", addMinutes(createdAt, 38))
    pushStatus("ready_to_dispatch", addHours(dispatchAt, -0.9))
    pushStatus("dispatched", dispatchAt)
    pushStatus("in_transit", addHours(dispatchAt, 6 + random() * 12))
    pushStatus("out_for_delivery", addHours(deliveredAt, -4))
    pushStatus("delivered", deliveredAt)
    pushPayment("refunded", refundedAt)
    finalStatus = "delivered"
    finalPayment = "refunded"
    refundedArs = Math.max(0, Math.round(totalArs))
    updatedAt = addHours(refundedAt, 1 + random() * 8)
  } else {
    const dispatchAt = addHours(createdAt, 4 + random() * 12)
    const deliveredAt = addHours(createdAt, 24 * (1 + random() * 2.2))
    pushStatus("preparing", addMinutes(createdAt, 24))
    pushPayment("paid", addMinutes(createdAt, 35))
    pushStatus("ready_to_dispatch", addHours(dispatchAt, -0.8))
    pushStatus("dispatched", dispatchAt)
    pushStatus("in_transit", addHours(dispatchAt, 5 + random() * 10))
    pushStatus("out_for_delivery", addHours(deliveredAt, -4))
    pushStatus("delivered", deliveredAt)
    finalStatus = "delivered"
    finalPayment = "paid"
    updatedAt = addHours(deliveredAt, 1 + random() * 8)
  }

  const safeUpdated = cap(updatedAt)
  timeline.sort((a, b) => a.at.localeCompare(b.at))

  return {
    status: finalStatus,
    paymentStatus: finalPayment,
    timeline,
    updatedAt: safeUpdated,
    refundedArs,
  }
}

async function createOrderThroughApi(input: {
  baseUrl: string
  publishableKey: string
  customer: CustomerProfile
  products: CatalogProduct[]
  random: () => number
}) {
  const shipping = pickWeighted(SHIPPING_METHODS, input.random).value
  const payment = pickWeighted(PAYMENT_METHODS, input.random).value
  const channel = pickWeighted(SALES_CHANNELS, input.random).value
  const items = pickProductsForOrder(input.products, input.random)
  const payload = {
    email: input.customer.email,
    first_name: input.customer.firstName,
    last_name: input.customer.lastName,
    phone: input.customer.phone,
    document_number: input.customer.documentNumber,
    address_line1: input.customer.addressLine1,
    city: input.customer.city,
    province: input.customer.province,
    postal_code: input.customer.postalCode,
    delivery_method: shipping,
    payment_method: payment,
    sales_channel: channel,
    items,
  }

  const data = await apiJson<{ order?: unknown }>(
    `${input.baseUrl}/store/catalog/checkout/orders`,
    {
      method: "POST",
      headers: {
        "x-publishable-api-key": input.publishableKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    }
  )

  const order = asRecord(data.order)
  const id = toText(order.id, 120)
  if (!id) {
    throw new Error("Checkout API response did not include order.id")
  }

  return {
    id,
    totalArs: Math.max(0, toInt(order.total_ars, 0)),
    metadata: asRecord(order.metadata),
  } as OrderShape
}

async function clearCheckoutAuthRateLimitBucket() {
  await pgQuery(
    `delete from "mp_rate_limit_bucket"
     where "bucket_key" like 'auth:%:/store/catalog/checkout/orders';`
  )
}

function isAuthRateLimited(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  return text.includes("AUTH_RATE_LIMITED") || text.includes("429 Too Many Requests")
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function applyScenarioToOrder(input: {
  order: OrderShape
  createdAt: Date
  now: Date
  random: () => number
  scenario: OrderScenario
  batchId: string
}) {
  const shape = scenarioShape({
    createdAt: input.createdAt,
    now: input.now,
    scenario: input.scenario,
    totalArs: input.order.totalArs,
    random: input.random,
  })

  const metadata: Record<string, unknown> = {
    ...input.order.metadata,
    timeline: shape.timeline,
    seeded_summary_batch: input.batchId,
  }
  if (shape.refundedArs > 0) {
    metadata.refunded_ars = shape.refundedArs
  } else {
    metadata.refunded_ars = 0
  }

  await pgQuery(
    `update "mp_customer_order"
     set "status" = $2,
         "payment_status" = $3,
         "metadata" = $4::jsonb,
         "created_at" = $5,
         "updated_at" = $6
     where "id" = $1;`,
    [
      input.order.id,
      shape.status,
      shape.paymentStatus,
      JSON.stringify(metadata),
      input.createdAt.toISOString(),
      shape.updatedAt.toISOString(),
    ]
  )

  await pgQuery(
    `update "mp_auth_audit_log"
     set "created_at" = $2,
         "updated_at" = $2
     where "event" = 'checkout.finalized'
       and ("metadata"->>'order_id') = $1;`,
    [input.order.id, addMinutes(input.createdAt, 4).toISOString()]
  )
}

export async function regenerateAdminSummaryHistory() {
  await runAppMigrations()

  const baseUrl = readArg("base-url", process.env.BACKEND_PUBLIC_URL || "http://localhost:9000")
    .replace(/\/+$/, "")
  const days = Math.max(84, Math.min(120, toInt(readArg("days", "90"), 90)))
  const seed = toInt(readArg("seed", String(Date.now() % 1_000_000_000)), 123456789)
  const random = mulberry32(seed)
  const batchId = `summary_seed_${Date.now()}_${Math.floor(random() * 1_000_000)}`

  console.log(`[summary-seed] base-url: ${baseUrl}`)
  console.log(`[summary-seed] days: ${days}`)
  console.log(`[summary-seed] seed: ${seed}`)

  const publishableKey = await resolvePublishableKey()

  await apiJson<{ ok?: boolean }>(`${baseUrl}/health`, { method: "GET", headers: { accept: "application/json" } })

  console.log("[summary-seed] loading products from API...")
  const products = await listProductsFromApi(baseUrl, publishableKey)
  const plans = buildDayPlans(days, random)
  const customers = buildCustomers(170, random)

  console.log("[summary-seed] cleaning previous summary data...")
  await resetSummaryData(products.map((p) => p.id))

  console.log("[summary-seed] inserting telemetry history...")
  const telemetryRows = buildTelemetryRows(plans, random, batchId)
  await insertAuditRows(telemetryRows)

  console.log("[summary-seed] creating checkout orders through API...")
  const now = new Date()
  let createdOrders = 0
  let failedOrders = 0
  let deliveredOrders = 0
  let pendingOrders = 0
  let rejectedOrders = 0
  let refundedOrders = 0

  for (let dayIndex = 0; dayIndex < plans.length; dayIndex += 1) {
    const plan = plans[dayIndex]
    for (let i = 0; i < plan.purchases; i += 1) {
      const customer = customers[Math.floor(random() * customers.length)] || customers[0]
      if (!customer) continue

      try {
        if ((createdOrders + failedOrders) % 20 === 0) {
          await clearCheckoutAuthRateLimitBucket()
        }

        let order: OrderShape | null = null
        let attempts = 0
        while (!order && attempts < 4) {
          attempts += 1
          try {
            order = await createOrderThroughApi({
              baseUrl,
              publishableKey,
              customer,
              products,
              random,
            })
          } catch (error) {
            if (!isAuthRateLimited(error) || attempts >= 4) {
              throw error
            }
            await clearCheckoutAuthRateLimitBucket()
            await delay(80)
          }
        }
        if (!order) {
          throw new Error("Order creation failed after retries.")
        }

        const createdAt = randomMomentInDay(plan.dayStart, dayIndex, random, now)
        const ageDays = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000))
        const scenario = pickScenario(ageDays, random)

        await applyScenarioToOrder({
          order,
          createdAt,
          now,
          random,
          scenario,
          batchId,
        })

        createdOrders += 1
        if (scenario === "failed_cancelled") rejectedOrders += 1
        else if (scenario === "pending_processing") pendingOrders += 1
        else if (scenario === "refunded_delivered") refundedOrders += 1
        else if (scenario === "paid_in_transit" || scenario === "paid_out_for_delivery") pendingOrders += 1
        else deliveredOrders += 1
      } catch (error) {
        failedOrders += 1
        const text = error instanceof Error ? error.message : String(error)
        console.warn(`[summary-seed] order generation failed on day ${dayIndex + 1}: ${text}`)
      }
    }
  }

  console.log("[summary-seed] done.")
  console.log(
    `[summary-seed] orders created=${createdOrders} failed=${failedOrders} delivered=${deliveredOrders} pending_or_transit=${pendingOrders} rejected=${rejectedOrders} refunded=${refundedOrders}`
  )
  console.log(`[summary-seed] telemetry rows inserted=${telemetryRows.length}`)
}

if (require.main === module) {
  regenerateAdminSummaryHistory().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
