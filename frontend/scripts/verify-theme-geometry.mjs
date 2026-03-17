import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const BASE_URL =
  process.env.THEME_AUDIT_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://127.0.0.1:4173";

const OUTPUT_DIR = path.resolve(".tmp/theme-audit");

const ROUTES = [
  "/",
  "/productos",
  "/contacto",
  "/nosotros",
  "/ingresar",
  "/carrito",
  "/checkout",
  "/comprobante?order=demo&token=demo",
  "/terminos-y-condiciones",
  "/politica-de-privacidad",
  "/cambios-y-devoluciones",
  "/politica-de-envios",
  "/boton-de-arrepentimiento",
  "/not-found-theme-audit",
  "/cuenta/administracion/resumen",
  "/cuenta/administracion/ordenes",
  "/cuenta/administracion/productos",
  "/cuenta/administracion/preguntas",
  "/cuenta/administracion/clientes",
  "/cuenta/administracion/inventario",
  "/cuenta/administracion/promociones",
  "/cuenta/administracion/apariencia",
];

const GEOMETRY_PROPS = [
  "box-sizing",
  "display",
  "position",
  "max-width",
  "min-width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "gap",
  "row-gap",
  "column-gap",
  "grid-template-columns",
  "grid-template-rows",
  "font-size",
  "line-height",
];

function sanitizeRoute(route) {
  return route
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^$/, "home");
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

async function collectSnapshot(page) {
  return page.evaluate((props) => {
    const IGNORE_TAGS = new Set(["SCRIPT", "STYLE", "META", "LINK", "NOSCRIPT"]);

    function buildPath(element) {
      const segments = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        if (current === document.documentElement) {
          segments.unshift("html");
          break;
        }

        const tag = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (!parent) {
          segments.unshift(tag);
          break;
        }

        let index = 1;
        let sibling = current.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === current.tagName) {
            index += 1;
          }
          sibling = sibling.previousElementSibling;
        }

        segments.unshift(`${tag}:nth-of-type(${index})`);
        current = parent;
      }
      return segments.join(" > ");
    }

    const output = [];
    const elements = [document.documentElement, ...document.body.querySelectorAll("*")];

    for (const element of elements) {
      if (IGNORE_TAGS.has(element.tagName)) continue;
      if (element.hasAttribute("data-theme-audit-ignore")) continue;

      const computed = window.getComputedStyle(element);
      if (computed.display === "none") continue;

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const style = {};
      for (const prop of props) {
        style[prop] = computed.getPropertyValue(prop).trim();
      }

      output.push({
        path: buildPath(element),
        style,
      });
    }

    return output;
  }, GEOMETRY_PROPS);
}

function compareSnapshots(lightSnapshot, darkSnapshot) {
  const lightMap = new Map(lightSnapshot.map((entry) => [entry.path, entry.style]));
  const darkMap = new Map(darkSnapshot.map((entry) => [entry.path, entry.style]));

  const paths = new Set([...lightMap.keys(), ...darkMap.keys()]);
  const diffs = [];

  for (const nodePath of paths) {
    const lightStyle = lightMap.get(nodePath);
    const darkStyle = darkMap.get(nodePath);

    if (!lightStyle || !darkStyle) {
      diffs.push({
        path: nodePath,
        property: "__presence__",
        light: lightStyle ? "present" : "missing",
        dark: darkStyle ? "present" : "missing",
      });
      continue;
    }

    for (const prop of GEOMETRY_PROPS) {
      const lightValue = lightStyle[prop] ?? "";
      const darkValue = darkStyle[prop] ?? "";
      if (lightValue === darkValue) continue;

      diffs.push({
        path: nodePath,
        property: prop,
        light: lightValue,
        dark: darkValue,
      });
    }
  }

  return diffs;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function run() {
  await ensureDir(OUTPUT_DIR);
  const report = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    routes: [],
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    locale: "es-AR",
  });
  const page = await context.newPage();

  let totalDiffs = 0;

  try {
    for (const route of ROUTES) {
      const fullUrl = new URL(route, BASE_URL).toString();
      await page.goto(fullUrl, { waitUntil: "networkidle", timeout: 45_000 });
      await page.addStyleTag({
        content:
          "*,*::before,*::after{animation:none!important;transition:none!important;}",
      });

      await setTheme(page, "light");
      const lightSnapshot = await collectSnapshot(page);

      await setTheme(page, "dark");
      const darkSnapshot = await collectSnapshot(page);

      const diffs = compareSnapshots(lightSnapshot, darkSnapshot);
      totalDiffs += diffs.length;

      const slug = sanitizeRoute(route);
      await setTheme(page, "light");
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${slug}-light.png`),
        fullPage: true,
      });
      await setTheme(page, "dark");
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${slug}-dark.png`),
        fullPage: true,
      });

      report.routes.push({
        route,
        url: page.url(),
        nodeCount: lightSnapshot.length,
        diffCount: diffs.length,
        diffs: diffs.slice(0, 100),
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const reportPath = path.join(OUTPUT_DIR, "geometry-report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  if (totalDiffs > 0) {
    const summary = report.routes
      .filter((entry) => entry.diffCount > 0)
      .map((entry) => `${entry.route}: ${entry.diffCount}`)
      .join(", ");
    throw new Error(
      `Se detectaron diferencias geométricas entre light/dark (${totalDiffs}). ${summary}`
    );
  }

  console.log("OK: no se detectaron diferencias geométricas light/dark.");
  console.log(`Reporte: ${reportPath}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
