import { expect, test, type Page, type Route } from "@playwright/test";

const BUY_NOW_INTENT_KEY = "store:checkout:buy-now:v1";
const CART_STORAGE_KEY = "store:cart:v1";
const CHECKOUT_DRAFT_KEY = "store:checkout:draft:v1";
const CHECKOUT_DRAFT_OWNER_KEY = "_ownerKey";

type CheckoutSeedItem = {
  id: string;
  name: string;
  brand: string;
  category: string;
  priceArs: number;
  qty: number;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

const CHECKOUT_ITEM: CheckoutSeedItem = {
  id: "prod-001",
  name: "Auriculares Pro",
  brand: "Acme",
  category: "audio",
  priceArs: 12999,
  qty: 2,
};

function createCatalogProduct(input: { id: string; name: string }) {
  return {
    id: input.id,
    name: input.name,
    brand: {
      id: "brand-001",
      name: "Acme",
      slug: "acme",
    },
    category: {
      id: "cat-001",
      name: "Accesorios",
    },
    priceArs: 15999,
    stockAvailable: 8,
    stockReserved: 0,
    stockThreshold: 2,
    inStock: true,
    lowStock: false,
    sku: `SKU-${input.id}`,
    createdAt: "2026-03-07T10:00:00.000Z",
  };
}

async function fulfillJsonRoute(
  route: Route,
  body: unknown,
  options?: { status?: number; delayMs?: number }
) {
  if ((options?.delayMs ?? 0) > 0) {
    await wait(options?.delayMs ?? 0);
  }

  await route.fulfill({
    status: options?.status ?? 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockCheckoutSuccess(page: Page) {
  let orderCreateCount = 0;

  await page.route("**/store/catalog/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/auth/session") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
        authenticated: false,
        account: null,
        cart: { items: [] },
        addresses: [],
      });
      return;
    }

    if (path.endsWith("/store/catalog/settings/shipping") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
        shipping: {
          free_shipping_threshold_ars: 50000,
          standard_shipping_ars: 8500,
          express_shipping_ars: 14500,
          express_discounted_shipping_ars: 6500,
        },
      });
      return;
    }

    if (path.endsWith("/store/catalog/telemetry/events") && request.method() === "POST") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (path.endsWith("/store/catalog/checkout/reservations") && request.method() === "POST") {
      await fulfillJsonRoute(route, {
        reservation: { id: "res-001" },
      });
      return;
    }

    if (path.endsWith("/store/catalog/checkout/orders") && request.method() === "POST") {
      orderCreateCount += 1;
      const rawBody = request.postData() || "{}";
      const body = JSON.parse(rawBody) as { total_ars?: number };
      await fulfillJsonRoute(route, {
        order: {
          id: "ord-001",
          order_number: "ORD-0001",
          tracking_code: "TRK-001",
          total_ars: typeof body.total_ars === "number" ? body.total_ars : 34498,
        },
      });
      return;
    }

    if (
      path.includes("/store/catalog/checkout/reservations/") &&
      request.method() === "DELETE"
    ) {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await fulfillJsonRoute(route, {});
  });

  return {
    get orderCreateCount() {
      return orderCreateCount;
    },
  };
}

async function mockAuthenticatedCheckout(page: Page) {
  await page.route("**/store/catalog/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/auth/session") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
        authenticated: true,
        account: {
          id: "acc-001",
          email: "carla.gomez@example.com",
          first_name: "Carla",
          last_name: "Gomez",
          document_number: "28444555",
          role: "user",
          phone: "1144556677",
          whatsapp: "",
          notifications: {
            email: true,
            whatsapp: false,
          },
          blocked_until: null,
          last_login_at: "2026-03-07T10:00:00.000Z",
          created_at: "2026-01-01T10:00:00.000Z",
          updated_at: "2026-03-07T10:00:00.000Z",
        },
        cart: {
          items: [
            {
              id: CHECKOUT_ITEM.id,
              name: CHECKOUT_ITEM.name,
              brand: CHECKOUT_ITEM.brand,
              category: CHECKOUT_ITEM.category,
              priceArs: CHECKOUT_ITEM.priceArs,
              qty: CHECKOUT_ITEM.qty,
            },
          ],
        },
        addresses: [
          {
            id: "addr-001",
            label: "Casa",
            recipient: "Carla Gomez",
            phone: "1144556677",
            line1: "Av. Cabildo 123",
            line2: "Piso 4",
            city: "Belgrano",
            province: "CABA",
            postal_code: "1428",
            is_default: true,
          },
        ],
      });
      return;
    }

    if (path.endsWith("/store/catalog/settings/shipping") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
        shipping: {
          free_shipping_threshold_ars: 50000,
          standard_shipping_ars: 8500,
          express_shipping_ars: 14500,
          express_discounted_shipping_ars: 6500,
        },
      });
      return;
    }

    if (path.endsWith("/store/catalog/telemetry/events") && request.method() === "POST") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await fulfillJsonRoute(route, {});
  });
}

async function mockCatalogSearchRace(page: Page) {
  const baseProduct = createCatalogProduct({
    id: "prod-base",
    name: "Producto Base",
  });
  const staleProduct = createCatalogProduct({
    id: "prod-stale",
    name: "Cadena Vieja",
  });
  const latestProduct = createCatalogProduct({
    id: "prod-latest",
    name: "Casco Integral Sport",
  });

  await page.route("**/store/catalog/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/auth/session") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
        authenticated: false,
        account: null,
        cart: { items: [] },
        addresses: [],
      });
      return;
    }

    if (path.endsWith("/store/catalog/brands") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
        brands: [{ id: "brand-001", name: "Acme", slug: "acme" }],
        count: 1,
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/products/suggestions") &&
      request.method() === "GET"
    ) {
      await fulfillJsonRoute(route, {
        suggestions: [],
        count: 0,
      });
      return;
    }

    if (path.endsWith("/store/catalog/products") && request.method() === "GET") {
      const q = (requestUrl.searchParams.get("q") || "").trim().toLowerCase();

      if (q === "ca") {
        await fulfillJsonRoute(
          route,
          {
            products: [staleProduct],
            count: 1,
            limit: 24,
            offset: 0,
            availableSizes: [],
          },
          { delayMs: 700 }
        );
        return;
      }

      if (q === "cas") {
        await fulfillJsonRoute(
          route,
          {
            products: [latestProduct],
            count: 1,
            limit: 24,
            offset: 0,
            availableSizes: [],
          },
          { delayMs: 50 }
        );
        return;
      }

      await fulfillJsonRoute(route, {
        products: [baseProduct],
        count: 1,
        limit: 24,
        offset: 0,
        availableSizes: [],
      });
      return;
    }

    await fulfillJsonRoute(route, {});
  });
}

async function mockUnavailableCustomerSession(page: Page) {
  await page.route("**/store/catalog/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/auth/session") && request.method() === "GET") {
      await fulfillJsonRoute(
        route,
        {
          message: "backend unavailable",
        },
        { status: 503 }
      );
      return;
    }

    await fulfillJsonRoute(route, {});
  });
}

async function mockProductDetailWithUnavailableSession(page: Page) {
  const product = {
    ...createCatalogProduct({
      id: "prod-helmet",
      name: "Casco Integral Sport",
    }),
    description: "Casco integral para uso urbano y ruta.",
    images: [],
  };

  await page.route("**/store/catalog/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/auth/session") && request.method() === "GET") {
      await fulfillJsonRoute(
        route,
        {
          message: "backend unavailable",
        },
        { status: 503 }
      );
      return;
    }

    if (path.endsWith("/store/catalog/settings/shipping") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
        shipping: {
          free_shipping_threshold_ars: 50000,
          standard_shipping_ars: 8500,
          express_shipping_ars: 14500,
          express_discounted_shipping_ars: 6500,
        },
      });
      return;
    }

    if (path.endsWith("/store/catalog/telemetry/events") && request.method() === "POST") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    if (path.endsWith("/store/catalog/products/prod-helmet") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
        product,
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/products/prod-helmet/related") &&
      request.method() === "GET"
    ) {
      await fulfillJsonRoute(route, {
        products: [],
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/products/prod-helmet/questions") &&
      request.method() === "GET"
    ) {
      await fulfillJsonRoute(route, {
        questions: [],
        count: 0,
        limit: Number(requestUrl.searchParams.get("limit") || 3),
        offset: Number(requestUrl.searchParams.get("offset") || 0),
      });
      return;
    }

    await fulfillJsonRoute(route, {});
  });
}

async function seedCart(page: Page, item: CheckoutSeedItem) {
  await page.addInitScript(
    ({ storageKey, seedItem }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          items: [seedItem],
          updatedAt: Date.now(),
        })
      );
    },
    { storageKey: CART_STORAGE_KEY, seedItem: item }
  );
}

async function seedBuyNowIntent(page: Page, item: CheckoutSeedItem) {
  await page.addInitScript(
    ({ storageKey, seedItem }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          items: [seedItem],
          updatedAt: Date.now(),
        })
      );
    },
    { storageKey: BUY_NOW_INTENT_KEY, seedItem: item }
  );
}

async function seedCheckoutDraft(
  page: Page,
  draft: Record<string, unknown>,
  ownerKey: string | null
) {
  await page.addInitScript(
    ({ storageKey, ownerKeyProp, seedDraft, seedOwnerKey }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          ...seedDraft,
          [ownerKeyProp]: seedOwnerKey,
        })
      );
    },
    {
      storageKey: CHECKOUT_DRAFT_KEY,
      ownerKeyProp: CHECKOUT_DRAFT_OWNER_KEY,
      seedDraft: draft,
      seedOwnerKey: ownerKey,
    }
  );
}

async function completeTransferCheckout(page: Page) {
  await page.locator("#checkout_firstName").waitFor({ state: "visible" });
  await page.locator("#checkout_firstName").fill("Juan");
  await page.locator("#checkout_lastName").fill("Perez");
  await page.locator("#checkout_email").fill("juan.perez@example.com");
  await page.locator("#checkout_phone").fill("1112345678");
  await page.getByRole("button", { name: /^Continuar/i }).click();

  await page.locator("#checkout_dni").fill("30123456");
  await page.locator("#checkout_postal").fill("1428");
  await page.locator("#checkout_address1").fill("Av. Siempre Viva 742");
  await page.locator("#checkout_city").fill("Palermo");
  await page.getByRole("button", { name: /^Continuar/i }).click();

  await page.getByRole("button", { name: /^Continuar/i }).click();
  await page.getByRole("button", { name: /Transferencia/i }).click();
  await page.getByRole("button", { name: /^Continuar/i }).click();

  await page.locator('input[type="checkbox"]').nth(1).check();
  await page.getByRole("button", { name: /Confirmar pedido/i }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Pedido creado");
  await expect(dialog).toContainText("ORD-0001");
}

async function closeSuccessDialog(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Cerrar$/ })
    .nth(1)
    .click();
}

test("successful cart checkout clears the cart snapshot", async ({ page }) => {
  const checkoutMock = await mockCheckoutSuccess(page);
  await seedCart(page, CHECKOUT_ITEM);

  await page.goto("/checkout");
  await completeTransferCheckout(page);

  await expect.poll(async () => {
    return await page.evaluate((storageKey) => {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return -1;
      const data = JSON.parse(raw) as { items?: unknown[] };
      return Array.isArray(data.items) ? data.items.length : -1;
    }, CART_STORAGE_KEY);
  }).toBe(0);
  expect(checkoutMock.orderCreateCount).toBe(1);

  await closeSuccessDialog(page);
  await expect(page.locator("#checkout_firstName")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Ir al/i })).toBeVisible();
});

test("successful buy-now checkout clears the stored intent", async ({ page }) => {
  const checkoutMock = await mockCheckoutSuccess(page);
  await seedBuyNowIntent(page, CHECKOUT_ITEM);

  await page.goto("/checkout?intent=buy-now");
  await completeTransferCheckout(page);

  await expect.poll(async () => {
    return await page.evaluate((storageKey) => {
      return window.sessionStorage.getItem(storageKey);
    }, BUY_NOW_INTENT_KEY);
  }).toBeNull();
  expect(checkoutMock.orderCreateCount).toBe(1);

  await closeSuccessDialog(page);
  await expect(page.locator("#checkout_firstName")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Ir al/i })).toBeVisible();
});

test("authenticated checkout replaces stale guest draft data", async ({ page }) => {
  await mockAuthenticatedCheckout(page);
  await seedCart(page, CHECKOUT_ITEM);
  await seedCheckoutDraft(
    page,
    {
      firstName: "Invitada",
      lastName: "Vieja",
      email: "guest.old@example.com",
      phone: "1199990000",
      dni: "30111222",
      address1: "Calle Falsa 123",
      address2: "Depto 8",
      city: "Lanus",
      province: "Buenos Aires",
      postalCode: "1824",
      notes: "Dejar con porteria",
      billingSameAsShipping: false,
      billingAddress1: "Otra dirección 456",
      billingCity: "Quilmes",
      billingProvince: "Buenos Aires",
      billingPostalCode: "1878",
      invoiceType: "factura_a",
      cuit: "20301112223",
      razonSocial: "Invitada SA",
      acceptTerms: true,
    },
    "guest"
  );

  await page.goto("/checkout");

  await expect(page.locator("#checkout_firstName")).toHaveValue("Carla");
  await expect(page.locator("#checkout_lastName")).toHaveValue("Gomez");
  await expect(page.locator("#checkout_email")).toHaveValue("carla.gomez@example.com");
  await expect(page.locator("#checkout_phone")).toHaveValue("1144556677");

  await page.getByRole("button", { name: /^Continuar/i }).click();

  await expect(page.locator("#checkout_dni")).toHaveValue("28444555");
  await expect(page.locator("#checkout_address1")).toHaveValue("Av. Cabildo 123");
  await expect(page.locator("#checkout_address2")).toHaveValue("Piso 4");
  await expect(page.locator("#checkout_city")).toHaveValue("Belgrano");
  await expect(page.locator("#checkout_postal")).toHaveValue("1428");

  await expect.poll(async () => {
    return await page.evaluate(
      ({ storageKey, ownerKeyProp }) => {
        const raw = window.sessionStorage.getItem(storageKey);
        if (!raw) return null;
        const data = JSON.parse(raw) as Record<string, unknown>;
        return {
          ownerKey:
            typeof data[ownerKeyProp] === "string" ? data[ownerKeyProp] : null,
          email: typeof data.email === "string" ? data.email : null,
          dni: typeof data.dni === "string" ? data.dni : null,
          address1: typeof data.address1 === "string" ? data.address1 : null,
          billingSameAsShipping:
            typeof data.billingSameAsShipping === "boolean"
              ? data.billingSameAsShipping
              : null,
          invoiceType:
            typeof data.invoiceType === "string" ? data.invoiceType : null,
          acceptTerms:
            typeof data.acceptTerms === "boolean" ? data.acceptTerms : null,
        };
      },
      {
        storageKey: CHECKOUT_DRAFT_KEY,
        ownerKeyProp: CHECKOUT_DRAFT_OWNER_KEY,
      }
    );
  }).toEqual({
    ownerKey: "account:acc-001",
    email: "carla.gomez@example.com",
    dni: "28444555",
    address1: "Av. Cabildo 123",
    billingSameAsShipping: true,
    invoiceType: "consumidor_final",
    acceptTerms: false,
  });
});

test("catalog keeps the latest search results when older responses arrive late", async ({
  page,
}) => {
  await mockCatalogSearchRace(page);

  await page.goto("/productos");
  await expect(page.getByText("Producto Base")).toBeVisible();

  const search = page.getByPlaceholder("Buscar producto");
  await search.fill("ca");
  await page.waitForTimeout(320);
  await search.fill("cas");
  await page.waitForTimeout(320);

  await expect(page.getByText("Casco Integral Sport")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByText("Casco Integral Sport")).toBeVisible();
  await expect(page.getByText("Cadena Vieja")).toHaveCount(0);
});

test("account pages degrade explicitly when customer session sync is unavailable", async ({
  page,
}) => {
  await mockUnavailableCustomerSession(page);

  await page.goto("/cuenta");

  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.locator("strong").filter({ hasText: "No pudimos validar tu sesión." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expect(page).not.toHaveURL(/\/ingresar/);
});

test("lists account page keeps the unavailable-session fallback and header state", async ({
  page,
}) => {
  await mockUnavailableCustomerSession(page);

  await page.goto("/cuenta/listas?tab=listas");

  await expect(page).toHaveURL(/\/cuenta\/listas\?tab=listas$/);
  await expect(
    page.locator("strong").filter({ hasText: /No pudimos validar tu sesi/i })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Ingresar" })).toHaveCount(0);
  await expect(page.locator("[aria-label*='No pudimos validar tu sesi']")).toBeVisible();
});

test("product detail keeps degraded session flows out of login redirects", async ({
  page,
}) => {
  await mockProductDetailWithUnavailableSession(page);

  await page.goto("/productos/casco-integral-sport/prod-helmet");
  await expect(
    page.getByRole("heading", { name: "Casco Integral Sport" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Agregar a favoritos" }).click();
  await expect(page).not.toHaveURL(/\/ingresar/);
  await expect(page.getByText(/No pudimos validar tu sesi/i)).toBeVisible();

  await page.getByRole("button", { name: "Agregar a una lista" }).click();
  await expect(page).not.toHaveURL(/\/ingresar/);
  await expect(
    page.getByRole("dialog", { name: "Agregar a una lista" })
  ).toHaveCount(0);
  await expect(page.getByText(/No pudimos validar tu sesi/i)).toBeVisible();
});
