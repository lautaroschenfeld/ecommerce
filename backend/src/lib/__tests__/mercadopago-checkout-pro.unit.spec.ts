import crypto from "crypto"

import {
  createMercadoPagoCheckoutProPreference,
  isMercadoPagoCheckoutMethod,
  mapMercadoPagoPaymentStatus,
  verifyMercadoPagoWebhookSignature,
} from "../mercadopago-checkout-pro"

describe("mercadopago-checkout-pro helpers", () => {
  const envBackup = { ...process.env }
  const originalFetch = global.fetch

  afterEach(() => {
    process.env = { ...envBackup }
    global.fetch = originalFetch
  })

  test("detects mercadopago checkout method aliases", () => {
    expect(isMercadoPagoCheckoutMethod("mercadopago")).toBe(true)
    expect(isMercadoPagoCheckoutMethod("Mercado Pago")).toBe(true)
    expect(isMercadoPagoCheckoutMethod("mp")).toBe(true)
    expect(isMercadoPagoCheckoutMethod("transfer")).toBe(false)
  })

  test("maps Mercado Pago payment statuses to internal status groups", () => {
    expect(mapMercadoPagoPaymentStatus("approved")).toBe("paid")
    expect(mapMercadoPagoPaymentStatus("accredited")).toBe("paid")
    expect(mapMercadoPagoPaymentStatus("pending")).toBe("pending")
    expect(mapMercadoPagoPaymentStatus("in_process")).toBe("pending")
    expect(mapMercadoPagoPaymentStatus("rejected")).toBe("failed")
    expect(mapMercadoPagoPaymentStatus("cancelled")).toBe("failed")
    expect(mapMercadoPagoPaymentStatus("refunded")).toBe("refunded")
    expect(mapMercadoPagoPaymentStatus("charged_back")).toBe("refunded")
  })

  test("validates webhook signature manifest", () => {
    const secret = "test-secret"
    const dataId = "123456789"
    const requestId = "req-abc-001"
    const ts = "1731600000"
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const digest = crypto.createHmac("sha256", secret).update(manifest).digest("hex")

    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        dataId,
        requestId,
        signatureHeader: `ts=${ts},v1=${digest}`,
      })
    ).toBe(true)

    expect(
      verifyMercadoPagoWebhookSignature({
        secret,
        dataId,
        requestId,
        signatureHeader: `ts=${ts},v1=deadbeef`,
      })
    ).toBe(false)
  })

  test("uses BACKEND_PUBLIC_URL (with /api) to build notification_url", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-123"
    process.env.STOREFRONT_URL = "https://www.frmotos.com"
    process.env.BACKEND_PUBLIC_URL = "https://www.frmotos.com/api"

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "pref_123",
        init_point: "https://www.mercadopago.com/init",
        sandbox_init_point: "https://sandbox.mercadopago.com/init",
      }),
    })
    global.fetch = fetchMock as any

    await createMercadoPagoCheckoutProPreference({
      orderId: "cord_123",
      orderNumber: "O-123",
      email: "buyer@example.com",
      items: [
        {
          id: "prod_1",
          name: "Producto test",
          brand: "Marca test",
          qty: 1,
          priceArs: 1000,
        },
      ],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.mercadopago.com/checkout/preferences")
    const body = JSON.parse(String(options?.body || "{}"))
    expect(body.notification_url).toBe("https://www.frmotos.com/api/webhooks/mercadopago")
  })
})
