import crypto from "crypto"

import type { HttpRequest, HttpResponse } from "../../../../../lib/http"
import { HttpError } from "../../../../../lib/http"
import { publishAdminNotification } from "../../../../../lib/admin-notifications"
import { pgQuery, pgTransaction, type PgClient } from "../../../../../lib/pg"

import {
  getClientIp,
  buildOrderNumber,
  buildTrackingCode,
  getCustomerAuthService,
  getSessionFromAccessCookie,
  getUserAgent,
  hashToken,
  ensureSingleDefaultAddress,
  newToken,
  normalizeDocumentNumber,
  normalizePhone,
  normalizeText,
  replaceServerCartItems,
  sanitizeCartItems,
  writeAuditLog,
} from "../../_shared/customer-auth"
import {
  createStockReservation,
  consumeStockReservationWithClient,
  releaseStockReservation,
  StockError,
} from "../../../../../lib/stock"
import {
  computeCouponDiscountArs,
  normalizeCouponCode,
  percentageTenthsToValue,
} from "../../../../../lib/coupon"
import { STORE_CURRENCY_CODE } from "../../../../../lib/catalog"
import { getCatalogProductsByIds } from "../../../../../lib/catalog-pg"
import {
  createMercadoPagoCheckoutProPreference,
  isMercadoPagoCheckoutMethod,
  isMercadoPagoConfigured,
  type MercadoPagoCheckoutProPreferenceOutput,
} from "../../../../../lib/mercadopago-checkout-pro"
import {
  computeShippingArs,
  getOrCreateShippingSettings,
} from "../../_shared/shipping-settings"

function toNumber(value: unknown) {
  const n = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(n) ? n : undefined
}

function toPositiveInt(raw: unknown, fallback: number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.trunc(parsed)
  return rounded > 0 ? rounded : fallback
}

function asObject(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

const CHECKOUT_IDEMPOTENCY_SCOPE = "checkout.order.v1"
const CHECKOUT_IDEMPOTENCY_RETENTION_DAYS = toPositiveInt(
  process.env.CHECKOUT_IDEMPOTENCY_RETENTION_DAYS,
  14
)
const CHECKOUT_IDEMPOTENCY_CLEANUP_INTERVAL_MS = toPositiveInt(
  process.env.CHECKOUT_IDEMPOTENCY_CLEANUP_INTERVAL_MS,
  15 * 60 * 1000
)

let checkoutIdempotencyCleanupLastRunAt = 0
let checkoutIdempotencyCleanupPromise: Promise<void> | null = null

type CheckoutConsumedReservation = {
  id: string
  items: Array<{
    productId: string
    qty: number
    name: string
    brand: string
    category: string
    unitPriceArs: number
    imageUrl?: string
  }>
}

type CheckoutSuccessPayload = {
  order: Record<string, unknown>
  reservation: CheckoutConsumedReservation | null
  transfer_proof_upload?: {
    token: string
    expires_at: string
  }
  checkout_pro?: {
    provider: "mercadopago"
    preference_id: string
    init_point: string
    sandbox_init_point: string
    redirect_url: string
    external_reference: string
  }
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim().toLowerCase()
}

function readHeaderValue(req: HttpRequest, headerName: string) {
  const raw = req.headers[headerName]
  if (typeof raw === "string") return raw
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === "string")
    return typeof first === "string" ? first : ""
  }
  return ""
}

function resolveCheckoutIdempotencyKey(
  req: HttpRequest,
  body: Record<string, unknown>,
  reservationIdInput: string
) {
  const fromBody =
    normalizeText(body.idempotency_key ?? body.idempotencyKey, 160) ||
    normalizeText(body.checkout_request_id ?? body.checkoutRequestId, 160)
  const fromHeader =
    normalizeText(readHeaderValue(req, "idempotency-key"), 160) ||
    normalizeText(readHeaderValue(req, "x-idempotency-key"), 160)

  const key = fromBody || fromHeader || reservationIdInput
  return key || ""
}

function buildCheckoutRequestHash(input: {
  accountId: string | null
  email: string
  firstName: string
  lastName: string
  documentNumber: string
  phone: string | null
  shippingMethod: string | null
  paymentMethod: string | null
  shippingAddress: CheckoutAddressInput
  items: Array<{
    id: string
    qty: number
    priceArs: number
  }>
  subtotal: number
  shippingArs: number
  discountArs: number
  total: number
  couponCode: string
  reservationIdInput: string
}) {
  const normalizedItems = [...input.items]
    .map((item) => ({
      id: String(item.id || "").trim(),
      qty: Math.max(0, Math.trunc(Number(item.qty || 0))),
      priceArs: Math.max(0, Math.trunc(Number(item.priceArs || 0))),
    }))
    .filter((item) => item.id && item.qty > 0 && item.priceArs >= 0)
    .sort((a, b) => a.id.localeCompare(b.id))

  const stablePayload = {
    accountId: input.accountId || null,
    email: normalizeEmail(input.email),
    firstName: input.firstName,
    lastName: input.lastName,
    documentNumber: input.documentNumber,
    phone: input.phone || null,
    shippingMethod: input.shippingMethod || null,
    paymentMethod: input.paymentMethod || null,
    shippingAddress: {
      line1: input.shippingAddress.line1,
      streetNumber: input.shippingAddress.streetNumber,
      line2: input.shippingAddress.line2 || null,
      city: input.shippingAddress.city,
      province: input.shippingAddress.province,
      postalCode: input.shippingAddress.postalCode,
    },
    items: normalizedItems,
    pricing: {
      subtotal: Math.max(0, Math.trunc(Number(input.subtotal || 0))),
      shippingArs: Math.max(0, Math.trunc(Number(input.shippingArs || 0))),
      discountArs: Math.max(0, Math.trunc(Number(input.discountArs || 0))),
      total: Math.max(0, Math.trunc(Number(input.total || 0))),
    },
    couponCode: input.couponCode || "",
    reservationIdInput: input.reservationIdInput || "",
  }

  return crypto.createHash("sha256").update(JSON.stringify(stablePayload)).digest("hex")
}

async function readCheckoutIdempotencyRow(key: string) {
  const rows = await pgQuery<{
    request_hash: string | null
    status: string | null
    response_status: number | null
    response_json: Record<string, unknown> | null
  }>(
    `select "request_hash", "status", "response_status", "response_json"
     from "mp_checkout_idempotency"
     where "scope" = $1 and "idempotency_key" = $2
     limit 1;`,
    [CHECKOUT_IDEMPOTENCY_SCOPE, key]
  )
  return rows[0] ?? null
}

async function cleanupCheckoutIdempotencyRows() {
  await pgQuery(
    `delete from "mp_checkout_idempotency"
     where "created_at" < now() - ($1::integer * interval '1 day');`,
    [CHECKOUT_IDEMPOTENCY_RETENTION_DAYS]
  )
}

function maybeCleanupCheckoutIdempotencyRows() {
  const now = Date.now()
  if (now - checkoutIdempotencyCleanupLastRunAt < CHECKOUT_IDEMPOTENCY_CLEANUP_INTERVAL_MS) {
    return
  }
  if (checkoutIdempotencyCleanupPromise) return

  checkoutIdempotencyCleanupLastRunAt = now
  checkoutIdempotencyCleanupPromise = cleanupCheckoutIdempotencyRows()
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[checkout.orders] idempotency cleanup failed", { message })
    })
    .finally(() => {
      checkoutIdempotencyCleanupPromise = null
    })
}

type CheckoutAddressInput = {
  line1: string
  streetNumber: string
  line2: string | null
  city: string
  province: string
  postalCode: string
}

function validateRequiredText(value: unknown, max: number, message: string) {
  const normalized = normalizeText(value, max)
  if (!normalized) {
    throw new HttpError(HttpError.Types.INVALID_DATA, message)
  }
  return normalized
}

function resolveRequiredDocumentNumber(body: Record<string, unknown>) {
  const candidate =
    body.document_number ??
    body.documentNumber ??
    body.dni ??
    body.cuit

  const documentNumber = normalizeDocumentNumber(candidate)
  if (!documentNumber) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "DNI or CUIT is required."
    )
  }

  const isDni = documentNumber.length === 7 || documentNumber.length === 8
  const isCuit = documentNumber.length === 11
  if (!isDni && !isCuit) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "DNI or CUIT is invalid."
    )
  }

  return documentNumber
}

function resolveRequiredCheckoutAddress(body: Record<string, unknown>): CheckoutAddressInput {
  const line1 = validateRequiredText(
    body.address_line1 ?? body.address1,
    200,
    "Address line is required."
  )
  const streetNumber = validateRequiredText(
    body.address_number ?? body.street_number ?? body.addressNumber ?? body.streetNumber,
    40,
    "Address number is required."
  )
  const city = validateRequiredText(body.city, 120, "City is required.")
  const province = validateRequiredText(
    body.province,
    120,
    "Province is required."
  )
  const postalCode = validateRequiredText(
    body.postal_code ?? body.postalCode,
    30,
    "Postal code is required."
  )

  return {
    line1,
    streetNumber,
    line2: normalizeText(body.address_line2 ?? body.address2, 120) || null,
    city,
    province,
    postalCode,
  }
}

async function upsertCheckoutAddressForAccount(input: {
  req: HttpRequest
  service: any
  accountId: string
  firstName: string
  lastName: string
  phone: string | null
  shippingAddress: CheckoutAddressInput
}) {
  const addresses = await input.service.listCustomerAddresses(
    { account_id: input.accountId },
    { take: 500 }
  )

  const recipient = `${input.firstName} ${input.lastName}`.trim()
  const label = "Principal"
  const shipping = input.shippingAddress

  const normalizedPostal = normalizeText(shipping.postalCode, 30)
  const matchingAddress = addresses.find((address: Record<string, unknown>) => {
    const sameLine1 = normalizeText(address.line1, 200) === shipping.line1
    const sameStreetNumber =
      normalizeText(
        address.street_number ?? address.streetNumber ?? address.address_number ?? address.addressNumber,
        40
      ) === shipping.streetNumber
    const sameCity = normalizeText(address.city, 120) === shipping.city
    const sameProvince = normalizeText(address.province, 120) === shipping.province
    const samePostal =
      normalizeText(address.postal_code ?? address.postalCode, 30) === normalizedPostal
    return sameLine1 && sameStreetNumber && sameCity && sameProvince && samePostal
  })

  const defaultAddress =
    addresses.find((address: Record<string, unknown>) => Boolean(address.is_default)) ??
    addresses[0]

  const target = matchingAddress ?? defaultAddress

  if (target?.id) {
    await input.service.updateCustomerAddresses({
      selector: { id: target.id },
      data: {
        label,
        recipient: recipient || null,
        phone: input.phone || null,
        line1: shipping.line1,
        street_number: shipping.streetNumber,
        line2: shipping.line2,
        city: shipping.city,
        province: shipping.province,
        postal_code: shipping.postalCode,
        is_default: true,
      },
    })

    await ensureSingleDefaultAddress(input.req, input.accountId, target.id)
    return
  }

  const created = await input.service.createCustomerAddresses({
    account_id: input.accountId,
    label,
    recipient: recipient || null,
    phone: input.phone || null,
    line1: shipping.line1,
    street_number: shipping.streetNumber,
    line2: shipping.line2,
    city: shipping.city,
    province: shipping.province,
    postal_code: shipping.postalCode,
    is_default: true,
  })

  await ensureSingleDefaultAddress(input.req, input.accountId, created.id)
}

function pickBrand(product: any) {
  const brand = product?.brand
  if (!brand) return undefined
  if (Array.isArray(brand)) return brand[0]
  return brand
}

function pickImageUrl(product: any) {
  if (typeof product?.thumbnail === "string" && product.thumbnail.trim()) {
    return product.thumbnail.trim()
  }
  if (Array.isArray(product?.images)) {
    const first = product.images.find((image: any) => typeof image?.url === "string" && image.url)
    if (first?.url) return String(first.url).trim()
  }
  return undefined
}

function pickCategoryName(product: any) {
  if (!Array.isArray(product?.categories)) return undefined
  const first = product.categories.find(
    (category: any) => typeof category?.name === "string" && category.name
  )
  return first?.name ? String(first.name).trim() : undefined
}

function pickConfiguredPrice(product: any) {
  const firstVariant = Array.isArray(product?.variants) ? product.variants[0] : undefined
  if (!firstVariant) return undefined

  const candidates: any[] = []
  const fromPriceSet = firstVariant?.price_set?.prices
  if (Array.isArray(fromPriceSet)) candidates.push(...fromPriceSet)
  const fromVariant = firstVariant?.prices
  if (Array.isArray(fromVariant)) candidates.push(...fromVariant)
  if (!candidates.length) return undefined

  const configured = candidates.find((p: any) => p?.currency_code === STORE_CURRENCY_CODE)
  const configuredAmount = Number(configured?.amount)
  if (Number.isFinite(configuredAmount) && configuredAmount > 0) {
    return Math.trunc(configuredAmount)
  }

  const fallback = candidates.find((p: any) => Number.isFinite(Number(p?.amount)) && Number(p?.amount) > 0)
  const fallbackAmount = Number(fallback?.amount)
  return Number.isFinite(fallbackAmount) && fallbackAmount > 0 ? Math.trunc(fallbackAmount) : undefined
}

function pickConfiguredCost(product: any) {
  const firstVariant = Array.isArray(product?.variants) ? product.variants[0] : undefined
  if (!firstVariant) return undefined

  const fromColumn = toNumber(firstVariant?.cost_ars)
  if (Number.isFinite(fromColumn) && Number(fromColumn) >= 0) {
    return Math.max(0, Math.trunc(Number(fromColumn)))
  }

  const variantMeta = asObject(firstVariant?.metadata)
  const fromVariantMeta =
    toNumber(variantMeta?.cost_ars) ??
    toNumber(variantMeta?.costArs)
  if (Number.isFinite(fromVariantMeta) && Number(fromVariantMeta) >= 0) {
    return Math.max(0, Math.trunc(Number(fromVariantMeta)))
  }

  const productMeta = asObject(product?.metadata)
  const fromProductMeta =
    toNumber(productMeta?.cost_ars) ??
    toNumber(productMeta?.costArs)
  if (Number.isFinite(fromProductMeta) && Number(fromProductMeta) >= 0) {
    return Math.max(0, Math.trunc(Number(fromProductMeta)))
  }

  return undefined
}

type SalesChannelKey = "web" | "instagram" | "facebook" | "ads" | "whatsapp"

function normalizeSalesChannel(value: unknown): SalesChannelKey {
  const normalized = normalizeText(value, 120).toLowerCase()
  if (!normalized) return "web"
  if (normalized.includes("instagram") || normalized === "ig") return "instagram"
  if (normalized.includes("facebook") || normalized === "fb") return "facebook"
  if (normalized.includes("whatsapp") || normalized === "wa") return "whatsapp"
  if (
    normalized.includes("ads") ||
    normalized.includes("anuncio") ||
    normalized.includes("campaign") ||
    normalized.includes("google") ||
    normalized.includes("meta")
  ) {
    return "ads"
  }
  return "web"
}

function paymentFeePercent(paymentMethod: string | null) {
  const method = String(paymentMethod || "").trim().toLowerCase()
  if (!method) return 3.3
  if (method.includes("transfer")) return 0.8
  if (method.includes("cash") || method.includes("efectivo")) return 0
  if (method.includes("debit")) return 1.8
  if (method.includes("credit")) return 3.9
  if (method.includes("card") || method.includes("mercado") || method.includes("mp")) return 4.2
  return 3.3
}

function channelFeePercent(channel: SalesChannelKey) {
  if (channel === "instagram" || channel === "facebook") return 4.2
  if (channel === "ads") return 8.5
  if (channel === "whatsapp") return 1.2
  return 0
}

function estimateOperationalShippingCostArs(shippingMethod: string | null, shippingArs: number) {
  const method = String(shippingMethod || "").trim().toLowerCase()
  const isPickup =
    method.includes("retiro") ||
    method.includes("pickup") ||
    method.includes("sucursal") ||
    method.includes("local")
  if (isPickup) return 0

  if (shippingArs > 0) return Math.max(0, Math.round(shippingArs * 0.85))
  return 3900
}

type ServerPricedItem = {
  id: string
  name: string
  brand: string
  category: string
  priceArs: number
  costArs: number
  imageUrl?: string
  qty: number
}

async function resolveServerPricedItems(
  req: HttpRequest,
  requestedItems: ReturnType<typeof sanitizeCartItems>
): Promise<ServerPricedItem[]> {
  const productIds = Array.from(
    new Set(
      requestedItems
        .map((item) => (typeof item?.id === "string" ? item.id : ""))
        .filter(Boolean)
    )
  )

  if (!productIds.length) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Checkout requires valid product ids.")
  }

  const products = await getCatalogProductsByIds(productIds, { status: "published" })

  const productById = new Map<string, any>()
  for (const product of products) {
    if (typeof product?.id === "string" && product.id) {
      productById.set(product.id, product)
    }
  }

  const resolved = requestedItems.map((item) => {
    const product = productById.get(item.id)
    if (!product) {
      throw new HttpError(
        HttpError.Types.INVALID_DATA,
        `Invalid or unavailable product: ${item.id}`
      )
    }

    const unitPriceArs = pickConfiguredPrice(product)
    if (!unitPriceArs) {
      throw new HttpError(
        HttpError.Types.INVALID_DATA,
        `Product has no valid ${STORE_CURRENCY_CODE.toUpperCase()} price: ${item.id}`
      )
    }

    const brand = pickBrand(product)
    const configuredCost = pickConfiguredCost(product)
    const name =
      typeof product?.title === "string" && product.title.trim()
        ? product.title.trim()
        : item.name

    return {
      id: item.id,
      name,
      brand:
        typeof brand?.name === "string" && brand.name.trim()
          ? brand.name.trim()
          : item.brand,
      category: pickCategoryName(product) || item.category,
      priceArs: unitPriceArs,
      costArs:
        configuredCost !== undefined
          ? Math.max(0, Math.trunc(configuredCost))
          : Math.max(0, Math.round(unitPriceArs * 0.55)),
      imageUrl: pickImageUrl(product) || item.imageUrl,
      qty: item.qty,
    }
  })

  return resolved
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  // Keep idempotency table bounded without slowing down checkout path.
  void maybeCleanupCheckoutIdempotencyRows()

  const body = asObject(req.body)
  const requestedItems = sanitizeCartItems(body.items)
  if (!requestedItems.length) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Checkout requires at least one item.")
  }

  const auth = await getSessionFromAccessCookie(req)
  const account = auth?.account ?? null

  const email =
    normalizeText(body.email, 160).toLowerCase() ||
    (typeof account?.email === "string" ? account.email : "")
  if (!email || !email.includes("@")) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "A valid email is required.")
  }

  const firstName = validateRequiredText(
    body.first_name ?? body.firstName,
    80,
    "First name is required."
  )
  const lastName = validateRequiredText(
    body.last_name ?? body.lastName,
    80,
    "Last name is required."
  )
  const documentNumber = resolveRequiredDocumentNumber(body)
  const shippingAddress = resolveRequiredCheckoutAddress(body)

  const phone =
    normalizePhone(body.phone) ||
    normalizePhone((body.customer as Record<string, unknown> | undefined)?.phone) ||
    normalizePhone(account?.phone) ||
    null

  const shippingMethod = normalizeText(body.delivery_method ?? body.shipping_method, 80) || null
  const paymentMethod = normalizeText(body.payment_method ?? body.paymentMethod, 80) || null
  const isMercadoPagoPayment = isMercadoPagoCheckoutMethod(paymentMethod)
  const salesChannel = normalizeSalesChannel(
    body.sales_channel ??
      body.salesChannel ??
      body.channel ??
      body.utm_source ??
      body.utmSource
  )
  const isTransferPayment = String(paymentMethod || "")
    .toLowerCase()
    .includes("transfer")
  const transferProofToken = isTransferPayment ? newToken(32) : ""
  const transferProofExpiresAt = isTransferPayment
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : null

  const items = await resolveServerPricedItems(req, requestedItems)
  const subtotal = items.reduce((acc, item) => acc + item.qty * item.priceArs, 0)
  const shippingSettings = await getOrCreateShippingSettings(req)
  const shippingArs = computeShippingArs({
    subtotalArs: subtotal,
    deliveryMethod: shippingMethod,
    freeShippingThresholdArs: shippingSettings.free_shipping_threshold_ars,
  })
  const couponCode = normalizeCouponCode(
    body.coupon_code ?? body.couponCode ?? body.promo_code ?? body.promoCode
  )
  const providedTotal = toNumber(body.total_ars ?? body.totalArs)
  const providedShipping = toNumber(body.shipping_ars ?? body.shippingArs)
  const providedDiscount = toNumber(body.discount_ars ?? body.discountArs)
  const service = getCustomerAuthService(req)

  if (isMercadoPagoPayment && !isMercadoPagoConfigured()) {
    return res.status(503).json({
      message: "Mercado Pago Checkout Pro is not configured.",
      code: "MERCADOPAGO_NOT_CONFIGURED",
    })
  }

  let discountArs = 0
  let appliedCoupon:
    | {
        id: string
        code: string
        title: string
        percentage_tenths: number
        percentage: number
        used_count: number
      }
    | null = null

  if (couponCode) {
    const found = await service.listCoupons({ code: couponCode }, { take: 1 })
    const coupon = found[0]
    if (!coupon || !coupon.is_active) {
      throw new HttpError(
        HttpError.Types.INVALID_DATA,
        "Coupon is invalid or inactive."
      )
    }

    const percentageTenths = Number(coupon.percentage_tenths || 0)
    discountArs = computeCouponDiscountArs(subtotal, percentageTenths)
    appliedCoupon = {
      id: coupon.id,
      code: coupon.code,
      title: coupon.title,
      percentage_tenths: percentageTenths,
      percentage: percentageTenthsToValue(percentageTenths),
      used_count: Math.max(0, Math.trunc(Number(coupon.used_count || 0))),
    }
  }

  const calculatedTotal = Math.max(
    0,
    Math.trunc(subtotal + shippingArs - discountArs)
  )
  const total = calculatedTotal
  const itemsCostArs = Math.max(
    0,
    Math.trunc(
      items.reduce(
        (acc, item) =>
          acc +
          item.qty *
            Math.max(
              0,
              Math.trunc(
                Number.isFinite(Number(item.costArs))
                  ? Number(item.costArs)
                  : Math.round(item.priceArs * 0.55)
              )
            ),
        0
      )
    )
  )
  const paymentFeePct = paymentFeePercent(paymentMethod)
  const paymentFeeArs = Math.max(0, Math.round(total * paymentFeePct / 100))
  const channelFeePct = channelFeePercent(salesChannel)
  const channelFeeArs = Math.max(0, Math.round(total * channelFeePct / 100))
  const operationalShippingCostArs = estimateOperationalShippingCostArs(
    shippingMethod,
    shippingArs
  )
  const profitArs = Math.round(
    total -
      itemsCostArs -
      paymentFeeArs -
      channelFeeArs -
      operationalShippingCostArs
  )
  const reservationIdInput = normalizeText(
    body.reservation_id ?? body.reservationId,
    120
  )
  const idempotencyKey = resolveCheckoutIdempotencyKey(req, body, reservationIdInput)
  const requestHash = idempotencyKey
    ? buildCheckoutRequestHash({
        accountId: normalizeText(account?.id, 120) || null,
        email,
        firstName,
        lastName,
        documentNumber,
        phone,
        shippingMethod,
        paymentMethod,
        shippingAddress,
        items: items.map((item) => ({
          id: item.id,
          qty: item.qty,
          priceArs: item.priceArs,
        })),
        subtotal,
        shippingArs,
        discountArs,
        total,
        couponCode,
        reservationIdInput,
      })
    : ""

  if (idempotencyKey) {
    const existingIdempotency = await readCheckoutIdempotencyRow(idempotencyKey)
    if (existingIdempotency) {
      const storedHash = normalizeText(existingIdempotency.request_hash, 120)
      if (storedHash && storedHash !== requestHash) {
        return res.status(409).json({
          message: "Idempotency key was already used with a different payload.",
          code: "CHECKOUT_IDEMPOTENCY_KEY_REUSED",
        })
      }

      if (
        existingIdempotency.status === "completed" &&
        existingIdempotency.response_json &&
        typeof existingIdempotency.response_json === "object"
      ) {
        const responseStatus =
          Number.isFinite(Number(existingIdempotency.response_status)) &&
          Number(existingIdempotency.response_status) > 0
            ? Math.trunc(Number(existingIdempotency.response_status))
            : 201
        res.setHeader("x-idempotency-replayed", "true")
        return res.status(responseStatus).json(existingIdempotency.response_json)
      }
    }
  }

  let reservationId = reservationIdInput || ""
  let createdReservationInternally = false

  if (!reservationId) {
    try {
      const reservation = await createStockReservation({
        items,
        holdMinutes: 15,
        accountId: account?.id || null,
        email,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req) || null,
        metadata: {
          source: "checkout_orders_route",
        },
      })
      reservationId = reservation.id
      createdReservationInternally = true
    } catch (error) {
      if (error instanceof StockError) {
        return res.status(error.status).json({
          message: error.message,
          code: error.code,
          ...(error.payload ? error.payload : {}),
        })
      }
      throw error
    }
  }

  let replayed = false
  let replayedResponseStatus = 201
  let payload: CheckoutSuccessPayload | null = null
  let created: Record<string, any> | null = null

  try {
    const txResult = await pgTransaction(async (client: PgClient) => {
      if (idempotencyKey) {
        await client.query(
          `insert into "mp_checkout_idempotency"
            ("id","scope","idempotency_key","request_hash","status","account_id","email","created_at","updated_at")
          values
            ($1,$2,$3,$4,'pending',$5,$6,now(),now())
          on conflict ("scope","idempotency_key") do nothing;`,
          [
            `mpeid_${newToken(16)}`,
            CHECKOUT_IDEMPOTENCY_SCOPE,
            idempotencyKey,
            requestHash,
            account?.id || null,
            email,
          ]
        )

        const lockRows = await client.query(
          `select "request_hash", "status", "response_status", "response_json"
           from "mp_checkout_idempotency"
           where "scope" = $1 and "idempotency_key" = $2
           limit 1
           for update;`,
          [CHECKOUT_IDEMPOTENCY_SCOPE, idempotencyKey]
        )
        const idemRow = lockRows.rows[0] as
          | {
              request_hash?: string | null
              status?: string | null
              response_status?: number | null
              response_json?: CheckoutSuccessPayload | null
            }
          | undefined
        if (!idemRow) {
          throw new HttpError(
            HttpError.Types.UNEXPECTED_STATE,
            "Could not lock checkout idempotency row."
          )
        }

        const storedHash = normalizeText(idemRow.request_hash, 120)
        if (storedHash && storedHash !== requestHash) {
          throw new StockError({
            code: "CHECKOUT_IDEMPOTENCY_KEY_REUSED",
            message: "Idempotency key was already used with a different payload.",
            status: 409,
          })
        }

        if (
          idemRow.status === "completed" &&
          idemRow.response_json &&
          typeof idemRow.response_json === "object"
        ) {
          return {
            replayed: true as const,
            responseStatus:
              Number.isFinite(Number(idemRow.response_status)) &&
              Number(idemRow.response_status) > 0
                ? Math.trunc(Number(idemRow.response_status))
                : 201,
            payload: idemRow.response_json as CheckoutSuccessPayload,
          }
        }
      }

      const orderId = `cord_${newToken(16)}`
      const orderNumber = buildOrderNumber()
      const trackingCode = buildTrackingCode()

      let mercadoPagoPreference: MercadoPagoCheckoutProPreferenceOutput | null = null
      if (isMercadoPagoPayment) {
        mercadoPagoPreference = await createMercadoPagoCheckoutProPreference({
          orderId,
          orderNumber,
          email,
          items: items.map((item) => ({
            id: item.id,
            name: item.name,
            brand: item.brand,
            qty: item.qty,
            priceArs: item.priceArs,
          })),
        })
      }

      const orderMetadata = {
        source: "store_checkout",
        sales_channel: salesChannel,
        reservation_id: reservationId,
        payment_provider: isMercadoPagoPayment ? "mercadopago" : paymentMethod,
        customer: {
          first_name: firstName,
          last_name: lastName,
          document_number: documentNumber,
        },
        shipping_address: {
          line1: shippingAddress.line1,
          street_number: shippingAddress.streetNumber,
          line2: shippingAddress.line2,
          city: shippingAddress.city,
          province: shippingAddress.province,
          postal_code: shippingAddress.postalCode,
        },
        subtotal_ars: subtotal,
        shipping_ars: shippingArs,
        discount_ars: discountArs,
        items_cost_ars: itemsCostArs,
        payment_fee_pct: paymentFeePct,
        payment_fee_ars: paymentFeeArs,
        channel_fee_pct: channelFeePct,
        channel_fee_ars: channelFeeArs,
        operational_shipping_cost_ars: operationalShippingCostArs,
        profit_ars: profitArs,
        gross_margin_pct:
          total > 0 ? Math.round((profitArs / total) * 10000) / 100 : 0,
        provided_total_ars: providedTotal,
        provided_shipping_ars: providedShipping,
        provided_discount_ars: providedDiscount,
        coupon: appliedCoupon
          ? {
              id: appliedCoupon.id,
              code: appliedCoupon.code,
              title: appliedCoupon.title,
              percentage: appliedCoupon.percentage,
            }
          : null,
        guest: !account?.id,
        ...(mercadoPagoPreference
          ? {
              mercadopago: {
                mode: "checkout_pro",
                preference_id: mercadoPagoPreference.id,
                init_point: mercadoPagoPreference.initPoint || null,
                sandbox_init_point: mercadoPagoPreference.sandboxInitPoint || null,
                redirect_url: mercadoPagoPreference.redirectUrl,
                external_reference: mercadoPagoPreference.externalReference,
                status: "pending",
                status_detail: null,
                payment_id: null,
              },
            }
          : {}),
        ...(isTransferPayment && transferProofToken && transferProofExpiresAt
          ? {
              transfer_proof: {
                token_hash: hashToken(transferProofToken),
                expires_at: transferProofExpiresAt.toISOString(),
                uploaded_at: null,
                files: [],
              },
            }
          : {}),
      }

      const createdRows = await client.query(
        `insert into "mp_customer_order"
          ("id","order_number","account_id","email","phone","status","payment_status","total_ars","currency_code","item_count","shipping_method","payment_method","tracking_code","items","metadata","created_at","updated_at","deleted_at")
         values
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,now(),now(),null)
         returning *;`,
        [
          orderId,
          orderNumber,
          account?.id || null,
          email,
          phone,
          "processing",
          "pending",
          total,
          STORE_CURRENCY_CODE,
          items.reduce((acc, item) => acc + item.qty, 0),
          shippingMethod,
          paymentMethod,
          trackingCode,
          JSON.stringify(items.map((item) => ({ ...item, costArs: Math.max(0, Math.trunc(item.costArs)) }))),
          JSON.stringify(orderMetadata),
        ]
      )
      const createdOrder = createdRows.rows[0] as Record<string, any> | undefined
      if (!createdOrder?.id) {
        throw new HttpError(
          HttpError.Types.UNEXPECTED_STATE,
          "Order could not be created."
        )
      }

      const consumed = await consumeStockReservationWithClient(client, reservationId, {
        expectedItems: items,
        expectedAccountId: account?.id || null,
        expectedEmail: account?.id ? null : email,
      })
      const consumedReservation: CheckoutConsumedReservation = {
        id: consumed.id,
        items: consumed.items,
      }

      if (appliedCoupon) {
        const couponRows = await client.query(
          `update "mp_coupon"
             set "used_count" = coalesce("used_count", 0) + 1,
                 "updated_at" = now()
           where "id" = $1 and "deleted_at" is null
           returning "id";`,
          [appliedCoupon.id]
        )
        if (!couponRows.rows[0]) {
          throw new HttpError(
            HttpError.Types.INVALID_DATA,
            "Coupon is invalid or inactive."
          )
        }
      }

      const responsePayload: CheckoutSuccessPayload = {
        order: createdOrder,
        reservation: consumedReservation,
      }

      if (isTransferPayment && transferProofToken && transferProofExpiresAt) {
        responsePayload.transfer_proof_upload = {
          token: transferProofToken,
          expires_at: transferProofExpiresAt.toISOString(),
        }
      }

      if (mercadoPagoPreference) {
        responsePayload.checkout_pro = {
          provider: "mercadopago",
          preference_id: mercadoPagoPreference.id,
          init_point: mercadoPagoPreference.initPoint,
          sandbox_init_point: mercadoPagoPreference.sandboxInitPoint,
          redirect_url: mercadoPagoPreference.redirectUrl,
          external_reference: mercadoPagoPreference.externalReference,
        }
      }

      if (idempotencyKey) {
        await client.query(
          `update "mp_checkout_idempotency"
             set "status" = 'completed',
                 "response_status" = $3,
                 "response_json" = $4::jsonb,
                 "order_id" = $5,
                 "reservation_id" = $6,
                 "account_id" = $7,
                 "email" = $8,
                 "updated_at" = now()
           where "scope" = $1 and "idempotency_key" = $2;`,
          [
            CHECKOUT_IDEMPOTENCY_SCOPE,
            idempotencyKey,
            201,
            JSON.stringify(responsePayload),
            createdOrder.id,
            reservationId,
            account?.id || null,
            email,
          ]
        )
      }

      return {
        replayed: false as const,
        responseStatus: 201,
        payload: responsePayload,
        createdOrder,
      }
    })

    replayed = txResult.replayed
    replayedResponseStatus = txResult.responseStatus
    payload = txResult.payload
    created = txResult.replayed ? null : txResult.createdOrder
  } catch (error) {
    if (createdReservationInternally && reservationId) {
      await releaseStockReservation(reservationId).catch(() => {
        // best-effort release
      })
    }

    if (error instanceof StockError) {
      return res.status(error.status).json({
        message: error.message,
        code: error.code,
        ...(error.payload ? error.payload : {}),
      })
    }
    throw error
  }

  if (!payload || typeof payload !== "object") {
    throw new HttpError(
      HttpError.Types.UNEXPECTED_STATE,
      "Checkout payload could not be created."
    )
  }

  if (replayed) {
    if (createdReservationInternally && reservationId) {
      await releaseStockReservation(reservationId).catch(() => {
        // best-effort release
      })
    }
    res.setHeader("x-idempotency-replayed", "true")
    return res.status(replayedResponseStatus).json(payload)
  }

  if (account?.id) {
    try {
      await service.updateCustomerAccounts({
        selector: { id: account.id },
        data: {
          first_name: firstName,
          last_name: lastName,
          document_number: documentNumber,
          phone: phone || account.phone || null,
        },
      })
    } catch (error) {
      console.error("[checkout.orders] Failed to update account profile", {
        accountId: account.id,
        error,
      })
    }

    try {
      await upsertCheckoutAddressForAccount({
        req,
        service,
        accountId: account.id,
        firstName,
        lastName,
        phone,
        shippingAddress,
      })
    } catch (error) {
      console.error("[checkout.orders] Failed to upsert checkout address", {
        accountId: account.id,
        error,
      })
    }
  }

  if (created?.id) {
    try {
      publishAdminNotification({
        type: "order.created",
        payload: {
          id: created.id,
          orderNumber: created.order_number,
          totalArs: created.total_ars,
          status: created.status,
          createdAt: created.created_at,
        },
      })
    } catch (error) {
      console.error("[checkout.orders] Failed to publish admin notification", {
        orderId: created.id,
        error,
      })
    }
  }

  if (account?.id) {
    try {
      await replaceServerCartItems(req, account.id, [])
    } catch (error) {
      console.error("[checkout.orders] Failed to clear server cart", {
        accountId: account.id,
        error,
      })
    }
  }

  if (created?.id) {
    try {
      await writeAuditLog(req, {
        accountId: account?.id || null,
        event: "checkout.finalized",
        success: true,
        metadata: {
          order_id: created.id,
          order_number: created.order_number,
          total_ars: total,
          guest: !account?.id,
          created_account_after_purchase: Boolean(body.created_account_after_purchase),
          reservation_id: reservationId,
        },
      })
    } catch (error) {
      console.error("[checkout.orders] Failed to write checkout.finalized audit log", {
        orderId: created.id,
        error,
      })
    }

    if (body.created_account_after_purchase && account?.id) {
      try {
        await writeAuditLog(req, {
          accountId: account.id,
          event: "auth.guest_conversion.completed",
          success: true,
          metadata: {
            order_id: created.id,
          },
        })
      } catch (error) {
        console.error("[checkout.orders] Failed to write guest conversion audit log", {
          orderId: created.id,
          accountId: account.id,
          error,
        })
      }
    }
  }

  return res.status(201).json(payload)
}



