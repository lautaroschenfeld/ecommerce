import path from "path"

import {
  startBackendForIntegrationTests,
  type StartedBackend,
} from "./test-server"

jest.setTimeout(3 * 60 * 1000)

type CookieJar = Map<string, string>

function readSetCookieHeaders(res: Response) {
  const headersAny = res.headers as unknown as {
    getSetCookie?: () => string[]
  }
  if (typeof headersAny.getSetCookie === "function") {
    return headersAny.getSetCookie()
  }

  const raw = res.headers.get("set-cookie")
  if (!raw) return []
  return raw.split(/,(?=[^;,\s]+=[^;,\s]+)/g)
}

function updateCookieJar(jar: CookieJar, res: Response) {
  const setCookies = readSetCookieHeaders(res)

  for (const cookie of setCookies) {
    const first = cookie.split(";")[0]?.trim() || ""
    if (!first || !first.includes("=")) continue

    const idx = first.indexOf("=")
    const name = first.slice(0, idx).trim()
    const value = first.slice(idx + 1).trim()

    if (!value) {
      jar.delete(name)
    } else {
      jar.set(name, value)
    }
  }
}

function cookieHeader(jar: CookieJar) {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ")
}

describe("Auth + checkout e2e (real DB)", () => {
  const backendRoot = path.resolve(__dirname, "../..")
  const jar: CookieJar = new Map()

  let backend: StartedBackend | null = null
  let baseUrl = ""
  let publishableApiKey = ""
  let email = ""
  let password = ""
  let newPassword = ""
  let createdOrderId = ""
  let catalogItem: {
    id: string
    name: string
    brand: string
    category: string
    priceArs: number
    stockAvailable: number
  } | null = null

  beforeAll(async () => {
    backend = await startBackendForIntegrationTests({
      backendRoot,
      extraEnv: {
        ALLOW_DEV_RESET_TOKEN: "true",
      },
    })
    baseUrl = backend.baseUrl
    publishableApiKey = backend.publishableApiKey

    const seed = Math.random().toString(36).slice(2, 8)
    email = `cliente.${seed}@store.test`
    password = "StorePass123"
    newPassword = "StorePass456"

    const productsRes = await fetch(
      `${baseUrl}/store/catalog/products?limit=50&offset=0`,
      {
        headers: {
          "x-publishable-api-key": publishableApiKey,
        },
      }
    )
    if (!productsRes.ok) {
      throw new Error(`Could not load products for tests (${productsRes.status})`)
    }
    const productsJson = (await productsRes.json()) as {
      products?: Array<Record<string, unknown>>
    }
    const products = Array.isArray(productsJson.products)
      ? productsJson.products
      : []
    const first = products.find((entry) => {
      const stockRaw =
        typeof entry?.stockAvailable === "number"
          ? entry.stockAvailable
          : Number(entry?.stockAvailable || 0)
      return Number.isFinite(stockRaw) && stockRaw > 0
    })
    if (!first) {
      throw new Error("No products available in catalog for checkout tests.")
    }

    const brandRec =
      first.brand && typeof first.brand === "object"
        ? (first.brand as Record<string, unknown>)
        : null
    const categoryRec =
      first.category && typeof first.category === "object"
        ? (first.category as Record<string, unknown>)
        : null

    catalogItem = {
      id: String(first.id || ""),
      name: String(first.name || "Producto"),
      brand: String(brandRec?.name || "Marca"),
      category: String(categoryRec?.name || "Categoria"),
      priceArs:
        typeof first.priceArs === "number"
          ? first.priceArs
          : Number(first.priceArs || 0),
      stockAvailable:
        typeof first.stockAvailable === "number"
          ? first.stockAvailable
          : Number(first.stockAvailable || 0),
    }

    if (!catalogItem.id || catalogItem.priceArs <= 0) {
      throw new Error("Catalog product is missing required fields for checkout tests.")
    }
  })

  afterAll(async () => {
    if (backend) {
      await backend.stop().catch(() => {})
      backend = null
    }
  })

  async function postJson(
    pathname: string,
    body: Record<string, unknown>,
    opts?: { auth?: boolean; headers?: Record<string, string> }
  ) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "x-publishable-api-key": publishableApiKey,
    }

    if (opts?.auth && jar.size > 0) {
      headers["cookie"] = cookieHeader(jar)
    }
    if (opts?.headers) {
      for (const [key, value] of Object.entries(opts.headers)) {
        headers[key] = value
      }
    }

    const res = await fetch(`${baseUrl}${pathname}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    updateCookieJar(jar, res)
    return res
  }

  async function getJson(pathname: string, opts?: { auth?: boolean }) {
    const headers: HeadersInit = {
      "x-publishable-api-key": publishableApiKey,
    }
    if (opts?.auth && jar.size > 0) {
      headers["cookie"] = cookieHeader(jar)
    }

    const res = await fetch(`${baseUrl}${pathname}`, { headers })
    updateCookieJar(jar, res)
    return res
  }

  async function putJson(
    pathname: string,
    body: Record<string, unknown>,
    opts?: { auth?: boolean }
  ) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "x-publishable-api-key": publishableApiKey,
    }

    if (opts?.auth && jar.size > 0) {
      headers["cookie"] = cookieHeader(jar)
    }

    const res = await fetch(`${baseUrl}${pathname}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    })

    updateCookieJar(jar, res)
    return res
  }

  test("registers a customer, keeps session and completes checkout", async () => {
    const item = catalogItem
    if (!item) throw new Error("Missing catalog item for test.")

    const registerRes = await postJson("/store/catalog/auth/register", {
      email,
      password,
      first_name: "Cliente",
      last_name: "Prueba",
      phone: "+5491112345678",
      guest_cart_items: [
        {
          id: item.id,
          name: item.name,
          brand: item.brand,
          category: item.category,
          priceArs: item.priceArs,
          qty: 1,
        },
      ],
    })

    expect(registerRes.status).toBe(201)
    expect(jar.size).toBeGreaterThan(0)

    const registerJson = await registerRes.json()
    expect(registerJson.account?.email).toBe(email)
    expect(Array.isArray(registerJson.cart?.items)).toBe(true)
    expect(registerJson.cart.items.length).toBe(1)

    const sessionRes = await getJson("/store/catalog/auth/session", { auth: true })
    expect(sessionRes.status).toBe(200)
    const sessionJson = await sessionRes.json()
    expect(sessionJson.authenticated).toBe(true)
    expect(sessionJson.account?.email).toBe(email)

    const mePatchRes = await fetch(`${baseUrl}/store/catalog/account/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": publishableApiKey,
        cookie: cookieHeader(jar),
      },
      body: JSON.stringify({
        phone: "+5491187654321",
        notifications: {
          email: true,
          whatsapp: true,
        },
      }),
    })
    updateCookieJar(jar, mePatchRes)
    expect(mePatchRes.status).toBe(200)

    const addressRes = await postJson(
      "/store/catalog/account/addresses",
      {
        label: "Casa",
        line1: "Av. Corrientes 1234",
        city: "Buenos Aires",
        province: "CABA",
        postal_code: "C1043",
        is_default: true,
      },
      { auth: true }
    )
    expect(addressRes.status).toBe(201)

    const syncCartRes = await putJson(
      "/store/catalog/cart",
      {
        items: [
          {
            id: item.id,
            name: item.name,
            brand: item.brand,
            category: item.category,
            priceArs: item.priceArs,
            qty: 1,
          },
        ],
      },
      { auth: true }
    )
    expect(syncCartRes.status).toBe(200)

    const checkoutRes = await postJson(
      "/store/catalog/checkout/orders",
      {
        email,
        phone: "+5491187654321",
        first_name: "Cliente",
        last_name: "Prueba",
        document_number: "12345678",
        address_line1: "Av. Corrientes 1234",
        city: "Buenos Aires",
        province: "CABA",
        postal_code: "C1043",
        items: [
          {
            id: item.id,
            name: item.name,
            brand: item.brand,
            category: item.category,
            priceArs: item.priceArs,
            qty: 1,
          },
        ],
        shipping_ars: 3000,
        discount_ars: 0,
        payment_method: "transferencia",
        shipping_method: "moto_express",
      },
      { auth: true }
    )

    expect(checkoutRes.status).toBe(201)
    const checkoutJson = await checkoutRes.json()
    createdOrderId = checkoutJson.order?.id
    expect(createdOrderId).toBeTruthy()
    expect(checkoutJson.order?.account_id).toBeTruthy()
    expect(checkoutJson.order?.currency_code).toBe("ars")

    const ordersRes = await getJson("/store/catalog/account/orders", { auth: true })
    expect(ordersRes.status).toBe(200)
    const ordersJson = await ordersRes.json()
    expect(Array.isArray(ordersJson.orders)).toBe(true)
    expect(ordersJson.orders.some((order: { id: string }) => order.id === createdOrderId)).toBe(
      true
    )

    const cartRes = await getJson("/store/catalog/cart", { auth: true })
    expect(cartRes.status).toBe(200)
    const cartJson = await cartRes.json()
    expect(Array.isArray(cartJson.cart?.items)).toBe(true)
    expect(cartJson.cart.items).toHaveLength(0)
  })

  test("returns out-of-stock on reservation when quantity is above availability", async () => {
    const item = catalogItem
    if (!item) throw new Error("Missing catalog item for test.")

    const requestedQty = Math.max(1, Math.trunc(item.stockAvailable || 0) + 999)
    const reserveRes = await postJson("/store/catalog/checkout/reservations", {
      email,
      items: [
        {
          id: item.id,
          name: item.name,
          brand: item.brand,
          category: item.category,
          priceArs: item.priceArs,
          qty: requestedQty,
        },
      ],
    })

    expect(reserveRes.status).toBe(409)
    const reserveJson = await reserveRes.json()
    expect(reserveJson.code).toBe("STOCK_OUT_OF_STOCK")
    expect(Array.isArray(reserveJson.items)).toBe(true)
  })

  test("validates a coupon and computes discount", async () => {
    const res = await postJson("/store/catalog/coupons/validate", {
      code: "MOTO15",
      subtotal_ars: 100000,
    })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.valid).toBe(true)
    expect(json.coupon?.code).toBe("MOTO15")
    expect(json.discount_ars).toBe(15000)
  })

  test("supports forgot/reset password and blocks old credentials", async () => {
    const forgotRes = await postJson("/store/catalog/auth/forgot-password", { email })
    expect(forgotRes.status).toBe(200)
    const forgotJson = await forgotRes.json()
    expect(typeof forgotJson.dev_reset_token).toBe("string")
    expect(forgotJson.dev_reset_token.length).toBeGreaterThan(20)

    const resetRes = await postJson("/store/catalog/auth/reset-password", {
      token: forgotJson.dev_reset_token,
      password: newPassword,
    })
    expect(resetRes.status).toBe(200)

    const oldLoginRes = await postJson("/store/catalog/auth/login", {
      email,
      password,
    })
    expect(oldLoginRes.status).toBe(401)

    const newLoginRes = await postJson("/store/catalog/auth/login", {
      email,
      password: newPassword,
    })
    expect(newLoginRes.status).toBe(200)
  })

  test("logs out and invalidates session", async () => {
    const logoutRes = await postJson(
      "/store/catalog/auth/logout",
      {},
      {
        auth: true,
      }
    )
    expect(logoutRes.status).toBe(200)

    const sessionRes = await getJson("/store/catalog/auth/session", { auth: true })
    expect(sessionRes.status).toBe(401)
    const sessionJson = await sessionRes.json()
    expect(sessionJson.authenticated).toBe(false)
  })

  test("allows guest checkout without account", async () => {
    const item = catalogItem
    if (!item) throw new Error("Missing catalog item for test.")

    const guestEmail = `guest.${Math.random().toString(36).slice(2, 8)}@store.test`
    const res = await postJson("/store/catalog/checkout/orders", {
      email: guestEmail,
      first_name: "Invitado",
      last_name: "Checkout",
      document_number: "23456789",
      address_line1: "Calle Falsa 123",
      city: "Buenos Aires",
      province: "CABA",
      postal_code: "C1043",
      items: [
        {
          id: item.id,
          name: item.name,
          brand: item.brand,
          category: item.category,
          priceArs: item.priceArs,
          qty: 1,
        },
      ],
      shipping_ars: 0,
      coupon_code: "MOTO15",
      payment_method: "efectivo",
      shipping_method: "retiro",
    })

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.order?.account_id).toBeNull()
    expect(json.order?.email).toBe(guestEmail)
    expect(json.order?.metadata?.coupon?.code).toBe("MOTO15")
  })

  test("replays checkout response with idempotency key and avoids duplicate orders", async () => {
    const item = catalogItem
    if (!item) throw new Error("Missing catalog item for test.")

    const guestEmail = `idem.${Math.random().toString(36).slice(2, 8)}@store.test`
    const reserveRes = await postJson("/store/catalog/checkout/reservations", {
      email: guestEmail,
      items: [
        {
          id: item.id,
          name: item.name,
          brand: item.brand,
          category: item.category,
          priceArs: item.priceArs,
          qty: 1,
        },
      ],
    })
    expect(reserveRes.status).toBe(201)
    const reserveJson = await reserveRes.json()
    const reservationId = String(reserveJson.reservation?.id || "")
    expect(reservationId).toBeTruthy()

    const idemKey = `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const checkoutBody = {
      reservation_id: reservationId,
      email: guestEmail,
      first_name: "Idem",
      last_name: "Retry",
      document_number: "33444555",
      address_line1: "Calle Idempotencia 42",
      city: "Buenos Aires",
      province: "CABA",
      postal_code: "C1043",
      items: [
        {
          id: item.id,
          name: item.name,
          brand: item.brand,
          category: item.category,
          priceArs: item.priceArs,
          qty: 1,
        },
      ],
      payment_method: "efectivo",
      shipping_method: "retiro",
    }

    const firstRes = await postJson("/store/catalog/checkout/orders", checkoutBody, {
      headers: { "idempotency-key": idemKey },
    })
    expect(firstRes.status).toBe(201)
    const firstJson = await firstRes.json()
    const firstOrderId = String(firstJson.order?.id || "")
    expect(firstOrderId).toBeTruthy()

    const secondRes = await postJson("/store/catalog/checkout/orders", checkoutBody, {
      headers: { "idempotency-key": idemKey },
    })
    expect(secondRes.status).toBe(201)
    expect(secondRes.headers.get("x-idempotency-replayed")).toBe("true")
    const secondJson = await secondRes.json()
    expect(String(secondJson.order?.id || "")).toBe(firstOrderId)
    expect(String(secondJson.reservation?.id || "")).toBe(reservationId)

    const mismatchRes = await postJson(
      "/store/catalog/checkout/orders",
      {
        ...checkoutBody,
        phone: "+5491112345678",
      },
      {
        headers: { "idempotency-key": idemKey },
      }
    )
    expect(mismatchRes.status).toBe(409)
    const mismatchJson = await mismatchRes.json()
    expect(mismatchJson.code).toBe("CHECKOUT_IDEMPOTENCY_KEY_REUSED")
  })
})
