import { GET } from "../route"
import { pgQuery } from "../../../../../../../lib/pg"
import { requireCustomerAdministrator } from "../../../../_shared/customer-auth"

jest.mock("../../../../../../../lib/pg", () => ({
  pgQuery: jest.fn(),
}))

jest.mock("../../../../_shared/customer-auth", () => ({
  requireCustomerAdministrator: jest.fn(),
}))

type MockOrderInput = {
  id: string
  accountId?: string | null
  email?: string | null
  status: string
  paymentStatus: string
  totalArs: number
  createdAt: string
  updatedAt?: string
  shippingMethod?: string
  paymentMethod?: string
  items: Array<{
    id: string
    name: string
    qty: number
    priceArs: number
    costArs?: number
  }>
  metadata?: Record<string, unknown>
}

function orderRow(input: MockOrderInput) {
  return {
    id: input.id,
    account_id: input.accountId ?? null,
    email: input.email ?? null,
    status: input.status,
    payment_status: input.paymentStatus,
    total_ars: input.totalArs,
    item_count: input.items.reduce((acc, item) => acc + item.qty, 0),
    shipping_method: input.shippingMethod ?? "store_checkout",
    payment_method: input.paymentMethod ?? "card",
    items: input.items,
    metadata: input.metadata ?? {},
    created_at: input.createdAt,
    updated_at: input.updatedAt ?? input.createdAt,
  }
}

function paymentString(value: unknown) {
  return String(value ?? "").toLowerCase()
}

function statusString(value: unknown) {
  return String(value ?? "").toLowerCase()
}

function isRevenueRow(row: ReturnType<typeof orderRow>) {
  const status = statusString(row.status)
  const payment = paymentString(row.payment_status)
  const cancelled =
    status === "cancelled" ||
    status === "canceled" ||
    status === "anulado" ||
    status === "anulada"
  const rejected =
    payment.includes("failed") ||
    payment.includes("reject") ||
    payment.includes("denied") ||
    payment.includes("cancel")
  return !cancelled && !rejected
}

function orderFactRow(row: ReturnType<typeof orderRow>, period: "current" | "previous") {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>
  const timeline = Array.isArray(metadata.timeline) ? metadata.timeline : []
  let dispatchAt: string | null = null
  let deliveredAt: string | null = null

  for (const event of timeline) {
    if (!event || typeof event !== "object") continue
    const rec = event as Record<string, unknown>
    if (String(rec.type ?? "").trim().toLowerCase() !== "order.status.changed") continue
    const at = typeof rec.at === "string" ? rec.at : null
    const message = String(rec.message ?? "").trim().toLowerCase()
    const match = /estado actualizado a\s+(.+)$/.exec(message)
    const status = match ? match[1]?.replace(/[.!?]+$/g, "").trim() : ""
    if (!at || !status) continue
    if (
      !dispatchAt &&
      [
        "ready_to_dispatch",
        "ready_pickup",
        "dispatched",
        "shipped",
        "in_transit",
        "out_for_delivery",
        "delivered",
      ].includes(status)
    ) {
      dispatchAt = at
    }
    if (!deliveredAt && status === "delivered") {
      deliveredAt = at
    }
  }

  return {
    period,
    id: row.id,
    account_id: row.account_id,
    email: row.email,
    status: row.status,
    payment_status: row.payment_status,
    total_ars: row.total_ars,
    item_count: row.item_count,
    shipping_method: row.shipping_method,
    payment_method: row.payment_method,
    sales_channel: metadata.sales_channel ?? null,
    sales_channel_alt: metadata.salesChannel ?? null,
    channel: metadata.channel ?? null,
    utm_source: metadata.utm_source ?? null,
    utm_source_alt: metadata.utmSource ?? null,
    utm_nested_source:
      metadata.utm && typeof metadata.utm === "object"
        ? (metadata.utm as Record<string, unknown>).source ?? null
        : null,
    source: metadata.source ?? null,
    profit_ars_meta: metadata.profit_ars ?? metadata.profitArs ?? null,
    items_cost_ars_meta: metadata.items_cost_ars ?? metadata.itemsCostArs ?? null,
    payment_fee_ars_meta: metadata.payment_fee_ars ?? metadata.paymentFeeArs ?? null,
    payment_fee_pct_meta: metadata.payment_fee_pct ?? metadata.paymentFeePct ?? null,
    channel_fee_ars_meta: metadata.channel_fee_ars ?? metadata.channelFeeArs ?? null,
    channel_fee_pct_meta: metadata.channel_fee_pct ?? metadata.channelFeePct ?? null,
    refunded_ars_meta: metadata.refunded_ars ?? metadata.refundedArs ?? null,
    shipping_ars_meta: metadata.shipping_ars ?? metadata.shippingArs ?? null,
    operational_shipping_cost_ars_meta:
      metadata.operational_shipping_cost_ars ?? metadata.operationalShippingCostArs ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    dispatch_at: dispatchAt,
    delivered_at: deliveredAt,
  }
}

function orderItemRows(row: ReturnType<typeof orderRow>, period: "current" | "previous") {
  return (Array.isArray(row.items) ? row.items : []).map((item) => ({
    period,
    order_id: row.id,
    product_id: item.id,
    item_sku: null,
    item_name: item.name,
    brand: null,
    qty: item.qty,
    price_ars: item.priceArs,
    unit_cost_ars: item.costArs ?? null,
  }))
}

function timelineStatusEvent(at: string, status: string) {
  return {
    type: "order.status.changed",
    message: `Estado actualizado a ${status}.`,
    at,
  }
}

function reqWithQuery(query: Record<string, unknown>) {
  return { query } as any
}

function resMock() {
  return {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as any
}

describe("admin summary route", () => {
  const pgQueryMock = pgQuery as jest.MockedFunction<typeof pgQuery>
  const requireAdminMock =
    requireCustomerAdministrator as jest.MockedFunction<
      typeof requireCustomerAdministrator
    >

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-02-26T12:00:00.000Z"))
    pgQueryMock.mockReset()
    requireAdminMock.mockReset()
    requireAdminMock.mockResolvedValue({
      account: { id: "acc_admin", role: "administrator" },
    } as any)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test("computes accurate week summary without cart/funnel double counting", async () => {
    const currentOrders = [
      orderRow({
        id: "ord_cur_1",
        accountId: "acc_1",
        email: "a@example.com",
        status: "delivered",
        paymentStatus: "approved",
        totalArs: 10000,
        createdAt: "2026-02-21T10:00:00.000Z",
        updatedAt: "2026-02-23T10:00:00.000Z",
        items: [{ id: "p1", name: "Cadena", qty: 1, priceArs: 10000 }],
        metadata: {
          source: "instagram",
          subtotal_ars: 9000,
          discount_ars: 0,
          shipping_ars: 1000,
          timeline: [
            timelineStatusEvent("2026-02-21T16:00:00.000Z", "ready_to_dispatch"),
            timelineStatusEvent("2026-02-23T10:00:00.000Z", "delivered"),
          ],
        },
      }),
      orderRow({
        id: "ord_cur_2",
        accountId: "acc_2",
        email: "b@example.com",
        status: "processing",
        paymentStatus: "pending",
        totalArs: 30000,
        createdAt: "2026-02-23T01:00:00.000Z",
        updatedAt: "2026-02-23T01:00:00.000Z",
        items: [
          { id: "p1", name: "Cadena", qty: 2, priceArs: 10000 },
          { id: "p2", name: "Pastillas", qty: 1, priceArs: 10000 },
        ],
        metadata: {
          source: "whatsapp",
          subtotal_ars: 28000,
          discount_ars: 0,
          shipping_ars: 2000,
          timeline: [],
        },
      }),
      orderRow({
        id: "ord_cur_3",
        accountId: "acc_3",
        email: "c@example.com",
        status: "processing",
        paymentStatus: "failed",
        totalArs: 7000,
        createdAt: "2026-02-24T14:00:00.000Z",
        updatedAt: "2026-02-24T14:00:00.000Z",
        items: [{ id: "p3", name: "Filtro", qty: 1, priceArs: 7000 }],
        metadata: {
          source: "ads",
          subtotal_ars: 7000,
          timeline: [],
        },
      }),
    ]

    const previousOrders = [
      orderRow({
        id: "ord_prev_1",
        accountId: "acc_prev_1",
        email: "old@example.com",
        status: "delivered",
        paymentStatus: "approved",
        totalArs: 10000,
        createdAt: "2026-02-15T10:00:00.000Z",
        updatedAt: "2026-02-19T10:00:00.000Z",
        items: [{ id: "p1", name: "Cadena", qty: 1, priceArs: 10000 }],
        metadata: {
          source: "web",
          subtotal_ars: 9000,
          discount_ars: 0,
          shipping_ars: 1000,
          timeline: [
            timelineStatusEvent("2026-02-15T22:00:00.000Z", "ready_to_dispatch"),
            timelineStatusEvent("2026-02-19T10:00:00.000Z", "delivered"),
          ],
        },
      }),
      orderRow({
        id: "ord_prev_2",
        accountId: "acc_prev_2",
        email: "old2@example.com",
        status: "cancelled",
        paymentStatus: "pending",
        totalArs: 5000,
        createdAt: "2026-02-16T10:00:00.000Z",
        items: [{ id: "p4", name: "Guantes", qty: 1, priceArs: 5000 }],
        metadata: { source: "facebook", subtotal_ars: 5000 },
      }),
    ]

    const events = [
      { event: "telemetry.session_start", current_count: "10", previous_count: "5" },
      { event: "telemetry.page_view", current_count: "30", previous_count: "20" },
      { event: "telemetry.product_view", current_count: "5", previous_count: "4" },
      { event: "telemetry.collection_view", current_count: "4", previous_count: "3" },
      { event: "telemetry.home_view", current_count: "2", previous_count: "1" },
      { event: "telemetry.add_to_cart", current_count: "6", previous_count: "3" },
      { event: "cart.synced", current_count: "6", previous_count: "2" },
      { event: "telemetry.cart_view", current_count: "4", previous_count: "2" },
      { event: "telemetry.begin_checkout", current_count: "3", previous_count: "1" },
    ]

    pgQueryMock
      .mockResolvedValueOnce([
        ...currentOrders.map((row) => orderFactRow(row, "current")),
        ...previousOrders.map((row) => orderFactRow(row, "previous")),
      ] as any)
      .mockResolvedValueOnce(events as any)
      .mockResolvedValueOnce([
        ...currentOrders.filter(isRevenueRow).flatMap((row) => orderItemRows(row, "current")),
        ...previousOrders.filter(isRevenueRow).flatMap((row) => orderItemRows(row, "previous")),
      ] as any)
      .mockResolvedValueOnce([] as any)

    const req = reqWithQuery({ r: "week" })
    const res = resMock()
    await GET(req, res)

    expect(requireAdminMock).toHaveBeenCalledTimes(1)
    expect(res.json).toHaveBeenCalledTimes(1)
    const payload = res.json.mock.calls[0]?.[0]

    expect(payload.range.key).toBe("week")
    expect(payload.metrics.billing).toEqual({ value: 40000, trend: 300 })
    expect(payload.metrics.net_revenue).toEqual({ value: 12990, trend: 302.17 })
    expect(payload.metrics.clients).toEqual({ value: 2, trend: 100 })
    expect(payload.metrics.avg_ticket).toEqual({ value: 20000, trend: 100 })

    const channelByKey = new Map(
      payload.channels.map((channel: any) => [channel.key, channel])
    )
    expect(channelByKey.get("instagram")).toMatchObject({
      orders: 1,
      revenue: 10000,
      share: 25,
      trend: 100,
    })
    expect(channelByKey.get("whatsapp")).toMatchObject({
      orders: 1,
      revenue: 30000,
      share: 75,
      trend: 100,
    })
    expect(channelByKey.get("web")).toMatchObject({
      orders: 0,
      revenue: 0,
      share: 0,
      trend: -100,
    })

    expect(payload.top_products).toEqual([
      { key: "p1", name: "Cadena", brand: null, units: 3, revenue: 30000, trend: 200 },
      { key: "p2", name: "Pastillas", brand: null, units: 1, revenue: 10000, trend: 100 },
    ])

    expect(payload.funnel.visits).toEqual({ value: 10, trend: 100 })
    expect(payload.funnel.cart).toEqual({ value: 6, trend: 100 })
    expect(payload.funnel.purchases).toEqual({ value: 2, trend: 100 })
    expect(payload.funnel.conversion).toEqual({ value: 20, trend: 0 })

    const paymentByKey = new Map(
      payload.payment_statuses.map((status: any) => [status.key, status.count])
    )
    expect(paymentByKey.get("approved")).toBe(1)
    expect(paymentByKey.get("pending")).toBe(1)
    expect(paymentByKey.get("rejected")).toBe(1)
    expect(paymentByKey.get("refunded")).toBe(0)

    expect(payload.delivery.average_days).toEqual({ value: 2, trend: 50 })
    expect(payload.delivery.on_time_rate).toEqual({ value: 100, trend: 100 })
    expect(payload.delivery.dispatch_hours).toEqual({ value: 6, trend: 50 })
    expect(payload.delivery.delayed_orders).toEqual({ value: 1, trend: 0 })

    expect(payload.chart.points).toHaveLength(7)
    const pointByDate = new Map(
      payload.chart.points.map((point: any) => [point.date, point.value])
    )
    expect(pointByDate.get("2026-02-21T00:00:00.000Z")).toBe(10000)
    expect(pointByDate.get("2026-02-23T00:00:00.000Z")).toBe(30000)
  })

  test("computes net gain from cost, payment fees, channel fees and operational shipping", async () => {
    const currentOrders = [
      orderRow({
        id: "ord_fin_1",
        accountId: "acc_fin_1",
        email: "fin@example.com",
        status: "processing",
        paymentStatus: "approved",
        totalArs: 100000,
        createdAt: "2026-02-24T10:00:00.000Z",
        paymentMethod: "credit_card",
        shippingMethod: "domicilio",
        items: [{ id: "p_fin_1", name: "Kit transmisión", qty: 2, priceArs: 50000, costArs: 20000 }],
        metadata: {
          sales_channel: "instagram",
          subtotal_ars: 110000,
          discount_ars: 15000,
          shipping_ars: 5000,
          items_cost_ars: 40000,
          payment_fee_pct: 3.9,
          channel_fee_pct: 4.2,
        },
      }),
    ]

    pgQueryMock
      .mockResolvedValueOnce(currentOrders.map((row) => orderFactRow(row, "current")) as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce(currentOrders.flatMap((row) => orderItemRows(row, "current")) as any)
      .mockResolvedValueOnce([] as any)

    const req = reqWithQuery({ r: "week" })
    const res = resMock()
    await GET(req, res)

    const payload = res.json.mock.calls[0]?.[0]
    expect(payload.metrics.billing).toEqual({ value: 100000, trend: 100 })
    expect(payload.metrics.net_revenue).toEqual({ value: 47650, trend: 100 })
    expect(payload.metrics.avg_ticket).toEqual({ value: 100000, trend: 100 })
    expect(payload.metrics.clients).toEqual({ value: 1, trend: 100 })
  })

  test("prefers explicit metadata profit when checkout already stored final gain", async () => {
    const currentOrders = [
      orderRow({
        id: "ord_fin_meta",
        accountId: "acc_meta",
        email: "meta@example.com",
        status: "processing",
        paymentStatus: "approved",
        totalArs: 45000,
        createdAt: "2026-02-25T10:00:00.000Z",
        paymentMethod: "debit_card",
        items: [{ id: "p_meta", name: "Casco", qty: 1, priceArs: 45000, costArs: 20000 }],
        metadata: {
          profit_ars: 12345,
          items_cost_ars: 20000,
          payment_fee_ars: 900,
          channel_fee_ars: 1800,
          operational_shipping_cost_ars: 2500,
        },
      }),
    ]

    pgQueryMock
      .mockResolvedValueOnce(currentOrders.map((row) => orderFactRow(row, "current")) as any)
      .mockResolvedValueOnce([] as any)
      .mockResolvedValueOnce(currentOrders.flatMap((row) => orderItemRows(row, "current")) as any)
      .mockResolvedValueOnce([] as any)

    const req = reqWithQuery({ r: "week" })
    const res = resMock()
    await GET(req, res)

    const payload = res.json.mock.calls[0]?.[0]
    expect(payload.metrics.billing.value).toBe(45000)
    expect(payload.metrics.net_revenue.value).toBe(12345)
  })

  test("falls back to cart.synced when add_to_cart is absent", async () => {
    pgQueryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { event: "telemetry.session_start", current_count: "4", previous_count: "2" },
        { event: "cart.synced", current_count: "7", previous_count: "5" },
      ] as any)

    const req = reqWithQuery({ r: "week" })
    const res = resMock()
    await GET(req, res)

    const payload = res.json.mock.calls[0]?.[0]
    expect(payload.funnel.cart).toEqual({ value: 7, trend: 40 })
  })

  test("custom monthly range does not include an extra month at end-of-month", async () => {
    pgQueryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    const req = reqWithQuery({
      r: "custom",
      from: "2025-01-01",
      to: "2025-05-31",
    })
    const res = resMock()
    await GET(req, res)

    const payload = res.json.mock.calls[0]?.[0]
    expect(payload.range.show_comparisons).toBe(false)
    expect(payload.range.start_date).toBe("2025-01-01T00:00:00.000Z")
    expect(payload.range.end_date).toBe("2025-05-31T23:59:59.999Z")
    expect(payload.chart.points.map((point: any) => point.label)).toEqual([
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
    ])
    expect(pgQueryMock).toHaveBeenCalledTimes(2)
  })
})
