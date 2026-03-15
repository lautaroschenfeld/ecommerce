export const DEV_MAINTENANCE_COOKIE_NAME = "store_dev_maintenance_access";
export const DEV_MAINTENANCE_COOKIE_VALUE = "ok";
export const DEV_MAINTENANCE_PASSWORD = "desarrollo7";
export const DEV_MAINTENANCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export function isDevMaintenanceEnabled() {
  return process.env.NODE_ENV !== "production";
}

export function hasDevMaintenanceAccess(value: string | undefined | null) {
  return value === DEV_MAINTENANCE_COOKIE_VALUE;
}

export function normalizeMaintenanceRedirectPath(input: string | undefined | null) {
  const value = String(input || "").trim();
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (value === "/mantenimiento" || value.startsWith("/mantenimiento/")) return "/";
  return value;
}
