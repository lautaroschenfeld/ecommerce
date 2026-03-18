"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { Category } from "@/lib/catalog";
import type { Product } from "@/lib/product";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";

const STORAGE_KEY = "store:cart:v1";
const CART_CHANGE_EVENT = "store:cart:changed";

export type CartItem = {
  id: string;
  name: string;
  brand: string;
  category: Category;
  priceArs: number;
  imageUrl?: string;
  imageUrls?: string[];
  stockAvailable?: number;
  qty: number;
};

type CartSnapshot = {
  items: CartItem[];
  updatedAt: number;
};

const SERVER_SNAPSHOT: CartSnapshot = { items: [], updatedAt: 0 };
const EMPTY_CLIENT_SNAPSHOT: CartSnapshot = { items: [], updatedAt: 1 };

let cachedRaw: string | null | undefined;
let cachedSnapshot: CartSnapshot = EMPTY_CLIENT_SNAPSHOT;

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeImageCandidates(...sources: unknown[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = toStoreMediaProxyUrl(value) || "";
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  for (const source of sources) {
    if (Array.isArray(source)) {
      for (const entry of source) {
        push(entry);
      }
      continue;
    }
    push(source);
  }

  return out.length ? out : undefined;
}

export function sanitizeCartItemsSnapshot(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];

  const out: CartItem[] = [];
  for (const raw of value) {
    const rec =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!rec) continue;

    const id = typeof rec.id === "string" ? rec.id : "";
    const name = typeof rec.name === "string" ? rec.name : "";
    const brand = typeof rec.brand === "string" ? rec.brand : "";
    const category = rec.category as Category;
    const priceArs =
      typeof rec.priceArs === "number" ? rec.priceArs : Number(rec.priceArs);
    const qty = typeof rec.qty === "number" ? rec.qty : Number(rec.qty);
    const imageUrls = normalizeImageCandidates(
      rec.imageUrls,
      rec.image_url,
      rec.imageUrl
    );
    const imageUrl = imageUrls?.[0];
    const stockAvailableRaw =
      typeof rec.stockAvailable === "number"
        ? rec.stockAvailable
        : Number(rec.stockAvailable);
    const stockAvailable =
      Number.isFinite(stockAvailableRaw) && stockAvailableRaw >= 0
        ? Math.max(0, Math.trunc(stockAvailableRaw))
        : undefined;

    if (!id || !name || !brand) continue;
    if (!Number.isFinite(priceArs) || priceArs <= 0) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;

    out.push({
      id,
      name,
      brand,
      category,
      priceArs,
      imageUrl,
      imageUrls,
      stockAvailable,
      qty:
        stockAvailable !== undefined
          ? clampInt(qty, 1, Math.min(99, Math.max(1, stockAvailable)))
          : clampInt(qty, 1, 99),
    });
  }

  return out;
}

function readSnapshot(): CartSnapshot {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedSnapshot;

    if (!raw) {
      cachedRaw = raw;
      cachedSnapshot = EMPTY_CLIENT_SNAPSHOT;
      return cachedSnapshot;
    }

    const data: unknown = JSON.parse(raw);
    const rec =
      data && typeof data === "object" ? (data as Record<string, unknown>) : null;

    const items = sanitizeCartItemsSnapshot(rec?.items);
    const updatedAtRaw = rec?.updatedAt;
    const updatedAt =
      typeof updatedAtRaw === "number" && Number.isFinite(updatedAtRaw)
        ? updatedAtRaw
        : Date.now();

    cachedRaw = raw;
    cachedSnapshot = { items, updatedAt };
    return cachedSnapshot;
  } catch {
    cachedRaw = undefined;
    cachedSnapshot = EMPTY_CLIENT_SNAPSHOT;
    return cachedSnapshot;
  }
}

function writeSnapshot(next: CartSnapshot) {
  if (typeof window === "undefined") return;

  const raw = JSON.stringify({
    items: next.items,
    updatedAt: next.updatedAt,
  });
  window.localStorage.setItem(STORAGE_KEY, raw);
  cachedRaw = raw;
  cachedSnapshot = next;
  window.dispatchEvent(new Event(CART_CHANGE_EVENT));
}

export function readCartItemsSnapshot() {
  return readSnapshot().items;
}

export function replaceCartItems(items: CartItem[]) {
  const safe = sanitizeCartItemsSnapshot(items);
  writeSnapshot({
    items: safe,
    updatedAt: Date.now(),
  });
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const onChange = () => onStoreChange();
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    onStoreChange();
  };

  window.addEventListener(CART_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CART_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart() {
  const snap = useSyncExternalStore(subscribe, readSnapshot, () => SERVER_SNAPSHOT);
  const items = snap.items;
  const hydrated = snap.updatedAt !== 0;

  const syncFromStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(CART_CHANGE_EVENT));
  }, []);

  const itemCount = useMemo(() => {
    return items.reduce((acc, it) => acc + it.qty, 0);
  }, [items]);

  const subtotalArs = useMemo(() => {
    return items.reduce((acc, it) => acc + it.qty * it.priceArs, 0);
  }, [items]);

  const getQty = useCallback(
    (productId: string) => {
      const found = items.find((it) => it.id === productId);
      return found?.qty ?? 0;
    },
    [items]
  );

  const addItem = useCallback((product: Product, qty = 1) => {
    const snap = readSnapshot();
    const nextQty = clampInt(qty, 1, 99);
    const latestImageUrls = normalizeImageCandidates(product.images, product.imageUrl);
    const stockAvailableRaw = product.stockAvailable;
    const stockAvailable =
      typeof stockAvailableRaw === "number" && Number.isFinite(stockAvailableRaw)
        ? Math.max(0, Math.trunc(stockAvailableRaw))
        : undefined;
    const maxAllowed =
      stockAvailable !== undefined
        ? stockAvailable
        : typeof product.inStock === "boolean"
          ? product.inStock
            ? 99
            : 0
          : 99;

    if (maxAllowed <= 0) return;

    const idx = snap.items.findIndex((it) => it.id === product.id);
    if (idx >= 0) {
      const next = [...snap.items];
      const existing = next[idx]!;
      const existingMax =
        typeof existing.stockAvailable === "number" && Number.isFinite(existing.stockAvailable)
          ? Math.max(0, Math.trunc(existing.stockAvailable))
          : 99;
      const effectiveMax = stockAvailable !== undefined ? maxAllowed : existingMax;
      const desired = clampInt(existing.qty + nextQty, 1, 99);
      const clamped = clampInt(desired, 1, Math.min(99, Math.max(1, effectiveMax)));
      if (clamped === existing.qty) return;
      const imageUrls = normalizeImageCandidates(
        latestImageUrls,
        existing.imageUrls,
        existing.imageUrl
      );
      next[idx] = {
        ...existing,
        // Always refresh display data from the latest product payload.
        name: product.name,
        brand: product.brand,
        category: product.category,
        priceArs: product.priceArs,
        imageUrl: imageUrls?.[0],
        imageUrls,
        stockAvailable: stockAvailable !== undefined ? stockAvailable : existing.stockAvailable,
        qty: clamped,
      };
      writeSnapshot({ items: next, updatedAt: Date.now() });
      return;
    }

    const clamped = clampInt(nextQty, 1, Math.min(99, Math.max(1, maxAllowed)));
    if (clamped <= 0) return;

    writeSnapshot({
      items: [
        ...snap.items,
        {
          id: product.id,
          name: product.name,
          brand: product.brand,
          category: product.category,
          priceArs: product.priceArs,
          imageUrl: latestImageUrls?.[0],
          imageUrls: latestImageUrls,
          stockAvailable,
          qty: clamped,
        },
      ],
      updatedAt: Date.now(),
    });
  }, []);

  const setItemQty = useCallback((productId: string, qty: number) => {
    const snap = readSnapshot();
    const target = snap.items.find((it) => it.id === productId);
    const maxAllowed =
      typeof target?.stockAvailable === "number" && Number.isFinite(target.stockAvailable)
        ? Math.max(0, Math.trunc(target.stockAvailable))
        : 99;
    const nextQty = clampInt(qty, 0, Math.min(99, maxAllowed));

    const next = snap.items
      .map((it) => (it.id === productId ? { ...it, qty: nextQty } : it))
      .filter((it) => it.qty > 0);

    writeSnapshot({ items: next, updatedAt: Date.now() });
  }, []);

  const removeItem = useCallback((productId: string) => {
    const snap = readSnapshot();
    const next = snap.items.filter((it) => it.id !== productId);
    writeSnapshot({ items: next, updatedAt: Date.now() });
  }, []);

  const clear = useCallback(() => {
    writeSnapshot({ items: [], updatedAt: Date.now() });
  }, []);

  return {
    hydrated,
    items,
    itemCount,
    subtotalArs,
    getQty,
    addItem,
    setItemQty,
    removeItem,
    clear,
    syncFromStorage,
  };
}

