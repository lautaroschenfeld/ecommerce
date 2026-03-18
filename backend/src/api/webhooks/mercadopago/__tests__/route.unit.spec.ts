import { publishAdminNotification } from "../../../../lib/admin-notifications"
import {
  getMercadoPagoMerchantOrderById,
  getMercadoPagoPaymentById,
  getMercadoPagoWebhookSecret,
} from "../../../../lib/mercadopago-checkout-pro"
import crypto from "crypto"
import { getCustomerAuthService } from "../../../store/catalog/_shared/customer-auth"
import { POST } from "../route"

jest.mock("../../../../lib/admin-notifications", () => ({
  publishAdminNotification: jest.fn(),
}))

jest.mock("../../../../lib/id", () => ({
  nanoId: jest.fn(() => "evt_test_001"),
}))

jest.mock("../../../../lib/mercadopago-checkout-pro", () => ({
  getMercadoPagoMerchantOrderById: jest.fn(),
  getMercadoPagoPaymentById: jest.fn(),
  getMercadoPagoWebhookSecret: jest.fn(),
  mapMercadoPagoPaymentStatus: jest.requireActual("../../../../lib/mercadopago-checkout-pro")
    .mapMercadoPagoPaymentStatus,
  verifyMercadoPagoWebhookSignature: jest.requireActual(
    "../../../../lib/mercadopago-checkout-pro"
  ).verifyMercadoPagoWebhookSignature,
}))

jest.mock("../../../store/catalog/_shared/customer-auth", () => ({
  getCustomerAuthService: jest.fn(),
  normalizeText: (value: unknown, max = 240) => {
    if (typeof value !== "string") return ""
    return value.trim().slice(0, max)
  },
}))

function reqMock(input: {
  query?: Record<string, unknown>
  headers?: Record<string, unknown>
  body?: Record<string, unknown>
}) {
  return {
    query: input.query ?? {},
    headers: input.headers ?? {},
    body: input.body ?? {},
  } as any
}

function resMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as any
}

describe("webhooks/mercadopago POST", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getMercadoPagoWebhookSecret as jest.Mock).mockReturnValue("")
    delete process.env.MERCADOPAGO_ALLOW_UNSIGNED_WEBHOOKS
  })

  test("ignores unsupported notification types without calling Mercado Pago APIs", async () => {
    const req = reqMock({
      query: {
        type: "point_integration",
        id: "sub_123",
      },
    })
    const res = resMock()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true, ignored: "unsupported_type" })
    expect(getMercadoPagoMerchantOrderById).not.toHaveBeenCalled()
    expect(getMercadoPagoPaymentById).not.toHaveBeenCalled()
  })

  test("prioritizes merchant_order payments by status before fetching payment details", async () => {
    const service = {
      listCustomerOrders: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "cord_test_001",
            order_number: "O-1001",
            status: "processing",
            payment_status: "pending",
            metadata: {},
          },
        ]),
      updateCustomerOrders: jest.fn().mockResolvedValue(undefined),
    }
    ;(getCustomerAuthService as jest.Mock).mockReturnValue(service)

    ;(getMercadoPagoMerchantOrderById as jest.Mock).mockResolvedValue({
      id: "mo_1",
      status: "opened",
      externalReference: "cord_test_001",
      payments: [
        { id: "pay_rejected", status: "rejected", statusDetail: "cc_rejected_other_reason" },
        { id: "pay_pending", status: "pending", statusDetail: "pending_waiting_transfer" },
      ],
    })

    ;(getMercadoPagoPaymentById as jest.Mock).mockResolvedValue({
      id: "pay_pending",
      status: "approved",
      statusDetail: "accredited",
      externalReference: "cord_test_001",
      merchantOrderId: "mo_1",
      amount: 120000,
      currencyId: "ARS",
      metadata: {},
    })

    const req = reqMock({
      query: {
        type: "merchant_order",
        id: "mo_1",
      },
    })
    const res = resMock()

    await POST(req, res)

    expect(getMercadoPagoPaymentById).toHaveBeenCalledWith("pay_pending")
    expect(service.updateCustomerOrders).toHaveBeenCalledWith({
      selector: { id: "cord_test_001" },
      data: expect.objectContaining({
        payment_status: "paid",
        status: "preparing",
      }),
    })
    expect(publishAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "order.payment.changed",
      })
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      order_id: "cord_test_001",
      payment_status: "paid",
      provider: "mercadopago",
    })
  })

  test("requires webhook secret in production unless unsigned webhooks are explicitly allowed", async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    delete process.env.MERCADOPAGO_ALLOW_UNSIGNED_WEBHOOKS

    try {
      const req = reqMock({
        query: {
          type: "payment",
          id: "12345",
        },
      })
      const res = resMock()

      await POST(req, res)

      expect(res.status).toHaveBeenCalledWith(503)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("MERCADOPAGO_WEBHOOK_SECRET"),
        })
      )
      expect(getMercadoPagoPaymentById).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = previousNodeEnv
    }
  })

  test("rejects webhook when signature is invalid", async () => {
    ;(getMercadoPagoWebhookSecret as jest.Mock).mockReturnValue("test-secret")

    const req = reqMock({
      query: {
        type: "payment",
        id: "12345",
      },
      headers: {
        "x-request-id": "req-test-invalid-1",
        "x-signature": "ts=1731600000,v1=deadbeef",
      },
    })
    const res = resMock()

    await POST(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid Mercado Pago webhook signature.",
    })
    expect(getMercadoPagoPaymentById).not.toHaveBeenCalled()
  })

  test("accepts signed payment webhooks and updates payment status", async () => {
    ;(getMercadoPagoWebhookSecret as jest.Mock).mockReturnValue("test-secret")
    const service = {
      listCustomerOrders: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: "cord_test_002",
            order_number: "O-2001",
            status: "processing",
            payment_status: "pending",
            metadata: {},
          },
        ]),
      updateCustomerOrders: jest.fn().mockResolvedValue(undefined),
    }
    ;(getCustomerAuthService as jest.Mock).mockReturnValue(service)

    ;(getMercadoPagoPaymentById as jest.Mock).mockResolvedValue({
      id: "pay_approved_1",
      status: "approved",
      statusDetail: "accredited",
      externalReference: "cord_test_002",
      merchantOrderId: "mo_2",
      amount: 50000,
      currencyId: "ARS",
      metadata: {},
    })

    const dataId = "pay_approved_1"
    const requestId = "req-test-valid-1"
    const ts = "1731600000"
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const digest = crypto.createHmac("sha256", "test-secret").update(manifest).digest("hex")

    const req = reqMock({
      query: {
        type: "payment",
        id: dataId,
      },
      headers: {
        "x-request-id": requestId,
        "x-signature": `ts=${ts},v1=${digest}`,
      },
    })
    const res = resMock()

    await POST(req, res)

    expect(getMercadoPagoPaymentById).toHaveBeenCalledWith(dataId)
    expect(service.updateCustomerOrders).toHaveBeenCalledWith({
      selector: { id: "cord_test_002" },
      data: expect.objectContaining({
        payment_status: "paid",
        status: "preparing",
      }),
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      order_id: "cord_test_002",
      payment_status: "paid",
      provider: "mercadopago",
    })
  })
})
