import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError, fetchJson } from "./store-client";

function jsonResponse(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("store-client fetchJson", () => {
  const publishableKey = "pk_test_store_client_123456789";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY = publishableKey;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY;
  });

  it("uses cache=default on public catalog GET endpoints", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
      })
    );

    await fetchJson<{ ok: boolean }>("/store/catalog/products?limit=1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(init.cache).toBe("default");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-publishable-api-key")).toBe(publishableKey);
    expect(init.credentials).toBe("same-origin");
  });

  it("uses cache=no-store for non-public catalog GET endpoints", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
      })
    );

    await fetchJson<{ ok: boolean }>("/store/catalog/account/orders");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.cache).toBe("no-store");
  });

  it("uses cache=no-store for POST requests and sets JSON content-type", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ok: true,
      })
    );

    await fetchJson<{ ok: boolean }>("/store/catalog/products", {
      method: "POST",
      body: JSON.stringify({ sample: true }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(init.cache).toBe("no-store");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("retries once with cache-bust query param on 304 GET responses", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 304,
        statusText: "Not Modified",
      })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        brands: [],
      })
    );

    await fetchJson<{ brands: unknown[] }>("/store/catalog/brands");

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [secondUrl, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];

    expect(firstUrl).toBe("http://localhost:9000/store/catalog/brands");
    expect(secondUrl.startsWith("http://localhost:9000/store/catalog/brands?")).toBe(true);
    expect(secondUrl.includes("_ts=")).toBe(true);
    expect(firstInit.cache).toBe("default");
    expect(secondInit.cache).toBe("default");
  });

  it("throws ApiHttpError with message/code from JSON error payload", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        message: "Validation failed",
        code: "VALIDATION_ERROR",
      })
    );

    try {
      await fetchJson("/store/catalog/brands");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiHttpError);
      const typed = error as ApiHttpError;
      expect(typed.status).toBe(422);
      expect(typed.message).toBe("Validation failed");
      expect(typed.code).toBe("VALIDATION_ERROR");
      return;
    }

    throw new Error("Expected ApiHttpError");
  });
});
