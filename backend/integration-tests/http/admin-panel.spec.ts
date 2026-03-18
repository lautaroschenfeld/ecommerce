import path from "path"

import { getCustomerAuthPgService } from "../../src/lib/customer-auth-pg-service"
import { pgQuery } from "../../src/lib/pg"
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

const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAOElEQVR4nO3VsQkAMQwEwe2/6fsSHDgwPDOgXCDpVAAHq91Ut6aBjCBLOGc4QZQozjPas3cM/N4H4RD+EPYb8QEAAAAASUVORK5CYII="

describe("Admin panel endpoints (real DB)", () => {
  const backendRoot = path.resolve(__dirname, "../..")
  const origin = "http://localhost:3000"

  const service = getCustomerAuthPgService() as any

  let backend: StartedBackend | null = null
  let publishableApiKey = ""
  let baseUrl = ""

  let categoryName = ""
  let admin: { jar: CookieJar; id: string; email: string } | null = null
  let employee: { jar: CookieJar; id: string; email: string } | null = null
  let user: { jar: CookieJar; id: string; email: string } | null = null

  let createdProductId = ""
  let createdProductName = ""
  let createdOrderId = ""
  let createdCouponId = ""

  let originalStorefront: any = null
  let originalShipping: any = null

  beforeAll(async () => {
    backend = await startBackendForIntegrationTests({ backendRoot })
    baseUrl = backend.baseUrl
    publishableApiKey = backend.publishableApiKey

    const categoriesRes = await fetch(`${baseUrl}/store/catalog/categories`, {
      headers: {
        "x-publishable-api-key": publishableApiKey,
      },
    })
    expect(categoriesRes.status).toBe(200)
    const categoriesJson = await categoriesRes.json()
    const categories = Array.isArray(categoriesJson.categories)
      ? categoriesJson.categories
      : []
    categoryName = String(categories[0]?.name || "").trim()
    expect(categoryName).toBeTruthy()

    const seed = Math.random().toString(36).slice(2, 8)
    const password = "AdminPass123"

    const makeAccount = async (role: "administrator" | "employee" | "user") => {
      const jar: CookieJar = new Map()
      const email = `${role}.${seed}.${Math.random().toString(36).slice(2, 6)}@store.test`

      const registerRes = await fetch(`${baseUrl}/store/catalog/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": publishableApiKey,
          origin,
        },
        body: JSON.stringify({
          email,
          password,
          first_name: role === "user" ? "User" : "Admin",
          last_name: "Test",
          phone: "+5491112345678",
          guest_cart_items: [],
        }),
      })

      updateCookieJar(jar, registerRes)
      expect(registerRes.status).toBe(201)
      const registerJson = await registerRes.json()
      const id = String(registerJson.account?.id || "")
      expect(id).toBeTruthy()

      if (role !== "user") {
        await service.updateCustomerAccounts({
          selector: { id },
          data: { role },
        })
      }

      return { jar, id, email }
    }

    admin = await makeAccount("administrator")
    employee = await makeAccount("employee")
    user = await makeAccount("user")
  })

  afterAll(async () => {
    if (admin?.jar && createdProductId) {
      await fetch(`${baseUrl}/store/catalog/account/admin/products/${createdProductId}`, {
        method: "DELETE",
        headers: {
          "x-publishable-api-key": publishableApiKey,
          cookie: cookieHeader(admin.jar),
        },
      }).catch(() => {})
    }

    if (admin?.jar && createdCouponId) {
      await fetch(`${baseUrl}/store/catalog/account/admin/coupons/${createdCouponId}`, {
        method: "DELETE",
        headers: {
          "x-publishable-api-key": publishableApiKey,
          cookie: cookieHeader(admin.jar),
        },
      }).catch(() => {})
    }

    if (admin?.jar && originalStorefront) {
      await fetch(`${baseUrl}/store/catalog/account/admin/settings/storefront`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": publishableApiKey,
          cookie: cookieHeader(admin.jar),
        },
        body: JSON.stringify(originalStorefront),
      }).catch(() => {})
    }

    if (admin?.jar && originalShipping) {
      await fetch(`${baseUrl}/store/catalog/account/admin/settings/shipping`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-publishable-api-key": publishableApiKey,
          cookie: cookieHeader(admin.jar),
        },
        body: JSON.stringify(originalShipping),
      }).catch(() => {})
    }

    if (backend) {
      await backend.stop().catch(() => {})
      backend = null
    }
  })

  async function getJson(pathname: string, jar?: CookieJar) {
    const headers: HeadersInit = {
      "x-publishable-api-key": publishableApiKey,
      origin,
    }
    if (jar && jar.size > 0) {
      headers["cookie"] = cookieHeader(jar)
    }

    const res = await fetch(`${baseUrl}${pathname}`, { headers })
    if (jar) updateCookieJar(jar, res)
    return res
  }

  async function postJson(pathname: string, body: Record<string, unknown>, jar?: CookieJar) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "x-publishable-api-key": publishableApiKey,
      origin,
    }
    if (jar && jar.size > 0) {
      headers["cookie"] = cookieHeader(jar)
    }

    const res = await fetch(`${baseUrl}${pathname}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    if (jar) updateCookieJar(jar, res)
    return res
  }

  async function patchJson(pathname: string, body: Record<string, unknown>, jar?: CookieJar) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "x-publishable-api-key": publishableApiKey,
      origin,
    }
    if (jar && jar.size > 0) {
      headers["cookie"] = cookieHeader(jar)
    }

    const res = await fetch(`${baseUrl}${pathname}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    })
    if (jar) updateCookieJar(jar, res)
    return res
  }

  async function putJson(pathname: string, body: Record<string, unknown>, jar?: CookieJar) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "x-publishable-api-key": publishableApiKey,
      origin,
    }
    if (jar && jar.size > 0) {
      headers["cookie"] = cookieHeader(jar)
    }

    const res = await fetch(`${baseUrl}${pathname}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    })
    if (jar) updateCookieJar(jar, res)
    return res
  }

  test("admin endpoints return 401 without auth (and include CORS headers)", async () => {
    const res = await fetch(`${baseUrl}/store/catalog/account/admin/orders?limit=1`, {
      headers: {
        "x-publishable-api-key": publishableApiKey,
        origin,
      },
    })

    expect(res.status).toBe(401)
    expect(res.headers.get("access-control-allow-origin")).toBe(origin)
    const json = await res.json()
    expect(String(json.message || "")).toContain("Not authenticated")
  })

  test("user role cannot access admin endpoints", async () => {
    if (!user) throw new Error("Missing user account")
    const res = await getJson("/store/catalog/account/admin/products", user.jar)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(String(json.message || "")).toContain("Admin role required")
  })

  test("employee role cannot access admin endpoints", async () => {
    if (!employee) throw new Error("Missing employee account")

    const productsRes = await getJson("/store/catalog/account/admin/products", employee.jar)
    expect(productsRes.status).toBe(401)
    const productsJson = await productsRes.json()
    expect(String(productsJson.message || "")).toContain("Admin role required")

    const accountsRes = await getJson("/store/catalog/account/admin/accounts", employee.jar)
    expect(accountsRes.status).toBe(401)
    const accountsJson = await accountsRes.json()
    expect(String(accountsJson.message || "")).toContain("Administrator role required")
  })

  test("admin product CRUD + inventory + orders + coupons + settings + uploads + accounts", async () => {
    if (!admin) throw new Error("Missing admin account")

    // Products list
    {
      const res = await getJson("/store/catalog/account/admin/products", admin.jar)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(Array.isArray(json.products)).toBe(true)
      expect(typeof json.count).toBe("number")
    }

    // Create product (title sorted early so it appears in inventory limit=100)
    {
      const seed = Math.random().toString(36).slice(2, 7).toUpperCase()
      createdProductName = `AAA Admin Test ${seed}`
      const sku = `ADM-${seed}`

      const res = await postJson(
        "/store/catalog/account/admin/products",
        {
          name: createdProductName,
          brand: `Marca ${seed}`,
          category: categoryName,
          priceArs: 12345,
          stockAvailable: 12,
          sku,
          metadata: { condition: "nuevo", color: "rojo" },
          active: true,
        },
        admin.jar
      )

      expect(res.status).toBe(201)
      const json = await res.json()
      createdProductId = String(json.product?.id || "")
      expect(createdProductId).toBeTruthy()
    }

    // Get and patch product
    {
      const getRes = await getJson(
        `/store/catalog/account/admin/products/${encodeURIComponent(createdProductId)}`,
        admin.jar
      )
      expect(getRes.status).toBe(200)
      const getJsonBody = await getRes.json()
      expect(getJsonBody.product?.id).toBe(createdProductId)
      expect(getJsonBody.product?.name).toBe(createdProductName)

      const patchRes = await patchJson(
        `/store/catalog/account/admin/products/${encodeURIComponent(createdProductId)}`,
        {
          priceArs: 22222,
          stockAvailable: 7,
          name: `${createdProductName} (edit)`,
        },
        admin.jar
      )
      expect(patchRes.status).toBe(200)

      const confirmRes = await getJson(
        `/store/catalog/account/admin/products/${encodeURIComponent(createdProductId)}`,
        admin.jar
      )
      expect(confirmRes.status).toBe(200)
      const confirmJson = await confirmRes.json()
      expect(confirmJson.product?.priceArs).toBe(22222)
      expect(confirmJson.product?.stockAvailable).toBe(7)
      expect(String(confirmJson.product?.name || "")).toContain("(edit)")
    }

    // Inventory includes product and stock
    {
      const res = await getJson("/store/catalog/account/admin/inventory?limit=100", admin.jar)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(Array.isArray(json.inventory)).toBe(true)
      expect(Number(json.count || 0)).toBeGreaterThan(0)
      expect(Number(json.summary?.totalProducts || 0)).toBeGreaterThan(0)
      const entry = (json.inventory as any[]).find((row) => row?.id === createdProductId)
      expect(entry).toBeTruthy()
      expect(entry.availableQty).toBe(7)

      const filteredRes = await getJson(
        `/store/catalog/account/admin/inventory?q=${encodeURIComponent(createdProductId)}&limit=20&offset=0`,
        admin.jar
      )
      expect(filteredRes.status).toBe(200)
      const filteredJson = await filteredRes.json()
      expect(Array.isArray(filteredJson.inventory)).toBe(true)
      expect(Number(filteredJson.limit || 0)).toBe(20)
      expect(Number(filteredJson.offset || 0)).toBe(0)
      expect((filteredJson.inventory as any[]).some((row) => row?.id === createdProductId)).toBe(true)
    }

    // Create a guest order for the product, then list orders in admin panel
    {
      const orderRes = await postJson("/store/catalog/checkout/orders", {
        email: `guest.${Math.random().toString(36).slice(2, 8)}@store.test`,
        first_name: "Invitado",
        last_name: "AdminSpec",
        document_number: "22334455",
        address_line1: "Av. Siempre Viva 742",
        address_number: "742",
        city: "Buenos Aires",
        province: "CABA",
        postal_code: "C1043",
        items: [
          {
            id: createdProductId,
            name: createdProductName,
            brand: "N/A",
            category: categoryName,
            priceArs: 22222,
            qty: 1,
          },
        ],
        payment_method: "transferencia",
        shipping_method: "standard",
      })
      expect(orderRes.status).toBe(201)
      const orderJson = await orderRes.json()
      createdOrderId = String(orderJson.order?.id || "")
      expect(createdOrderId).toBeTruthy()

      const listRes = await getJson("/store/catalog/account/admin/orders?limit=50", admin.jar)
      expect(listRes.status).toBe(200)
      const listJson = await listRes.json()
      expect(Array.isArray(listJson.orders)).toBe(true)
      expect(listJson.orders.some((o: any) => o?.id === createdOrderId)).toBe(true)

      const refundRes = await patchJson(
        `/store/catalog/account/admin/orders/${encodeURIComponent(createdOrderId)}`,
        { payment_status: "refunded" },
        admin.jar
      )
      expect(refundRes.status).toBe(200)
      const refundJson = await refundRes.json()
      expect(refundJson.order?.payment_status).toBe("refunded")

      const refundedListRes = await getJson(
        "/store/catalog/account/admin/orders?limit=50&payment_status=refunded",
        admin.jar
      )
      expect(refundedListRes.status).toBe(200)
      const refundedListJson = await refundedListRes.json()
      expect(Array.isArray(refundedListJson.orders)).toBe(true)
      expect(refundedListJson.orders.some((o: any) => o?.id === createdOrderId)).toBe(true)
      expect(
        refundedListJson.orders.every(
          (o: any) => String(o?.payment_status || "").trim().toLowerCase() === "refunded"
        )
      ).toBe(true)

      const movementsRes = await getJson(
        "/store/catalog/account/admin/inventory/movements?limit=5&offset=0",
        admin.jar
      )
      expect(movementsRes.status).toBe(200)
      const movementsJson = await movementsRes.json()
      expect(Array.isArray(movementsJson.movements)).toBe(true)
      expect(Number(movementsJson.count || 0)).toBeGreaterThan(0)
      expect(Number(movementsJson.limit || 0)).toBe(5)
      expect(Number(movementsJson.offset || 0)).toBe(0)
      expect(
        movementsJson.movements.some(
          (movement: any) =>
            String(movement?.productId || "").trim() === createdProductId &&
            ["reserve", "exit", "release"].includes(
              String(movement?.movement || "").trim().toLowerCase()
            )
        )
      ).toBe(true)
    }

    // Coupons CRUD
    {
      const code = `TEST${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const createRes = await postJson(
        "/store/catalog/account/admin/coupons",
        { code, title: `Cupon ${code}`, percentage: 12.5, active: true },
        admin.jar
      )
      expect(createRes.status).toBe(201)
      const created = await createRes.json()
      createdCouponId = String(created.coupon?.id || "")
      expect(createdCouponId).toBeTruthy()
      expect(created.coupon?.code).toBe(code)

      const getRes = await getJson(
        `/store/catalog/account/admin/coupons/${encodeURIComponent(createdCouponId)}`,
        admin.jar
      )
      expect(getRes.status).toBe(200)

      const patchRes = await patchJson(
        `/store/catalog/account/admin/coupons/${encodeURIComponent(createdCouponId)}`,
        { title: `Cupon ${code} (edit)`, active: false },
        admin.jar
      )
      expect(patchRes.status).toBe(200)

      const listRes = await getJson("/store/catalog/account/admin/coupons?limit=1&offset=0", admin.jar)
      expect(listRes.status).toBe(200)
      const listJson = await listRes.json()
      expect(Array.isArray(listJson.coupons)).toBe(true)
      expect(listJson.coupons.length).toBeLessThanOrEqual(1)
      expect(Number(listJson.count || 0)).toBeGreaterThan(0)
      expect(Number(listJson.limit || 0)).toBe(1)
      expect(Number(listJson.offset || 0)).toBe(0)
    }

    // Settings storefront + shipping (save originals, patch, restore happens in afterAll)
    {
      const storefrontRes = await getJson(
        "/store/catalog/account/admin/settings/storefront",
        admin.jar
      )
      expect(storefrontRes.status).toBe(200)
      const storefrontJson = await storefrontRes.json()
      originalStorefront = storefrontJson.storefront
      const storefrontName = String(originalStorefront?.store_name || "").trim()
      const storefrontLogo = String(originalStorefront?.logo_url || "").trim()
      expect(Boolean(storefrontName || storefrontLogo)).toBe(true)

      const shippingRes = await getJson(
        "/store/catalog/account/admin/settings/shipping",
        admin.jar
      )
      expect(shippingRes.status).toBe(200)
      const shippingJson = await shippingRes.json()
      originalShipping = shippingJson.shipping
      expect(typeof originalShipping?.free_shipping_threshold_ars).toBe("number")

      const nextName = `Ecommerce ${Math.random().toString(36).slice(2, 6)}`
      const patchStorefrontRes = await patchJson(
        "/store/catalog/account/admin/settings/storefront",
        { store_name: nextName, theme_mode: "dark", radius_scale: 0.5 },
        admin.jar
      )
      expect(patchStorefrontRes.status).toBe(200)
      const patchedStorefront = await patchStorefrontRes.json()
      expect(patchedStorefront.storefront?.store_name).toBe(nextName)
      expect(patchedStorefront.storefront?.theme_mode).toBe("dark")
      expect(patchedStorefront.storefront?.radius_scale).toBe(0.5)

      const patchShippingRes = await patchJson(
        "/store/catalog/account/admin/settings/shipping",
        { free_shipping_threshold_ars: 77777 },
        admin.jar
      )
      expect(patchShippingRes.status).toBe(200)
      const patchedShipping = await patchShippingRes.json()
      expect(patchedShipping.shipping?.free_shipping_threshold_ars).toBe(77777)
    }

    // Uploads (multipart) + static fetch
    {
      const pngBuffer = Buffer.from(TEST_PNG_BASE64, "base64")
      const form = new FormData()
      form.append("files", new Blob([pngBuffer], { type: "image/png" }), "admin-upload.png")

      const res = await fetch(`${baseUrl}/store/catalog/account/admin/uploads`, {
        method: "POST",
        headers: {
          "x-publishable-api-key": publishableApiKey,
          origin,
          cookie: cookieHeader(admin.jar),
        },
        body: form,
      })
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(Array.isArray(json.files)).toBe(true)
      expect(json.files.length).toBeGreaterThan(0)
      const first = json.files[0]
      expect(typeof first?.url).toBe("string")

      const fileRes = await fetch(String(first.url), {
        headers: {
          origin,
        },
      })
      expect(fileRes.status).toBe(200)
      expect(fileRes.headers.get("content-type") || "").toContain("image/webp")
    }

    // Accounts list (admin-only) and role patch
    {
      const accountsRes = await getJson("/store/catalog/account/admin/accounts", admin.jar)
      expect(accountsRes.status).toBe(200)
      const accountsJson = await accountsRes.json()
      expect(Array.isArray(accountsJson.accounts)).toBe(true)

      // Promote a user to employee via admin endpoint.
      const userAccount = (accountsJson.accounts as any[]).find((acc) => acc?.id === user?.id)
      expect(userAccount).toBeTruthy()

      const promoteRes = await patchJson(
        `/store/catalog/account/admin/accounts/${encodeURIComponent(String(user?.id))}/role`,
        { role: "employee" },
        admin.jar
      )
      expect(promoteRes.status).toBe(200)
      const promoteJson = await promoteRes.json()
      expect(promoteJson.account?.role).toBe("employee")
    }
  })

  test("summary funnel cart prioritizes add_to_cart over cart.synced", async () => {
    if (!admin) throw new Error("Missing admin account")
    if (!user) throw new Error("Missing user account")

    await pgQuery(
      `delete from "mp_auth_audit_log"
       where "created_at" >= date_trunc('day', now())
         and "event" = any($1::text[]);`,
      [["telemetry.add_to_cart", "cart.synced", "telemetry.begin_checkout", "telemetry.cart_view"]]
    )

    const baselineSummaryRes = await getJson(
      "/store/catalog/account/admin/summary?r=today",
      admin.jar
    )
    expect(baselineSummaryRes.status).toBe(200)
    const baselineSummary = await baselineSummaryRes.json()
    const baselineCart = Number(baselineSummary.funnel?.cart?.value || 0)

    const productsRes = await getJson("/store/catalog/products?limit=1")
    expect(productsRes.status).toBe(200)
    const productsJson = await productsRes.json()
    const product = Array.isArray(productsJson.products)
      ? productsJson.products[0]
      : null
    expect(product).toBeTruthy()

    const telemetryRes = await postJson(
      "/store/catalog/telemetry/events",
      {
        event: "add_to_cart",
        metadata: {
          source: "integration_test",
          product_id: String(product.id || ""),
        },
      },
      user.jar
    )
    expect(telemetryRes.status).toBe(202)

    const syncRes = await putJson(
      "/store/catalog/cart",
      {
        items: [
          {
            id: String(product.id || ""),
            name: String(product.name || "Producto"),
            brand: String(product.brand || "Marca"),
            category: String(product.category || "Accesorios"),
            priceArs: Number(product.priceArs || 1),
            qty: 1,
            imageUrl:
              typeof product.imageUrl === "string" ? product.imageUrl : undefined,
          },
        ],
      },
      user.jar
    )
    expect(syncRes.status).toBe(200)

    const summaryRes = await getJson("/store/catalog/account/admin/summary?r=today", admin.jar)
    expect(summaryRes.status).toBe(200)
    const summaryJson = await summaryRes.json()
    const nextCart = Number(summaryJson.funnel?.cart?.value || 0)

    expect(nextCart - baselineCart).toBe(1)
  })
})
