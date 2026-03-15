import { cache } from "react";

import { toStoreMediaProxyUrl } from "@/lib/store-media-url";

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL?.trim() ||
  process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
  "http://localhost:9000";
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";

type SeoProduct = {
  id: string;
  name: string;
  brand: string;
  category: string;
  priceArs: number;
  sku?: string;
  imageUrl?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  inStock?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type StoreProductsPage = {
  products: SeoProduct[];
  count: number;
  limit: number;
  offset: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickBrandName(raw: unknown) {
  const rec = asRecord(raw);
  const single = rec ? toString(rec.name) : undefined;
  if (single?.trim()) return single.trim();

  if (Array.isArray(raw) && raw.length) {
    const first = asRecord(raw[0]);
    const name = first ? toString(first.name) : undefined;
    if (name?.trim()) return name.trim();
  }

  return "";
}

function pickCategoryName(raw: unknown) {
  const rec = asRecord(raw);
  const name = rec ? toString(rec.name) : undefined;
  return name?.trim() || "";
}

function mapSeoProduct(raw: unknown): SeoProduct | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const id = toString(rec.id)?.trim() || "";
  const name = toString(rec.name)?.trim() || "";
  const brand = pickBrandName(rec.brand);
  const category = pickCategoryName(rec.category);
  const priceArs = toNumber(rec.priceArs);
  const sku = toString(rec.sku)?.trim() || undefined;
  const imageUrl = toStoreMediaProxyUrl(toString(rec.imageUrl)) || undefined;
  const description = toString(rec.description)?.trim() || undefined;
  const metadata = asRecord(rec.metadata) ?? undefined;
  const createdAt = toString(rec.createdAt)?.trim() || undefined;
  const updatedAt = toString(rec.updatedAt)?.trim() || undefined;
  const inStock =
    typeof rec.inStock === "boolean" ? (rec.inStock as boolean) : undefined;

  if (!id || !name || !brand || !category) return null;
  if (priceArs === undefined || priceArs <= 0) return null;

  return {
    id,
    name,
    brand,
    category,
    priceArs: Math.round(priceArs),
    sku,
    imageUrl,
    description,
    metadata,
    inStock,
    createdAt,
    updatedAt,
  };
}

async function fetchProductsPage(input: {
  q?: string;
  limit: number;
  offset: number;
}): Promise<StoreProductsPage> {
  if (!PUBLISHABLE_KEY) {
    return { products: [], count: 0, limit: input.limit, offset: input.offset };
  }

  const params = new URLSearchParams();
  params.set("limit", String(input.limit));
  params.set("offset", String(input.offset));
  if (input.q?.trim()) params.set("q", input.q.trim());

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`${BACKEND_URL}/store/catalog/products?${params.toString()}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-publishable-api-key": PUBLISHABLE_KEY,
      },
      signal: controller.signal,
      next: { revalidate: 900 },
    });

    if (!res.ok) {
      throw new Error(`store products request failed (${res.status})`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const productsRaw = Array.isArray(data.products) ? data.products : [];
    const products = productsRaw.map(mapSeoProduct).filter(Boolean) as SeoProduct[];
    const count =
      typeof data.count === "number" && Number.isFinite(data.count)
        ? data.count
        : products.length;
    const limit =
      typeof data.limit === "number" && Number.isFinite(data.limit)
        ? data.limit
        : input.limit;
    const offset =
      typeof data.offset === "number" && Number.isFinite(data.offset)
        ? data.offset
        : input.offset;

    return { products, count, limit, offset };
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function fetchProductById(id: string): Promise<SeoProduct | null> {
  if (!PUBLISHABLE_KEY) return null;

  const normalizedId = id.trim();
  if (!normalizedId) return null;

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(
      `${BACKEND_URL}/store/catalog/products/${encodeURIComponent(normalizedId)}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-publishable-api-key": PUBLISHABLE_KEY,
        },
        signal: controller.signal,
        next: { revalidate: 900 },
      }
    );

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`store product request failed (${res.status})`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    return mapSeoProduct(data.product);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function findSeoProductByIdInternal(id: string) {
  const normalizedId = id.trim();
  if (!normalizedId) return null;

  try {
    return await fetchProductById(normalizedId);
  } catch {
    return null;
  }
}

export const findSeoProductById = cache(findSeoProductByIdInternal);

export async function listSeoProductsForSitemap(maxProducts = 5000) {
  if (!PUBLISHABLE_KEY) return [] as SeoProduct[];

  const seen = new Set<string>();
  const output: SeoProduct[] = [];

  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  const limit = 100;

  try {
    while (offset < total && output.length < maxProducts) {
      const page = await fetchProductsPage({ limit, offset });
      total = page.count;

      for (const product of page.products) {
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        output.push(product);
        if (output.length >= maxProducts) break;
      }

      if (!page.products.length) break;
      offset += page.limit;
    }
  } catch {
    return [];
  }

  return output;
}

export type { SeoProduct };
