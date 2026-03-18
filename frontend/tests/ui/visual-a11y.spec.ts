import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

type RouteCheck = {
  name: string;
  path: string;
  setup?: (page: Page) => Promise<void>;
};

type ViewportScenario = {
  name: string;
  width: number;
  height: number;
};

type InteractionScenario = {
  name: string;
  apply?: (page: Page) => Promise<void>;
};

type ThemeScenario = "light" | "dark";

const ADMIN_SUMMARY_FIXTURE = {
  range: {
    key: "month",
    granularity: "day",
    start_date: "2026-02-01",
    end_date: "2026-02-28",
    comparison_label: "vs mes pasado",
    show_comparisons: true,
  },
  chart: {
    points: [
      { label: "01 Feb", value: 420000, date: "2026-02-01T00:00:00.000Z" },
      { label: "08 Feb", value: 510000, date: "2026-02-08T00:00:00.000Z" },
      { label: "15 Feb", value: 470000, date: "2026-02-15T00:00:00.000Z" },
      { label: "22 Feb", value: 620000, date: "2026-02-22T00:00:00.000Z" },
      { label: "28 Feb", value: 690000, date: "2026-02-28T00:00:00.000Z" },
    ],
  },
  metrics: {
    billing: { value: 2710000, trend: 9.6 },
    net_revenue: { value: 2395000, trend: 8.2 },
    clients: { value: 412, trend: 5.1 },
    avg_ticket: { value: 65800, trend: 2.7 },
  },
  channels: [
    { key: "web", label: "Web", orders: 193, revenue: 1710000, share: 63, trend: 7.4 },
    { key: "whatsapp", label: "WhatsApp", orders: 84, revenue: 690000, share: 25, trend: 10.9 },
    { key: "phone", label: "Teléfono", orders: 38, revenue: 310000, share: 12, trend: -1.3 },
  ],
  top_products: [
    {
      key: "p-aceite",
      name: "Aceite Street Race 10W40",
      brand: "Liqui Moly",
      units: 124,
      revenue: 905000,
      trend: 11.1,
    },
    {
      key: "p-casco",
      name: "Casco Integral V2",
      brand: "LS2",
      units: 72,
      revenue: 780000,
      trend: 3.2,
    },
  ],
  funnel: {
    visits: { value: 18820, trend: 4.2 },
    cart: { value: 2320, trend: 6.4 },
    purchases: { value: 315, trend: 8.6 },
    conversion: { value: 1.67, trend: 0.4 },
  },
  payment_statuses: [
    { key: "approved", label: "Aprobado", count: 272 },
    { key: "pending", label: "Pendiente", count: 28 },
    { key: "rejected", label: "Rechazado", count: 11 },
    { key: "refunded", label: "Reintegrado", count: 4 },
  ],
  delivery: {
    average_days: { value: 2.4, trend: -4.2 },
    on_time_rate: { value: 94.6, trend: 1.9 },
    dispatch_hours: { value: 13.1, trend: -2.7 },
    delayed_orders: { value: 17, trend: -6.3 },
  },
} as const;

const ADMIN_ORDER_DETAIL_FIXTURE = {
  order: {
    id: "ord-e2e-001",
    order_number: "100501",
    account_id: "admin-e2e",
    email: "cliente@example.com",
    phone: "+54 11 5555-1111",
    status: "preparing",
    payment_status: "pending",
    total_ars: 189900,
    currency_code: "ARS",
    item_count: 2,
    shipping_method: "moto_envio",
    payment_method: "bank_transfer",
    tracking_code: "TRK-TEST-001",
    items: [
      {
        id: "item-1",
        name: "Casco Integral V2",
        brand: "LS2",
        category: "Cascos",
        price_ars: 124900,
        qty: 1,
        image_url: "",
      },
      {
        id: "item-2",
        name: "Guantes Street",
        brand: "Alpinestars",
        category: "Indumentaria",
        price_ars: 65000,
        qty: 1,
        image_url: "",
      },
    ],
    metadata: {
      shipping_address: {
        line1: "Av. Siempreviva 123",
        city: "CABA",
        province: "Buenos Aires",
        postal_code: "1414",
      },
      timeline: [
        {
          id: "evt-1",
          at: "2026-02-27T11:20:00.000Z",
          type: "order.status.changed",
          message: "Estado actualizado a preparing",
        },
        {
          id: "evt-2",
          at: "2026-02-27T10:00:00.000Z",
          type: "order.payment.changed",
          message: "Pago actualizado a pending",
        },
      ],
    },
    created_at: "2026-02-27T09:30:00.000Z",
    updated_at: "2026-02-27T11:20:00.000Z",
  },
  item_skus: {
    "item-1": "CASCO-V2-NEGRO-M",
    "item-2": "GUANTES-STREET-L",
  },
  item_stock: {
    "item-1": {
      availableQty: 6,
      reservedQty: 1,
      soldQty: 21,
      inStock: true,
      lowStock: false,
    },
    "item-2": {
      availableQty: 3,
      reservedQty: 0,
      soldQty: 14,
      inStock: true,
      lowStock: true,
      lowStockThreshold: 5,
    },
  },
} as const;

const ADMIN_ORDERS_PAGE_FIXTURE = {
  orders: [
    {
      id: "ord-e2e-001",
      order_number: "100501",
      account_id: "acc-001",
      email: "carlos.arias@example.com",
      phone: "+54 11 5555-1111",
      status: "preparing",
      payment_status: "pending",
      total_ars: 189900,
      currency_code: "ARS",
      item_count: 2,
      shipping_method: "moto_envio",
      payment_method: "bank_transfer",
      tracking_code: "TRK-001",
      items: [
        {
          id: "ord1-item1",
          name: "Casco Integral V2",
          brand: "LS2",
          category: "Indumentaria",
          price_ars: 124900,
          qty: 1,
          image_url: "",
        },
        {
          id: "ord1-item2",
          name: "Guantes Street",
          brand: "Alpinestars",
          category: "Indumentaria",
          price_ars: 65000,
          qty: 1,
          image_url: "",
        },
      ],
      metadata: {
        customer: {
          first_name: "Carlos",
          last_name: "Arias",
        },
        shipping_address: {
          line1: "Av. Siempreviva 123",
          city: "CABA",
          province: "Buenos Aires",
          postal_code: "1414",
        },
        transfer_proof: {
          files: [
            {
              id: "proof-001",
              mime: "image/jpeg",
              original_name: "comprobante-100501.jpg",
              uploaded_at: "2026-02-27T10:15:00.000Z",
            },
          ],
        },
      },
      created_at: "2026-02-27T09:30:00.000Z",
      updated_at: "2026-02-27T11:20:00.000Z",
    },
    {
      id: "ord-e2e-002",
      order_number: "100502",
      account_id: "acc-002",
      email: "maria.lopez@example.com",
      phone: "+54 11 5555-2222",
      status: "processing",
      payment_status: "paid",
      total_ars: 121500,
      currency_code: "ARS",
      item_count: 3,
      shipping_method: "correo",
      payment_method: "card",
      tracking_code: "",
      items: [
        {
          id: "ord2-item1",
          name: "Aceite Street Race 10W40",
          brand: "Liqui Moly",
          category: "Lubricantes",
          price_ars: 28500,
          qty: 3,
          image_url: "",
        },
        {
          id: "ord2-item2",
          name: "Filtro de Aceite Sport",
          brand: "Mann",
          category: "Filtros",
          price_ars: 36000,
          qty: 1,
          image_url: "",
        },
      ],
      metadata: {
        customer_data: {
          first_name: "Maria",
          last_name: "Lopez",
        },
        shipping_address: {
          line1: "Brasil 455",
          city: "Rosario",
          province: "Santa Fe",
          postal_code: "2000",
        },
      },
      created_at: "2026-02-26T13:10:00.000Z",
      updated_at: "2026-02-26T13:45:00.000Z",
    },
    {
      id: "ord-e2e-003",
      order_number: "100503",
      account_id: "acc-003",
      email: "juan.perez@example.com",
      phone: "+54 11 5555-3333",
      status: "ready_to_dispatch",
      payment_status: "paid",
      total_ars: 248900,
      currency_code: "ARS",
      item_count: 2,
      shipping_method: "correo_expres",
      payment_method: "card",
      tracking_code: "TRK-003",
      items: [
        {
          id: "ord3-item1",
          name: "Kit Cadena 520 Reforzada",
          brand: "DID",
          category: "Motor",
          price_ars: 139900,
          qty: 1,
          image_url: "",
        },
        {
          id: "ord3-item2",
          name: "Pastillas Freno Delantero",
          brand: "Brembo",
          category: "Frenos",
          price_ars: 54500,
          qty: 2,
          image_url: "",
        },
      ],
      metadata: {
        customer: {
          first_name: "Juan",
          last_name: "Perez",
        },
        shipping_address: {
          line1: "Belgrano 742",
          city: "Cordoba",
          province: "Cordoba",
          postal_code: "5000",
        },
      },
      created_at: "2026-02-25T16:40:00.000Z",
      updated_at: "2026-02-25T18:00:00.000Z",
    },
    {
      id: "ord-e2e-004",
      order_number: "100504",
      account_id: "acc-004",
      email: "lucia.gomez@example.com",
      phone: "+54 11 5555-4444",
      status: "in_transit",
      payment_status: "paid",
      total_ars: 45900,
      currency_code: "ARS",
      item_count: 1,
      shipping_method: "correo",
      payment_method: "card",
      tracking_code: "TRK-004",
      items: [
        {
          id: "ord4-item1",
          name: "Bateria AGM 9Ah",
          brand: "Yuasa",
          category: "Baterias",
          price_ars: 45900,
          qty: 1,
          image_url: "",
        },
      ],
      metadata: {
        customer: {
          first_name: "Lucia",
          last_name: "Gomez",
        },
        shipping_address: {
          line1: "San Martin 998",
          city: "Mendoza",
          province: "Mendoza",
          postal_code: "5500",
        },
      },
      created_at: "2026-02-24T08:20:00.000Z",
      updated_at: "2026-02-24T12:10:00.000Z",
    },
    {
      id: "ord-e2e-005",
      order_number: "100505",
      account_id: "acc-005",
      email: "martin.diaz@example.com",
      phone: "+54 11 5555-5555",
      status: "out_for_delivery",
      payment_status: "paid",
      total_ars: 86900,
      currency_code: "ARS",
      item_count: 2,
      shipping_method: "moto_envio",
      payment_method: "card",
      tracking_code: "TRK-005",
      items: [
        {
          id: "ord5-item1",
          name: "Campera Race Pro",
          brand: "Alpinestars",
          category: "Indumentaria",
          price_ars: 72900,
          qty: 1,
          image_url: "",
        },
        {
          id: "ord5-item2",
          name: "Pinlock V2",
          brand: "LS2",
          category: "Accesorios",
          price_ars: 14000,
          qty: 1,
          image_url: "",
        },
      ],
      metadata: {
        customer: {
          first_name: "Martin",
          last_name: "Diaz",
        },
        shipping_address: {
          line1: "Bv. Orono 2101",
          city: "Rosario",
          province: "Santa Fe",
          postal_code: "2000",
        },
      },
      created_at: "2026-02-23T17:05:00.000Z",
      updated_at: "2026-02-24T07:50:00.000Z",
    },
    {
      id: "ord-e2e-006",
      order_number: "100506",
      account_id: "acc-006",
      email: "rocio.ferreyra@example.com",
      phone: "+54 11 5555-6666",
      status: "delivered",
      payment_status: "paid",
      total_ars: 132000,
      currency_code: "ARS",
      item_count: 1,
      shipping_method: "correo_expres",
      payment_method: "card",
      tracking_code: "TRK-006",
      items: [
        {
          id: "ord6-item1",
          name: "Casco Integral V2",
          brand: "LS2",
          category: "Indumentaria",
          price_ars: 132000,
          qty: 1,
          image_url: "",
        },
      ],
      metadata: {
        customer: {
          first_name: "Rocio",
          last_name: "Ferreyra",
        },
        shipping_address: {
          line1: "Saavedra 84",
          city: "Mar del Plata",
          province: "Buenos Aires",
          postal_code: "7600",
        },
      },
      created_at: "2026-02-21T15:32:00.000Z",
      updated_at: "2026-02-22T11:00:00.000Z",
    },
    {
      id: "ord-e2e-007",
      order_number: "100507",
      account_id: "acc-003",
      email: "juan.perez@example.com",
      phone: "+54 11 5555-3333",
      status: "cancelled",
      payment_status: "refunded",
      total_ars: 55900,
      currency_code: "ARS",
      item_count: 1,
      shipping_method: "correo",
      payment_method: "card",
      tracking_code: "",
      items: [
        {
          id: "ord7-item1",
          name: "Pastillas Freno Trasero",
          brand: "Brembo",
          category: "Frenos",
          price_ars: 55900,
          qty: 1,
          image_url: "",
        },
      ],
      metadata: {
        customer: {
          first_name: "Juan",
          last_name: "Perez",
        },
        shipping_address: {
          line1: "Belgrano 742",
          city: "Cordoba",
          province: "Cordoba",
          postal_code: "5000",
        },
      },
      created_at: "2026-02-20T09:00:00.000Z",
      updated_at: "2026-02-20T09:45:00.000Z",
    },
    {
      id: "ord-e2e-008",
      order_number: "100508",
      account_id: "acc-001",
      email: "carlos.arias@example.com",
      phone: "+54 11 5555-1111",
      status: "dispatched",
      payment_status: "failed",
      total_ars: 74900,
      currency_code: "ARS",
      item_count: 1,
      shipping_method: "correo",
      payment_method: "card",
      tracking_code: "TRK-008",
      items: [
        {
          id: "ord8-item1",
          name: "Intercomunicador Duo",
          brand: "Cardo",
          category: "Accesorios",
          price_ars: 74900,
          qty: 1,
          image_url: "",
        },
      ],
      metadata: {
        customer: {
          first_name: "Carlos",
          last_name: "Arias",
        },
        shipping_address: {
          line1: "Av. Siempreviva 123",
          city: "CABA",
          province: "Buenos Aires",
          postal_code: "1414",
        },
      },
      created_at: "2026-02-19T12:12:00.000Z",
      updated_at: "2026-02-19T12:44:00.000Z",
    },
  ],
  count: 8,
  limit: 50,
  offset: 0,
} as const;

function normalizeAdminOrderPaymentStatus(value: unknown) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "";
  if (raw.includes("refund") || raw.includes("reintegr") || raw.includes("chargeback")) {
    return "refunded";
  }
  if (
    raw.includes("fail") ||
    raw.includes("reject") ||
    raw.includes("denied") ||
    raw.includes("cancel")
  ) {
    return "failed";
  }
  if (
    raw.includes("paid") ||
    raw.includes("approve") ||
    raw.includes("accredit") ||
    raw.includes("success")
  ) {
    return "paid";
  }
  if (raw.includes("pend")) return "pending";
  return raw;
}

function filteredAdminOrdersFixture(requestUrl: URL) {
  const rawPaymentFilter =
    requestUrl.searchParams.get("payment_status") ??
    requestUrl.searchParams.get("paymentStatus") ??
    requestUrl.searchParams.get("payment") ??
    "";
  const paymentFilter = normalizeAdminOrderPaymentStatus(rawPaymentFilter);
  const limit = Math.max(1, Number.parseInt(requestUrl.searchParams.get("limit") || "50", 10) || 50);
  const offset = Math.max(0, Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10) || 0);

  const filteredOrders = ADMIN_ORDERS_PAGE_FIXTURE.orders.filter((order) => {
    if (!paymentFilter) return true;
    return normalizeAdminOrderPaymentStatus(order.payment_status) === paymentFilter;
  });

  return {
    orders: filteredOrders.slice(offset, offset + limit),
    count: filteredOrders.length,
    limit,
    offset,
  };
}

const ADMIN_PRODUCTS_PAGE_FIXTURE = {
  products: [
    {
      id: "prod-casco-v2-negro-m",
      name: "Casco Integral V2",
      brand: { id: "brand-ls2", name: "LS2", slug: "ls2" },
      category: { id: "cat-ind", name: "Indumentaria" },
      priceArs: 124900,
      costArs: 84000,
      active: true,
      archived: false,
      stockAvailable: 12,
      stockReserved: 2,
      stockThreshold: 5,
      inStock: true,
      lowStock: false,
      sku: "CASCO-V2-NEGRO-M",
      color: "Negro",
      size: "M",
      gender: "unisex",
      variantGroupId: "grp-casco-v2",
      images: [],
      createdAt: "2026-01-07T12:00:00.000Z",
      updatedAt: "2026-02-26T09:00:00.000Z",
      metadata: { line: "street" },
    },
    {
      id: "prod-casco-v2-negro-l",
      name: "Casco Integral V2",
      brand: { id: "brand-ls2", name: "LS2", slug: "ls2" },
      category: { id: "cat-ind", name: "Indumentaria" },
      priceArs: 129900,
      costArs: 86000,
      active: true,
      archived: false,
      stockAvailable: 3,
      stockReserved: 1,
      stockThreshold: 5,
      inStock: true,
      lowStock: true,
      sku: "CASCO-V2-NEGRO-L",
      color: "Negro",
      size: "L",
      gender: "unisex",
      variantGroupId: "grp-casco-v2",
      images: [],
      createdAt: "2026-01-08T12:00:00.000Z",
      updatedAt: "2026-02-26T09:05:00.000Z",
      metadata: { line: "street" },
    },
    {
      id: "prod-aceite-10w40-1l",
      name: "Aceite Street Race 10W40 1L",
      brand: { id: "brand-liqui", name: "Liqui Moly", slug: "liqui-moly" },
      category: { id: "cat-lub", name: "Lubricantes" },
      priceArs: 28500,
      costArs: 17300,
      active: true,
      archived: false,
      stockAvailable: 58,
      stockReserved: 4,
      stockThreshold: 12,
      inStock: true,
      lowStock: false,
      sku: "ACEITE-10W40-1L",
      images: [],
      createdAt: "2026-01-10T10:20:00.000Z",
      updatedAt: "2026-02-25T16:00:00.000Z",
      metadata: { viscosity: "10w40" },
    },
    {
      id: "prod-kit-cadena-520",
      name: "Kit Cadena 520 Reforzada",
      brand: { id: "brand-did", name: "DID", slug: "did" },
      category: { id: "cat-tr", name: "Motor" },
      priceArs: 139900,
      costArs: 101000,
      active: true,
      archived: false,
      stockAvailable: 2,
      stockReserved: 0,
      stockThreshold: 6,
      inStock: true,
      lowStock: true,
      sku: "KIT-520-RF",
      images: [],
      createdAt: "2026-01-11T11:00:00.000Z",
      updatedAt: "2026-02-24T11:15:00.000Z",
      metadata: { chain_pitch: "520" },
    },
    {
      id: "prod-bateria-agm-9ah",
      name: "Bateria AGM 9Ah",
      brand: { id: "brand-yuasa", name: "Yuasa", slug: "yuasa" },
      category: { id: "cat-elec", name: "Electricidad" },
      priceArs: 45900,
      costArs: 32000,
      active: true,
      archived: false,
      stockAvailable: 0,
      stockReserved: 0,
      stockThreshold: 4,
      inStock: false,
      lowStock: true,
      sku: "BAT-AGM-9AH",
      images: [],
      createdAt: "2026-01-12T08:10:00.000Z",
      updatedAt: "2026-02-22T07:40:00.000Z",
      metadata: { voltage: "12v" },
    },
    {
      id: "prod-campera-race-rojo-m",
      name: "Campera Race Pro",
      brand: { id: "brand-alpin", name: "Alpinestars", slug: "alpinestars" },
      category: { id: "cat-ind", name: "Indumentaria" },
      priceArs: 172900,
      costArs: 130000,
      active: false,
      archived: true,
      stockAvailable: 7,
      stockReserved: 0,
      stockThreshold: 3,
      inStock: true,
      lowStock: false,
      sku: "CAMP-RACE-ROJO-M",
      color: "Rojo",
      size: "M",
      gender: "hombre",
      variantGroupId: "grp-campera-race",
      images: [],
      createdAt: "2026-01-15T13:00:00.000Z",
      updatedAt: "2026-02-23T19:00:00.000Z",
      metadata: { archived: true },
    },
    {
      id: "prod-pastillas-freno-del",
      name: "Pastillas Freno Delantero",
      brand: { id: "brand-brembo", name: "Brembo", slug: "brembo" },
      category: { id: "cat-fr", name: "Frenos" },
      priceArs: 54500,
      costArs: 38900,
      active: true,
      archived: false,
      stockAvailable: 24,
      stockReserved: 6,
      stockThreshold: 8,
      inStock: true,
      lowStock: false,
      sku: "FRENO-DEL-BR",
      images: [],
      createdAt: "2026-01-16T09:45:00.000Z",
      updatedAt: "2026-02-25T10:20:00.000Z",
      metadata: { position: "front" },
    },
  ],
  count: 7,
  limit: 48,
  offset: 0,
} as const;

type AdminProductsFixtureItem = (typeof ADMIN_PRODUCTS_PAGE_FIXTURE.products)[number];

function adminProductGroupKey(product: AdminProductsFixtureItem) {
  return product.variantGroupId?.trim() || product.id;
}

function adminProductCreatedAt(product: AdminProductsFixtureItem) {
  return Date.parse(product.createdAt) || 0;
}

function compareAdminProductsForSort(
  a: AdminProductsFixtureItem,
  b: AdminProductsFixtureItem,
  sort: string
) {
  if (sort === "created_asc") return adminProductCreatedAt(a) - adminProductCreatedAt(b);
  if (sort === "price_desc") return Number(b.priceArs ?? 0) - Number(a.priceArs ?? 0);
  if (sort === "price_asc") return Number(a.priceArs ?? 0) - Number(b.priceArs ?? 0);
  if (sort === "name_asc") return a.name.localeCompare(b.name, "es");
  if (sort === "name_desc") return b.name.localeCompare(a.name, "es");
  if (sort === "stock_desc") return Number(b.stockAvailable ?? 0) - Number(a.stockAvailable ?? 0);
  if (sort === "stock_asc") return Number(a.stockAvailable ?? 0) - Number(b.stockAvailable ?? 0);
  return adminProductCreatedAt(b) - adminProductCreatedAt(a);
}

function filteredAdminProductsFixture(requestUrl: URL) {
  const limit = Math.max(1, Number.parseInt(requestUrl.searchParams.get("limit") ?? "48", 10) || 48);
  const offset = Math.max(0, Number.parseInt(requestUrl.searchParams.get("offset") ?? "0", 10) || 0);
  const query = (requestUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const category = (requestUrl.searchParams.get("category") ?? "").trim().toLowerCase();
  const brand = (requestUrl.searchParams.get("brand") ?? "").trim().toLowerCase();
  const status = (requestUrl.searchParams.get("status") ?? "live").trim().toLowerCase();
  const sort = (requestUrl.searchParams.get("sort") ?? "created_desc").trim().toLowerCase();
  const minPrice = Number.parseInt(requestUrl.searchParams.get("min_price") ?? "", 10);
  const maxPrice = Number.parseInt(requestUrl.searchParams.get("max_price") ?? "", 10);

  const filteredProducts = ADMIN_PRODUCTS_PAGE_FIXTURE.products
    .filter((product) => {
      if (query) {
        const haystack = [product.id, product.name, product.sku, product.brand?.name, product.category?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (category && product.category?.name.toLowerCase() !== category) return false;
      if (brand) {
        const slug = product.brand?.slug?.toLowerCase() ?? "";
        const name = product.brand?.name?.toLowerCase() ?? "";
        if (slug !== brand && name !== brand) return false;
      }

      if (status === "active" && (!product.active || product.archived)) return false;
      if (status === "draft" && (product.active || product.archived)) return false;
      if (status === "archived" && !product.archived) return false;
      if (status === "live" && product.archived) return false;

      if (Number.isFinite(minPrice) && Number(product.priceArs ?? 0) < minPrice) return false;
      if (Number.isFinite(maxPrice) && Number(product.priceArs ?? 0) > maxPrice) return false;

      return true;
    })
    .sort((a, b) => {
      const diff = compareAdminProductsForSort(a, b, sort);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id, "es");
    });

  const grouped = new Map<string, AdminProductsFixtureItem[]>();
  for (const product of filteredProducts) {
    const key = adminProductGroupKey(product);
    const bucket = grouped.get(key) ?? [];
    bucket.push(product);
    grouped.set(key, bucket);
  }

  const orderedGroups = Array.from(grouped.entries())
    .map(([key, products]) => {
      const representative = [...products]
        .sort((a, b) => {
          const diff = compareAdminProductsForSort(a, b, sort);
          if (diff !== 0) return diff;
          return a.id.localeCompare(b.id, "es");
        })[0];
      return { key, products, representative };
    })
    .sort((a, b) => {
      const diff = compareAdminProductsForSort(a.representative, b.representative, sort);
      if (diff !== 0) return diff;
      return a.key.localeCompare(b.key, "es");
    });

  const pagedGroups = orderedGroups.slice(offset, offset + limit);
  const pagePositions = new Map(pagedGroups.map((group, index) => [group.key, index]));
  const pageProducts = filteredProducts
    .filter((product) => pagePositions.has(adminProductGroupKey(product)))
    .sort((a, b) => {
      const pageDiff =
        (pagePositions.get(adminProductGroupKey(a)) ?? 0) -
        (pagePositions.get(adminProductGroupKey(b)) ?? 0);
      if (pageDiff !== 0) return pageDiff;
      const createdDiff = adminProductCreatedAt(a) - adminProductCreatedAt(b);
      if (createdDiff !== 0) return createdDiff;
      return a.id.localeCompare(b.id, "es");
    });

  return {
    products: pageProducts,
    count: orderedGroups.length,
    product_count: filteredProducts.length,
    limit,
    offset,
  };
}

const ADMIN_QUESTIONS_PAGE_FIXTURE = {
  questions: [
    {
      id: "q-e2e-001",
      product_id: "prod-casco-v2-negro-m",
      product_title: "Casco Integral V2",
      product_handle: "casco-integral-v2",
      question: "Sirve para uso diario en ciudad?",
      answer: "",
      status: "pending",
      customer_name: "Carlos Arias",
      customer_email: "carlos.arias@example.com",
      answered_by_account_id: "",
      created_at: "2026-02-27T10:05:00.000Z",
      updated_at: "2026-02-27T10:05:00.000Z",
      answered_at: null,
    },
    {
      id: "q-e2e-002",
      product_id: "prod-aceite-10w40-1l",
      product_title: "Aceite Street Race 10W40 1L",
      product_handle: "aceite-street-race-10w40-1l",
      question: "Cada cuantos km recomiendan el cambio?",
      answer: "Para uso urbano recomendamos cada 3000 km o 6 meses.",
      status: "answered",
      customer_name: "Maria Lopez",
      customer_email: "maria.lopez@example.com",
      answered_by_account_id: "admin-e2e",
      created_at: "2026-02-26T08:20:00.000Z",
      updated_at: "2026-02-26T10:10:00.000Z",
      answered_at: "2026-02-26T10:09:00.000Z",
    },
    {
      id: "q-e2e-004",
      product_id: "prod-bateria-agm-9ah",
      product_title: "Bateria AGM 9Ah",
      product_handle: "bateria-agm-9ah",
      question: "Es libre de mantenimiento?",
      answer: "",
      status: "pending",
      customer_name: "Rocio Ferreyra",
      customer_email: "rocio.ferreyra@example.com",
      answered_by_account_id: "",
      created_at: "2026-02-24T18:42:00.000Z",
      updated_at: "2026-02-24T18:42:00.000Z",
      answered_at: null,
    },
    {
      id: "q-e2e-005",
      product_id: "prod-pastillas-freno-del",
      product_title: "Pastillas Freno Delantero",
      product_handle: "pastillas-freno-delantero",
      question: "Compatibles con FZ 2.0?",
      answer: "Sí, son compatibles con FZ 2.0 y FZ-S.",
      status: "answered",
      customer_name: "Lucia Gomez",
      customer_email: "lucia.gomez@example.com",
      answered_by_account_id: "admin-e2e",
      created_at: "2026-02-23T14:15:00.000Z",
      updated_at: "2026-02-23T14:40:00.000Z",
      answered_at: "2026-02-23T14:39:00.000Z",
    },
  ],
  count: 4,
  limit: 50,
  offset: 0,
} as const;

const ADMIN_COUPONS_FIXTURE = [
  {
    id: "coupon-e2e-001",
    code: "BIENVENIDA10",
    title: "Promo bienvenida",
    percentage: 10,
    active: true,
    used_count: 34,
    created_at: "2026-01-03T10:00:00.000Z",
    updated_at: "2026-02-26T09:00:00.000Z",
  },
  {
    id: "coupon-e2e-002",
    code: "ENVIO55",
    title: "Descuento envio",
    percentage: 5.5,
    active: true,
    used_count: 18,
    created_at: "2026-01-08T12:00:00.000Z",
    updated_at: "2026-02-24T08:10:00.000Z",
  },
  {
    id: "coupon-e2e-003",
    code: "VIP20",
    title: "Clientes VIP",
    percentage: 20,
    active: false,
    used_count: 12,
    created_at: "2026-01-10T09:30:00.000Z",
    updated_at: "2026-02-20T17:45:00.000Z",
  },
  {
    id: "coupon-e2e-004",
    code: "REACTIVA15",
    title: "Reactivacion",
    percentage: 15,
    active: false,
    used_count: 4,
    created_at: "2026-01-15T13:45:00.000Z",
    updated_at: "2026-02-19T11:30:00.000Z",
  },
] as const;

function filteredAdminCouponsFixture(requestUrl: URL) {
  const limit = Math.max(1, Number.parseInt(requestUrl.searchParams.get("limit") ?? "50", 10) || 50);
  const offset = Math.max(0, Number.parseInt(requestUrl.searchParams.get("offset") ?? "0", 10) || 0);
  const sorted = [...ADMIN_COUPONS_FIXTURE].sort(
    (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)
  );

  return {
    coupons: sorted.slice(offset, offset + limit),
    count: sorted.length,
    limit,
    offset,
  };
}

const ADMIN_INVENTORY_FIXTURE = {
  inventory: [
    {
      id: "prod-casco-v2-negro-m",
      productId: "prod-casco-v2-negro-m",
      stockScope: "product",
      productName: "Casco Integral V2",
      productStatus: "published",
      archived: false,
      sku: "CASCO-V2-NEGRO-M",
      availableQty: 12,
      reservedQty: 2,
      soldQty: 34,
      lowStockThreshold: 5,
      inStock: true,
      lowStock: false,
      updatedAt: "2026-02-27T11:20:00.000Z",
      metadata: { rack: "A1" },
    },
    {
      id: "prod-casco-v2-negro-l",
      productId: "prod-casco-v2-negro-l",
      stockScope: "product",
      productName: "Casco Integral V2",
      productStatus: "published",
      archived: false,
      sku: "CASCO-V2-NEGRO-L",
      availableQty: 3,
      reservedQty: 1,
      soldQty: 19,
      lowStockThreshold: 5,
      inStock: true,
      lowStock: true,
      updatedAt: "2026-02-26T09:05:00.000Z",
      metadata: { rack: "A2" },
    },
    {
      id: "prod-aceite-10w40-1l",
      productId: "prod-aceite-10w40-1l",
      stockScope: "product",
      productName: "Aceite Street Race 10W40 1L",
      productStatus: "published",
      archived: false,
      sku: "ACEITE-10W40-1L",
      availableQty: 58,
      reservedQty: 4,
      soldQty: 141,
      lowStockThreshold: 12,
      inStock: true,
      lowStock: false,
      updatedAt: "2026-02-25T16:00:00.000Z",
      metadata: { rack: "B3" },
    },
    {
      id: "prod-kit-cadena-520",
      productId: "prod-kit-cadena-520",
      stockScope: "product",
      productName: "Kit Cadena 520 Reforzada",
      productStatus: "draft",
      archived: false,
      sku: "KIT-520-RF",
      availableQty: 0,
      reservedQty: 0,
      soldQty: 27,
      lowStockThreshold: 6,
      inStock: false,
      lowStock: true,
      updatedAt: "2026-02-24T11:15:00.000Z",
      metadata: { rack: "C1" },
    },
    {
      id: "prod-bateria-agm-9ah",
      productId: "prod-bateria-agm-9ah",
      stockScope: "product",
      productName: "Bateria AGM 9Ah",
      productStatus: "draft",
      archived: false,
      sku: "BAT-AGM-9AH",
      availableQty: 1,
      reservedQty: 0,
      soldQty: 18,
      lowStockThreshold: 4,
      inStock: true,
      lowStock: true,
      updatedAt: "2026-02-22T07:40:00.000Z",
      metadata: { rack: "D4" },
    },
    {
      id: "prod-campera-race-rojo-m",
      productId: "prod-campera-race-rojo-m",
      stockScope: "product",
      productName: "Campera Race Pro",
      productStatus: "archived",
      archived: true,
      sku: "CAMP-RACE-ROJO-M",
      availableQty: 7,
      reservedQty: 3,
      soldQty: 22,
      lowStockThreshold: 3,
      inStock: true,
      lowStock: false,
      updatedAt: "2026-02-23T19:00:00.000Z",
      metadata: { rack: "E2" },
    },
    {
      id: "prod-pastillas-freno-del",
      productId: "prod-pastillas-freno-del",
      stockScope: "product",
      productName: "Pastillas Freno Delantero",
      productStatus: "published",
      archived: false,
      sku: "FRENO-DEL-BR",
      availableQty: 24,
      reservedQty: 6,
      soldQty: 87,
      lowStockThreshold: 8,
      inStock: true,
      lowStock: false,
      updatedAt: "2026-02-25T10:20:00.000Z",
      metadata: { rack: "B1" },
    },
  ],
} as const;

function inventoryThreshold(item: (typeof ADMIN_INVENTORY_FIXTURE.inventory)[number]) {
  return Number(item.lowStockThreshold ?? 0) || 0;
}

function inventoryReorderQty(item: (typeof ADMIN_INVENTORY_FIXTURE.inventory)[number]) {
  return Math.max(0, inventoryThreshold(item) - Math.max(0, Number(item.availableQty ?? 0) || 0));
}

function inventorySummaryFixture(
  inventory: readonly (typeof ADMIN_INVENTORY_FIXTURE.inventory)[number][] = ADMIN_INVENTORY_FIXTURE.inventory
) {
  return {
    totalProducts: inventory.length,
    totalAvailableQty: inventory.reduce((sum, item) => sum + Math.max(0, Number(item.availableQty ?? 0) || 0), 0),
    lowStockCount: inventory.filter((item) => Boolean(item.lowStock) && Boolean(item.inStock)).length,
    outOfStockCount: inventory.filter((item) => !item.inStock).length,
    reorderCount: inventory.filter((item) => inventoryReorderQty(item) > 0).length,
    productsWithActiveReservations: inventory.filter((item) => Math.max(0, Number(item.reservedQty ?? 0) || 0) > 0).length,
  };
}

function filteredAdminInventoryFixture(requestUrl: URL) {
  const limit = Math.max(1, Number.parseInt(requestUrl.searchParams.get("limit") ?? "50", 10) || 50);
  const offset = Math.max(0, Number.parseInt(requestUrl.searchParams.get("offset") ?? "0", 10) || 0);
  const search = (requestUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const status = (requestUrl.searchParams.get("status") ?? "all").trim().toLowerCase();
  const sort = (requestUrl.searchParams.get("sort") ?? "stock_asc").trim().toLowerCase();

  const filtered = ADMIN_INVENTORY_FIXTURE.inventory.filter((item) => {
    if (search) {
      const haystack = `${item.productName} ${item.sku}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    if (status === "in_stock" && !item.inStock) return false;
    if (status === "low_stock" && (!item.lowStock || !item.inStock)) return false;
    if (status === "out_of_stock" && item.inStock) return false;
    if (status === "to_buy" && inventoryReorderQty(item) <= 0) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === "stock_desc") return b.availableQty - a.availableQty;
    if (sort === "reorder_desc") return inventoryReorderQty(b) - inventoryReorderQty(a);
    if (sort === "name_asc") return a.productName.localeCompare(b.productName, "es");
    if (sort === "name_desc") return b.productName.localeCompare(a.productName, "es");
    return a.availableQty - b.availableQty;
  });

  const inventory = filtered.slice(offset, offset + limit).map((item) => ({
    ...item,
    stockThreshold: inventoryThreshold(item),
    reorderSuggestedQty: inventoryReorderQty(item),
  }));

  return {
    inventory,
    count: filtered.length,
    limit,
    offset,
    summary: inventorySummaryFixture(filtered),
  };
}

const ADMIN_INVENTORY_MOVEMENTS_FIXTURE = [
  {
    id: "mov-e2e-001",
    itemId: "prod-casco-v2-negro-m",
    productId: "prod-casco-v2-negro-m",
    sku: "CASCO-V2-NEGRO-M",
    productName: "Casco Integral V2",
    variantName: "Negro / M",
    movement: "purchase_in",
    deltaQty: 20,
    balanceQty: 20,
    source: "supplier",
    motive: "Ingreso por compra",
    reference: "PO-1001",
    user: "Admin E2E",
    at: "2026-02-20T09:00:00.000Z",
  },
  {
    id: "mov-e2e-002",
    itemId: "prod-casco-v2-negro-m",
    productId: "prod-casco-v2-negro-m",
    sku: "CASCO-V2-NEGRO-M",
    productName: "Casco Integral V2",
    variantName: "Negro / M",
    movement: "reserve",
    deltaQty: -2,
    balanceQty: 18,
    source: "orders",
    motive: "Reserva por orden 100501",
    reference: "100501",
    user: "System",
    at: "2026-02-27T09:35:00.000Z",
  },
  {
    id: "mov-e2e-003",
    itemId: "prod-casco-v2-negro-m",
    productId: "prod-casco-v2-negro-m",
    sku: "CASCO-V2-NEGRO-M",
    productName: "Casco Integral V2",
    variantName: "Negro / M",
    movement: "exit",
    deltaQty: -1,
    balanceQty: 17,
    source: "orders",
    motive: "Despacho confirmado",
    reference: "100506",
    user: "Admin E2E",
    at: "2026-02-22T10:15:00.000Z",
  },
  {
    id: "mov-e2e-004",
    itemId: "prod-casco-v2-negro-l",
    productId: "prod-casco-v2-negro-l",
    sku: "CASCO-V2-NEGRO-L",
    productName: "Casco Integral V2",
    variantName: "Negro / L",
    movement: "release",
    deltaQty: 1,
    balanceQty: 4,
    source: "orders",
    motive: "Liberacion de reserva",
    reference: "100498",
    user: "System",
    at: "2026-02-26T11:25:00.000Z",
  },
  {
    id: "mov-e2e-005",
    itemId: "prod-bateria-agm-9ah",
    productId: "prod-bateria-agm-9ah",
    sku: "BAT-AGM-9AH",
    productName: "Bateria AGM 9Ah",
    variantName: "12V",
    movement: "return",
    deltaQty: 1,
    balanceQty: 1,
    source: "returns",
    motive: "Devolucion de cliente",
    reference: "RMA-2026-09",
    user: "Admin E2E",
    at: "2026-02-22T07:35:00.000Z",
  },
  {
    id: "mov-e2e-006",
    itemId: "prod-kit-cadena-520",
    productId: "prod-kit-cadena-520",
    sku: "KIT-520-RF",
    productName: "Kit Cadena 520 Reforzada",
    variantName: "520",
    movement: "adjustment",
    deltaQty: -3,
    balanceQty: 0,
    source: "audit",
    motive: "Ajuste por conteo ciclico",
    reference: "AUD-44",
    user: "Admin E2E",
    at: "2026-02-24T11:10:00.000Z",
  },
  {
    id: "mov-e2e-007",
    itemId: "prod-aceite-10w40-1l",
    productId: "prod-aceite-10w40-1l",
    sku: "ACEITE-10W40-1L",
    productName: "Aceite Street Race 10W40 1L",
    variantName: "1L",
    movement: "entry",
    deltaQty: 40,
    balanceQty: 58,
    source: "supplier",
    motive: "Recepcion parcial",
    reference: "PO-1009",
    user: "Deposito",
    at: "2026-02-25T15:55:00.000Z",
  },
  {
    id: "mov-e2e-008",
    itemId: "prod-pastillas-freno-del",
    productId: "prod-pastillas-freno-del",
    sku: "FRENO-DEL-BR",
    productName: "Pastillas Freno Delantero",
    variantName: "Delantero",
    movement: "purchase_in",
    deltaQty: 30,
    balanceQty: 30,
    source: "supplier",
    motive: "Ingreso por compra",
    reference: "PO-1020",
    user: "Deposito",
    at: "2026-02-21T12:05:00.000Z",
  },
] as const;

function filteredAdminInventoryMovementsFixture(requestUrl: URL) {
  const limit = Math.max(1, Number.parseInt(requestUrl.searchParams.get("limit") ?? "25", 10) || 25);
  const offset = Math.max(0, Number.parseInt(requestUrl.searchParams.get("offset") ?? "0", 10) || 0);
  const sorted = [...ADMIN_INVENTORY_MOVEMENTS_FIXTURE].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at)
  );

  return {
    movements: sorted.slice(offset, offset + limit),
    count: sorted.length,
    limit,
    offset,
  };
}

const ADMIN_ACCOUNTS_FIXTURE = {
  accounts: [
    {
      id: "acc-001",
      email: "carlos.arias@example.com",
      first_name: "Carlos",
      last_name: "Arias",
      role: "user",
      created_at: "2025-11-02T10:00:00.000Z",
      last_login_at: "2026-02-27T08:50:00.000Z",
      blocked_until: null,
      phone: "+54 11 5555-1111",
      whatsapp: "+54 9 11 5555-1111",
      admin_notes: "Compra frecuente en indumentaria.",
      addresses: [
        {
          label: "Casa",
          line1: "Av. Siempreviva 123",
          city: "CABA",
          province: "Buenos Aires",
          postal_code: "1414",
        },
      ],
    },
    {
      id: "acc-002",
      email: "maria.lopez@example.com",
      first_name: "Maria",
      last_name: "Lopez",
      role: "employee",
      created_at: "2025-10-18T13:00:00.000Z",
      last_login_at: "2026-02-26T12:40:00.000Z",
      blocked_until: null,
      phone: "+54 11 5555-2222",
      whatsapp: "+54 9 11 5555-2222",
      admin_notes: "Atiende ventas por WhatsApp.",
      addresses: [
        {
          label: "Trabajo",
          line1: "Brasil 455",
          city: "Rosario",
          province: "Santa Fe",
          postal_code: "2000",
        },
      ],
    },
    {
      id: "acc-003",
      email: "juan.perez@example.com",
      first_name: "Juan",
      last_name: "Perez",
      role: "user",
      created_at: "2025-08-09T09:30:00.000Z",
      last_login_at: "2026-02-20T09:10:00.000Z",
      blocked_until: "2099-12-31T23:59:59.000Z",
      phone: "+54 11 5555-3333",
      whatsapp: "+54 9 11 5555-3333",
      admin_notes: "Cuenta bloqueada por contracargos.",
      addresses: [
        {
          label: "Casa",
          line1: "Belgrano 742",
          city: "Cordoba",
          province: "Cordoba",
          postal_code: "5000",
        },
      ],
    },
    {
      id: "acc-004",
      email: "lucia.gomez@example.com",
      first_name: "Lucia",
      last_name: "Gomez",
      role: "user",
      created_at: "2025-12-01T15:20:00.000Z",
      last_login_at: "2026-02-24T07:10:00.000Z",
      blocked_until: null,
      phone: "+54 11 5555-4444",
      whatsapp: "+54 9 11 5555-4444",
      admin_notes: "",
      addresses: [
        {
          label: "Casa",
          line1: "San Martin 998",
          city: "Mendoza",
          province: "Mendoza",
          postal_code: "5500",
        },
      ],
    },
    {
      id: "acc-005",
      email: "martin.diaz@example.com",
      first_name: "Martin",
      last_name: "Diaz",
      role: "user",
      created_at: "2025-12-09T18:00:00.000Z",
      last_login_at: "2026-02-23T16:10:00.000Z",
      blocked_until: null,
      phone: "+54 11 5555-5555",
      whatsapp: "+54 9 11 5555-5555",
      admin_notes: "Prefiere retiro en sucursal.",
      addresses: [
        {
          label: "Casa",
          line1: "Bv. Orono 2101",
          city: "Rosario",
          province: "Santa Fe",
          postal_code: "2000",
        },
      ],
    },
    {
      id: "acc-006",
      email: "rocio.ferreyra@example.com",
      first_name: "Rocio",
      last_name: "Ferreyra",
      role: "user",
      created_at: "2025-09-15T11:05:00.000Z",
      last_login_at: "2026-02-22T10:55:00.000Z",
      blocked_until: null,
      phone: "+54 11 5555-6666",
      whatsapp: "+54 9 11 5555-6666",
      admin_notes: "Cliente con compras recurrentes.",
      addresses: [
        {
          label: "Casa",
          line1: "Saavedra 84",
          city: "Mar del Plata",
          province: "Buenos Aires",
          postal_code: "7600",
        },
      ],
    },
    {
      id: "admin-e2e",
      email: "admin@example.com",
      first_name: "Admin",
      last_name: "E2E",
      role: "administrator",
      created_at: "2025-01-01T00:00:00.000Z",
      last_login_at: "2026-02-28T08:00:00.000Z",
      blocked_until: null,
      phone: "+54 11 5555-0000",
      whatsapp: "",
      admin_notes: "Cuenta interna de pruebas.",
      addresses: [],
    },
  ],
} as const;

function normalizeAdminClientText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function adminFixtureTimestamp(value: string | null | undefined) {
  const ts = Date.parse(value ?? "");
  return Number.isFinite(ts) ? ts : 0;
}

function adminAccountMatchesOrder(
  account: (typeof ADMIN_ACCOUNTS_FIXTURE.accounts)[number],
  order: (typeof ADMIN_ORDERS_PAGE_FIXTURE.orders)[number]
) {
  const orderAccountId = typeof order.account_id === "string" ? order.account_id.trim() : "";
  if (orderAccountId && orderAccountId === account.id) return true;

  const accountEmail = normalizeAdminClientText(account.email);
  const orderEmail = normalizeAdminClientText(order.email);
  return Boolean(accountEmail && orderEmail && accountEmail === orderEmail);
}

function buildAdminClientFixtureRow(
  account: (typeof ADMIN_ACCOUNTS_FIXTURE.accounts)[number]
) {
  const orders = ADMIN_ORDERS_PAGE_FIXTURE.orders
    .filter((order) => adminAccountMatchesOrder(account, order))
    .sort((a, b) => adminFixtureTimestamp(b.created_at) - adminFixtureTimestamp(a.created_at));
  const totalSpent = orders.reduce((sum, order) => sum + Math.max(0, Number(order.total_ars) || 0), 0);
  const ordersCount = orders.length;
  const lastPurchaseAt = orders[0]?.created_at ?? null;
  const lastActivityAt = [lastPurchaseAt, account.last_login_at, account.created_at]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => adminFixtureTimestamp(b) - adminFixtureTimestamp(a))[0] ?? null;

  return {
    ...account,
    updated_at: account.last_login_at ?? account.created_at,
    orders_count: ordersCount,
    total_spent_ars: totalSpent,
    avg_ticket_ars: ordersCount > 0 ? totalSpent / ordersCount : 0,
    last_purchase_at: lastPurchaseAt,
    last_activity_at: lastActivityAt,
  };
}

function filteredAdminAccountsFixture(requestUrl: URL) {
  const query = normalizeAdminClientText(
    requestUrl.searchParams.get("q") ?? requestUrl.searchParams.get("search") ?? ""
  );
  const role = normalizeAdminClientText(requestUrl.searchParams.get("role") ?? "");
  const status = normalizeAdminClientText(requestUrl.searchParams.get("status") ?? "");
  const sort = normalizeAdminClientText(requestUrl.searchParams.get("sort") ?? "latest_purchase");
  const fromTs = adminFixtureTimestamp(requestUrl.searchParams.get("from"));
  const toTs = adminFixtureTimestamp(requestUrl.searchParams.get("to"));
  const limit = Math.max(1, Number.parseInt(requestUrl.searchParams.get("limit") || "50", 10) || 50);
  const offset = Math.max(0, Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10) || 0);
  const nowTs = adminFixtureTimestamp("2026-03-05T12:00:00.000Z");

  const filtered = ADMIN_ACCOUNTS_FIXTURE.accounts
    .map(buildAdminClientFixtureRow)
    .filter((account) => {
      if (query) {
        const haystack = [
          account.id,
          account.email,
          account.first_name,
          account.last_name,
          account.phone,
          account.whatsapp,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (role && role !== "all" && normalizeAdminClientText(account.role) !== role) return false;

      const blockedUntilTs = adminFixtureTimestamp(account.blocked_until);
      const isBlocked = blockedUntilTs > nowTs;
      if (status === "blocked" && !isBlocked) return false;
      if (status === "active" && isBlocked) return false;

      const createdTs = adminFixtureTimestamp(account.created_at);
      if (fromTs > 0 && createdTs < fromTs) return false;
      if (toTs > 0 && createdTs > toTs) return false;

      return true;
    });

  filtered.sort((a, b) => {
    if (sort === "total_spent") {
      const totalDiff = Number(b.total_spent_ars) - Number(a.total_spent_ars);
      if (totalDiff !== 0) return totalDiff;
    } else if (sort === "newest") {
      const createdDiff = adminFixtureTimestamp(b.created_at) - adminFixtureTimestamp(a.created_at);
      if (createdDiff !== 0) return createdDiff;
    } else {
      const purchaseDiff =
        adminFixtureTimestamp(b.last_purchase_at) - adminFixtureTimestamp(a.last_purchase_at);
      if (purchaseDiff !== 0) return purchaseDiff;
    }

    return adminFixtureTimestamp(b.created_at) - adminFixtureTimestamp(a.created_at);
  });

  return {
    accounts: filtered.slice(offset, offset + limit),
    count: filtered.length,
    limit,
    offset,
  };
}

function buildAdminAccountDetailFixture(requestUrl: URL, accountId: string) {
  const account = ADMIN_ACCOUNTS_FIXTURE.accounts.find((entry) => entry.id === accountId);
  if (!account) return null;

  const limit = Math.max(
    1,
    Number.parseInt(
      requestUrl.searchParams.get("orders_limit") ??
        requestUrl.searchParams.get("limit") ??
        "12",
      10
    ) || 12
  );
  const offset = Math.max(
    0,
    Number.parseInt(
      requestUrl.searchParams.get("orders_offset") ??
        requestUrl.searchParams.get("offset") ??
        "0",
      10
    ) || 0
  );
  const client = buildAdminClientFixtureRow(account);
  const orders = ADMIN_ORDERS_PAGE_FIXTURE.orders
    .filter((order) => adminAccountMatchesOrder(account, order))
    .sort((a, b) => adminFixtureTimestamp(b.created_at) - adminFixtureTimestamp(a.created_at));

  return {
    account: client,
    orders: orders.slice(offset, offset + limit),
    orders_total_count: orders.length,
    orders_limit: limit,
    orders_offset: offset,
  };
}

async function mockAdminSummarySession(page: Page) {
  await page.route("**/store/catalog/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        account: {
          id: "admin-e2e",
          email: "admin@example.com",
          first_name: "Admin",
          last_name: "E2E",
          role: "administrator",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-02-28T00:00:00.000Z",
        },
        cart: { items: [] },
        addresses: [],
      }),
    });
  });

  await page.route("**/store/catalog/products/brands*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ brands: [] }),
    });
  });

  await page.route("**/store/catalog/account/admin/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/account/admin/summary")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ADMIN_SUMMARY_FIXTURE),
      });
      return;
    }

    if (path.endsWith("/store/catalog/account/admin/orders")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(filteredAdminOrdersFixture(requestUrl)),
      });
      return;
    }

    if (/\/store\/catalog\/account\/admin\/orders\/[^/]+$/.test(path)) {
      const orderId = decodeURIComponent(path.split("/").pop() ?? "ord-e2e-001");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...ADMIN_ORDER_DETAIL_FIXTURE,
          order: {
            ...ADMIN_ORDER_DETAIL_FIXTURE.order,
            id: orderId,
          },
        }),
      });
      return;
    }

    if (path.endsWith("/store/catalog/account/admin/products")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(filteredAdminProductsFixture(requestUrl)),
      });
      return;
    }

    if (path.endsWith("/store/catalog/account/admin/questions")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ADMIN_QUESTIONS_PAGE_FIXTURE),
      });
      return;
    }

    if (path.endsWith("/store/catalog/account/admin/coupons")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(filteredAdminCouponsFixture(requestUrl)),
      });
      return;
    }

    if (path.endsWith("/store/catalog/account/admin/inventory")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(filteredAdminInventoryFixture(requestUrl)),
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/account/admin/inventory/movements") ||
      path.endsWith("/store/catalog/account/admin/inventory/kardex") ||
      path.endsWith("/store/catalog/account/admin/inventory/history")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(filteredAdminInventoryMovementsFixture(requestUrl)),
      });
      return;
    }

    if (path.endsWith("/store/catalog/account/admin/accounts")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(filteredAdminAccountsFixture(requestUrl)),
      });
      return;
    }

    if (/\/store\/catalog\/account\/admin\/accounts\/[^/]+$/.test(path)) {
      const accountId = decodeURIComponent(path.split("/").pop() ?? "acc-001");
      const detail = buildAdminAccountDetailFixture(requestUrl, accountId);
      if (!detail) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ message: "Not found" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(detail),
      });
      return;
    }

    if (path.endsWith("/store/catalog/account/admin/settings/storefront")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          storefront: {
            store_name: "E2E Store",
            logo_url: "",
            favicon_url: "",
            theme_mode: "light",
            radius_scale: 1,
            font_scale: 1,
            currency_code: "ARS",
            store_locale: "es-AR",
            metadata: {
              banner: {
                image_url: "",
                focus_x: 50,
                focus_y: 50,
                zoom: 1,
              },
            },
          },
        }),
      });
      return;
    }

    if (path.endsWith("/store/catalog/account/admin/uploads")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          files: [{ url: "/assets/home/hero.webp" }],
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

const ROUTES: RouteCheck[] = [
  { name: "home", path: "/" },
  { name: "politica-privacidad", path: "/politica-de-privacidad" },
  { name: "administracion-raiz", path: "/cuenta/administracion", setup: mockAdminSummarySession },
  { name: "administracion-resumen", path: "/cuenta/administracion/resumen", setup: mockAdminSummarySession },
  { name: "administracion-ordenes", path: "/cuenta/administracion/ordenes", setup: mockAdminSummarySession },
  { name: "administracion-productos", path: "/cuenta/administracion/productos", setup: mockAdminSummarySession },
  { name: "administracion-preguntas", path: "/cuenta/administracion/preguntas", setup: mockAdminSummarySession },
  { name: "administracion-clientes", path: "/cuenta/administracion/clientes", setup: mockAdminSummarySession },
  { name: "administracion-inventario", path: "/cuenta/administracion/inventario", setup: mockAdminSummarySession },
  { name: "administracion-promociones", path: "/cuenta/administracion/promociones", setup: mockAdminSummarySession },
  { name: "administracion-apariencia", path: "/cuenta/administracion/apariencia", setup: mockAdminSummarySession },
  { name: "administracion-orden-detalle", path: "/cuenta/administracion/ordenes/ord-e2e-001", setup: mockAdminSummarySession },
  { name: "administracion-productos-crear", path: "/cuenta/administracion/productos/crear", setup: mockAdminSummarySession },
  { name: "administracion-promociones-crear", path: "/cuenta/administracion/promociones/crear", setup: mockAdminSummarySession },
];

const BASE_VIEWPORTS: readonly ViewportScenario[] = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const ADMIN_BOUNDARY_VIEWPORTS: readonly ViewportScenario[] = [
  { name: "bp-640", width: 640, height: 900 },
  { name: "bp-641", width: 641, height: 900 },
  { name: "bp-767", width: 767, height: 900 },
  { name: "bp-768", width: 768, height: 900 },
  { name: "bp-1024", width: 1024, height: 900 },
  { name: "bp-1025", width: 1025, height: 900 },
  { name: "bp-1200", width: 1200, height: 900 },
  { name: "bp-1201", width: 1201, height: 900 },
];

const ADMIN_INTERACTION_BOUNDARY_VIEWPORTS = new Set<string>([
  "bp-641",
  "bp-768",
  "bp-1025",
  "bp-1201",
]);

const CROSS_BROWSER_VISUAL_SMOKE_ROUTES = new Set<string>([
  "administracion-resumen",
  "administracion-ordenes",
  "administracion-productos",
  "administracion-clientes",
  "administracion-inventario",
  "administracion-promociones",
  "administracion-apariencia",
]);

const CROSS_BROWSER_VISUAL_SMOKE_VIEWPORTS = new Set<string>([
  "desktop",
  "mobile",
]);

const CROSS_BROWSER_A11Y_SMOKE_VIEWPORTS = new Set<string>([
  "desktop",
  "mobile",
]);

const ADMIN_VISUAL_SMOKE_THEMES: readonly ThemeScenario[] = ["light", "dark"];

const STABILIZE_STYLES = `
  *,
  *::before,
  *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

function blockingViolations<T extends { impact?: string | null }>(violations: T[]) {
  return violations.filter((entry) => entry.impact === "serious" || entry.impact === "critical");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderA11yFailures(
  violations: Array<{
    id: string;
    impact?: string | null;
    description: string;
    nodes: Array<{ target: ReadonlyArray<unknown> }>;
  }>
) {
  if (!violations.length) return "No blocking accessibility violations";

  return violations
    .map((violation) => {
      const targets = violation.nodes
        .map((node) => node.target.map((segment) => String(segment)).join(" "))
        .filter(Boolean)
        .join(" | ");
      return `[${violation.impact ?? "unknown"}] ${violation.id}: ${violation.description} -> ${targets}`;
    })
    .join("\n");
}

function isAdminRoute(route: RouteCheck) {
  return route.path.startsWith("/cuenta/administracion");
}

function expectedAdminRoutePattern(route: RouteCheck) {
  const targetPath =
    route.name === "administracion-raiz"
      ? "/cuenta/administracion/resumen"
      : route.path;
  return new RegExp(`${escapeRegex(targetPath)}(?:\\?|$)`);
}

function isBaseViewport(viewport: ViewportScenario) {
  return viewport.name === "desktop" || viewport.name === "mobile";
}

function supportsRouteInteractions(viewport: ViewportScenario) {
  return isBaseViewport(viewport) || ADMIN_INTERACTION_BOUNDARY_VIEWPORTS.has(viewport.name);
}

function shouldRunCrossBrowserVisualSmoke(
  route: RouteCheck,
  viewport: ViewportScenario,
  interaction: InteractionScenario
) {
  return (
    interaction.name === "initial" &&
    isAdminRoute(route) &&
    CROSS_BROWSER_VISUAL_SMOKE_ROUTES.has(route.name) &&
    CROSS_BROWSER_VISUAL_SMOKE_VIEWPORTS.has(viewport.name)
  );
}

function shouldRunCrossBrowserA11ySmoke(
  route: RouteCheck,
  viewport: ViewportScenario,
  interaction: InteractionScenario
) {
  return (
    interaction.name === "initial" &&
    isAdminRoute(route) &&
    CROSS_BROWSER_VISUAL_SMOKE_ROUTES.has(route.name) &&
    CROSS_BROWSER_A11Y_SMOKE_VIEWPORTS.has(viewport.name)
  );
}

function viewportsFor(route: RouteCheck): readonly ViewportScenario[] {
  if (!isAdminRoute(route)) return BASE_VIEWPORTS;
  return [...BASE_VIEWPORTS, ...ADMIN_BOUNDARY_VIEWPORTS];
}

async function hoverAdminSidebar(page: Page) {
  const sidebar = page.locator("aside").first();
  await expect(sidebar).toBeVisible();
  await sidebar.hover();
  await page.waitForTimeout(120);
}

async function openAdminMobileSidebar(page: Page) {
  const openButton = page.getByRole("button", { name: /Abrir .* del panel/i }).first();
  const canUseHeaderTrigger = await openButton.isVisible().catch(() => false);

  if (canUseHeaderTrigger) {
    await openButton.click();
  } else {
    await page.evaluate(() => {
      window.dispatchEvent(new Event("admin:sidebar:open"));
    });
  }

  await expect(page.getByRole("button", { name: /Cerrar .* del panel/i }).first()).toBeVisible();
  await page.waitForTimeout(120);
}

async function openSummaryCustomRange(page: Page) {
  const customTab = page.getByRole("tab", { name: "Personalizado" }).first();
  const hasCustomTab = await customTab.isVisible().catch(() => false);
  if (!hasCustomTab) return;

  await customTab.click();
  await expect(page.getByLabel("Desde")).toBeEnabled();
  await expect(page.getByLabel("Hasta")).toBeEnabled();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(120);
}

async function openProductsActionsMenu(page: Page) {
  const trigger = page.getByRole("button", { name: "Abrir acciones" }).first();
  const hasTrigger = await trigger.isVisible().catch(() => false);
  if (!hasTrigger) return;

  await trigger.click();
  await expect(page.getByRole("menu").first()).toBeVisible();
  await page.waitForTimeout(120);
}

async function openOrdersDetailSheet(page: Page) {
  const firstOrderCard = page.getByRole("button").filter({ hasText: "100501" }).first();
  const hasOrderCard = await firstOrderCard.isVisible().catch(() => false);
  if (!hasOrderCard) return;

  await firstOrderCard.click();
  await expect(page.getByText("Datos de la orden").first()).toBeVisible();
  await page.waitForTimeout(120);
}

async function filterOrdersToRefunded(page: Page) {
  const paymentFilter = page
    .locator("select")
    .filter({ has: page.locator('option[value="refunded"]') })
    .first();
  const hasPaymentFilter = await paymentFilter.isVisible().catch(() => false);
  if (!hasPaymentFilter) return;

  await paymentFilter.selectOption("refunded");
  await expect(page.getByText("100507").first()).toBeVisible();
  await expect(page.getByText("Reintegrado").first()).toBeVisible();
  await page.waitForTimeout(120);
}

async function openClientDetailSheet(page: Page) {
  const firstClientButton = page.locator("button").filter({ hasText: "Carlos Arias" }).first();
  const hasClientButton = await firstClientButton.isVisible().catch(() => false);
  if (!hasClientButton) return;

  await firstClientButton.click();
  await expect(page.getByText("Ficha del cliente").first()).toBeVisible();
  await page.waitForTimeout(120);
}

async function filterQuestionsToAnswered(page: Page) {
  const statusFilter = page
    .locator("select")
    .filter({ has: page.locator('option[value="answered"]') })
    .first();
  const hasStatusFilter = await statusFilter.isVisible().catch(() => false);
  if (!hasStatusFilter) return;

  await statusFilter.selectOption("answered");
  await expect(page.getByText("Respondida").first()).toBeVisible();
  await page.waitForTimeout(120);
}

async function filterInventoryBySearch(page: Page) {
  const searchInput = page.getByLabel("Búsqueda").first();
  const hasSearchInput = await searchInput.isVisible().catch(() => false);
  if (!hasSearchInput) return;

  await searchInput.fill("Bateria");
  await page.waitForTimeout(120);
}

async function openCouponEditDialog(page: Page) {
  const editButton = page.getByRole("button", { name: "Editar" }).first();
  const hasEditButton = await editButton.isVisible().catch(() => false);
  if (!hasEditButton) return;

  await editButton.click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
  await page.waitForTimeout(120);
}

async function editAppearancePrimaryColor(page: Page) {
  const themeTrigger = page.locator("#admin_theme_mode").first();
  const hasThemeTrigger = await themeTrigger.isVisible().catch(() => false);
  if (!hasThemeTrigger) return;

  await themeTrigger.click();
  await page.getByRole("option", { name: "Oscuro" }).click();
  await page.waitForTimeout(120);
}

async function openAppearanceBannerEditor(page: Page) {
  const bannerTrigger = page.locator("#admin_store_banner_file").first();
  const hasBannerTrigger = (await bannerTrigger.count()) > 0;
  if (!hasBannerTrigger) return;

  const bannerInput = bannerTrigger.locator("xpath=preceding-sibling::input[@type='file']").first();
  await bannerInput.setInputFiles("public/assets/home/hero.webp");
  await expect(page.getByText("Personalizar banner del hero").first()).toBeVisible();
  await page.waitForTimeout(120);
}

async function openCreateProductCharacteristics(page: Page) {
  const toggle = page.getByRole("button", { name: /Caracteristicas/i }).first();
  const hasToggle = await toggle.isVisible().catch(() => false);
  if (!hasToggle) return;

  await toggle.click();
  await page.waitForTimeout(120);
}

async function fillCreateCouponForm(page: Page) {
  const couponCode = page.locator("#coupon_code");
  const hasCouponCode = await couponCode.isVisible().catch(() => false);
  if (!hasCouponCode) return;

  await couponCode.fill("E2ERESP10");
  await page.locator("#coupon_percentage").fill("10");
  await page.locator("#coupon_title").fill("Promo E2E responsive");
  await page.waitForTimeout(120);
}

function interactionScenariosFor(
  route: RouteCheck,
  viewport: ViewportScenario
): InteractionScenario[] {
  const scenarios: InteractionScenario[] = [{ name: "initial" }];
  const adminRoute = isAdminRoute(route);
  const routeInteractionsEnabled = supportsRouteInteractions(viewport);

  if (adminRoute && viewport.width >= 768) {
    scenarios.push({
      name: "sidebar-hover",
      apply: hoverAdminSidebar,
    });
  }

  if (adminRoute && viewport.width <= 767) {
    scenarios.push({
      name: "sidebar-open",
      apply: openAdminMobileSidebar,
    });
  }

  if (!routeInteractionsEnabled) return scenarios;

  if (route.name === "administracion-resumen") {
    scenarios.push({
      name: "custom-range-open",
      apply: openSummaryCustomRange,
    });
  }

  if (route.name === "administracion-productos") {
    scenarios.push({
      name: "actions-menu-open",
      apply: openProductsActionsMenu,
    });
  }

  if (route.name === "administracion-ordenes") {
    scenarios.push({
      name: "order-sheet-open",
      apply: openOrdersDetailSheet,
    });
    scenarios.push({
      name: "filter-refunded",
      apply: filterOrdersToRefunded,
    });
  }

  if (route.name === "administracion-clientes") {
    scenarios.push({
      name: "client-sheet-open",
      apply: openClientDetailSheet,
    });
  }

  if (route.name === "administracion-preguntas") {
    scenarios.push({
      name: "filter-answered",
      apply: filterQuestionsToAnswered,
    });
  }

  if (route.name === "administracion-inventario") {
    scenarios.push({
      name: "search-bateria",
      apply: filterInventoryBySearch,
    });
  }

  if (route.name === "administracion-promociones") {
    scenarios.push({
      name: "coupon-edit-open",
      apply: openCouponEditDialog,
    });
  }

  if (route.name === "administracion-apariencia") {
    scenarios.push({
      name: "primary-color-edited",
      apply: editAppearancePrimaryColor,
    });
    scenarios.push({
      name: "banner-editor-open",
      apply: openAppearanceBannerEditor,
    });
  }

  if (route.name === "administracion-productos-crear") {
    scenarios.push({
      name: "characteristics-open",
      apply: openCreateProductCharacteristics,
    });
  }

  if (route.name === "administracion-promociones-crear") {
    scenarios.push({
      name: "coupon-form-filled",
      apply: fillCreateCouponForm,
    });
  }

  return scenarios;
}

async function openStableScenario(
  page: Page,
  route: RouteCheck,
  viewport: ViewportScenario,
  interaction: InteractionScenario
) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  if (route.setup) {
    await route.setup(page);
  }

  await page.goto(route.path, { waitUntil: "domcontentloaded" });
  if (isAdminRoute(route)) {
    await page.waitForURL(expectedAdminRoutePattern(route));
  }
  await page.waitForLoadState("networkidle");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: STABILIZE_STYLES });
  if (interaction.apply) {
    await interaction.apply(page);
  }
  await page.waitForTimeout(200);
}

async function applyThemeMode(page: Page, theme: ThemeScenario) {
  await page.evaluate((nextTheme) => {
    document.documentElement.setAttribute("data-theme-mode", nextTheme);
    if (document.body) {
      document.body.setAttribute("data-theme-mode", nextTheme);
    }
    document.documentElement.style.colorScheme = nextTheme;
    if (document.body) {
      document.body.style.colorScheme = nextTheme;
    }
  }, theme);

  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

for (const route of ROUTES) {
  for (const viewport of viewportsFor(route)) {
    for (const interaction of interactionScenariosFor(route, viewport)) {
      const caseId = `${route.name} @ ${viewport.name} @ ${interaction.name}`;
      const snapshotName = `${route.name}--${viewport.name}--${interaction.name}.png`;

      test(`${caseId}: visual baseline`, async ({ page }) => {
        await openStableScenario(page, route, viewport, interaction);

        await expect(page).toHaveScreenshot(snapshotName, {
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          scale: "css",
          maxDiffPixelRatio: 0.01,
        });
      });

      if (shouldRunCrossBrowserVisualSmoke(route, viewport, interaction)) {
        test(`${caseId}: visual smoke`, async ({ page }, testInfo) => {
          await openStableScenario(page, route, viewport, interaction);
          for (const theme of ADMIN_VISUAL_SMOKE_THEMES) {
            await applyThemeMode(page, theme);
            const smokeSnapshotName = `${route.name}--${viewport.name}--${theme}--smoke--${testInfo.project.name}.png`;

            await expect(page).toHaveScreenshot(smokeSnapshotName, {
              fullPage: true,
              animations: "disabled",
              caret: "hide",
              scale: "css",
              maxDiffPixelRatio: 0.01,
            });
          }
        });
      }

      if (shouldRunCrossBrowserA11ySmoke(route, viewport, interaction)) {
        test(`${caseId}: a11y smoke serious/critical`, async ({ page }) => {
          await openStableScenario(page, route, viewport, interaction);

          const analysis = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
          const blocking = blockingViolations(analysis.violations);

          expect(blocking, renderA11yFailures(blocking)).toEqual([]);
        });
      }

      test(`${caseId}: a11y serious/critical`, async ({ page }) => {
        await openStableScenario(page, route, viewport, interaction);

        const analysis = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
        const blocking = blockingViolations(analysis.violations);

        expect(blocking, renderA11yFailures(blocking)).toEqual([]);
      });
    }
  }
}
