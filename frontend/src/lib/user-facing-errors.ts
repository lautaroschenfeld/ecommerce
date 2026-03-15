import { ApiHttpError } from "@/lib/store-client";

export const FRIENDLY_ERROR_MESSAGES = {
  serviceUnavailable: "Servicio momentáneamente no disponible.",
  actionFailed: "No pudimos completar la acción. Intenta nuevamente.",
  sessionExpired: "Tu sesión venció. Inicia sesión nuevamente.",
  noPermissions: "No tienes permisos para realizar esta acción.",
} as const;

type AuthErrorMode = "session" | "permissions" | "login";

function authMessage(mode: AuthErrorMode) {
  if (mode === "permissions") return FRIENDLY_ERROR_MESSAGES.noPermissions;
  if (mode === "login") return "Inicia sesión para continuar.";
  return FRIENDLY_ERROR_MESSAGES.sessionExpired;
}

function mapHttpStatus(status: number, mode: AuthErrorMode) {
  if (status === 401) return authMessage(mode);
  if (status === 403) return FRIENDLY_ERROR_MESSAGES.noPermissions;
  if (status >= 500) return FRIENDLY_ERROR_MESSAGES.serviceUnavailable;
  return "";
}

function containsAny(source: string, values: readonly string[]) {
  return values.some((value) => source.includes(value));
}

const SERVICE_UNAVAILABLE_HINTS = [
  "failed to fetch",
  "fetch failed",
  "networkerror",
  "network request failed",
  "econnrefused",
  "err_connection_refused",
  "timeout",
  "timed out",
  "abort",
  "publishable api key required",
  "x-publishable-api-key",
  "next_public_publishable_api_key",
  "frontend/.env.local",
  "backend",
  "http ",
  "invalid response",
  "respuesta inválida",
] as const;

const SESSION_HINTS = [
  "not authenticated",
  "unauthorized",
  "auth_refresh_failed",
] as const;

const PERMISSION_HINTS = [
  "forbidden",
  "admin role required",
  "not allowed",
] as const;

export function sanitizeUserFacingMessage(
  message: string,
  fallback: string = FRIENDLY_ERROR_MESSAGES.actionFailed,
  mode: AuthErrorMode = "session"
) {
  const trimmed = String(message || "").trim();
  if (!trimmed) return fallback;

  const normalized = trimmed.toLowerCase();
  if (containsAny(normalized, SESSION_HINTS)) return authMessage(mode);
  if (containsAny(normalized, PERMISSION_HINTS)) return FRIENDLY_ERROR_MESSAGES.noPermissions;
  if (normalized === "error") return fallback;
  if (/^http\s+\d{3}/.test(normalized)) return fallback;
  if (/^\d{3}\s/.test(normalized)) return fallback;
  if (containsAny(normalized, SERVICE_UNAVAILABLE_HINTS)) {
    return FRIENDLY_ERROR_MESSAGES.serviceUnavailable;
  }

  return trimmed;
}

export function mapFriendlyError(
  error: unknown,
  fallback: string = FRIENDLY_ERROR_MESSAGES.actionFailed,
  mode: AuthErrorMode = "session"
) {
  if (error instanceof ApiHttpError) {
    const fromStatus = mapHttpStatus(error.status, mode);
    if (fromStatus) return fromStatus;
  }

  if (error instanceof Error) {
    return sanitizeUserFacingMessage(error.message, fallback, mode);
  }

  return fallback;
}

export function mapOAuthErrorMessage(raw: string | null | undefined) {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return null;

  if (
    normalized.includes("access_denied") ||
    normalized.includes("cancelled") ||
    normalized.includes("canceled")
  ) {
    return "No pudimos completar el ingreso con Google. Intenta nuevamente.";
  }

  if (
    normalized.includes("temporarily_unavailable") ||
    normalized.includes("server_error") ||
    normalized.includes("timeout") ||
    normalized.includes("provider_timeout") ||
    normalized.includes("provider_not_configured")
  ) {
    return FRIENDLY_ERROR_MESSAGES.serviceUnavailable;
  }

  if (
    normalized.includes("invalid_state") ||
    normalized.includes("provider_invalid_response")
  ) {
    return "No pudimos validar el ingreso con el proveedor. Intenta nuevamente.";
  }

  return "No pudimos completar el ingreso con Google. Intenta nuevamente.";
}
