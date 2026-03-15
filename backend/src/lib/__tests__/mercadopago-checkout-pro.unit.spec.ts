import crypto from "crypto"

import {
  isMercadoPagoCheckoutMethod,
  mapMercadoPagoPaymentStatus,
  verifyMercadoPagoWebhookSignature,
} from "../mercadopago-checkout-pro"

describe("mercadopago-checkout-pro helpers", () => {
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
})
