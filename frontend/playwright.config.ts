import { defineConfig, devices } from "@playwright/test";

const playwrightHost = process.env.PLAYWRIGHT_HOST ?? "127.0.0.1";
const playwrightPort = process.env.PLAYWRIGHT_PORT ?? "4173";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://${playwrightHost}:${playwrightPort}`;

export default defineConfig({
  testDir: "./tests/ui",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    colorScheme: "light",
    locale: "es-AR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-ui",
      grepInvert: /visual smoke|a11y smoke serious\/critical/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "firefox-ui-smoke",
      grep: /visual smoke/,
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "webkit-ui-smoke",
      grep: /visual smoke/,
      use: {
        ...devices["Desktop Safari"],
      },
    },
    {
      name: "firefox-a11y",
      grep: /a11y smoke serious\/critical/,
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "webkit-a11y",
      grep: /a11y smoke serious\/critical/,
      use: {
        ...devices["Desktop Safari"],
      },
    },
  ],
  webServer: {
    command: `npm run start -- --hostname ${playwrightHost} --port ${playwrightPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
