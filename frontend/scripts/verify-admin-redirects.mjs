import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const BASE_URL =
  process.env.THEME_AUDIT_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://127.0.0.1:3000";

const OUTPUT_DIR = path.resolve(".tmp/theme-audit");
const REPORT_PATH = path.join(OUTPUT_DIR, "admin-redirects-report.json");

const ADMIN_ROUTES = [
  "/cuenta/administracion/resumen",
  "/cuenta/administracion/ordenes",
  "/cuenta/administracion/productos",
  "/cuenta/administracion/preguntas",
  "/cuenta/administracion/clientes",
  "/cuenta/administracion/inventario",
  "/cuenta/administracion/promociones",
  "/cuenta/administracion/apariencia",
];

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: "es-AR",
  });
  const page = await context.newPage();

  const checks = [];
  let failed = 0;

  try {
    for (const route of ADMIN_ROUTES) {
      const target = new URL(route, BASE_URL).toString();
      await page.goto(target, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");

      const finalUrl = page.url();
      const redirectedToLogin =
        finalUrl.includes("/ingresar") &&
        finalUrl.includes(`redirect=${encodeURIComponent(route)}`);

      if (!redirectedToLogin) failed += 1;

      checks.push({
        route,
        requestedUrl: target,
        finalUrl,
        redirectedToLogin,
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const report = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    totalRoutes: ADMIN_ROUTES.length,
    failedRoutes: failed,
    checks,
  };

  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (failed > 0) {
    console.error(`Admin redirect check failed in ${failed} route(s).`);
    console.error(`Report: ${REPORT_PATH}`);
    process.exit(1);
  }

  console.log("OK: admin routes redirect to /ingresar without authenticated session.");
  console.log(`Routes checked: ${ADMIN_ROUTES.length}`);
  console.log(`Report: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
