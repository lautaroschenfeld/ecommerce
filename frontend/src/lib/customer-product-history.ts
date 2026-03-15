"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { Product } from "@/lib/product";
import { buildProductPath } from "@/lib/product-path";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";

const CUSTOMER_PRODUCT_HISTORY_UPDATED_EVENT = "store:customer:history:updated";
const CUSTOMER_PRODUCT_HISTORY_STORAGE_PREFIX = "store:customer:history:v1:";
const MAX_CUSTOMER_HISTORY_ITEMS = 80;
const SERVER_HISTORY_SNAPSHOT: CustomerProductHistoryItem[] = [];

export type CustomerProductHistoryItem = {
  productId: string;
  name: string;
  brand: string;
  category: string;
  priceArs: number;
  imageUrl: string | null;
  viewedAt: number;
  path: string;
};

function normalizeCustomerHistoryKey(customerKeyRaw: string | null | undefined) {
  const normalized = String(customerKeyRaw || "").trim().toLowerCase();
  return normalized;
}

function storageKeyForCustomer(customerKeyRaw: string | null | undefined) {
  const customerKey = normalizeCustomerHistoryKey(customerKeyRaw);
  if (!customerKey) return "";
  return `${CUSTOMER_PRODUCT_HISTORY_STORAGE_PREFIX}${encodeURIComponent(customerKey)}`;
}

function sanitizeHistoryItem(raw: unknown): CustomerProductHistoryItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;

  const productId = typeof rec.productId === "string" ? rec.productId.trim() : "";
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  const brand = typeof rec.brand === "string" ? rec.brand.trim() : "";
  const category = typeof rec.category === "string" ? rec.category.trim() : "";
  const path = typeof rec.path === "string" ? rec.path.trim() : "";
  const viewedAt =
    typeof rec.viewedAt === "number" && Number.isFinite(rec.viewedAt)
      ? rec.viewedAt
      : Number(rec.viewedAt);
  const priceRaw =
    typeof rec.priceArs === "number" && Number.isFinite(rec.priceArs)
      ? rec.priceArs
      : Number(rec.priceArs);
  const imageUrlRaw = typeof rec.imageUrl === "string" ? rec.imageUrl : "";
  const imageUrl = toStoreMediaProxyUrl(imageUrlRaw.trim()) || null;

  if (!productId || !name || !brand || !category || !path) return null;
  if (!Number.isFinite(viewedAt) || viewedAt <= 0) return null;
  if (!Number.isFinite(priceRaw) || priceRaw <= 0) return null;

  return {
    productId,
    name,
    brand,
    category,
    priceArs: Math.max(0, Math.round(priceRaw)),
    imageUrl,
    viewedAt,
    path,
  };
}

function readHistorySnapshot(storageKey: string) {
  if (typeof window === "undefined") return SERVER_HISTORY_SNAPSHOT;
  if (!storageKey) return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeHistoryItem)
      .filter(Boolean)
      .sort((a, b) => b!.viewedAt - a!.viewedAt) as CustomerProductHistoryItem[];
  } catch {
    return [];
  }
}

function writeHistorySnapshot(storageKey: string, items: CustomerProductHistoryItem[]) {
  if (typeof window === "undefined") return;
  if (!storageKey) return;
  window.localStorage.setItem(storageKey, JSON.stringify(items));
}

function emitHistoryUpdated(storageKey: string) {
  if (typeof window === "undefined") return;
  if (!storageKey) return;
  window.dispatchEvent(
    new CustomEvent<string>(CUSTOMER_PRODUCT_HISTORY_UPDATED_EVENT, {
      detail: storageKey,
    })
  );
}

export function upsertCustomerProductHistory(
  customerKeyRaw: string | null | undefined,
  product: Product
) {
  if (typeof window === "undefined") return;

  const storageKey = storageKeyForCustomer(customerKeyRaw);
  if (!storageKey) return;

  const productId = product.id.trim();
  const name = product.name.trim();
  const brand = product.brand.trim();
  const category = String(product.category || "").trim();
  if (!productId || !name || !brand || !category) return;

  const imageUrl =
    toStoreMediaProxyUrl(product.imageUrl || product.images?.[0] || "") || null;
  const nextItem: CustomerProductHistoryItem = {
    productId,
    name,
    brand,
    category,
    priceArs: Math.max(0, Math.round(product.priceArs)),
    imageUrl,
    viewedAt: Date.now(),
    path: buildProductPath(productId, name),
  };

  const current = readHistorySnapshot(storageKey);
  const next = [nextItem, ...current.filter((entry) => entry.productId !== productId)].slice(
    0,
    MAX_CUSTOMER_HISTORY_ITEMS
  );

  writeHistorySnapshot(storageKey, next);
  emitHistoryUpdated(storageKey);
}

export function clearCustomerProductHistory(customerKeyRaw: string | null | undefined) {
  if (typeof window === "undefined") return;
  const storageKey = storageKeyForCustomer(customerKeyRaw);
  if (!storageKey) return;
  window.localStorage.removeItem(storageKey);
  emitHistoryUpdated(storageKey);
}

export function removeCustomerProductHistoryItem(
  customerKeyRaw: string | null | undefined,
  productIdRaw: string
) {
  if (typeof window === "undefined") return;
  const storageKey = storageKeyForCustomer(customerKeyRaw);
  const productId = String(productIdRaw || "").trim();
  if (!storageKey || !productId) return;

  const current = readHistorySnapshot(storageKey);
  const next = current.filter((entry) => entry.productId !== productId);
  writeHistorySnapshot(storageKey, next);
  emitHistoryUpdated(storageKey);
}

export function useCustomerProductHistory(customerKeyRaw: string | null | undefined) {
  const storageKey = useMemo(
    () => storageKeyForCustomer(customerKeyRaw),
    [customerKeyRaw]
  );

  const subscribe = useMemo(() => {
    return (onStoreChange: () => void) => {
      if (typeof window === "undefined" || !storageKey) return () => {};

      const onStorage = (event: StorageEvent) => {
        if (event.key !== storageKey) return;
        onStoreChange();
      };

      const onHistoryEvent = (event: Event) => {
        const custom = event as CustomEvent<string>;
        if (custom.detail !== storageKey) return;
        onStoreChange();
      };

      window.addEventListener("storage", onStorage);
      window.addEventListener(
        CUSTOMER_PRODUCT_HISTORY_UPDATED_EVENT,
        onHistoryEvent as EventListener
      );

      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(
          CUSTOMER_PRODUCT_HISTORY_UPDATED_EVENT,
          onHistoryEvent as EventListener
        );
      };
    };
  }, [storageKey]);

  const items = useSyncExternalStore(
    subscribe,
    () => readHistorySnapshot(storageKey),
    () => SERVER_HISTORY_SNAPSHOT
  );

  return items;
}
