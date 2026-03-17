import { prefixedNanoId } from "./id"
import { getPgPool, type PgClient, type PgPool } from "./pg"
export type StockCheckoutItem = {
  id: string
  name: string
  brand: string
  category: string
  priceArs: number
  imageUrl?: string
  qty: number
}

export type StockSnapshot = {
  productId: string
  availableQty: number
  reservedQty: number
  soldQty: number
  lowStockThreshold: number
  allowBackorder: boolean
  inStock: boolean
  lowStock: boolean
}

export type StockReservationItem = {
  productId: string
  qty: number
  name: string
  brand: string
  category: string
  unitPriceArs: number
  imageUrl?: string
}

export type StockReservation = {
  id: string
  status: "active" | "released" | "consumed" | "expired"
  expiresAt: string
  createdAt: string
  releasedAt: string | null
  consumedAt: string | null
  accountId: string | null
  email: string | null
  metadata: Record<string, unknown>
  items: StockReservationItem[]
}

export class StockError extends Error {
  code: string
  status: number
  payload?: Record<string, unknown>

  constructor(input: {
    code: string
    message: string
    status?: number
    payload?: Record<string, unknown>
  }) {
    super(input.message)
    this.name = "StockError"
    this.code = input.code
    this.status = input.status ?? 400
    this.payload = input.payload
  }
}

const MAX_STOCK_QTY = 1_000_000
const DEFAULT_LOW_STOCK_THRESHOLD = 3
const DEFAULT_HOLD_MINUTES = 15
const SWEEP_INTERVAL_MS = 10_000

let sweepPromise: Promise<void> | null = null
let lastSweepAt = 0

function getPool() {
  return getPgPool() as PgPool
}
function buildId(prefix: string) {
  return prefixedNanoId(prefix)
}

function toInt(value: unknown, fallback = 0) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.trunc(n)
}

function clampQty(input: unknown, fallback = 0) {
  const value = Math.trunc(Number(input))
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(MAX_STOCK_QTY, value))
}

function mapStockRow(row: Record<string, unknown>): StockSnapshot {
  const availableQty = clampQty(row.available_qty, 0)
  const reservedQty = clampQty(row.reserved_qty, 0)
  const soldQty = clampQty(row.sold_qty, 0)
  const lowStockThreshold = clampQty(
    row.low_stock_threshold,
    DEFAULT_LOW_STOCK_THRESHOLD
  )
  const allowBackorder = row.allow_backorder === true

  return {
    productId: String(row.product_id || ""),
    availableQty,
    reservedQty,
    soldQty,
    lowStockThreshold,
    allowBackorder,
    inStock: allowBackorder || availableQty > 0,
    lowStock: !allowBackorder && availableQty <= lowStockThreshold,
  }
}

function sanitizeText(input: unknown, max = 180) {
  if (typeof input !== "string") return ""
  return input.replace(/\s+/g, " ").trim().slice(0, max)
}

function normalizeEmail(input: unknown) {
  if (typeof input !== "string") return ""
  return input.trim().toLowerCase()
}

function sanitizeMetadata(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {} as Record<string, unknown>
  }
  const out: Record<string, unknown> = {}
  const entries = Object.entries(input as Record<string, unknown>).slice(0, 30)
  for (const [key, value] of entries) {
    const safeKey = sanitizeText(key, 60)
    if (!safeKey) continue
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[safeKey] = value
      continue
    }
    out[safeKey] = sanitizeText(String(value), 200)
  }
  return out
}

function sanitizeCheckoutItems(raw: unknown): StockCheckoutItem[] {
  if (!Array.isArray(raw)) return []
  const out: StockCheckoutItem[] = []

  for (const value of raw) {
    const rec =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null
    if (!rec) continue

    const id = sanitizeText(rec.id, 120)
    const name = sanitizeText(rec.name, 180)
    const brand = sanitizeText(rec.brand, 120)
    const category = sanitizeText(rec.category, 120)
    const imageUrl = sanitizeText(rec.imageUrl, 600) || undefined
    const priceArs = toInt(rec.priceArs)
    const qty = toInt(rec.qty)

    if (!id || !name || !brand || !category) continue
    if (priceArs <= 0) continue
    if (qty <= 0) continue

    out.push({
      id,
      name,
      brand,
      category,
      imageUrl,
      priceArs,
      qty: Math.max(1, Math.min(999, qty)),
    })
  }

  return out
}

type AggregatedRequestedItem = {
  productId: string
  qty: number
  name: string
  brand: string
  category: string
  unitPriceArs: number
  imageUrl?: string
}

function aggregateRequestedItems(itemsRaw: unknown): AggregatedRequestedItem[] {
  const items = sanitizeCheckoutItems(itemsRaw)
  const byProduct = new Map<string, AggregatedRequestedItem>()

  for (const item of items) {
    const current = byProduct.get(item.id)
    if (!current) {
      byProduct.set(item.id, {
        productId: item.id,
        qty: item.qty,
        name: item.name,
        brand: item.brand,
        category: item.category,
        unitPriceArs: item.priceArs,
        imageUrl: item.imageUrl,
      })
      continue
    }

    current.qty = Math.min(999, current.qty + item.qty)
    current.unitPriceArs = item.priceArs
    current.name = item.name
    current.brand = item.brand
    current.category = item.category
    current.imageUrl = item.imageUrl
  }

  return Array.from(byProduct.values())
}

async function withTransaction<T>(fn: (client: PgClient) => Promise<T>) {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    const out = await fn(client)
    await client.query("COMMIT")
    return out
  } catch (e) {
    try {
      await client.query("ROLLBACK")
    } catch {
      // ignore rollback failure
    }
    throw e
  } finally {
    client.release()
  }
}

async function ensureStockRowsTx(client: PgClient, productIds: string[]) {
  const unique = Array.from(new Set(productIds.map((id) => id.trim()).filter(Boolean)))
  if (!unique.length) return

  await client.query(
    `insert into "mp_product_stock"
      ("id","product_id","available_qty","reserved_qty","sold_qty","low_stock_threshold","allow_backorder","created_at","updated_at")
      select
        concat('mpstk_', substr(md5(pid || random()::text || clock_timestamp()::text), 1, 24)),
        pid,
        0,
        0,
        0,
        $2,
        false,
        now(),
        now()
      from unnest($1::text[]) as pid
      on conflict ("product_id") do nothing;`,
    [unique, DEFAULT_LOW_STOCK_THRESHOLD]
  )
}

async function lockStockRowsTx(client: PgClient, productIds: string[]) {
  const unique = Array.from(new Set(productIds.map((id) => id.trim()).filter(Boolean)))
  if (!unique.length) return new Map<string, StockSnapshot>()

  const { rows } = await client.query(
    `select
      "product_id",
      "available_qty",
      "reserved_qty",
      "sold_qty",
      "low_stock_threshold",
      "allow_backorder"
    from "mp_product_stock"
    where "product_id" = any($1::text[])
    order by "product_id" asc
    for update;`,
    [unique]
  )

  return new Map<string, StockSnapshot>(
    rows.map((row) => {
      const mapped = mapStockRow(row as Record<string, unknown>)
      return [mapped.productId, mapped]
    })
  )
}

async function releaseExpiredReservationsTx(client: PgClient) {
  const expired = await client.query(
    `update "mp_stock_reservation"
      set "status" = 'expired',
          "released_at" = now(),
          "updated_at" = now()
    where "status" = 'active'
      and "expires_at" <= now()
    returning "id";`
  )

  const ids = expired.rows
    .map((row) => String(row.id || ""))
    .filter(Boolean)

  if (!ids.length) return 0

  await client.query(
    `with totals as (
      select "product_id", sum("qty")::int as "qty"
      from "mp_stock_reservation_item"
      where "reservation_id" = any($1::text[])
      group by "product_id"
    )
    update "mp_product_stock" as s
    set "available_qty" = s."available_qty" + t."qty",
        "reserved_qty" = greatest(0, s."reserved_qty" - t."qty"),
        "updated_at" = now()
    from totals t
    where s."product_id" = t."product_id";`,
    [ids]
  )

  return ids.length
}

function maybeSweepExpiredReservations() {
  const now = Date.now()
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
  if (sweepPromise) return

  lastSweepAt = now
  sweepPromise = withTransaction(async (client) => {
    await releaseExpiredReservationsTx(client)
  })
    .catch(() => {
      // non-blocking for read paths
    })
    .finally(() => {
      sweepPromise = null
    })
}

function mapReservationRows(
  reservationRow: Record<string, unknown>,
  itemRows: Array<Record<string, unknown>>
): StockReservation {
  const accountId = sanitizeText(reservationRow.account_id, 120) || null
  const email = normalizeEmail(reservationRow.email) || null
  const metadata = sanitizeMetadata(reservationRow.metadata)

  return {
    id: String(reservationRow.id || ""),
    status: String(reservationRow.status || "active") as StockReservation["status"],
    expiresAt: new Date(String(reservationRow.expires_at || new Date().toISOString())).toISOString(),
    createdAt: new Date(String(reservationRow.created_at || new Date().toISOString())).toISOString(),
    releasedAt:
      reservationRow.released_at ? new Date(String(reservationRow.released_at)).toISOString() : null,
    consumedAt:
      reservationRow.consumed_at ? new Date(String(reservationRow.consumed_at)).toISOString() : null,
    accountId,
    email,
    metadata,
    items: itemRows.map((row) => ({
      productId: String(row.product_id || ""),
      qty: clampQty(row.qty, 0),
      name: sanitizeText(row.name, 180),
      brand: sanitizeText(row.brand, 120),
      category: sanitizeText(row.category, 120),
      unitPriceArs: clampQty(row.unit_price_ars, 0),
      imageUrl: sanitizeText(row.image_url, 600) || undefined,
    })),
  }
}

export async function getStockSnapshotsByProductIds(productIdsRaw: string[]) {
  // Trigger periodic cleanup in background; read routes stay non-blocking.
  void maybeSweepExpiredReservations()

  const productIds = Array.from(
    new Set(productIdsRaw.map((id) => sanitizeText(id, 120)).filter(Boolean))
  )
  if (!productIds.length) return new Map<string, StockSnapshot>()

  const { rows } = await getPool().query(
    `select
      "product_id",
      "available_qty",
      "reserved_qty",
      "sold_qty",
      "low_stock_threshold",
      "allow_backorder"
    from "mp_product_stock"
    where "product_id" = any($1::text[]);`,
    [productIds]
  )

  const byProductId = new Map<string, StockSnapshot>(
    rows.map((row) => {
      const mapped = mapStockRow(row as Record<string, unknown>)
      return [mapped.productId, mapped]
    })
  )

  for (const productId of productIds) {
    if (byProductId.has(productId)) continue
    byProductId.set(productId, {
      productId,
      availableQty: 0,
      reservedQty: 0,
      soldQty: 0,
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
      allowBackorder: false,
      inStock: false,
      lowStock: true,
    })
  }

  return byProductId
}

export async function ensureStockRows(productIdsRaw: string[]) {
  const productIds = Array.from(
    new Set(productIdsRaw.map((id) => sanitizeText(id, 120)).filter(Boolean))
  )
  if (!productIds.length) return

  await withTransaction(async (client) => {
    await ensureStockRowsTx(client, productIds)
  })
}

export async function setProductStockLevelTx(
  client: Pick<PgClient, "query">,
  input: {
    productId: string
    availableQty: number
    lowStockThreshold?: number
    allowBackorder?: boolean
  }
) {
  const productId = sanitizeText(input.productId, 120)
  if (!productId) {
    throw new StockError({
      code: "STOCK_INVALID_PRODUCT",
      message: "Invalid product id for stock update.",
      status: 400,
    })
  }

  const availableQty = clampQty(input.availableQty, 0)
  const lowStockThreshold = clampQty(
    input.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
    DEFAULT_LOW_STOCK_THRESHOLD
  )
  const allowBackorder = Boolean(input.allowBackorder)

  const { rows } = await client.query(
    `insert into "mp_product_stock"
      ("id","product_id","available_qty","reserved_qty","sold_qty","low_stock_threshold","allow_backorder","created_at","updated_at")
      values
      ($1,$2,$3,0,0,$4,$5,now(),now())
      on conflict ("product_id") do update
      set "available_qty" = excluded."available_qty",
          "low_stock_threshold" = excluded."low_stock_threshold",
          "allow_backorder" = excluded."allow_backorder",
          "updated_at" = now()
      returning
        "product_id",
        "available_qty",
        "reserved_qty",
        "sold_qty",
        "low_stock_threshold",
        "allow_backorder";`,
    [buildId("mpstk"), productId, availableQty, lowStockThreshold, allowBackorder]
  )

  return mapStockRow(rows[0] as Record<string, unknown>)
}

export async function setProductStockLevel(input: {
  productId: string
  availableQty: number
  lowStockThreshold?: number
  allowBackorder?: boolean
}) {
  return await setProductStockLevelTx(getPool(), input)
}

export async function createStockReservation(input: {
  items: unknown
  holdMinutes?: number
  accountId?: string | null
  email?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}) {
  const requested = aggregateRequestedItems(input.items)
  if (!requested.length) {
    throw new StockError({
      code: "STOCK_NO_ITEMS",
      message: "Reservation requires at least one valid item.",
      status: 400,
    })
  }

  const accountId = sanitizeText(input.accountId, 120) || null
  const email = normalizeEmail(input.email) || null
  if (!accountId && !email) {
    throw new StockError({
      code: "STOCK_RESERVATION_OWNER_REQUIRED",
      message: "Reservation requires an authenticated account or a valid email.",
      status: 400,
    })
  }

  const holdMinutes = Math.max(
    1,
    Math.min(60, toInt(input.holdMinutes, DEFAULT_HOLD_MINUTES))
  )

  return await withTransaction(async (client) => {
    await releaseExpiredReservationsTx(client)

    const productIds = requested.map((item) => item.productId)
    await ensureStockRowsTx(client, productIds)
    const stockByProductId = await lockStockRowsTx(client, productIds)

    const insufficient: Array<Record<string, unknown>> = []
    for (const item of requested) {
      const stock = stockByProductId.get(item.productId)
      const available = stock?.availableQty ?? 0
      const allowBackorder = Boolean(stock?.allowBackorder)
      if (!allowBackorder && available < item.qty) {
        insufficient.push({
          product_id: item.productId,
          name: item.name,
          requested_qty: item.qty,
          available_qty: Math.max(0, available),
        })
      }
    }

    if (insufficient.length) {
      throw new StockError({
        code: "STOCK_OUT_OF_STOCK",
        message: "Algunos productos ya no tienen stock suficiente.",
        status: 409,
        payload: { items: insufficient },
      })
    }

    for (const item of requested) {
      await client.query(
        `update "mp_product_stock"
          set "available_qty" = greatest(0, "available_qty" - $1),
              "reserved_qty" = "reserved_qty" + $1,
              "updated_at" = now()
        where "product_id" = $2;`,
        [item.qty, item.productId]
      )
    }

    const reservationId = buildId("mpres")
    const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000)
    await client.query(
      `insert into "mp_stock_reservation"
        ("id","status","expires_at","account_id","email","ip_address","user_agent","metadata","created_at","updated_at")
      values
        ($1,'active',$2,$3,$4,$5,$6,$7::jsonb,now(),now());`,
      [
        reservationId,
        expiresAt.toISOString(),
        accountId,
        email,
        input.ipAddress || null,
        input.userAgent || null,
        JSON.stringify(sanitizeMetadata(input.metadata)),
      ]
    )

    for (const item of requested) {
      await client.query(
        `insert into "mp_stock_reservation_item"
          ("id","reservation_id","product_id","qty","name","brand","category","unit_price_ars","image_url","created_at","updated_at")
        values
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now());`,
        [
          buildId("mpri"),
          reservationId,
          item.productId,
          item.qty,
          item.name,
          item.brand,
          item.category,
          item.unitPriceArs,
          item.imageUrl || null,
        ]
      )
    }

    const reservationRow = (
      await client.query(
        `select
          "id","status","expires_at","created_at","released_at","consumed_at","account_id","email","metadata"
        from "mp_stock_reservation"
        where "id" = $1
        limit 1;`,
        [reservationId]
      )
    ).rows[0] as Record<string, unknown>

    const itemRows = (
      await client.query(
        `select
          "product_id","qty","name","brand","category","unit_price_ars","image_url"
        from "mp_stock_reservation_item"
        where "reservation_id" = $1
        order by "created_at" asc;`,
        [reservationId]
      )
    ).rows as Array<Record<string, unknown>>

    return mapReservationRows(reservationRow, itemRows)
  })
}

async function getReservationTx(client: PgClient, reservationId: string) {
  const reservationRows = await client.query(
    `select
      "id","status","expires_at","created_at","released_at","consumed_at","account_id","email","metadata"
    from "mp_stock_reservation"
    where "id" = $1
    limit 1
    for update;`,
    [reservationId]
  )

  const reservation = reservationRows.rows[0] as Record<string, unknown> | undefined
  if (!reservation) {
    throw new StockError({
      code: "STOCK_RESERVATION_NOT_FOUND",
      message: "Stock reservation not found.",
      status: 404,
    })
  }

  const itemRows = (
    await client.query(
      `select
        "product_id","qty","name","brand","category","unit_price_ars","image_url"
      from "mp_stock_reservation_item"
      where "reservation_id" = $1
      order by "created_at" asc;`,
      [reservationId]
    )
  ).rows as Array<Record<string, unknown>>

  return mapReservationRows(reservation, itemRows)
}

type ReservationOwnershipConstraints = {
  expectedAccountId?: string | null
  expectedEmail?: string | null
}

function aggregateReservationItems(items: StockReservationItem[]) {
  const byProduct = new Map<string, number>()
  for (const item of items) {
    const productId = sanitizeText(item.productId, 120)
    const qty = clampQty(item.qty, 0)
    if (!productId || qty <= 0) continue
    byProduct.set(productId, (byProduct.get(productId) ?? 0) + qty)
  }
  return byProduct
}

function assertReservationOwnership(
  reservation: StockReservation,
  constraints?: ReservationOwnershipConstraints
) {
  if (!constraints) return

  const expectedAccountId = sanitizeText(constraints.expectedAccountId, 120) || null
  const expectedEmail = normalizeEmail(constraints.expectedEmail) || null

  if (expectedAccountId) {
    if (reservation.accountId !== expectedAccountId) {
      throw new StockError({
        code: "STOCK_RESERVATION_ACCOUNT_MISMATCH",
        message: "Reservation does not belong to this account.",
        status: 403,
      })
    }
    return
  }

  if (expectedEmail) {
    if (!reservation.email || normalizeEmail(reservation.email) !== expectedEmail) {
      throw new StockError({
        code: "STOCK_RESERVATION_EMAIL_MISMATCH",
        message: "Reservation does not belong to this email.",
        status: 403,
      })
    }
  }
}

type ConsumeReservationConstraints = ReservationOwnershipConstraints & {
  expectedItems?: unknown
}

function assertReservationItemsMatch(
  reservation: StockReservation,
  constraints?: ConsumeReservationConstraints
) {
  if (!constraints || constraints.expectedItems === undefined) return

  const expected = aggregateRequestedItems(constraints.expectedItems)
  const expectedByProduct = new Map<string, number>()
  for (const item of expected) {
    expectedByProduct.set(
      item.productId,
      (expectedByProduct.get(item.productId) ?? 0) + item.qty
    )
  }

  const reservedByProduct = aggregateReservationItems(reservation.items)

  if (expectedByProduct.size !== reservedByProduct.size) {
    throw new StockError({
      code: "STOCK_RESERVATION_ITEMS_MISMATCH",
      message: "Reservation items do not match checkout items.",
      status: 409,
    })
  }

  for (const [productId, qty] of expectedByProduct.entries()) {
    if ((reservedByProduct.get(productId) ?? 0) !== qty) {
      throw new StockError({
        code: "STOCK_RESERVATION_ITEMS_MISMATCH",
        message: "Reservation items do not match checkout items.",
        status: 409,
        payload: { product_id: productId },
      })
    }
  }
}

function normalizeReservationIdOrThrow(reservationIdRaw: string) {
  const reservationId = sanitizeText(reservationIdRaw, 120)
  if (!reservationId) {
    throw new StockError({
      code: "STOCK_RESERVATION_INVALID",
      message: "Invalid reservation id.",
      status: 400,
    })
  }
  return reservationId
}

export async function releaseStockReservation(
  reservationIdRaw: string,
  constraints?: ReservationOwnershipConstraints
) {
  const reservationId = normalizeReservationIdOrThrow(reservationIdRaw)

  return await withTransaction(async (client) => {
    await releaseExpiredReservationsTx(client)

    const reservation = await getReservationTx(client, reservationId)
    assertReservationOwnership(reservation, constraints)
    if (reservation.status !== "active") {
      return reservation
    }

    const totals = await client.query(
      `select "product_id", sum("qty")::int as "qty"
      from "mp_stock_reservation_item"
      where "reservation_id" = $1
      group by "product_id";`,
      [reservationId]
    )

    for (const row of totals.rows) {
      const productId = String(row.product_id || "")
      const qty = clampQty(row.qty, 0)
      if (!productId || qty <= 0) continue

      await client.query(
        `update "mp_product_stock"
          set "available_qty" = "available_qty" + $1,
              "reserved_qty" = greatest(0, "reserved_qty" - $1),
              "updated_at" = now()
        where "product_id" = $2;`,
        [qty, productId]
      )
    }

    await client.query(
      `update "mp_stock_reservation"
        set "status" = 'released',
            "released_at" = now(),
            "updated_at" = now()
      where "id" = $1;`,
      [reservationId]
    )

    return await getReservationTx(client, reservationId)
  })
}

async function consumeStockReservationTx(
  client: PgClient,
  reservationId: string,
  constraints?: ConsumeReservationConstraints
) {
  await releaseExpiredReservationsTx(client)

  const reservation = await getReservationTx(client, reservationId)
  assertReservationOwnership(reservation, constraints)
  assertReservationItemsMatch(reservation, constraints)

  if (reservation.status !== "active") {
    throw new StockError({
      code: "STOCK_RESERVATION_NOT_ACTIVE",
      message: "Reservation is no longer active.",
      status: 409,
      payload: { status: reservation.status },
    })
  }

  const expiresAtMs = Date.parse(reservation.expiresAt)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new StockError({
      code: "STOCK_RESERVATION_EXPIRED",
      message: "Reservation expired. Please retry checkout.",
      status: 409,
    })
  }

  const totals = await client.query(
    `select "product_id", sum("qty")::int as "qty"
      from "mp_stock_reservation_item"
      where "reservation_id" = $1
      group by "product_id";`,
    [reservationId]
  )

  for (const row of totals.rows) {
    const productId = String(row.product_id || "")
    const qty = clampQty(row.qty, 0)
    if (!productId || qty <= 0) continue

    await client.query(
      `update "mp_product_stock"
          set "reserved_qty" = greatest(0, "reserved_qty" - $1),
              "sold_qty" = "sold_qty" + $1,
              "updated_at" = now()
        where "product_id" = $2;`,
      [qty, productId]
    )
  }

  await client.query(
    `update "mp_stock_reservation"
        set "status" = 'consumed',
            "consumed_at" = now(),
            "updated_at" = now()
      where "id" = $1;`,
    [reservationId]
  )

  return await getReservationTx(client, reservationId)
}

export async function consumeStockReservationWithClient(
  client: PgClient,
  reservationIdRaw: string,
  constraints?: ConsumeReservationConstraints
) {
  const reservationId = normalizeReservationIdOrThrow(reservationIdRaw)
  return await consumeStockReservationTx(client, reservationId, constraints)
}

export async function consumeStockReservation(
  reservationIdRaw: string,
  constraints?: ConsumeReservationConstraints
) {
  const reservationId = normalizeReservationIdOrThrow(reservationIdRaw)

  return await withTransaction(async (client) => {
    return await consumeStockReservationTx(client, reservationId, constraints)
  })
}



