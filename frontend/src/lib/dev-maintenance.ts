export const MAINTENANCE_COOKIE_NAME = "store_maintenance_access";
export const MAINTENANCE_COOKIE_VALUE = "ok";
export const MAINTENANCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

const MAINTENANCE_CACHE_TTL_MS = 10_000;

let maintenanceEnabledCache: { value: boolean; expiresAt: number } | null = null;
let maintenanceEnabledInFlight: Promise<boolean> | null = null;

function resolveStoreBackendUrl() {
  const publicUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:9000";
  const internalUrl = process.env.BACKEND_INTERNAL_URL?.trim() || "";

  if (typeof window === "undefined" && internalUrl) {
    return internalUrl;
  }
  return publicUrl;
}

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";
}

function normalizeMaintenanceMode(input: unknown) {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;
  if (typeof input === "string") {
    const value = input.trim().toLowerCase();
    if (!value) return false;
    if (value === "true" || value === "1" || value === "yes" || value === "on") return true;
    if (value === "false" || value === "0" || value === "no" || value === "off") return false;
  }
  return false;
}

async function fetchMaintenanceEnabled() {
  const backendUrl = resolveStoreBackendUrl();
  const headers = new Headers({ accept: "application/json" });
  const publishableKey = getPublishableKey();
  if (publishableKey) {
    headers.set("x-publishable-api-key", publishableKey);
  }

  const response = await fetch(`${backendUrl}/store/catalog/settings/storefront`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    return false;
  }

  const data =
    (await response.json().catch(() => null)) as
      | { storefront?: { maintenance_mode?: unknown; maintenanceMode?: unknown } }
      | null;
  const storefront = data?.storefront;
  if (!storefront || typeof storefront !== "object") return false;

  return normalizeMaintenanceMode(storefront.maintenance_mode ?? storefront.maintenanceMode);
}

export async function isMaintenanceEnabled() {
  const now = Date.now();
  if (maintenanceEnabledCache && maintenanceEnabledCache.expiresAt > now) {
    return maintenanceEnabledCache.value;
  }

  if (!maintenanceEnabledInFlight) {
    maintenanceEnabledInFlight = fetchMaintenanceEnabled()
      .catch(() => false)
      .finally(() => {
        maintenanceEnabledInFlight = null;
      });
  }

  const value = await maintenanceEnabledInFlight;
  maintenanceEnabledCache = {
    value,
    expiresAt: now + MAINTENANCE_CACHE_TTL_MS,
  };
  return value;
}

export async function verifyMaintenancePassword(password: string) {
  const backendUrl = resolveStoreBackendUrl();
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
  });
  const publishableKey = getPublishableKey();
  if (publishableKey) {
    headers.set("x-publishable-api-key", publishableKey);
  }

  const response = await fetch(
    `${backendUrl}/store/catalog/settings/storefront/maintenance/unlock`,
    {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({ password }),
    }
  );
  return response.ok;
}

export function hasMaintenanceAccess(value: string | undefined | null) {
  return value === MAINTENANCE_COOKIE_VALUE;
}

export function normalizeMaintenanceRedirectPath(input: string | undefined | null) {
  const value = String(input || "").trim();
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value === "/mantenimiento" || value.startsWith("/mantenimiento/")) return "/";
  return value;
}
