import { expect, test, type Page, type Route } from "@playwright/test";

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fulfillJsonRoute(
  route: Route,
  body: unknown,
  options?: { status?: number; delayMs?: number }
) {
  if ((options?.delayMs ?? 0) > 0) {
    await wait(options?.delayMs ?? 0);
  }

  try {
    await route.fulfill({
      status: options?.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Target page, context or browser has been closed") ||
      message.includes("Route is already handled") ||
      message.includes("Request context disposed")
    ) {
      return;
    }
    throw error;
  }
}

function createAdminAccount() {
  return {
    id: "acc-001",
    email: "carlos.arias@example.com",
    first_name: "Carlos",
    last_name: "Arias",
    role: "user",
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-02-20T11:00:00.000Z",
    last_login_at: "2026-02-25T14:30:00.000Z",
    blocked_until: null,
    phone: "+54 11 5555-1111",
    whatsapp: "+54 11 5555-1111",
    admin_notes: "Cliente frecuente",
    orders_count: 3,
    total_spent_ars: 189900,
    avg_ticket_ars: 63300,
    last_purchase_at: "2026-02-24T18:10:00.000Z",
    last_activity_at: "2026-02-25T14:30:00.000Z",
    addresses: [
      {
        label: "Casa",
        line1: "Av. Siempreviva 123",
        city: "CABA",
        province: "Buenos Aires",
        postal_code: "1414",
      },
    ],
  };
}

async function mockAdminClientsPage(page: Page) {
  let account = createAdminAccount();
  let rolePatchCount = 0;
  let accountPatchCount = 0;

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

  await page.route("**/store/catalog/account/admin/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/account/admin/accounts") && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accounts: [account],
          count: 1,
          limit: 50,
          offset: 0,
        }),
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/account/admin/accounts/acc-001") &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          account,
          orders: [],
          orders_total_count: 0,
          orders_limit: 12,
          orders_offset: 0,
        }),
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/account/admin/accounts/acc-001/role") &&
      request.method() === "PATCH"
    ) {
      rolePatchCount += 1;
      const body = JSON.parse(request.postData() || "{}") as { role?: string };
      account = {
        ...account,
        role: body.role === "administrator" || body.role === "employee" ? body.role : "user",
        updated_at: "2026-03-06T11:00:00.000Z",
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ account }),
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/account/admin/accounts/acc-001") &&
      request.method() === "PATCH"
    ) {
      accountPatchCount += 1;
      const body = JSON.parse(request.postData() || "{}") as {
        blocked_until?: string | null;
        admin_notes?: string;
      };
      account = {
        ...account,
        blocked_until:
          typeof body.blocked_until === "string" || body.blocked_until === null
            ? body.blocked_until
            : account.blocked_until,
        admin_notes:
          typeof body.admin_notes === "string" ? body.admin_notes : account.admin_notes,
        updated_at: "2026-03-06T11:00:00.000Z",
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ account }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  return {
    get rolePatchCount() {
      return rolePatchCount;
    },
    get accountPatchCount() {
      return accountPatchCount;
    },
  };
}

async function mockAdminCouponsPage(page: Page) {
  let deleted = false;
  let deleteCount = 0;
  let updateCount = 0;
  let releaseUpdate: (() => void) | null = null;
  let releaseDelete: (() => void) | null = null;
  const updateReleased = new Promise<void>((resolve) => {
    releaseUpdate = resolve;
  });
  const deleteReleased = new Promise<void>((resolve) => {
    releaseDelete = resolve;
  });
  let coupon = {
    id: "coupon-001",
    code: "BIENVENIDA10",
    title: "Promo bienvenida",
    percentage: 10,
    active: true,
    used_count: 3,
    created_at: "2026-01-15T10:00:00.000Z",
    updated_at: "2026-03-06T10:00:00.000Z",
  };

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

  await page.route("**/store/catalog/account/admin/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/account/admin/coupons") && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          coupons: deleted ? [] : [coupon],
          count: deleted ? 0 : 1,
          limit: 50,
          offset: 0,
        }),
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/account/admin/coupons/coupon-001") &&
      request.method() === "PATCH"
    ) {
      updateCount += 1;
      await updateReleased;
      const body = JSON.parse(request.postData() || "{}") as Record<string, unknown>;
      coupon = {
        ...coupon,
        code: typeof body.code === "string" ? body.code : coupon.code,
        title: typeof body.title === "string" ? body.title : coupon.title,
        percentage:
          typeof body.percentage === "number" ? body.percentage : coupon.percentage,
        active: typeof body.active === "boolean" ? body.active : coupon.active,
        updated_at: "2026-03-07T10:00:00.000Z",
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ coupon }),
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/account/admin/coupons/coupon-001") &&
      request.method() === "DELETE"
    ) {
      deleteCount += 1;
      await deleteReleased;
      deleted = true;
      await route.fulfill({
        status: 204,
        body: "",
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  return {
    get deleteCount() {
      return deleteCount;
    },
    get updateCount() {
      return updateCount;
    },
    allowDelete() {
      releaseDelete?.();
    },
    allowUpdate() {
      releaseUpdate?.();
    },
  };
}

async function mockAdminOrdersPage(
  page: Page,
  overrides?: {
    status?: string;
    paymentStatus?: string;
    paymentMethod?: string;
    holdPatch?: boolean;
    searchResponses?: Record<
      string,
      {
        delayMs?: number;
        order?: Record<string, unknown>;
      }
    >;
    detailSequence?: Array<{
      delayMs?: number;
      order?: Record<string, unknown>;
      itemSkus?: Record<string, string>;
      itemStock?: Record<string, unknown>;
    }>;
  }
) {
  let order = {
    id: "ord-001",
    order_number: "100501",
    account_id: "acc-001",
    email: "cliente@example.com",
    phone: "+54 11 5555-1111",
    status: overrides?.status ?? "processing",
    payment_status: overrides?.paymentStatus ?? "pending",
    total_ars: 189900,
    currency_code: "ARS",
    item_count: 1,
    shipping_method: "moto_envio",
    payment_method: overrides?.paymentMethod ?? "bank_transfer",
    tracking_code: null,
    items: [
      {
        id: "item-1",
        name: "Casco Integral V2",
        brand: "LS2",
        category: "Cascos",
        price_ars: 189900,
        qty: 1,
        image_url: "",
      },
    ],
    metadata: {
      customer: {
        first_name: "Carlos",
        last_name: "Arias",
      },
    },
    created_at: "2026-03-01T10:00:00.000Z",
    updated_at: "2026-03-06T10:00:00.000Z",
  };
  let patchCount = 0;
  let listCount = 0;
  let detailCount = 0;
  let lastSearch = "";
  const detailSequence = [...(overrides?.detailSequence ?? [])];
  let releasePatch: (() => void) | null = null;
  const patchReleased = new Promise<void>((resolve) => {
    releasePatch = resolve;
  });

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

  await page.route("**/store/catalog/account/admin/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/account/admin/orders") && request.method() === "GET") {
      listCount += 1;
      lastSearch = requestUrl.searchParams.get("q") ?? "";
      const searchResponse = overrides?.searchResponses?.[lastSearch];
      const listedOrder = searchResponse?.order ? { ...order, ...searchResponse.order } : order;
      await fulfillJsonRoute(
        route,
        {
          orders: [listedOrder],
          count: 1,
          limit: 50,
          offset: 0,
        },
        { delayMs: searchResponse?.delayMs }
      );
      return;
    }

    if (path.endsWith("/store/catalog/account/admin/orders/ord-001") && request.method() === "GET") {
      detailCount += 1;
      const nextDetail = detailSequence.shift();
      const detailOrder = nextDetail?.order ? { ...order, ...nextDetail.order } : order;
      await fulfillJsonRoute(
        route,
        {
          order: detailOrder,
          item_skus: nextDetail?.itemSkus ?? { "item-1": "CASCO-V2" },
          item_stock: nextDetail?.itemStock ?? {},
        },
        { delayMs: nextDetail?.delayMs }
      );
      return;
    }

    if (
      path.endsWith("/store/catalog/account/admin/orders/ord-001") &&
      request.method() === "PATCH"
    ) {
      patchCount += 1;
      if (overrides?.holdPatch) {
        await patchReleased;
      }
      const body = JSON.parse(request.postData() || "{}") as Record<string, unknown>;
      order = {
        ...order,
        status: typeof body.status === "string" ? body.status : order.status,
        payment_status:
          typeof body.payment_status === "string" ? body.payment_status : order.payment_status,
        tracking_code:
          typeof body.tracking_code === "string" || body.tracking_code === null
            ? body.tracking_code
            : order.tracking_code,
        updated_at: "2026-03-06T11:00:00.000Z",
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          order,
          item_skus: { "item-1": "CASCO-V2" },
          item_stock: {},
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

  return {
    get patchCount() {
      return patchCount;
    },
    get listCount() {
      return listCount;
    },
    get detailCount() {
      return detailCount;
    },
    get lastSearch() {
      return lastSearch;
    },
    allowPatch() {
      releasePatch?.();
    },
  };
}

async function mockAdminProductsPage(
  page: Page,
  overrides?: {
    holdGroupSync?: boolean;
    searchResponses?: Record<
      string,
      {
        delayMs?: number;
        product?: Record<string, unknown>;
      }
    >;
  }
) {
  const bulkRequests: Array<Record<string, unknown>> = [];
  const groupSyncRequests: Array<Record<string, unknown>> = [];
  let listCount = 0;
  let lastSearch = "";
  let legacyMutationCount = 0;
  let releaseGroupSync: (() => void) | null = null;
  const groupSyncReleased = new Promise<void>((resolve) => {
    releaseGroupSync = resolve;
  });

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
      body: JSON.stringify({ brands: [{ id: "brand-ls2", name: "LS2", slug: "ls2" }] }),
    });
  });

  await page.route("**/store/catalog/account/admin/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/account/admin/products") && request.method() === "GET") {
      listCount += 1;
      lastSearch = requestUrl.searchParams.get("q") ?? "";
      const searchResponse = overrides?.searchResponses?.[lastSearch];
      await fulfillJsonRoute(
        route,
        {
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
              imageUrl: "/assets/home/hero.webp",
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
              ...(searchResponse?.product ?? {}),
            },
          ],
          count: 1,
          product_count: 1,
          limit: 48,
          offset: 0,
        },
        { delayMs: searchResponse?.delayMs }
      );
      return;
    }

    if (
      path.endsWith("/store/catalog/account/admin/products/prod-casco-v2-negro-m") &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          product: {
            id: "prod-casco-v2-negro-m",
            name: "Casco Integral V2",
            description: "Casco integral con visor pinlock.",
            brand: "LS2",
            category: "Indumentaria",
            priceArs: 124900,
            costArs: 84000,
            active: true,
            archived: false,
            stockAvailable: 12,
            stockReserved: 2,
            stockSold: 0,
            stockThreshold: 5,
            inStock: true,
            lowStock: false,
            sku: "CASCO-V2-NEGRO-M",
            condition: "nuevo",
            color: "Negro",
            size: "M",
            gender: "unisex",
            variantGroupId: "grp-casco-v2",
            images: ["/assets/home/hero.webp"],
            thumbnail: "/assets/home/hero.webp",
            createdAt: "2026-01-07T12:00:00.000Z",
            updatedAt: "2026-02-26T09:00:00.000Z",
            metadata: {
              line: "street",
              group_id: "grp-casco-v2",
            },
          },
        }),
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/account/admin/products/group") &&
      request.method() === "POST"
    ) {
      const body = JSON.parse(request.postData() || "{}") as Record<string, unknown>;
      groupSyncRequests.push(body);
      if (overrides?.holdGroupSync) {
        await groupSyncReleased;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          groupId: "grp-casco-v2",
          productIds: ["prod-casco-v2-negro-m"],
        }),
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/account/admin/products/bulk") &&
      request.method() === "POST"
    ) {
      const body = JSON.parse(request.postData() || "{}") as Record<string, unknown>;
      bulkRequests.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job: {
            id: `bulk-job-${bulkRequests.length}`,
            action: body.action ?? "publish",
            status: "completed",
            total: Array.isArray(body.productIds) ? body.productIds.length : 0,
            processed: Array.isArray(body.productIds) ? body.productIds.length : 0,
            succeeded: Array.isArray(body.productIds) ? body.productIds.length : 0,
            failed: 0,
            createdAt: "2026-03-06T12:00:00.000Z",
            startedAt: "2026-03-06T12:00:01.000Z",
            finishedAt: "2026-03-06T12:00:02.000Z",
            error: null,
            errors: [],
            parameters: body,
          },
        }),
      });
      return;
    }

    if (
      /\/store\/catalog\/account\/admin\/products\/bulk\/[^/]+$/.test(path) &&
      request.method() === "GET"
    ) {
      const lastRequest = bulkRequests[bulkRequests.length - 1] ?? {};
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job: {
            id: "bulk-job-1",
            action: lastRequest.action ?? "publish",
            status: "completed",
            total: Array.isArray(lastRequest.productIds) ? lastRequest.productIds.length : 0,
            processed: Array.isArray(lastRequest.productIds)
              ? lastRequest.productIds.length
              : 0,
            succeeded: Array.isArray(lastRequest.productIds)
              ? lastRequest.productIds.length
              : 0,
            failed: 0,
            createdAt: "2026-03-06T12:00:00.000Z",
            startedAt: "2026-03-06T12:00:01.000Z",
            finishedAt: "2026-03-06T12:00:02.000Z",
            error: null,
            errors: [],
            parameters: lastRequest,
          },
        }),
      });
      return;
    }

    if (
      request.method() !== "GET" &&
      (/\/store\/catalog\/account\/admin\/products$/.test(path) ||
        /\/store\/catalog\/account\/admin\/products\/[^/]+$/.test(path))
    ) {
      legacyMutationCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  return {
    get bulkRequests() {
      return bulkRequests;
    },
    get groupSyncRequests() {
      return groupSyncRequests;
    },
    get listCount() {
      return listCount;
    },
    get lastSearch() {
      return lastSearch;
    },
    get legacyMutationCount() {
      return legacyMutationCount;
    },
    allowGroupSync() {
      releaseGroupSync?.();
    },
  };
}

async function mockAdminQuestionsPage(page: Page, options?: { totalQuestions?: number }) {
  let deleteCount = 0;
  let listCount = 0;
  let lastSearch = "";
  const totalQuestions = Math.max(2, options?.totalQuestions ?? 2);
  const baseQuestions = [
    {
      id: "question-visible-101",
      product_id: "prod-visible",
      product_title: "Casco Integral V2",
      product_handle: "casco-integral-v2",
      question: "Necesito confirmar si incluye visor pinlock.",
      answer: "",
      status: "pending",
      customer_name: "Carlos Arias",
      customer_email: "carlos.arias@example.com",
      answered_by_account_id: "",
      created_at: "2026-03-06T11:00:00.000Z",
      updated_at: "2026-03-06T11:00:00.000Z",
      answered_at: null,
    },
    {
      id: "question-visible-102",
      product_id: "prod-visible-2",
      product_title: "Aceite Street Race 10W40 1L",
      product_handle: "aceite-street-race-10w40-1l",
      question: "Cada cuantos km recomiendan el cambio?",
      answer: "Para uso urbano recomendamos cada 3000 km o 6 meses.",
      status: "answered",
      customer_name: "Maria Lopez",
      customer_email: "maria.lopez@example.com",
      answered_by_account_id: "admin-e2e",
      created_at: "2026-03-05T11:00:00.000Z",
      updated_at: "2026-03-05T12:00:00.000Z",
      answered_at: "2026-03-05T11:59:00.000Z",
    },
  ];
  let questions = [
    ...baseQuestions,
    ...Array.from({ length: Math.max(0, totalQuestions - baseQuestions.length) }, (_, index) => {
      const sequence = baseQuestions.length + index + 1;
      const isAnswered = sequence % 2 === 0;
      const day = String(((sequence - 1) % 9) + 1).padStart(2, "0");
      return {
        id: `question-visible-${100 + sequence}`,
        product_id: `prod-visible-${sequence}`,
        product_title: `Producto demo ${sequence}`,
        product_handle: `producto-demo-${sequence}`,
        question: `Pregunta de prueba ${sequence}`,
        answer: isAnswered ? `Respuesta de prueba ${sequence}` : "",
        status: isAnswered ? "answered" : "pending",
        customer_name: `Cliente ${sequence}`,
        customer_email: `cliente${sequence}@example.com`,
        answered_by_account_id: isAnswered ? "admin-e2e" : "",
        created_at: `2026-03-${day}T11:00:00.000Z`,
        updated_at: `2026-03-${day}T12:00:00.000Z`,
        answered_at: isAnswered ? `2026-03-${day}T11:59:00.000Z` : null,
      };
    }),
  ];

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

  await page.route("**/store/catalog/account/admin/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/account/admin/questions") && request.method() === "GET") {
      listCount += 1;
      lastSearch = requestUrl.searchParams.get("q") ?? "";
      const status = requestUrl.searchParams.get("status") ?? "all";
      const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "50", 10) || 50;
      const offset = Number.parseInt(requestUrl.searchParams.get("offset") ?? "0", 10) || 0;
      const searchTerm = lastSearch.trim().toLowerCase();
      const filteredQuestions = questions.filter((question) => {
        if (status !== "all" && status !== question.status) {
          return false;
        }

        if (!searchTerm) return true;

        const haystack = [
          question.product_title,
          question.question,
          question.customer_name,
          question.customer_email,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(searchTerm);
      });
      const pageQuestions = filteredQuestions.slice(offset, offset + limit);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          questions: pageQuestions,
          count: filteredQuestions.length,
          limit,
          offset,
        }),
      });
      return;
    }

    if (/\/store\/catalog\/account\/admin\/questions\/[^/]+$/.test(path) && request.method() === "DELETE") {
      deleteCount += 1;
      const questionId = decodeURIComponent(path.split("/").pop() ?? "");
      questions = questions.filter((question) => question.id !== questionId);
      await route.fulfill({
        status: 204,
        body: "",
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  return {
    get deleteCount() {
      return deleteCount;
    },
    get listCount() {
      return listCount;
    },
    get lastSearch() {
      return lastSearch;
    },
  };
}

async function mockAdminAppearancePage(page: Page) {
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

  await page.route("**/store/catalog/account/admin/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (
      path.endsWith("/store/catalog/account/admin/settings/storefront") &&
      request.method() === "GET"
    ) {
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

test("admin child routes stay on the requested path and hide storefront chrome", async ({
  page,
}) => {
  await mockAdminClientsPage(page);

  await page.goto("/cuenta/administracion/clientes", {
    waitUntil: "domcontentloaded",
  });

  await expect(page).toHaveURL(/\/cuenta\/administracion\/clientes(?:\?|$)/);
  await expect(
    page.getByRole("navigation", { name: "Navegacion principal" })
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Carrito:/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Clientes" })).toBeVisible();
});

test("single client actions require explicit confirmation before mutating", async ({
  page,
}) => {
  const requests = await mockAdminClientsPage(page);

  await page.goto("/cuenta/administracion/clientes", {
    waitUntil: "domcontentloaded",
  });

  await page.locator("button").filter({ hasText: "Carlos Arias" }).first().click();
  await expect(page.getByText("Ficha del cliente").first()).toBeVisible();

  await page.locator("#client_role_select").click();
  await page.getByRole("option", { name: "Empleado" }).click();
  await expect(page.getByText("Confirmar cambio de rol")).toBeVisible();
  expect(requests.rolePatchCount).toBe(0);
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(requests.rolePatchCount).toBe(0);

  await page.getByRole("button", { name: /Bloquear cuenta/i }).click();
  await expect(page.getByText("Confirmar bloqueo de cuenta")).toBeVisible();
  expect(requests.accountPatchCount).toBe(0);
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(requests.accountPatchCount).toBe(0);
});

test("coupon deletion requires confirmation and locks the destructive action while pending", async ({
  page,
}) => {
  const requests = await mockAdminCouponsPage(page);

  await page.goto("/cuenta/administracion/promociones", {
    waitUntil: "domcontentloaded",
  });

  const deleteTrigger = page.getByRole("button", { name: /^Eliminar$/ }).first();
  await deleteTrigger.click();
  const dialog = page.getByRole("dialog", { name: "Eliminar cupon" });
  await expect(dialog).toBeVisible();
  const closeButton = dialog.getByRole("button", { name: "Cerrar" });
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Eliminar" })).toBeFocused();
  expect(requests.deleteCount).toBe(0);
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(requests.deleteCount).toBe(0);

  await deleteTrigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(deleteTrigger).toBeFocused();

  await deleteTrigger.click();
  const confirmDeleteButton = page.getByRole("dialog").getByRole("button", { name: "Eliminar" });
  await confirmDeleteButton.click();

  await expect(page.getByRole("button", { name: "Eliminando..." })).toBeDisabled();
  expect(requests.deleteCount).toBe(1);
  await expect(dialog.getByRole("button", { name: "Cerrar" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(dialog).toBeVisible();

  requests.allowDelete();

  await expect(page.locator("div").filter({ hasText: "No hay cupones todavia." }).last()).toBeVisible();
});

test("selects inside admin dialogs support keyboard interaction and keep the parent dialog open", async ({
  page,
}) => {
  await mockAdminCouponsPage(page);

  await page.goto("/cuenta/administracion/promociones", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("button", { name: "Editar" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Editar cupon" });
  const statusSelect = dialog.locator("#coupon_active_coupon-001");

  await expect(dialog).toBeVisible();
  await statusSelect.focus();
  await expect(statusSelect).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(statusSelect).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(statusSelect).toContainText("Inactivo");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const active = document.activeElement;
        const dialog = document.querySelector("[role='dialog'][aria-modal='true']");
        return Boolean(active && dialog?.contains(active));
      })
    )
    .toBe(true);
});

test("coupon edit stays open and non-dismissible while saving", async ({ page }) => {
  const requests = await mockAdminCouponsPage(page);

  await page.goto("/cuenta/administracion/promociones", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("button", { name: "Editar" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Editar cupon" });
  await expect(dialog).toBeVisible();

  await dialog.locator("#coupon_title_coupon-001").fill("Promo pendiente");
  await dialog.getByRole("button", { name: "Guardar" }).click();

  await expect(dialog.getByRole("button", { name: "Guardando..." })).toBeDisabled();
  expect(requests.updateCount).toBe(1);
  await expect(dialog.getByRole("button", { name: "Cerrar" })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(dialog).toBeVisible();

  requests.allowUpdate();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("Promo pendiente").first()).toBeVisible();
});

test("mobile admin sidebar exposes dialog semantics and traps focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdminCouponsPage(page);

  await page.goto("/cuenta/administracion/promociones", {
    waitUntil: "domcontentloaded",
  });

  const trigger = page.locator('[aria-controls="admin-mobile-sidebar"]');
  await expect(trigger).toHaveAttribute("aria-controls", "admin-mobile-sidebar");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Menú del panel" });
  const closeButton = dialog.getByRole("button", { name: "Cerrar menú del panel" });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await closeButton.focus();
  await expect(closeButton).toBeFocused();
  await expect
    .poll(async () => await page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");

  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "Configuración" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});

test("order payment confirmation requires explicit approval before mutating", async ({ page }) => {
  const requests = await mockAdminOrdersPage(page, {
    status: "processing",
    paymentStatus: "pending",
    paymentMethod: "bank_transfer",
  });

  await page.goto("/cuenta/administracion/ordenes", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("button").filter({ hasText: "100501" }).first().click();
  await expect(page.getByRole("button", { name: "Confirmar pago" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Confirmar pago" }).first().click();
  await expect(page.getByText("Confirmar pago de la orden")).toBeVisible();
  expect(requests.patchCount).toBe(0);
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(requests.patchCount).toBe(0);
});

test("order delivery confirmation requires explicit approval before mutating", async ({ page }) => {
  const requests = await mockAdminOrdersPage(page, {
    status: "out_for_delivery",
    paymentStatus: "paid",
    paymentMethod: "bank_transfer",
  });

  await page.goto("/cuenta/administracion/ordenes", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("button").filter({ hasText: "100501" }).first().click();
  await expect(page.getByRole("button", { name: "Marcar como entregada" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Marcar como entregada" }).first().click();
  await expect(page.getByText("Confirmar entrega de la orden")).toBeVisible();
  expect(requests.patchCount).toBe(0);
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(requests.patchCount).toBe(0);
});

test("order detail sheet exposes an accessible name and restores focus when it closes", async ({
  page,
}) => {
  await mockAdminOrdersPage(page);

  await page.goto("/cuenta/administracion/ordenes", {
    waitUntil: "domcontentloaded",
  });

  const orderTrigger = page.getByRole("button").filter({ hasText: "100501" }).first();
  await orderTrigger.click();

  const sheet = page.getByRole("dialog", { name: /Orden 100501/i });
  await expect(sheet).toBeVisible();
  const closeButton = sheet.getByRole("button", { name: "Cerrar" });
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(sheet.getByRole("link", { name: "Ver detalle de la orden" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(orderTrigger).toBeFocused();
});

test("bulk client actions require confirmation before mutating", async ({ page }) => {
  const requests = await mockAdminClientsPage(page);

  await page.goto("/cuenta/administracion/clientes", {
    waitUntil: "domcontentloaded",
  });

  await page
    .getByRole("checkbox", { name: "Seleccionar Carlos Arias" })
    .check();

  await page.locator("#clients_bulk_role").click();
  await page.getByRole("option", { name: "Empleado" }).click();
  await page.getByRole("button", { name: /Aplicar/i }).click();
  await expect(page.getByText("Confirmar cambio masivo de rol")).toBeVisible();
  expect(requests.rolePatchCount).toBe(0);
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(requests.rolePatchCount).toBe(0);

  await page.locator("#clients_bulk_mode").click();
  await page.getByRole("option", { name: "Cambiar estado" }).click();
  await page.locator("#clients_bulk_status").click();
  await page.getByRole("option", { name: "Bloqueado" }).click();
  await page.getByRole("button", { name: /Aplicar/i }).click();
  await expect(page.getByText("Confirmar bloqueo masivo de cuentas")).toBeVisible();
  expect(requests.accountPatchCount).toBe(0);
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(requests.accountPatchCount).toBe(0);
});

test("question deletion removes the record instead of hiding it", async ({
  page,
}) => {
  const requests = await mockAdminQuestionsPage(page);

  await page.goto("/cuenta/administracion/preguntas", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByText("Necesito confirmar si incluye visor pinlock.").first()).toBeVisible();
  await expect(page.getByText("Mostrando del 1 al 2 de 2 preguntas")).toBeVisible();

  await page.getByRole("button", { name: "Eliminar pregunta" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Eliminar pregunta" });
  await expect(dialog).toBeVisible();
  expect(requests.deleteCount).toBe(0);

  await dialog.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect.poll(() => requests.deleteCount).toBe(1);
  await expect(page.getByText("Necesito confirmar si incluye visor pinlock.").first()).toHaveCount(0);
  await expect(page.getByText("Mostrando del 1 al 1 de 1 preguntas")).toBeVisible();
});

test("questions background refresh ignores duplicate focus and visibility events while data is still fresh", async ({
  page,
}) => {
  const requests = await mockAdminQuestionsPage(page);

  await page.goto("/cuenta/administracion/preguntas", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByText("Necesito confirmar si incluye visor pinlock.").first()).toBeVisible();
  await expect.poll(() => requests.listCount).toBe(1);

  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await page.waitForTimeout(300);
  expect(requests.listCount).toBe(1);
});

test("questions pagination clamps to the last available page after deleting the final result", async ({
  page,
}) => {
  await mockAdminQuestionsPage(page, { totalQuestions: 51 });

  await page.goto("/cuenta/administracion/preguntas", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByText("Mostrando del 1 al 50 de 51 preguntas")).toBeVisible();
  await page.getByRole("button", { name: "Ir a pagina 2" }).click();
  await expect(page.getByText("Mostrando del 51 al 51 de 51 preguntas")).toBeVisible();
  await expect(page.getByText("Pregunta de prueba 51").first()).toBeVisible();

  await page.getByRole("button", { name: "Eliminar pregunta" }).click();
  const dialog = page.getByRole("dialog", { name: "Eliminar pregunta" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Eliminar", exact: true }).click();

  await expect(page.getByText("Mostrando del 1 al 50 de 50 preguntas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ir a pagina 2" })).toHaveCount(0);
  await expect(page.getByText("Pregunta de prueba 50").first()).toBeVisible();
  await expect(page.getByText("No hay preguntas con estos filtros.")).toHaveCount(0);
});

test("questions search debounces network refreshes while typing", async ({ page }) => {
  const requests = await mockAdminQuestionsPage(page);

  await page.goto("/cuenta/administracion/preguntas", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByText("Necesito confirmar si incluye visor pinlock.").first()).toBeVisible();
  await expect.poll(() => requests.listCount).toBe(1);

  const searchInput = page.getByPlaceholder("Buscar por producto, pregunta o cliente");
  await searchInput.pressSequentially("visor", { delay: 35 });

  await page.waitForTimeout(150);
  expect(requests.listCount).toBe(1);

  await expect.poll(() => requests.listCount).toBe(2);
  expect(requests.lastSearch).toBe("visor");
});

test("orders search debounces network refreshes while typing", async ({ page }) => {
  const requests = await mockAdminOrdersPage(page);

  await page.goto("/cuenta/administracion/ordenes", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByRole("button").filter({ hasText: "100501" }).first()).toBeVisible();
  await expect.poll(() => requests.listCount).toBe(1);

  const searchInput = page.getByPlaceholder("Buscar orden");
  await searchInput.pressSequentially("1005", { delay: 35 });

  await page.waitForTimeout(150);
  expect(requests.listCount).toBe(1);

  await expect.poll(() => requests.listCount).toBe(2);
  expect(requests.lastSearch).toBe("1005");
});

test("orders ignore stale list responses that arrive after a newer search", async ({ page }) => {
  const requests = await mockAdminOrdersPage(page, {
    searchResponses: {
      cas: {
        delayMs: 500,
        order: {
          order_number: "100111",
        },
      },
      casco: {
        order: {
          order_number: "100999",
        },
      },
    },
  });

  await page.goto("/cuenta/administracion/ordenes", {
    waitUntil: "domcontentloaded",
  });

  const searchInput = page.getByPlaceholder("Buscar orden");
  await expect(page.getByRole("button").filter({ hasText: "100501" }).first()).toBeVisible();

  await searchInput.fill("cas");
  await expect.poll(() => requests.listCount).toBe(2);

  await searchInput.fill("casco");
  await expect.poll(() => requests.listCount).toBe(3);
  await expect(page.getByRole("button").filter({ hasText: "100999" }).first()).toBeVisible();

  await page.waitForTimeout(650);
  await expect(page.getByRole("button").filter({ hasText: "100999" }).first()).toBeVisible();
  await expect(page.getByRole("button").filter({ hasText: "100111" })).toHaveCount(0);
});

test("order detail ignores stale responses for the same order after a newer refresh", async ({
  page,
}) => {
  await mockAdminOrdersPage(page, {
    detailSequence: [
      {
        delayMs: 500,
        order: {
          tracking_code: "SLOW-001",
          metadata: {
            customer: {
              first_name: "Carlos",
              last_name: "Arias",
            },
            admin_notes: "Nota vieja",
          },
        },
      },
      {
        order: {
          tracking_code: "FAST-999",
          metadata: {
            customer: {
              first_name: "Carlos",
              last_name: "Arias",
            },
            admin_notes: "Nota nueva",
          },
        },
      },
    ],
  });

  await page.goto("/cuenta/administracion/ordenes", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("button").filter({ hasText: "100501" }).first().click();
  await expect(page.getByText("Cargando detalle...")).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new Event("store:invalidate:admin-orders"));
  });

  const sheet = page.getByRole("dialog", { name: /Orden 100501/i });
  await expect(sheet.locator("#order_tracking_input")).toHaveValue("FAST-999");
  await expect(sheet.locator("#order_admin_notes")).toHaveValue("Nota nueva");

  await page.waitForTimeout(650);
  await expect(sheet.locator("#order_tracking_input")).toHaveValue("FAST-999");
  await expect(sheet.locator("#order_admin_notes")).toHaveValue("Nota nueva");
});

test("order detail preserves local tracking and notes drafts during background refresh", async ({
  page,
}) => {
  const requests = await mockAdminOrdersPage(page, {
    detailSequence: [
      {
        order: {
          tracking_code: "TRACK-INIT",
          metadata: {
            customer: {
              first_name: "Carlos",
              last_name: "Arias",
            },
            admin_notes: "Nota servidor inicial",
          },
        },
      },
      {
        order: {
          tracking_code: "TRACK-SERVER-NEW",
          metadata: {
            customer: {
              first_name: "Carlos",
              last_name: "Arias",
            },
            admin_notes: "Nota servidor nueva",
          },
        },
      },
    ],
  });

  await page.goto("/cuenta/administracion/ordenes", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("button").filter({ hasText: "100501" }).first().click();

  const sheet = page.getByRole("dialog", { name: /Orden 100501/i });
  const trackingInput = sheet.locator("#order_tracking_input");
  const notesInput = sheet.locator("#order_admin_notes");

  await expect(trackingInput).toHaveValue("TRACK-INIT");
  await expect(notesInput).toHaveValue("Nota servidor inicial");

  await trackingInput.fill("TRACK-LOCAL");
  await notesInput.fill("Nota local en progreso");

  await page.evaluate(() => {
    window.dispatchEvent(new Event("store:invalidate:admin-orders"));
  });

  await expect.poll(() => requests.detailCount).toBe(2);
  await expect(trackingInput).toHaveValue("TRACK-LOCAL");
  await expect(notesInput).toHaveValue("Nota local en progreso");
  await page.waitForTimeout(150);
  await expect(trackingInput).toHaveValue("TRACK-LOCAL");
  await expect(notesInput).toHaveValue("Nota local en progreso");
});

test("order detail sheet stays open and non-dismissible while saving", async ({ page }) => {
  const requests = await mockAdminOrdersPage(page, {
    holdPatch: true,
  });

  await page.goto("/cuenta/administracion/ordenes", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("button").filter({ hasText: "100501" }).first().click();

  const sheet = page.getByRole("dialog", { name: /Orden 100501/i });
  await expect(sheet).toBeVisible();

  await sheet.locator("#order_tracking_input").fill("TRACK-LOCKED");
  await sheet.getByRole("button", { name: "Guardar tracking" }).click();

  await expect(sheet.getByRole("button", { name: "Guardando..." }).first()).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "Cerrar" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(sheet).toBeVisible();
  expect(requests.patchCount).toBe(1);

  requests.allowPatch();

  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Guardar tracking" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Cerrar" })).toBeVisible();
});

test("bulk product actions require explicit selection and confirmation before posting", async ({
  page,
}) => {
  const requests = await mockAdminProductsPage(page);

  await page.goto("/cuenta/administracion/productos", {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("button", { name: "Seleccionar Casco Integral V2" }).click();

  const bulkActionTrigger = page.locator("#products_bulk_action");
  const runButton = page.getByRole("button", { name: "Seleccionar accion" });
  await expect(runButton).toBeDisabled();

  await bulkActionTrigger.click();
  await page.getByRole("option", { name: /publicar/i }).click();
  await page.getByRole("button", { name: "Publicar seleccion" }).click();
  await expect(page.getByText("Publicar producto")).toBeVisible();
  expect(requests.bulkRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(requests.bulkRequests).toHaveLength(0);

  await bulkActionTrigger.click();
  await page.getByRole("option", { name: /cambiar categor/i }).click();
  await page.locator("#products_bulk_category").click();
  await page.getByRole("option", { name: "Motor" }).click();
  await page.getByRole("button", { name: "Cambiar categoria" }).click();
  await expect(page.getByText("Cambiar categoria de productos")).toBeVisible();
  expect(requests.bulkRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(requests.bulkRequests).toHaveLength(0);

  await bulkActionTrigger.click();
  await page.getByRole("option", { name: /ajustar stock/i }).click();
  await page.locator("#products_bulk_stock_delta").fill("+5");
  await page.getByRole("button", { name: "Ajustar stock" }).click();
  await expect(page.getByText("Ajustar stock de productos")).toBeVisible();
  expect(requests.bulkRequests).toHaveLength(0);
  await page.getByRole("button", { name: "Cancelar" }).click();
  expect(requests.bulkRequests).toHaveLength(0);

  await bulkActionTrigger.click();
  await page.getByRole("option", { name: /publicar/i }).click();
  await page.getByRole("button", { name: "Publicar seleccion" }).click();
  await page.getByRole("dialog", { name: "Publicar producto" }).getByRole("button", { name: "Publicar" }).click();
  await expect
    .poll(() => requests.bulkRequests.length)
    .toBe(1);
  expect(requests.bulkRequests[0]).toMatchObject({
    action: "publish",
    productIds: ["prod-casco-v2-negro-m"],
  });
});

test("products search debounces network refreshes while typing", async ({ page }) => {
  const requests = await mockAdminProductsPage(page);

  await page.goto("/cuenta/administracion/productos", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByRole("button", { name: "Seleccionar Casco Integral V2" })).toBeVisible();
  await expect.poll(() => requests.listCount).toBe(1);

  const searchInput = page.getByPlaceholder("Buscar producto");
  await searchInput.pressSequentially("casco", { delay: 35 });

  await page.waitForTimeout(150);
  expect(requests.listCount).toBe(1);

  await expect.poll(() => requests.listCount).toBe(2);
  expect(requests.lastSearch).toBe("casco");
});

test("products ignore stale list responses that arrive after a newer search", async ({ page }) => {
  const requests = await mockAdminProductsPage(page, {
    searchResponses: {
      cas: {
        delayMs: 500,
        product: {
          name: "Producto lento",
        },
      },
      casco: {
        product: {
          name: "Casco Integral V2 Carbon",
        },
      },
    },
  });

  await page.goto("/cuenta/administracion/productos", {
    waitUntil: "domcontentloaded",
  });

  const searchInput = page.getByPlaceholder("Buscar producto");
  await expect(page.getByRole("button", { name: "Seleccionar Casco Integral V2" })).toBeVisible();

  await searchInput.fill("cas");
  await expect.poll(() => requests.listCount).toBe(2);

  await searchInput.fill("casco");
  await expect.poll(() => requests.listCount).toBe(3);
  await expect(
    page.getByRole("button", { name: "Seleccionar Casco Integral V2 Carbon" })
  ).toBeVisible();

  await page.waitForTimeout(650);
  await expect(
    page.getByRole("button", { name: "Seleccionar Casco Integral V2 Carbon" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Seleccionar Producto lento" })).toHaveCount(0);
});

test("product edit syncs the whole group in one atomic request", async ({ page }) => {
  const requests = await mockAdminProductsPage(page);

  await page.goto("/cuenta/administracion/productos", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByRole("button", { name: "Seleccionar Casco Integral V2" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir acciones" }).first().click();
  await page.getByRole("menuitem", { name: "Editar" }).click();

  const dialog = page.getByRole("dialog", { name: "Editar producto" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nombre").fill("Casco Integral V2 Reloaded");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();

  await expect.poll(() => requests.groupSyncRequests.length).toBe(1);
  await expect(dialog).toBeHidden();
  expect(requests.legacyMutationCount).toBe(0);

  expect(requests.groupSyncRequests[0]).toMatchObject({
    anchorProductId: "prod-casco-v2-negro-m",
  });
  expect(requests.groupSyncRequests[0]?.variants).toMatchObject([
    {
      id: "prod-casco-v2-negro-m",
      name: "Casco Integral V2 Reloaded",
      brand: "LS2",
      category: "Indumentaria",
      priceArs: 124900,
      stockAvailable: 12,
    },
  ]);
});

test("product edit dialog stays open and non-dismissible while saving", async ({ page }) => {
  const requests = await mockAdminProductsPage(page, {
    holdGroupSync: true,
  });

  await page.goto("/cuenta/administracion/productos", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByRole("button", { name: "Seleccionar Casco Integral V2" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir acciones" }).first().click();
  await page.getByRole("menuitem", { name: "Editar" }).click();

  const dialog = page.getByRole("dialog", { name: "Editar producto" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nombre").fill("Casco Integral V2 Locked");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();

  await expect(dialog.getByRole("button", { name: "Guardando..." })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cerrar" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(dialog).toBeVisible();
  await expect.poll(() => requests.groupSyncRequests.length).toBe(1);

  requests.allowGroupSync();

  await expect(dialog).toBeHidden();
});

test("hero banner editor exposes keyboard-operable controls for horizontal and vertical framing", async ({
  page,
}) => {
  await mockAdminAppearancePage(page);

  await page.goto("/cuenta/administracion/apariencia", {
    waitUntil: "domcontentloaded",
  });

  const bannerTrigger = page.locator("#admin_store_banner_file").first();
  const bannerInput = bannerTrigger
    .locator("xpath=preceding-sibling::input[@type='file']")
    .first();
  await bannerInput.setInputFiles("public/assets/home/hero.webp");

  await expect(page.getByRole("dialog", { name: "Personalizar banner del hero" })).toBeVisible();

  const horizontalRange = page.locator("#banner_focus_x_range");
  const verticalRange = page.locator("#banner_focus_y_range");

  await expect(horizontalRange).toHaveValue("50");
  await expect(verticalRange).toHaveValue("50");

  await horizontalRange.press("ArrowRight");
  await verticalRange.press("ArrowRight");

  await expect(horizontalRange).toHaveValue("51");
  await expect(verticalRange).toHaveValue("51");
});

test("hero banner editor confirms before discarding unsaved framing changes", async ({
  page,
}) => {
  await mockAdminAppearancePage(page);

  await page.goto("/cuenta/administracion/apariencia", {
    waitUntil: "domcontentloaded",
  });

  const bannerTrigger = page.locator("#admin_store_banner_file").first();
  const bannerInput = bannerTrigger
    .locator("xpath=preceding-sibling::input[@type='file']")
    .first();
  await bannerInput.setInputFiles("public/assets/home/hero.webp");

  const editor = page.getByRole("dialog", { name: "Personalizar banner del hero" });
  await expect(editor).toBeVisible();

  const horizontalRange = page.locator("#banner_focus_x_range");
  await horizontalRange.press("ArrowRight");
  await expect(horizontalRange).toHaveValue("51");

  await editor.getByRole("button", { name: "Cancelar" }).click();

  const confirmDialog = page.getByRole("dialog", {
    name: "Descartar ajustes del banner",
  });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Seguir editando" }).click();
  await expect(editor).toBeVisible();
  await expect(horizontalRange).toHaveValue("51");

  await page.keyboard.press("Escape");
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Descartar cambios" }).click();
  await expect(editor).toBeHidden();
});
