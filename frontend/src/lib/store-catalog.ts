"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Category } from "@/lib/catalog";
import type {
  Product,
  ProductCondition,
  ProductGender,
  ProductSort,
} from "@/lib/product";
import { ApiHttpError, fetchJson } from "@/lib/store-client";
import { createLatestRequestController } from "@/lib/latest-request";
import { mapStoreDtoToProduct } from "@/lib/store-mappers";
import {
  markStoreBackendHealthy,
  markStoreBackendUnavailable,
} from "@/lib/store-backend-status";
import {
  FRIENDLY_ERROR_MESSAGES,
  mapFriendlyError,
} from "@/lib/user-facing-errors";

const STORE_INVALIDATE_EVENT = "store:invalidate:store-products";
const STORE_REQUEST_TIMEOUT_MS = 1800;
const STORE_PRODUCT_DETAIL_TIMEOUT_MS = 4000;
const STORE_RELATED_REQUEST_TIMEOUT_MS = 2500;
const BACKEND_DOWN_COOLDOWN_MS = 30000;
const SUGGESTION_MAX_QUERY_VARIANTS = 3;
const SUGGESTION_MIN_FETCH_LIMIT = 8;
const SUGGESTION_MAX_FETCH_LIMIT = 24;
const SERVICE_UNAVAILABLE_MESSAGE =
  FRIENDLY_ERROR_MESSAGES.serviceUnavailable;

const SUGGESTION_SYNONYMS: Record<string, string> = {
  cubiertas: "neumaticos",
  cubierta: "neumatico",
  gomas: "neumaticos",
  goma: "neumatico",
  llantas: "ruedas",
  llanta: "rueda",
  bujias: "bujias",
  bujia: "bujia",
  cascos: "cascos",
  casco: "casco",
};

let backendUnavailableUntil = 0;

export function invalidateStoreProducts() {
  window.dispatchEvent(new Event(STORE_INVALIDATE_EVENT));
}

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";
}

function isBackendInCooldown() {
  return Date.now() < backendUnavailableUntil;
}

function markBackendUnavailable() {
  backendUnavailableUntil = Date.now() + BACKEND_DOWN_COOLDOWN_MS;
  markStoreBackendUnavailable("store_request_failed");
}

function markBackendHealthy() {
  backendUnavailableUntil = 0;
  markStoreBackendHealthy();
}

function storeHeaders(): Record<string, string> {
  const key = getPublishableKey();
  if (!key) return {};
  return {
    "x-publishable-api-key": key,
  };
}

function mapStoreError(
  error: unknown,
  fallback = SERVICE_UNAVAILABLE_MESSAGE
) {
  if (error instanceof ApiHttpError && error.status === 304) return fallback;
  return mapFriendlyError(error, fallback);
}

function shouldMarkBackendUnavailable(error: unknown) {
  if (error instanceof ApiHttpError) {
    if (error.status === 304) return false;
    if (error.status === 401) {
      const normalized = error.message.toLowerCase();
      if (
        normalized.includes("publishable api key required") ||
        normalized.includes("x-publishable-api-key")
      ) {
        return true;
      }
    }
    return error.status >= 500;
  }

  if (!(error instanceof Error)) return false;

  const normalized = error.message.toLowerCase();
  return (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("abort") ||
    normalized.includes("econnrefused")
  );
}

function stripSearchDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeSearchQuery(value: string) {
  return stripSearchDiacritics(value)
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function singularizeSearchToken(token: string) {
  const value = token.trim();
  if (value.length <= 3) return value;
  if (value.endsWith("es") && value.length > 5) return value.slice(0, -2);
  if (value.endsWith("s") && value.length > 4) return value.slice(0, -1);
  return value;
}

function buildSuggestionQueryVariants(queryRaw: string) {
  const raw = String(queryRaw || "").trim();
  if (!raw) return [] as string[];

  const normalized = normalizeSearchQuery(raw);
  const normalizedTokens = normalized ? normalized.split(" ").filter(Boolean) : [];

  const variants: string[] = [];
  const seen = new Set<string>();
  const pushVariant = (valueRaw: string) => {
    const value = valueRaw.trim();
    if (value.length < 2) return;
    const key = value.toLocaleLowerCase("es");
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(value);
  };

  pushVariant(raw);
  if (normalized) pushVariant(normalized);

  if (normalizedTokens.length) {
    const singularized = normalizedTokens.map(singularizeSearchToken).join(" ").trim();
    if (singularized) pushVariant(singularized);

    const synonymized = normalizedTokens
      .map((token) => SUGGESTION_SYNONYMS[token] ?? token)
      .join(" ")
      .trim();
    if (synonymized) pushVariant(synonymized);
  }

  return variants.slice(0, SUGGESTION_MAX_QUERY_VARIANTS);
}

function scoreSuggestionProduct(product: Product, queryRaw: string) {
  const normalizedQuery = normalizeSearchQuery(queryRaw);
  if (!normalizedQuery) return 0;

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const name = normalizeSearchQuery(product.name || "");
  const brand = normalizeSearchQuery(product.brand || "");
  const category = normalizeSearchQuery(product.category || "");
  const sku = normalizeSearchQuery(product.sku || "");

  let score = 0;

  if (name === normalizedQuery) score += 220;
  if (name.startsWith(normalizedQuery)) score += 170;
  if (name.includes(normalizedQuery)) score += 140;
  if (brand === normalizedQuery) score += 115;
  if (brand.startsWith(normalizedQuery)) score += 85;
  if (category === normalizedQuery) score += 95;
  if (category.startsWith(normalizedQuery)) score += 70;
  if (sku && sku === normalizedQuery) score += 130;
  if (sku && sku.startsWith(normalizedQuery)) score += 95;
  if (sku && sku.includes(normalizedQuery)) score += 80;

  if (!queryTokens.length) return score;

  let matchedTokens = 0;
  for (const token of queryTokens) {
    if (!token) continue;
    let tokenScore = 0;

    if (name.startsWith(token)) tokenScore = Math.max(tokenScore, 34);
    if (name.includes(` ${token}`) || name.includes(token)) {
      tokenScore = Math.max(tokenScore, 26);
    }
    if (brand.startsWith(token) || brand.includes(token)) {
      tokenScore = Math.max(tokenScore, 18);
    }
    if (category.startsWith(token) || category.includes(token)) {
      tokenScore = Math.max(tokenScore, 14);
    }
    if (sku && (sku.startsWith(token) || sku.includes(token))) {
      tokenScore = Math.max(tokenScore, 28);
    }

    if (tokenScore > 0) {
      matchedTokens += 1;
      score += tokenScore;
    } else {
      score -= 6;
    }
  }

  if (matchedTokens === queryTokens.length) score += 45;
  if (queryTokens.length >= 2 && matchedTokens >= 2) score += 20;

  return score;
}

function rankSuggestionProducts(products: Product[], queryRaw: string, limit: number) {
  if (!products.length) return [] as Product[];

  return [...products]
    .map((product, index) => ({
      product,
      index,
      score: scoreSuggestionProduct(product, queryRaw),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const byName = a.product.name.localeCompare(b.product.name, "es");
      if (byName !== 0) return byName;
      return a.index - b.index;
    })
    .slice(0, limit)
    .map((entry) => entry.product);
}

export type StoreProductsQuery = {
  q?: string;
  category?: Category;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  condition?: ProductCondition[];
  gender?: Exclude<ProductGender, "unisex">;
  size?: string;
  groupId?: string;
  sort?: ProductSort;
  limit?: number;
  offset?: number;
  skip?: boolean;
};

export type StoreProductSuggestionsQuery = {
  q?: string;
  category?: Category;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  skip?: boolean;
};

export type StoreRelatedProductsQuery = {
  productId: string;
  limit?: number;
  skip?: boolean;
};

function buildStoreProductsQuery(input: StoreProductsQuery) {
  const params = new URLSearchParams();

  const q = input.q?.trim();
  if (q) params.set("q", q);

  if (input.category) params.set("categoria", input.category);

  const brands =
    input.brands
      ?.map((b) => b.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)) ?? [];
  for (const b of brands) params.append("marca", b);

  if (typeof input.minPrice === "number" && Number.isFinite(input.minPrice)) {
    params.set("min_price", String(input.minPrice));
  }
  if (typeof input.maxPrice === "number" && Number.isFinite(input.maxPrice)) {
    params.set("max_price", String(input.maxPrice));
  }

  if (input.condition && input.condition.length) {
    for (const c of input.condition) params.append("estado", c);
  }
  if (input.gender) params.set("genero", input.gender);
  if (input.size?.trim()) params.set("talle", input.size.trim());

  if (input.groupId) params.set("grupo", input.groupId);

  if (input.sort) params.set("sort", input.sort);

  if (typeof input.limit === "number" && Number.isFinite(input.limit)) {
    params.set("limit", String(input.limit));
  }
  if (typeof input.offset === "number" && Number.isFinite(input.offset)) {
    params.set("offset", String(input.offset));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function buildStoreProductSuggestionsQuery(input: StoreProductSuggestionsQuery) {
  const params = new URLSearchParams();

  const q = input.q?.trim();
  if (q) params.set("q", q);
  if (input.category) params.set("categoria", input.category);

  const brands =
    input.brands
      ?.map((b) => b.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)) ?? [];
  for (const b of brands) params.append("marca", b);

  if (typeof input.minPrice === "number" && Number.isFinite(input.minPrice)) {
    params.set("min_price", String(input.minPrice));
  }
  if (typeof input.maxPrice === "number" && Number.isFinite(input.maxPrice)) {
    params.set("max_price", String(input.maxPrice));
  }

  if (typeof input.limit === "number" && Number.isFinite(input.limit)) {
    params.set("limit", String(input.limit));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function buildStoreRelatedProductsQuery(input: StoreRelatedProductsQuery) {
  const params = new URLSearchParams();
  if (typeof input.limit === "number" && Number.isFinite(input.limit)) {
    params.set("limit", String(input.limit));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

type StoreProductsApiResponse = {
  products?: unknown[];
  count?: number;
  limit?: number;
  offset?: number;
  availableSizes?: unknown[];
};

type StoreBrandsApiResponse = {
  brands?: unknown[];
  count?: number;
};

type StoreProductByIdApiResponse = {
  product?: unknown;
};

type StoreProductSuggestionsApiResponse = {
  suggestions?: unknown[];
  count?: number;
  q?: string;
  limit?: number;
};

type StoreRelatedProductsApiResponse = {
  products?: unknown[];
  count?: number;
  limit?: number;
};

async function fetchStoreProductsOnce(
  query: StoreProductsQuery,
  options?: { signal?: AbortSignal }
): Promise<{
  products: Product[];
  count: number;
  limit: number;
  offset: number;
  availableSizes: string[];
}> {
  const qs = buildStoreProductsQuery(query);

  const data = await fetchJson<StoreProductsApiResponse>(
    `/store/catalog/products${qs}`,
    {
      headers: storeHeaders(),
      signal: options?.signal,
      timeoutMs: STORE_REQUEST_TIMEOUT_MS,
    }
  );

  const mapped = (data.products ?? [])
    .map(mapStoreDtoToProduct)
    .filter(Boolean) as Product[];

  const limit =
    typeof data.limit === "number" ? data.limit : query.limit ?? 24;
  const offset =
    typeof data.offset === "number" ? data.offset : query.offset ?? 0;
  const count = typeof data.count === "number" ? data.count : mapped.length;
  const availableSizes = Array.isArray(data.availableSizes)
    ? data.availableSizes
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return { products: mapped, count, limit, offset, availableSizes };
}

async function fetchStoreProductById(id: string, options?: { signal?: AbortSignal }) {
  const data = await fetchJson<StoreProductByIdApiResponse>(
    `/store/catalog/products/${encodeURIComponent(id)}`,
    {
      headers: storeHeaders(),
      signal: options?.signal,
      timeoutMs: STORE_PRODUCT_DETAIL_TIMEOUT_MS,
    }
  );

  return mapStoreDtoToProduct(data.product ?? null);
}

async function fetchStoreProductSuggestionsOnce(
  query: StoreProductSuggestionsQuery,
  options?: { signal?: AbortSignal }
) {
  const queryRaw = query.q?.trim() ?? "";
  if (!queryRaw) return [] as Product[];

  const requestedLimit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.max(1, Math.trunc(query.limit))
      : SUGGESTION_MIN_FETCH_LIMIT;
  const fetchLimit = Math.max(
    SUGGESTION_MIN_FETCH_LIMIT,
    Math.min(SUGGESTION_MAX_FETCH_LIMIT, requestedLimit * 2)
  );

  const variants = buildSuggestionQueryVariants(queryRaw);
  if (!variants.length) return [] as Product[];

  const settled = await Promise.allSettled(
    variants.map(async (qVariant) => {
      const qs = buildStoreProductSuggestionsQuery({
        ...query,
        q: qVariant,
        limit: fetchLimit,
      });
      const data = await fetchJson<StoreProductSuggestionsApiResponse>(
        `/store/catalog/products/suggestions${qs}`,
        {
          headers: storeHeaders(),
          signal: options?.signal,
          timeoutMs: STORE_REQUEST_TIMEOUT_MS,
        }
      );
      return (data.suggestions ?? [])
        .map(mapStoreDtoToProduct)
        .filter(Boolean) as Product[];
    })
  );

  const firstRejected = settled.find(
    (entry): entry is PromiseRejectedResult => entry.status === "rejected"
  );
  const mergedById = new Map<string, Product>();
  let hasSuccess = false;

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    hasSuccess = true;
    for (const product of result.value) {
      if (mergedById.has(product.id)) continue;
      mergedById.set(product.id, product);
    }
  }

  if (!hasSuccess) {
    throw firstRejected?.reason ?? new Error(SERVICE_UNAVAILABLE_MESSAGE);
  }

  return rankSuggestionProducts(
    Array.from(mergedById.values()),
    queryRaw,
    requestedLimit
  );
}

async function fetchStoreRelatedProductsOnce(
  query: StoreRelatedProductsQuery,
  options?: { signal?: AbortSignal }
) {
  const productId = query.productId.trim();
  if (!productId) return [] as Product[];

  const qs = buildStoreRelatedProductsQuery(query);
  const data = await fetchJson<StoreRelatedProductsApiResponse>(
    `/store/catalog/products/${encodeURIComponent(productId)}/related${qs}`,
    {
      headers: storeHeaders(),
      signal: options?.signal,
      timeoutMs: STORE_RELATED_REQUEST_TIMEOUT_MS,
    }
  );

  return (data.products ?? [])
    .map(mapStoreDtoToProduct)
    .filter(Boolean) as Product[];
}

function toBrandName(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name.trim() : "";
}

async function fetchStoreBrands(options?: { signal?: AbortSignal }) {
  const data = await fetchJson<StoreBrandsApiResponse>("/store/catalog/brands", {
    headers: storeHeaders(),
    signal: options?.signal,
    timeoutMs: STORE_REQUEST_TIMEOUT_MS,
  });

  const byNormalizedName = new Map<string, string>();
  for (const raw of data.brands ?? []) {
    const name = toBrandName(raw);
    if (!name) continue;
    const normalized = name.toLocaleLowerCase("es");
    if (byNormalizedName.has(normalized)) continue;
    byNormalizedName.set(normalized, name);
  }

  return Array.from(byNormalizedName.values()).sort((a, b) =>
    a.localeCompare(b, "es")
  );
}

export function useStoreProducts(query: StoreProductsQuery = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [availableSizes, setAvailableSizes] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const [limit, setLimit] = useState(24);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(createLatestRequestController());

  const normalizedQuery = useMemo<StoreProductsQuery>(() => {
    return {
      q: query.q,
      category: query.category,
      brands: query.brands,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      condition: query.condition,
      gender: query.gender,
      size: query.size,
      groupId: query.groupId,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
      skip: query.skip,
    };
  }, [
    query.q,
    query.category,
    query.brands,
    query.minPrice,
    query.maxPrice,
    query.condition,
    query.gender,
    query.size,
    query.groupId,
    query.sort,
    query.limit,
    query.offset,
    query.skip,
  ]);

  const refetch = useCallback(async () => {
    if (normalizedQuery.skip) {
      latestRequestRef.current.invalidate();
      setProducts([]);
      setAvailableSizes([]);
      setCount(0);
      setLimit(normalizedQuery.limit ?? 24);
      setOffset(normalizedQuery.offset ?? 0);
      setError(null);
      setLoading(false);
      return;
    }

    const request = latestRequestRef.current.start();
    setLoading(true);
    setError(null);

    try {
      if (!getPublishableKey()) {
        throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
      }

      if (isBackendInCooldown()) {
        throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
      }

      const data = await fetchStoreProductsOnce(normalizedQuery, {
        signal: request.controller.signal,
      });
      if (latestRequestRef.current.shouldIgnore(request)) return;
      markBackendHealthy();
      setProducts(data.products);
      setAvailableSizes(data.availableSizes);
      setCount(data.count);
      setLimit(data.limit);
      setOffset(data.offset);
    } catch (error) {
      if (latestRequestRef.current.shouldIgnore(request)) return;
      if (shouldMarkBackendUnavailable(error)) {
        markBackendUnavailable();
      }
      setProducts([]);
      setAvailableSizes([]);
      setCount(0);
      setLimit(normalizedQuery.limit ?? 24);
      setOffset(normalizedQuery.offset ?? 0);
      setError(mapStoreError(error));
    } finally {
      const isLatest = latestRequestRef.current.isLatest(request);
      latestRequestRef.current.release(request);
      if (isLatest) {
        setLoading(false);
      }
    }
  }, [normalizedQuery]);

  useEffect(() => {
    const latestRequest = latestRequestRef.current;
    void refetch();
    return () => {
      latestRequest.abort();
    };
  }, [refetch]);

  useEffect(() => {
    const onInvalidate = () => void refetch();
    window.addEventListener(STORE_INVALIDATE_EVENT, onInvalidate);
    return () => window.removeEventListener(STORE_INVALIDATE_EVENT, onInvalidate);
  }, [refetch]);

  return { products, availableSizes, count, limit, offset, loading, error, refetch };
}

export function useStoreProductSuggestions(query: StoreProductSuggestionsQuery = {}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(createLatestRequestController());

  const normalizedQuery = useMemo<StoreProductSuggestionsQuery>(() => {
    return {
      q: query.q,
      category: query.category,
      brands: query.brands,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      limit: query.limit,
      skip: query.skip,
    };
  }, [
    query.q,
    query.category,
    query.brands,
    query.minPrice,
    query.maxPrice,
    query.limit,
    query.skip,
  ]);

  const refetch = useCallback(async () => {
    const normalizedQ = normalizedQuery.q?.trim() ?? "";
    const isLikelySkuSearch = /\d/.test(normalizedQ);
    if (normalizedQuery.skip || (normalizedQ.length < 2 && !isLikelySkuSearch)) {
      latestRequestRef.current.invalidate();
      setProducts([]);
      setError(null);
      setLoading(false);
      return;
    }

    const request = latestRequestRef.current.start();
    setLoading(true);
    setError(null);
    setProducts([]);

    try {
      if (!getPublishableKey()) {
        throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
      }

      if (isBackendInCooldown()) {
        throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
      }

      const mapped = await fetchStoreProductSuggestionsOnce(normalizedQuery, {
        signal: request.controller.signal,
      });
      if (latestRequestRef.current.shouldIgnore(request)) return;
      markBackendHealthy();
      setProducts(mapped);
    } catch (error) {
      if (latestRequestRef.current.shouldIgnore(request)) return;
      if (shouldMarkBackendUnavailable(error)) {
        markBackendUnavailable();
      }
      setProducts([]);
      setError(mapStoreError(error));
    } finally {
      const isLatest = latestRequestRef.current.isLatest(request);
      latestRequestRef.current.release(request);
      if (isLatest) {
        setLoading(false);
      }
    }
  }, [normalizedQuery]);

  useEffect(() => {
    const latestRequest = latestRequestRef.current;
    void refetch();
    return () => {
      latestRequest.abort();
    };
  }, [refetch]);

  useEffect(() => {
    const onInvalidate = () => void refetch();
    window.addEventListener(STORE_INVALIDATE_EVENT, onInvalidate);
    return () =>
      window.removeEventListener(STORE_INVALIDATE_EVENT, onInvalidate);
  }, [refetch]);

  return { products, loading, error, refetch };
}

export function useStoreRelatedProducts(query: StoreRelatedProductsQuery) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(createLatestRequestController());

  const normalizedQuery = useMemo<StoreRelatedProductsQuery>(() => {
    return {
      productId: query.productId,
      limit: query.limit,
      skip: query.skip,
    };
  }, [query.productId, query.limit, query.skip]);

  const refetch = useCallback(async () => {
    const normalizedId = normalizedQuery.productId.trim();
    if (normalizedQuery.skip || !normalizedId) {
      latestRequestRef.current.invalidate();
      setProducts([]);
      setError(null);
      setLoading(false);
      return;
    }

    const request = latestRequestRef.current.start();
    setLoading(true);
    setError(null);

    try {
      if (!getPublishableKey()) {
        throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
      }

      if (isBackendInCooldown()) {
        throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
      }

      const mapped = await fetchStoreRelatedProductsOnce(
        {
          ...normalizedQuery,
          productId: normalizedId,
        },
        {
          signal: request.controller.signal,
        }
      );
      if (latestRequestRef.current.shouldIgnore(request)) return;
      markBackendHealthy();
      setProducts(mapped);
    } catch (error) {
      if (latestRequestRef.current.shouldIgnore(request)) return;
      if (shouldMarkBackendUnavailable(error)) {
        markBackendUnavailable();
      }
      setProducts([]);
      setError(mapStoreError(error));
    } finally {
      const isLatest = latestRequestRef.current.isLatest(request);
      latestRequestRef.current.release(request);
      if (isLatest) {
        setLoading(false);
      }
    }
  }, [normalizedQuery]);

  useEffect(() => {
    const latestRequest = latestRequestRef.current;
    void refetch();
    return () => {
      latestRequest.abort();
    };
  }, [refetch]);

  useEffect(() => {
    const onInvalidate = () => void refetch();
    window.addEventListener(STORE_INVALIDATE_EVENT, onInvalidate);
    return () =>
      window.removeEventListener(STORE_INVALIDATE_EVENT, onInvalidate);
  }, [refetch]);

  return { products, loading, error, refetch };
}

export function useStoreBrands() {
  const [brands, setBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(createLatestRequestController());

  const refetch = useCallback(async () => {
    const request = latestRequestRef.current.start();
    setLoading(true);
    setError(null);

    try {
      if (!getPublishableKey()) {
        throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
      }

      if (isBackendInCooldown()) {
        throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
      }

      const mapped = await fetchStoreBrands({
        signal: request.controller.signal,
      });
      if (latestRequestRef.current.shouldIgnore(request)) return;
      markBackendHealthy();
      setBrands(mapped);
    } catch (error) {
      if (latestRequestRef.current.shouldIgnore(request)) return;
      if (shouldMarkBackendUnavailable(error)) {
        markBackendUnavailable();
      }
      setBrands([]);
      setError(mapStoreError(error));
    } finally {
      const isLatest = latestRequestRef.current.isLatest(request);
      latestRequestRef.current.release(request);
      if (isLatest) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const latestRequest = latestRequestRef.current;
    void refetch();
    return () => {
      latestRequest.abort();
    };
  }, [refetch]);

  useEffect(() => {
    const onInvalidate = () => void refetch();
    window.addEventListener(STORE_INVALIDATE_EVENT, onInvalidate);
    return () =>
      window.removeEventListener(STORE_INVALIDATE_EVENT, onInvalidate);
  }, [refetch]);

  return { brands, loading, error, refetch };
}

export function useStoreProduct(productId: string) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const latestRequestRef = useRef(createLatestRequestController());

  const normalizedId = useMemo(() => productId.trim(), [productId]);

  const refetch = useCallback(async () => {
    if (!normalizedId) {
      latestRequestRef.current.invalidate();
      setProduct(null);
      setNotFound(true);
      setError(null);
      setLoading(false);
      return;
    }

    const request = latestRequestRef.current.start();
    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      if (!getPublishableKey()) {
        throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
      }

      if (isBackendInCooldown()) {
        throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
      }

      const found = await fetchStoreProductById(normalizedId, {
        signal: request.controller.signal,
      });
      if (latestRequestRef.current.shouldIgnore(request)) return;

      markBackendHealthy();
      if (found) {
        setProduct(found);
        setNotFound(false);
      } else {
        setProduct(null);
        setNotFound(true);
      }
    } catch (error) {
      if (latestRequestRef.current.shouldIgnore(request)) return;
      if (error instanceof ApiHttpError && error.status === 404) {
        markBackendHealthy();
        setProduct(null);
        setNotFound(true);
        setError(null);
        return;
      }

      if (shouldMarkBackendUnavailable(error)) {
        markBackendUnavailable();
      }
      setProduct(null);
      setNotFound(false);
      setError(mapStoreError(error));
    } finally {
      const isLatest = latestRequestRef.current.isLatest(request);
      latestRequestRef.current.release(request);
      if (isLatest) {
        setLoading(false);
      }
    }
  }, [normalizedId]);

  useEffect(() => {
    const latestRequest = latestRequestRef.current;
    void refetch();
    return () => {
      latestRequest.abort();
    };
  }, [refetch]);

  useEffect(() => {
    const onInvalidate = () => void refetch();
    window.addEventListener(STORE_INVALIDATE_EVENT, onInvalidate);
    return () =>
      window.removeEventListener(STORE_INVALIDATE_EVENT, onInvalidate);
  }, [refetch]);

  return { product, loading, error, notFound, refetch };
}
