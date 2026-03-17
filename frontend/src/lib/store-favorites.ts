"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Product } from "@/lib/product";
import { createLatestRequestController } from "@/lib/latest-request";
import { mapStoreDtoToProduct } from "@/lib/store-mappers";
import { fetchJsonWithAuthRetry } from "@/lib/store-client";
import { mapFriendlyError } from "@/lib/user-facing-errors";

type FavoritesApiResponse = {
  product_ids?: unknown[];
  products?: unknown[];
  count?: unknown;
};

function normalizeProductId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProductIds(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    const productId = normalizeProductId(entry);
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    out.push(productId);
  }

  return out;
}

function parseCount(raw: unknown, fallback: number) {
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function mapFavoritesProducts(raw: unknown) {
  if (!Array.isArray(raw)) return [] as Product[];
  return raw.map(mapStoreDtoToProduct).filter(Boolean) as Product[];
}

function mapFavoritesResponse(response: FavoritesApiResponse) {
  const productIds = normalizeProductIds(response.product_ids);
  const products = mapFavoritesProducts(response.products);
  const count = parseCount(response.count, productIds.length);

  return {
    productIds,
    products,
    count,
  };
}

async function fetchAccountFavorites(options?: { signal?: AbortSignal }) {
  const response = await fetchJsonWithAuthRetry<FavoritesApiResponse>(
    "/store/catalog/account/favorites",
    {
      method: "GET",
      credentials: "include",
      signal: options?.signal,
    }
  );
  return mapFavoritesResponse(response);
}

async function addAccountFavorite(productId: string) {
  const response = await fetchJsonWithAuthRetry<FavoritesApiResponse>(
    "/store/catalog/account/favorites",
    {
      method: "POST",
      credentials: "include",
      body: JSON.stringify({
        product_id: productId,
      }),
    }
  );
  return mapFavoritesResponse(response);
}

async function removeAccountFavorite(productId: string) {
  const response = await fetchJsonWithAuthRetry<FavoritesApiResponse>(
    `/store/catalog/account/favorites/${encodeURIComponent(productId)}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );
  return mapFavoritesResponse(response);
}

export function useStoreFavorites(input?: { skip?: boolean }) {
  const skip = input?.skip === true;

  const [productIds, setProductIds] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(!skip);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(createLatestRequestController());

  const productIdsSet = useMemo(() => new Set(productIds), [productIds]);

  const refetch = useCallback(async () => {
    if (skip) {
      latestRequestRef.current.invalidate();
      setProductIds([]);
      setProducts([]);
      setCount(0);
      setLoading(false);
      setError(null);
      return;
    }

    const request = latestRequestRef.current.start();
    setLoading(true);
    setError(null);
    try {
      const next = await fetchAccountFavorites({
        signal: request.controller.signal,
      });
      if (latestRequestRef.current.shouldIgnore(request)) return;
      setProductIds(next.productIds);
      setProducts(next.products);
      setCount(next.count);
    } catch (fetchError) {
      if (latestRequestRef.current.shouldIgnore(request)) return;
      setError(
        mapFriendlyError(fetchError, "No pudimos cargar tus favoritos.", "login")
      );
      setProductIds([]);
      setProducts([]);
      setCount(0);
    } finally {
      const isLatest = latestRequestRef.current.isLatest(request);
      latestRequestRef.current.release(request);
      if (isLatest) {
        setLoading(false);
      }
    }
  }, [skip]);

  useEffect(() => {
    const latestRequest = latestRequestRef.current;
    void refetch();
    return () => {
      latestRequest.abort();
    };
  }, [refetch]);

  const addFavorite = useCallback(async (productIdRaw: string) => {
    const productId = normalizeProductId(productIdRaw);
    if (!productId) return false;

    latestRequestRef.current.invalidate();
    setLoading(false);
    setSavingProductId(productId);
    setError(null);
    try {
      const next = await addAccountFavorite(productId);
      setProductIds(next.productIds);
      setCount(next.count);
      return next.productIds.includes(productId);
    } catch (saveError) {
      setError(
        mapFriendlyError(saveError, "No pudimos guardar este favorito.", "login")
      );
      throw saveError;
    } finally {
      setSavingProductId((current) => (current === productId ? null : current));
    }
  }, []);

  const removeFavorite = useCallback(async (productIdRaw: string) => {
    const productId = normalizeProductId(productIdRaw);
    if (!productId) return false;

    latestRequestRef.current.invalidate();
    setLoading(false);
    setSavingProductId(productId);
    setError(null);
    try {
      const next = await removeAccountFavorite(productId);
      setProductIds(next.productIds);
      setProducts((current) =>
        current.filter((product) => product.id !== productId)
      );
      setCount(next.count);
      return next.productIds.includes(productId);
    } catch (saveError) {
      setError(
        mapFriendlyError(saveError, "No pudimos quitar este favorito.", "login")
      );
      throw saveError;
    } finally {
      setSavingProductId((current) => (current === productId ? null : current));
    }
  }, []);

  const toggleFavorite = useCallback(
    async (productIdRaw: string, force?: boolean) => {
      const productId = normalizeProductId(productIdRaw);
      if (!productId) return false;

      const current = productIdsSet.has(productId);
      const shouldAdd = typeof force === "boolean" ? force : !current;

      if (shouldAdd) {
        return await addFavorite(productId);
      }
      return await removeFavorite(productId);
    },
    [addFavorite, productIdsSet, removeFavorite]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    productIds,
    productIdsSet,
    products,
    count,
    loading,
    savingProductId,
    error,
    refetch,
    clearError,
    isFavorite: useCallback(
      (productIdRaw: string) => productIdsSet.has(normalizeProductId(productIdRaw)),
      [productIdsSet]
    ),
    addFavorite,
    removeFavorite,
    toggleFavorite,
  };
}
