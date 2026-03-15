"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Product } from "@/lib/product";
import { createLatestRequestController } from "@/lib/latest-request";
import { mapStoreDtoToProduct } from "@/lib/store-mappers";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";
import { fetchJsonWithAuthRetry } from "@/lib/store-client";
import { mapFriendlyError } from "@/lib/user-facing-errors";

export type StoreAccountListSummary = {
  id: string;
  name: string;
  itemCount: number;
  previewImageUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type StoreProductListItem = {
  id: string;
  name: string;
};

export type StoreProductListSelection = {
  productId: string;
  favorite: boolean;
  listIds: string[];
  lists: StoreProductListItem[];
};

export type StoreAccountListDetail = {
  list: StoreAccountListSummary | null;
  productIds: string[];
  products: Product[];
  count: number;
};

type ListsApiResponse = {
  lists?: unknown[];
  count?: unknown;
};

type CreateListApiResponse = {
  list?: unknown;
};

type ListDetailApiResponse = {
  list?: unknown;
  product_ids?: unknown[];
  products?: unknown[];
  count?: unknown;
};

type ProductSelectionApiResponse = {
  product_id?: unknown;
  favorite?: unknown;
  list_ids?: unknown[];
  lists?: unknown[];
};

function normalizeText(value: unknown, max = 160) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeId(value: unknown) {
  return normalizeText(value, 140);
}

function toCount(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function uniq(values: string[]) {
  return Array.from(new Set(values));
}

function mapStoreAccountListSummary(raw: unknown): StoreAccountListSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;

  const id = normalizeId(rec.id);
  const name = normalizeText(rec.name, 80);
  if (!id || !name) return null;

  return {
    id,
    name,
    itemCount: toCount(rec.item_count ?? rec.itemCount, 0),
    previewImageUrl:
      toStoreMediaProxyUrl(
        normalizeText(rec.preview_image_url ?? rec.previewImageUrl, 1200)
      ) || null,
    createdAt: normalizeText(rec.created_at ?? rec.createdAt, 80) || null,
    updatedAt: normalizeText(rec.updated_at ?? rec.updatedAt, 80) || null,
  };
}

function mapStoreProductListItem(raw: unknown): StoreProductListItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const id = normalizeId(rec.id);
  const name = normalizeText(rec.name, 80);
  if (!id || !name) return null;
  return { id, name };
}

function normalizeIds(raw: unknown) {
  if (!Array.isArray(raw)) return [] as string[];
  return uniq(raw.map((entry) => normalizeId(entry)).filter(Boolean));
}

function mapProductList(raw: unknown) {
  if (!Array.isArray(raw)) return [] as Product[];
  return raw.map(mapStoreDtoToProduct).filter(Boolean) as Product[];
}

export async function fetchStoreAccountLists(options?: { signal?: AbortSignal }) {
  const response = await fetchJsonWithAuthRetry<ListsApiResponse>(
    "/store/catalog/account/lists",
    {
      method: "GET",
      credentials: "include",
      signal: options?.signal,
    }
  );

  const lists = (response.lists ?? [])
    .map(mapStoreAccountListSummary)
    .filter(Boolean) as StoreAccountListSummary[];

  return {
    lists,
    count: toCount(response.count, lists.length),
  };
}

export async function createStoreAccountList(nameRaw: string) {
  const name = normalizeText(nameRaw, 80);
  if (!name) {
    throw new Error("El nombre de la lista es obligatorio.");
  }

  const response = await fetchJsonWithAuthRetry<CreateListApiResponse>(
    "/store/catalog/account/lists",
    {
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ name }),
    }
  );

  const list = mapStoreAccountListSummary(response.list);
  if (!list) {
    throw new Error("No pudimos crear la lista.");
  }
  return list;
}

export async function fetchStoreAccountListDetail(
  listIdRaw: string,
  options?: { signal?: AbortSignal }
) {
  const listId = normalizeId(listIdRaw);
  if (!listId) {
    throw new Error("Lista inválida.");
  }

  const response = await fetchJsonWithAuthRetry<ListDetailApiResponse>(
    `/store/catalog/account/lists/${encodeURIComponent(listId)}`,
    {
      method: "GET",
      credentials: "include",
      signal: options?.signal,
    }
  );

  const list = mapStoreAccountListSummary(response.list);
  const productIds = normalizeIds(response.product_ids);
  const products = mapProductList(response.products);
  const count = toCount(response.count, productIds.length);

  return {
    list,
    productIds,
    products,
    count,
  } as StoreAccountListDetail;
}

function mapStoreProductListSelection(
  response: ProductSelectionApiResponse
): StoreProductListSelection {
  const listIds = normalizeIds(response.list_ids);
  const lists = (response.lists ?? [])
    .map(mapStoreProductListItem)
    .filter(Boolean) as StoreProductListItem[];

  return {
    productId: normalizeId(response.product_id),
    favorite: response.favorite === true,
    listIds,
    lists,
  };
}

export async function fetchStoreProductListSelection(productIdRaw: string) {
  const productId = normalizeId(productIdRaw);
  if (!productId) {
    throw new Error("Producto inválido.");
  }

  const response = await fetchJsonWithAuthRetry<ProductSelectionApiResponse>(
    `/store/catalog/account/lists/product/${encodeURIComponent(productId)}`,
    {
      method: "GET",
      credentials: "include",
    }
  );

  return mapStoreProductListSelection(response);
}

export async function saveStoreProductListSelection(
  productIdRaw: string,
  input: { favorite: boolean; listIds: string[] }
) {
  const productId = normalizeId(productIdRaw);
  if (!productId) {
    throw new Error("Producto inválido.");
  }

  const response = await fetchJsonWithAuthRetry<ProductSelectionApiResponse>(
    `/store/catalog/account/lists/product/${encodeURIComponent(productId)}`,
    {
      method: "PUT",
      credentials: "include",
      body: JSON.stringify({
        favorite: input.favorite === true,
        list_ids: normalizeIds(input.listIds),
      }),
    }
  );

  return mapStoreProductListSelection(response);
}

export function useStoreAccountLists(input?: { skip?: boolean }) {
  const skip = input?.skip === true;

  const [lists, setLists] = useState<StoreAccountListSummary[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(!skip);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(createLatestRequestController());

  const refetch = useCallback(async () => {
    if (skip) {
      latestRequestRef.current.invalidate();
      setLists([]);
      setCount(0);
      setLoading(false);
      setError(null);
      return;
    }

    const request = latestRequestRef.current.start();
    setLoading(true);
    setError(null);
    try {
      const next = await fetchStoreAccountLists({
        signal: request.controller.signal,
      });
      if (latestRequestRef.current.shouldIgnore(request)) return;
      setLists(next.lists);
      setCount(next.count);
    } catch (fetchError) {
      if (latestRequestRef.current.shouldIgnore(request)) return;
      setError(
        mapFriendlyError(fetchError, "No pudimos cargar tus listas.", "login")
      );
      setLists([]);
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

  const createList = useCallback(async (nameRaw: string) => {
    const name = normalizeText(nameRaw, 80);
    if (!name) {
      throw new Error("El nombre de la lista es obligatorio.");
    }

    latestRequestRef.current.invalidate();
    setLoading(false);
    setCreating(true);
    setError(null);
    try {
      const created = await createStoreAccountList(name);
      setLists((current) => {
        const next = [created, ...current.filter((item) => item.id !== created.id)];
        return next.sort((a, b) => {
          const aTime = Date.parse(a.updatedAt || a.createdAt || "");
          const bTime = Date.parse(b.updatedAt || b.createdAt || "");
          if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
          return a.name.localeCompare(b.name, "es");
        });
      });
      setCount((current) => Math.max(current + 1, 1));
      return created;
    } catch (createError) {
      const message = mapFriendlyError(
        createError,
        "No pudimos crear la lista.",
        "login"
      );
      setError(message);
      throw createError;
    } finally {
      setCreating(false);
    }
  }, []);

  const updateListItemCount = useCallback((listIdRaw: string, itemCount: number) => {
    const listId = normalizeId(listIdRaw);
    if (!listId) return;
    setLists((current) =>
      current.map((list) =>
        list.id === listId
          ? {
              ...list,
              itemCount: Math.max(0, Math.trunc(itemCount)),
            }
          : list
      )
    );
  }, []);

  return {
    lists,
    count,
    loading,
    creating,
    error,
    refetch,
    createList,
    updateListItemCount,
    clearError: useCallback(() => setError(null), []),
    listById: useMemo(
      () => new Map(lists.map((list) => [list.id, list])),
      [lists]
    ),
  };
}

export function useStoreAccountListDetail(
  listIdRaw: string,
  input?: { skip?: boolean }
) {
  const listId = useMemo(() => normalizeId(listIdRaw), [listIdRaw]);
  const skip = input?.skip === true || !listId;

  const [detail, setDetail] = useState<StoreAccountListDetail | null>(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(createLatestRequestController());

  const refetch = useCallback(async () => {
    if (skip || !listId) {
      latestRequestRef.current.invalidate();
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }

    const request = latestRequestRef.current.start();
    setLoading(true);
    setError(null);
    try {
      const next = await fetchStoreAccountListDetail(listId, {
        signal: request.controller.signal,
      });
      if (latestRequestRef.current.shouldIgnore(request)) return;
      setDetail(next);
    } catch (fetchError) {
      if (latestRequestRef.current.shouldIgnore(request)) return;
      setError(
        mapFriendlyError(fetchError, "No pudimos cargar esta lista.", "login")
      );
      setDetail(null);
    } finally {
      const isLatest = latestRequestRef.current.isLatest(request);
      latestRequestRef.current.release(request);
      if (isLatest) {
        setLoading(false);
      }
    }
  }, [listId, skip]);

  useEffect(() => {
    const latestRequest = latestRequestRef.current;
    void refetch();
    return () => {
      latestRequest.abort();
    };
  }, [refetch]);

  return {
    detail,
    loading,
    error,
    refetch,
  };
}
