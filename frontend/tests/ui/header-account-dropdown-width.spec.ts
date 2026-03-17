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

  await route.fulfill({
    status: options?.status ?? 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

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

async function mockHeaderAccountDropdownWidthSession(page: Page) {
  const account = {
    id: "acc-001",
    email: "admin@example.com",
    first_name: "Admin",
    last_name: "E2E",
    role: "administrator",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-02-28T00:00:00.000Z",
    last_login_at: "2026-03-01T12:00:00.000Z",
    blocked_until: null,
    phone: "+54 11 5555-1111",
    whatsapp: "+54 11 5555-1111",
    admin_notes: "Cuenta de prueba",
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

  await page.route("**/store/catalog/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;

    if (path.endsWith("/store/catalog/auth/session") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
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

    if (path.endsWith("/store/catalog/products/suggestions") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
        suggestions: [],
        count: 0,
        q: "",
        limit: 8,
      });
      return;
    }

    if (path.endsWith("/store/catalog/products") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
        products: [
          createCatalogProduct({
            id: "prod-001",
            name: "Casco Integral",
          }),
        ],
        count: 1,
        limit: 24,
        offset: 0,
        availableSizes: [],
      });
      return;
    }

    if (path.endsWith("/store/catalog/account/admin/accounts") && request.method() === "GET") {
      await fulfillJsonRoute(route, {
        accounts: [account],
        count: 1,
        limit: 50,
        offset: 0,
      });
      return;
    }

    if (
      path.endsWith("/store/catalog/account/admin/accounts/acc-001") &&
      request.method() === "GET"
    ) {
      await fulfillJsonRoute(route, {
        account,
        orders: [],
        orders_total_count: 0,
        orders_limit: 12,
        orders_offset: 0,
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

async function accountDropdownWidth(page: Page) {
  const accountTrigger = page.getByRole("button", { name: /Mi cuenta/i }).first();
  await expect(accountTrigger).toBeVisible();
  await accountTrigger.click();

  const accountDropdown = page.getByRole("menu").filter({ hasText: "Cerrar sesión" }).first();
  await expect(accountDropdown).toBeVisible();

  const accountDropdownRect = await accountDropdown.boundingBox();
  expect(accountDropdownRect).not.toBeNull();

  return accountDropdownRect?.width ?? 0;
}

const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`account dropdown keeps same width in storefront and admin (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockHeaderAccountDropdownWidthSession(page);

    await page.goto("/productos", {
      waitUntil: "domcontentloaded",
    });
    const storefrontWidth = await accountDropdownWidth(page);

    await page.goto("/cuenta/administracion/clientes", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/cuenta\/administracion\/clientes(?:\?|$)/);
    const adminWidth = await accountDropdownWidth(page);

    expect(Math.abs(storefrontWidth - adminWidth)).toBeLessThanOrEqual(1);
  });
}
