import { CUSTOMER_AUTH_LOST_EVENT } from "@/lib/customer-auth-events";

function resolveStoreBackendUrl() {
  const publicUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:9000";
  const internalUrl = process.env.BACKEND_INTERNAL_URL?.trim() || "";

  if (typeof window === "undefined" && internalUrl) {
    return internalUrl;
  }
  return publicUrl;
}

export const STORE_BACKEND_URL = resolveStoreBackendUrl();

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";
}

export class ApiHttpError extends Error {
  status: number;
  code: string | null;
  payload: unknown;

  constructor(input: {
    status: number;
    message: string;
    code?: string | null;
    payload?: unknown;
  }) {
    super(input.message);
    this.name = "ApiHttpError";
    this.status = input.status;
    this.code = input.code ?? null;
    this.payload = input.payload;
  }
}

async function readErrorPayload(res: Response) {
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const data: unknown = await res.json();
      const rec =
        data && typeof data === "object"
          ? (data as Record<string, unknown>)
          : null;
      const message =
        rec && typeof rec["message"] === "string"
          ? rec["message"]
          : JSON.stringify(data);
      const code =
        rec && typeof rec["code"] === "string" ? rec["code"] : null;
      return { message, code, payload: data };
    } catch {
      // fall back to text
    }
  }

  try {
    const text = await res.text();
    return {
      message: text || `${res.status} ${res.statusText}`.trim(),
      code: null,
      payload: text,
    };
  } catch {
    return {
      message: `${res.status} ${res.statusText}`.trim(),
      code: null,
      payload: null,
    };
  }
}

type FetchJsonInit = RequestInit & {
  timeoutMs?: number;
};

function toSafePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function isPublicCatalogCacheablePath(path: string) {
  if (path === "/store/catalog/brands") return true;
  if (path === "/store/catalog/categories") return true;
  if (path.startsWith("/store/catalog/products")) return true;
  return false;
}

function resolveDefaultRequestCache(input: {
  path: string;
  method: string;
  cache: RequestCache | undefined;
}) {
  if (input.cache) return input.cache;
  if (input.method !== "GET") return "no-store";
  if (isPublicCatalogCacheablePath(input.path)) return "default";
  return "no-store";
}

export async function fetchJson<T>(
  path: string,
  init?: FetchJsonInit
): Promise<T> {
  const safePath = toSafePath(path);
  const url = `${STORE_BACKEND_URL}${safePath}`;

  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");

  // The backend requires this header for all `/store/*` endpoints.
  // Add it by default if the caller didn't provide it.
  if (!headers.has("x-publishable-api-key")) {
    const key = getPublishableKey();
    if (key) headers.set("x-publishable-api-key", key);
  }

  // If we pass a JSON string body, enforce JSON content type.
  if (typeof init?.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const { timeoutMs, ...requestInit } = init ?? {};
  const method = (requestInit.method ?? "GET").toUpperCase();
  const resolvedCache = resolveDefaultRequestCache({
    path: safePath,
    method,
    cache: requestInit.cache,
  });

  const controller = new AbortController();
  const timeoutId =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
      : null;

  const onAbort = () => controller.abort();
  requestInit.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const makeRequest = (requestUrl: string, requestHeaders = headers) =>
      fetch(requestUrl, {
        ...requestInit,
        headers: requestHeaders,
        cache: resolvedCache,
        signal: controller.signal,
        credentials: requestInit.credentials ?? "same-origin",
      });

    let res = await makeRequest(url);

    // Some browsers/dev setups may revalidate with 304 even for client fetches.
    // For JSON APIs this response has no body, so retry once with cache-bust.
    if (res.status === 304 && method === "GET") {
      const retryUrl = new URL(url);
      retryUrl.searchParams.set("_ts", String(Date.now()));
      res = await makeRequest(retryUrl.toString());
    }

    if (!res.ok) {
      const parsed = await readErrorPayload(res);
      throw new ApiHttpError({
        status: res.status,
        message: parsed.message || `HTTP ${res.status}`,
        code: parsed.code,
        payload: parsed.payload,
      });
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    requestInit.signal?.removeEventListener("abort", onAbort);
  }
}

export async function fetchBlob(
  path: string,
  init?: FetchJsonInit
): Promise<{ blob: Blob; response: Response }> {
  const safePath = toSafePath(path);
  const url = `${STORE_BACKEND_URL}${safePath}`;

  const headers = new Headers(init?.headers);
  headers.set("accept", "application/pdf,application/octet-stream");

  // The backend requires this header for all `/store/*` endpoints.
  // Add it by default if the caller didn't provide it.
  if (!headers.has("x-publishable-api-key")) {
    const key = getPublishableKey();
    if (key) headers.set("x-publishable-api-key", key);
  }

  const { timeoutMs, ...requestInit } = init ?? {};
  const method = (requestInit.method ?? "GET").toUpperCase();

  const controller = new AbortController();
  const timeoutId =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
      : null;

  const onAbort = () => controller.abort();
  requestInit.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const makeRequest = (requestUrl: string, requestHeaders = headers) =>
      fetch(requestUrl, {
        ...requestInit,
        headers: requestHeaders,
        cache: requestInit.cache ?? "no-store",
        signal: controller.signal,
        credentials: requestInit.credentials ?? "same-origin",
      });

    let res = await makeRequest(url);

    if (res.status === 304 && method === "GET") {
      const retryUrl = new URL(url);
      retryUrl.searchParams.set("_ts", String(Date.now()));
      res = await makeRequest(retryUrl.toString());
    }

    if (!res.ok) {
      const parsed = await readErrorPayload(res);
      throw new ApiHttpError({
        status: res.status,
        message: parsed.message || `HTTP ${res.status}`,
        code: parsed.code,
        payload: parsed.payload,
      });
    }

    const blob = res.status === 204 ? new Blob() : await res.blob();
    return { blob, response: res };
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    requestInit.signal?.removeEventListener("abort", onAbort);
  }
}

let refreshPromise: Promise<boolean> | null = null;

function shouldRefreshAndRetry(path: string) {
  const safePath = toSafePath(path);
  if (!safePath.startsWith("/store/catalog/")) return false;

  // Avoid retry loops on auth endpoints.
  if (safePath === "/store/catalog/auth/refresh") return false;
  if (safePath === "/store/catalog/auth/login") return false;
  if (safePath === "/store/catalog/auth/register") return false;
  if (safePath === "/store/catalog/auth/logout") return false;
  return true;
}

function shouldEmitAuthLost(path: string) {
  const safePath = toSafePath(path);
  return safePath.startsWith("/store/catalog/account/");
}

function emitAuthLostEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CUSTOMER_AUTH_LOST_EVENT));
}

async function refreshCustomerSession() {
  try {
    await fetchJson("/store/catalog/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    return true;
  } catch {
    return false;
  }
}

async function refreshCustomerSessionSingleFlight() {
  if (!refreshPromise) {
    refreshPromise = (async () => await refreshCustomerSession())().finally(
      () => {
        refreshPromise = null;
      }
    );
  }
  return await refreshPromise;
}

export async function fetchJsonWithAuthRetry<T>(
  path: string,
  init?: FetchJsonInit
): Promise<T> {
  const safePath = toSafePath(path);

  try {
    return await fetchJson<T>(safePath, init);
  } catch (error) {
    if (!(error instanceof ApiHttpError)) throw error;
    if (error.status !== 401) throw error;
    if (!shouldRefreshAndRetry(safePath)) {
      if (shouldEmitAuthLost(safePath)) emitAuthLostEvent();
      throw error;
    }

    const refreshed = await refreshCustomerSessionSingleFlight();
    try {
      if (refreshed) {
        return await fetchJson<T>(safePath, init);
      }

      // Another in-flight request might have already rotated cookies.
      return await fetchJson<T>(safePath, init);
    } catch (retryError) {
      if (
        retryError instanceof ApiHttpError &&
        retryError.status === 401 &&
        shouldEmitAuthLost(safePath)
      ) {
        emitAuthLostEvent();
      }
      throw retryError;
    }
  }
}

export async function fetchBlobWithAuthRetry(
  path: string,
  init?: FetchJsonInit
): Promise<{ blob: Blob; response: Response }> {
  const safePath = toSafePath(path);

  try {
    return await fetchBlob(safePath, init);
  } catch (error) {
    if (!(error instanceof ApiHttpError)) throw error;
    if (error.status !== 401) throw error;
    if (!shouldRefreshAndRetry(safePath)) {
      if (shouldEmitAuthLost(safePath)) emitAuthLostEvent();
      throw error;
    }

    const refreshed = await refreshCustomerSessionSingleFlight();
    try {
      if (refreshed) {
        return await fetchBlob(safePath, init);
      }

      // Another in-flight request might have already rotated cookies.
      return await fetchBlob(safePath, init);
    } catch (retryError) {
      if (
        retryError instanceof ApiHttpError &&
        retryError.status === 401 &&
        shouldEmitAuthLost(safePath)
      ) {
        emitAuthLostEvent();
      }
      throw retryError;
    }
  }
}
