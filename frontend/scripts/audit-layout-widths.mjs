import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const BASE_URL =
  process.env.THEME_AUDIT_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://127.0.0.1:4173";

const OUTPUT_DIR = path.resolve(".tmp/theme-audit");
const REPORT_PATH = path.join(OUTPUT_DIR, "layout-width-report.json");

const ROUTES = [
  "/",
  "/productos",
  "/contacto",
  "/nosotros",
  "/ingresar",
  "/restablecer",
  "/carrito",
  "/checkout",
  "/comprobante?order=demo&token=demo",
  "/terminos-y-condiciones",
  "/politica-de-privacidad",
  "/cambios-y-devoluciones",
  "/politica-de-envios",
  "/boton-de-arrepentimiento",
  "/mantenimiento",
  "/cuenta",
  "/cuenta/pedidos",
  "/cuenta/listas",
  "/cuenta/historial",
  "/cuenta/datos-personales",
  "/cuenta/administracion/resumen",
  "/cuenta/administracion/ordenes",
  "/cuenta/administracion/productos",
  "/cuenta/administracion/preguntas",
  "/cuenta/administracion/clientes",
  "/cuenta/administracion/inventario",
  "/cuenta/administracion/promociones",
  "/cuenta/administracion/apariencia",
  "/cuenta/administracion/productos/crear",
  "/cuenta/administracion/promociones/crear",
  "/not-found-layout-audit",
];

const WIDTH_TOLERANCE_PX = 1;
const STRUCTURAL_WIDTH_WINDOW_PX = 96;

function approxEqual(a, b, tolerance = WIDTH_TOLERANCE_PX) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= tolerance;
}

function truncate(value, max = 160) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}\u2026`;
}

function sanitizeRoute(route) {
  return route
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^$/, "home");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function setTheme(page, theme) {
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
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })
  );
}

async function collectLayoutSnapshot(page) {
  return page.evaluate((structuralWidthWindowPx) => {
    const IGNORED_TAGS = new Set(["SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT"]);

    function resolveLength(rawValue) {
      const value = String(rawValue || "").trim();
      if (!value) return null;
      const probe = document.createElement("div");
      probe.style.position = "fixed";
      probe.style.left = "-99999px";
      probe.style.top = "-99999px";
      probe.style.visibility = "hidden";
      probe.style.pointerEvents = "none";
      probe.style.width = value;
      document.body.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return Number.isFinite(width) ? width : null;
    }

    function parseCssPx(rawValue) {
      const value = String(rawValue || "").trim();
      if (!value || value === "none") return null;
      const pxMatch = value.match(/^(-?\d+(?:\.\d+)?)px$/);
      if (pxMatch) {
        const pxValue = Number(pxMatch[1]);
        return Number.isFinite(pxValue) ? pxValue : null;
      }
      const resolved = resolveLength(value);
      if (!Number.isFinite(resolved)) return null;
      return resolved;
    }

    function readNodeMetrics(element, selector) {
      if (!element) return null;
      const computed = window.getComputedStyle(element);
      if (computed.display === "none" || computed.visibility === "hidden") return null;

      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const maxWidthPx = parseCssPx(computed.maxWidth);
      return {
        selector,
        node: element.tagName.toLowerCase(),
        className:
          typeof element.className === "string" ? element.className.slice(0, 200) : "",
        widthPx: Math.round(rect.width * 100) / 100,
        maxWidthRaw: computed.maxWidth.trim(),
        maxWidthPx:
          Number.isFinite(maxWidthPx) && maxWidthPx !== null
            ? Math.round(maxWidthPx * 100) / 100
            : null,
        marginLeft: computed.marginLeft,
        marginRight: computed.marginRight,
      };
    }

    function firstMetrics(selectors) {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        const metrics = readNodeMetrics(node, selector);
        if (metrics) return metrics;
      }
      return null;
    }

    const rootComputed = window.getComputedStyle(document.documentElement);
    const tokens = {
      pageMaxWidthPx: resolveLength(rootComputed.getPropertyValue("--page-max-width")),
      containerPx: resolveLength("var(--container)"),
      adminContentMaxWidthPx: resolveLength("var(--admin-content-max-width)"),
    };

    const anchors = {
      headerContainer: firstMetrics([
        "[data-site-header] .container",
        "[data-site-header] > div > div",
        "[data-site-header] > div",
        "[data-site-header] [class*='innerAdmin']",
      ]),
      main: firstMetrics(["main"]),
      mainContainer: firstMetrics(["main.container"]),
      adminContent: firstMetrics([
        "main [class*='admin-layout_content']",
        "main [class*='admin-layout_topbar']",
      ]),
      footerContainer: firstMetrics(["[data-site-footer] .container"]),
    };

    const expectedPageWidth = tokens.pageMaxWidthPx;
    const minimumStructuralMaxWidth = Number.isFinite(expectedPageWidth)
      ? Math.max(0, expectedPageWidth - structuralWidthWindowPx)
      : 1000;
    const maximumStructuralMaxWidth = Number.isFinite(expectedPageWidth)
      ? expectedPageWidth + structuralWidthWindowPx
      : Number.POSITIVE_INFINITY;

    const buckets = new Map();
    const candidates = [];

    const nodes = [document.documentElement, ...document.body.querySelectorAll("*")];
    for (const node of nodes) {
      if (IGNORED_TAGS.has(node.tagName)) continue;
      if (node.hasAttribute("data-theme-audit-ignore")) continue;

      const computed = window.getComputedStyle(node);
      if (computed.display === "none" || computed.visibility === "hidden") continue;

      const rect = node.getBoundingClientRect();
      if (rect.width <= 2 || rect.height <= 2) continue;

      const maxWidthPx = parseCssPx(computed.maxWidth);
      if (!Number.isFinite(maxWidthPx) || maxWidthPx === null) continue;
      if (maxWidthPx < minimumStructuralMaxWidth) continue;
      if (maxWidthPx > maximumStructuralMaxWidth) continue;

      const className = typeof node.className === "string" ? node.className : "";
      const centered = computed.marginLeft === "auto" || computed.marginRight === "auto";
      const insideHeader = Boolean(node.closest("[data-site-header]"));
      const insideFooter = Boolean(node.closest("[data-site-footer]"));
      const insideMain = Boolean(node.closest("main"));
      const structural =
        centered ||
        className.includes("container") ||
        node.tagName === "MAIN" ||
        node.hasAttribute("data-site-header") ||
        node.hasAttribute("data-site-footer") ||
        insideHeader ||
        insideFooter ||
        insideMain;

      if (!structural) continue;

      const roundedMaxWidth = Math.round(maxWidthPx * 100) / 100;
      buckets.set(roundedMaxWidth, (buckets.get(roundedMaxWidth) || 0) + 1);

      if (candidates.length < 24) {
        candidates.push({
          node: node.tagName.toLowerCase(),
          className: className.slice(0, 200),
          widthPx: Math.round(rect.width * 100) / 100,
          maxWidthPx: roundedMaxWidth,
        });
      }
    }

    const structuralMaxWidthBuckets = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([maxWidthPx, count]) => ({ maxWidthPx, count }));

    return {
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      tokens,
      anchors,
      structuralMaxWidthBuckets,
      candidates,
    };
  }, STRUCTURAL_WIDTH_WINDOW_PX);
}

function compareAnchorWidth(lightAnchor, darkAnchor) {
  if (!lightAnchor && !darkAnchor) return null;
  if (!lightAnchor || !darkAnchor) {
    return {
      type: "anchor_presence_mismatch",
      light: lightAnchor ? "present" : "missing",
      dark: darkAnchor ? "present" : "missing",
    };
  }

  const lightValue = lightAnchor.maxWidthPx;
  const darkValue = darkAnchor.maxWidthPx;
  if (lightValue === null && darkValue === null) return null;
  if (lightValue === null || darkValue === null) {
    return {
      type: "anchor_max_width_missing",
      light: lightValue,
      dark: darkValue,
    };
  }
  if (!approxEqual(lightValue, darkValue)) {
    return {
      type: "anchor_max_width_diff",
      light: lightValue,
      dark: darkValue,
    };
  }

  return null;
}

function compareBuckets(lightBuckets, darkBuckets) {
  if (lightBuckets.length !== darkBuckets.length) return false;
  for (let i = 0; i < lightBuckets.length; i += 1) {
    const light = lightBuckets[i];
    const dark = darkBuckets[i];
    if (!approxEqual(light.maxWidthPx, dark.maxWidthPx)) return false;
    if (light.count !== dark.count) return false;
  }
  return true;
}

async function run() {
  await ensureDir(OUTPUT_DIR);

  const report = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    tolerancePx: WIDTH_TOLERANCE_PX,
    routes: [],
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    locale: "es-AR",
  });
  const page = await context.newPage();

  const failures = [];

  try {
    for (const route of ROUTES) {
      const fullUrl = new URL(route, BASE_URL).toString();
      await page.goto(fullUrl, { waitUntil: "networkidle", timeout: 45_000 });
      await page.addStyleTag({
        content:
          "*,*::before,*::after{animation:none!important;transition:none!important;}",
      });

      await setTheme(page, "light");
      const light = await collectLayoutSnapshot(page);

      await setTheme(page, "dark");
      const dark = await collectLayoutSnapshot(page);

      const routeFailures = [];

      const lightTokens = light.tokens;
      if (
        !approxEqual(lightTokens.pageMaxWidthPx, lightTokens.containerPx) ||
        !approxEqual(lightTokens.pageMaxWidthPx, lightTokens.adminContentMaxWidthPx)
      ) {
        routeFailures.push({
          type: "token_mismatch",
          details: {
            pageMaxWidthPx: lightTokens.pageMaxWidthPx,
            containerPx: lightTokens.containerPx,
            adminContentMaxWidthPx: lightTokens.adminContentMaxWidthPx,
          },
        });
      }

      if (
        !approxEqual(light.tokens.pageMaxWidthPx, dark.tokens.pageMaxWidthPx) ||
        !approxEqual(light.tokens.containerPx, dark.tokens.containerPx) ||
        !approxEqual(light.tokens.adminContentMaxWidthPx, dark.tokens.adminContentMaxWidthPx)
      ) {
        routeFailures.push({
          type: "token_theme_mismatch",
          light: light.tokens,
          dark: dark.tokens,
        });
      }

      const anchorKeys = Object.keys(light.anchors);
      for (const key of anchorKeys) {
        const anchorDiff = compareAnchorWidth(light.anchors[key], dark.anchors[key]);
        if (anchorDiff) {
          routeFailures.push({
            type: "anchor_theme_mismatch",
            anchor: key,
            ...anchorDiff,
          });
        }
      }

      if (!compareBuckets(light.structuralMaxWidthBuckets, dark.structuralMaxWidthBuckets)) {
        routeFailures.push({
          type: "structural_bucket_theme_mismatch",
          light: light.structuralMaxWidthBuckets,
          dark: dark.structuralMaxWidthBuckets,
        });
      }

      for (const bucket of light.structuralMaxWidthBuckets) {
        if (!approxEqual(bucket.maxWidthPx, light.tokens.pageMaxWidthPx)) {
          routeFailures.push({
            type: "unexpected_structural_width",
            expected: light.tokens.pageMaxWidthPx,
            found: bucket.maxWidthPx,
            count: bucket.count,
          });
        }
      }

      const requestedPath = new URL(fullUrl).pathname;
      const finalPath = new URL(light.url).pathname;
      const redirected = requestedPath !== finalPath;

      if (routeFailures.length > 0) {
        failures.push({
          route,
          finalUrl: light.url,
          failures: routeFailures,
        });
      }

      const slug = sanitizeRoute(route);
      await setTheme(page, "light");
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${slug}-layout-light.png`),
        fullPage: true,
      });
      await setTheme(page, "dark");
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${slug}-layout-dark.png`),
        fullPage: true,
      });

      report.routes.push({
        route,
        requestedUrl: fullUrl,
        finalUrl: light.url,
        redirected,
        light,
        dark,
        failures: routeFailures,
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  if (failures.length > 0) {
    const summary = failures
      .slice(0, 6)
      .map((entry) => {
        const reasons = entry.failures.map((failure) => failure.type).join(",");
        return `${entry.route} => ${reasons}`;
      })
      .join(" | ");

    throw new Error(
      `Se detectaron inconsistencias de max-width/layout en ${failures.length} rutas. ${truncate(summary, 600)}`
    );
  }

  const redirectedCount = report.routes.filter((entry) => entry.redirected).length;

  console.log("OK: max-width/layout consistente entre light y dark.");
  console.log(`Rutas auditadas: ${report.routes.length}`);
  console.log(`Rutas con redirect: ${redirectedCount}`);
  console.log(`Reporte: ${REPORT_PATH}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
