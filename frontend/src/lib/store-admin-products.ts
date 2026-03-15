"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ALL_CATEGORIES, type Category } from "@/lib/catalog";
import { fetchJsonWithAuthRetry as fetchJson } from "@/lib/store-client";
import {
  mapAdminDetailDtoToAdminProductDetail,
  mapAdminDtoToAdminProduct,
  type AdminProduct,
  type AdminProductDetail,
} from "@/lib/store-mappers";
import { invalidateStoreProducts } from "@/lib/store-catalog";
import { notify } from "@/lib/notifications";
import {
  FRIENDLY_ERROR_MESSAGES,
  mapFriendlyError,
} from "@/lib/user-facing-errors";

const ADMIN_INVALIDATE_EVENT = "store:invalidate:admin-products";

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";
}

function adminHeaders(): Record<string, string> {
  const key = getPublishableKey();
  if (!key) return {};
  return { "x-publishable-api-key": key };
}

function mapAdminError(error: unknown, fallback: string) {
  return mapFriendlyError(error, fallback);
}

export type AdminProductsBulkAction =
  | "publish"
  | "delete"
  | "change_category"
  | "adjust_stock";

export type AdminProductsBulkJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type AdminProductsBulkJobError = {
  productId: string;
  message: string;
};

export type AdminProductsBulkJob = {
  id: string;
  action: AdminProductsBulkAction;
  status: AdminProductsBulkJobStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  errors: AdminProductsBulkJobError[];
  parameters?: Record<string, unknown>;
};

export type AdminProductsListStatus =
  | "all"
  | "live"
  | "active";

export type AdminProductsListSort =
  | "created_desc"
  | "created_asc"
  | "price_desc"
  | "price_asc"
  | "name_asc"
  | "name_desc"
  | "stock_desc"
  | "stock_asc";

export type AdminProductsListQuery = {
  q?: string;
  category?: Category;
  brand?: string;
  status?: AdminProductsListStatus;
  minPrice?: number;
  maxPrice?: number;
  sort?: AdminProductsListSort;
  limit?: number;
  offset?: number;
  skip?: boolean;
};

export type AdminProductGroupSyncVariantInput = {
  id?: string;
  name: string;
  brand: string;
  category: Category;
  priceArs: number;
  costArs?: number;
  handle?: string;
  images?: string[];
  stockAvailable: number;
  sku?: string;
  description?: string;
  active?: boolean;
  metadata?: Record<string, unknown>;
};

type NormalizedAdminProductsListQuery = {
  q: string;
  category?: Category;
  brand: string;
  status: AdminProductsListStatus;
  minPrice?: number;
  maxPrice?: number;
  sort: AdminProductsListSort;
  limit: number;
  offset: number;
  skip: boolean;
};

type AdminProductsListResponse = {
  products?: unknown[];
  count?: number;
  product_count?: number;
  productCount?: number;
  limit?: number;
  offset?: number;
};

type AdminProductsRequestOptions = {
  signal?: AbortSignal;
};

export function invalidateAdminProducts() {
  window.dispatchEvent(new Event(ADMIN_INVALIDATE_EVENT));
}

function normalizeAdminProductsQuery(
  query: AdminProductsListQuery = {}
): NormalizedAdminProductsListQuery {
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const category =
    query.category && ALL_CATEGORIES.includes(query.category) ? query.category : undefined;
  const brand = typeof query.brand === "string" ? query.brand.trim() : "";
  const status: AdminProductsListStatus =
    query.status === "all" ||
    query.status === "live" ||
    query.status === "active"
      ? query.status
      : "live";
  const sort: AdminProductsListSort =
    query.sort === "created_desc" ||
    query.sort === "created_asc" ||
    query.sort === "price_desc" ||
    query.sort === "price_asc" ||
    query.sort === "name_asc" ||
    query.sort === "name_desc" ||
    query.sort === "stock_desc" ||
    query.sort === "stock_asc"
      ? query.sort
      : "created_desc";
  const minPrice =
    typeof query.minPrice === "number" && Number.isFinite(query.minPrice)
      ? Math.max(0, query.minPrice)
      : undefined;
  const maxPrice =
    typeof query.maxPrice === "number" && Number.isFinite(query.maxPrice)
      ? Math.max(0, query.maxPrice)
      : undefined;
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.max(1, Math.min(200, Math.trunc(query.limit)))
      : 48;
  const offset =
    typeof query.offset === "number" && Number.isFinite(query.offset)
      ? Math.max(0, Math.trunc(query.offset))
      : 0;

  return {
    q,
    category,
    brand,
    status,
    minPrice,
    maxPrice,
    sort,
    limit,
    offset,
    skip: query.skip === true,
  };
}

function buildAdminProductsQuery(
  query: NormalizedAdminProductsListQuery
) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.brand) params.set("brand", query.brand);
  params.set("status", query.status);
  if (query.minPrice !== undefined) params.set("min_price", String(query.minPrice));
  if (query.maxPrice !== undefined) params.set("max_price", String(query.maxPrice));
  params.set("sort", query.sort);
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  const search = params.toString();
  return search ? `?${search}` : "";
}

async function listAdminProducts(
  query: AdminProductsListQuery = {},
  options: AdminProductsRequestOptions = {}
) {
  const normalized = normalizeAdminProductsQuery(query);
  const qs = buildAdminProductsQuery(normalized);
  const data = await fetchJson<AdminProductsListResponse>(
    `/store/catalog/account/admin/products${qs}`,
    {
      method: "GET",
      headers: adminHeaders(),
      credentials: "include",
      signal: options.signal,
    }
  );

  const mapped = (data.products ?? [])
    .map(mapAdminDtoToAdminProduct)
    .filter(Boolean) as AdminProduct[];

  const count =
    typeof data.count === "number" && Number.isFinite(data.count)
      ? Math.max(0, Math.trunc(data.count))
      : mapped.length;
  const productCountRaw =
    typeof data.product_count === "number" && Number.isFinite(data.product_count)
      ? data.product_count
      : typeof data.productCount === "number" && Number.isFinite(data.productCount)
        ? data.productCount
        : mapped.length;
  const productCount = Math.max(0, Math.trunc(productCountRaw));
  const limit =
    typeof data.limit === "number" && Number.isFinite(data.limit)
      ? Math.max(1, Math.trunc(data.limit))
      : normalized.limit;
  const offset =
    typeof data.offset === "number" && Number.isFinite(data.offset)
      ? Math.max(0, Math.trunc(data.offset))
      : normalized.offset;

  return { products: mapped, count, productCount, limit, offset };
}

async function createAdminProduct(payload: Record<string, unknown>) {
  return await fetchJson<{ product?: { id?: string } }>(
    "/store/catalog/account/admin/products",
    {
      method: "POST",
      headers: {
        ...adminHeaders(),
      },
      credentials: "include",
      body: JSON.stringify(payload),
    }
  );
}

async function getAdminProductById(id: string) {
  const data = await fetchJson<{ product?: unknown }>(
    `/store/catalog/account/admin/products/${encodeURIComponent(id)}`,
    {
      method: "GET",
      headers: adminHeaders(),
      credentials: "include",
    }
  );

  const mapped = mapAdminDetailDtoToAdminProductDetail(data.product);
  if (!mapped) {
    throw new Error(FRIENDLY_ERROR_MESSAGES.actionFailed);
  }

  return mapped;
}

async function patchAdminProduct(id: string, payload: Record<string, unknown>) {
  await fetchJson(`/store/catalog/account/admin/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      ...adminHeaders(),
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
}

async function deleteAdminProduct(id: string) {
  await fetchJson(`/store/catalog/account/admin/products/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: adminHeaders(),
    credentials: "include",
  });
}

async function syncAdminProductGroup(input: {
  anchorProductId: string;
  expectedExistingProductIds?: string[];
  variants: AdminProductGroupSyncVariantInput[];
}) {
  return await fetchJson<{ groupId?: string; productIds?: string[] }>(
    "/store/catalog/account/admin/products/group",
    {
      method: "POST",
      headers: {
        ...adminHeaders(),
      },
      credentials: "include",
      body: JSON.stringify({
        anchorProductId: input.anchorProductId,
        expectedExistingProductIds: input.expectedExistingProductIds ?? [],
        variants: input.variants.map((variant) => ({
          ...(variant.id ? { id: variant.id } : {}),
          name: variant.name,
          brand: variant.brand,
          category: variant.category,
          priceArs: variant.priceArs,
          ...(variant.costArs !== undefined ? { costArs: variant.costArs } : {}),
          ...(variant.handle ? { handle: variant.handle } : {}),
          images: variant.images ?? [],
          stockAvailable: variant.stockAvailable,
          ...(variant.sku !== undefined ? { sku: variant.sku } : {}),
          ...(variant.description !== undefined
            ? { description: variant.description }
            : {}),
          ...(variant.active !== undefined ? { active: variant.active } : {}),
          metadata: variant.metadata ?? {},
        })),
      }),
    }
  );
}

async function startAdminProductsBulkJob(input: {
  action: AdminProductsBulkAction;
  productIds: string[];
  category?: string;
  stockDelta?: number;
}) {
  return await fetchJson<{ job?: AdminProductsBulkJob }>(
    "/store/catalog/account/admin/products/bulk",
    {
      method: "POST",
      headers: {
        ...adminHeaders(),
      },
      credentials: "include",
      body: JSON.stringify({
        action: input.action,
        productIds: input.productIds,
        category: input.category,
        stockDelta: input.stockDelta,
      }),
    }
  );
}

async function getAdminProductsBulkJob(jobId: string) {
  const data = await fetchJson<{ job?: AdminProductsBulkJob }>(
    `/store/catalog/account/admin/products/bulk/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: adminHeaders(),
      credentials: "include",
    }
  );
  const job = data.job;
  if (!job || !job.id) {
    throw new Error("No se pudo leer el estado del proceso masivo.");
  }
  return job;
}

export type AdminUploadedFile = { id: string; url: string };

async function uploadSingleAdminFile(file: File) {
  const form = new FormData();
  form.append("files", file);

  const data = await fetchJson<{ files?: AdminUploadedFile[] }>(
    "/store/catalog/account/admin/uploads",
    {
      method: "POST",
      headers: adminHeaders(),
      credentials: "include",
      body: form,
    }
  );

  return data.files ?? [];
}

async function uploadAdminFiles(files: File[]) {
  const uploaded: AdminUploadedFile[] = [];
  const failures: string[] = [];

  for (const file of files) {
    try {
      const current = await uploadSingleAdminFile(file);
      if (current.length) {
        uploaded.push(...current);
      } else {
        failures.push(`${file.name}: La subida no devolvio archivos.`);
      }
    } catch (error) {
      const reason = mapAdminError(error, "No se pudo subir la imagen.");
      failures.push(`${file.name}: ${reason}`);
    }
  }

  if (!uploaded.length) {
    throw new Error(
      failures[0] ||
        "No se pudo subir ninguna imagen. Revisa formato y tamano de los archivos."
    );
  }

  if (failures.length) {
    console.warn("[admin-products] Algunas imagenes no se pudieron subir:", failures);
  }

  return uploaded;
}

export const adminProductsActions = {
  async getById(id: string): Promise<AdminProductDetail> {
    return await getAdminProductById(id);
  },

  async upload(files: File[]): Promise<AdminUploadedFile[]> {
    const uploaded = await uploadAdminFiles(files);
    return uploaded;
  },

  async startBulkJob(
    input: {
      action: AdminProductsBulkAction;
      productIds: string[];
      category?: string;
      stockDelta?: number;
    },
    options?: { toast?: boolean }
  ): Promise<AdminProductsBulkJob> {
    const shouldToast = options?.toast ?? false;
    try {
      const response = await startAdminProductsBulkJob(input);
      const job = response.job;
      if (!job || !job.id) {
        throw new Error("No se pudo iniciar el proceso masivo.");
      }

      if (shouldToast) {
        notify(
          "Proceso masivo iniciado",
          `Se encolaron ${job.total} producto${job.total === 1 ? "" : "s"} para procesar.`,
          "success"
        );
      }

      return job;
    } catch (error) {
      const message = mapAdminError(
        error,
        "No se pudo iniciar el proceso masivo."
      );
      if (shouldToast) {
        notify("Error al iniciar proceso masivo", message, "error");
      }
      throw new Error(message);
    }
  },

  async getBulkJob(jobId: string): Promise<AdminProductsBulkJob> {
    try {
      return await getAdminProductsBulkJob(jobId);
    } catch (error) {
      const message = mapAdminError(
        error,
        "No se pudo consultar el estado del proceso masivo."
      );
      throw new Error(message);
    }
  },

  async create(
    input: {
      name: string;
      brand: string;
      category: Category;
      priceArs: number;
      costArs?: number;
      handle?: string;
      images?: string[];
      stockAvailable?: number;
      sku?: string;
      description?: string;
      active?: boolean;
      metadata?: Record<string, unknown>;
    },
    options?: { toast?: boolean; invalidate?: boolean }
  ): Promise<string | undefined> {
    const shouldToast = options?.toast ?? true;
    const shouldInvalidate = options?.invalidate ?? true;
    const images = (input.images ?? [])
      .map((item) => item.trim())
      .filter(Boolean);

    const payload = {
      name: input.name,
      brand: input.brand,
      category: input.category,
      priceArs: input.priceArs,
      ...(input.costArs !== undefined ? { costArs: Math.max(0, Math.trunc(input.costArs)) } : {}),
      handle: input.handle,
      images,
      sku: input.sku,
      description: input.description,
      metadata: input.metadata ?? {},
      stockAvailable:
        input.stockAvailable === undefined
          ? 15
          : Math.max(0, Math.trunc(input.stockAvailable)),
      active: input.active ?? true,
    };

    let createdId: string | undefined;

    try {
      const created = await createAdminProduct(payload);
      createdId = created.product?.id;

      if (shouldToast) {
        notify("Producto creado satisfactoriamente", undefined, "success");
      }
    } catch (error) {
      const message = mapAdminError(error, "No se pudo crear el producto.");
      if (shouldToast) {
        notify("Error al crear el producto", message, "error");
      }
      throw new Error(message);
    }

    if (shouldInvalidate) {
      invalidateAdminProducts();
      invalidateStoreProducts();
    }

    return createdId;
  },

  async update(
    id: string,
    input: {
      name?: string;
      brand?: string;
      category?: Category;
      priceArs?: number;
      costArs?: number;
      stockAvailable?: number;
      sku?: string;
      description?: string;
      active?: boolean;
      images?: string[];
      metadata?: Record<string, unknown>;
    },
    options?: { toast?: boolean; invalidate?: boolean }
  ) {
    const shouldToast = options?.toast ?? true;
    const shouldInvalidate = options?.invalidate ?? true;
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.brand !== undefined) payload.brand = input.brand;
    if (input.category !== undefined) payload.category = input.category;
    if (input.priceArs !== undefined) payload.priceArs = input.priceArs;
    if (input.costArs !== undefined) payload.costArs = Math.max(0, Math.trunc(input.costArs));
    if (input.stockAvailable !== undefined) {
      payload.stockAvailable = Math.max(0, Math.trunc(input.stockAvailable));
    }
    if (input.sku !== undefined) payload.sku = input.sku;
    if (input.description !== undefined) payload.description = input.description;
    if (input.active !== undefined) payload.active = input.active;
    if (input.images !== undefined) payload.images = input.images;
    if (input.metadata !== undefined) payload.metadata = input.metadata;

    try {
      await patchAdminProduct(id, payload);

      if (shouldToast) {
        const title =
          input.active === false
            ? "Producto desactivado satisfactoriamente"
            : input.active === true
              ? "Producto activado satisfactoriamente"
              : "Producto actualizado satisfactoriamente";
        const variant = input.active === false ? "warning" : "success";

        notify(title, undefined, variant);
      }
    } catch (error) {
      const message = mapAdminError(error, "No se pudo actualizar el producto.");
      if (shouldToast) {
        notify("Error al actualizar el producto", message, "error");
      }
      throw new Error(message);
    }

    if (shouldInvalidate) {
      invalidateAdminProducts();
      invalidateStoreProducts();
    }
  },

  async remove(
    id: string,
    options?: { toast?: boolean; invalidate?: boolean }
  ) {
    const shouldToast = options?.toast ?? true;
    const shouldInvalidate = options?.invalidate ?? true;

    try {
      await deleteAdminProduct(id);

      if (shouldToast) {
        notify("Producto eliminado satisfactoriamente", undefined, "warning");
      }
    } catch (error) {
      const message = mapAdminError(error, "No se pudo eliminar el producto.");
      if (shouldToast) {
        notify("Error al eliminar el producto", message, "error");
      }
      throw new Error(message);
    }

    if (shouldInvalidate) {
      invalidateAdminProducts();
      invalidateStoreProducts();
    }
  },

  async syncGroup(
    input: {
      anchorProductId: string;
      expectedExistingProductIds?: string[];
      variants: AdminProductGroupSyncVariantInput[];
    },
    options?: { toast?: boolean; invalidate?: boolean }
  ) {
    const shouldToast = options?.toast ?? true;
    const shouldInvalidate = options?.invalidate ?? true;
    const variantCount = input.variants.length;

    try {
      const response = await syncAdminProductGroup(input);

      if (shouldToast) {
        notify(
          variantCount > 1
            ? "Grupo de variantes actualizado satisfactoriamente"
            : "Producto actualizado satisfactoriamente",
          undefined,
          "success"
        );
      }

      if (shouldInvalidate) {
        invalidateAdminProducts();
        invalidateStoreProducts();
      }

      return {
        groupId: response.groupId,
        productIds: response.productIds ?? [],
      };
    } catch (error) {
      const message = mapAdminError(
        error,
        "No se pudo guardar el grupo de variantes."
      );
      if (shouldToast) {
        notify("Error al guardar el producto", message, "error");
      }
      throw new Error(message);
    }
  },

  async clearAll() {
    let list: AdminProduct[] = [];

    try {
      const collected: AdminProduct[] = [];
      let nextOffset = 0;
      const batchLimit = 200;

      while (true) {
        const page = await listAdminProducts({
          status: "all",
          sort: "created_desc",
          limit: batchLimit,
          offset: nextOffset,
        });
        collected.push(...page.products);

        const nextGroupOffset = nextOffset + page.limit;
        if (!page.products.length || nextGroupOffset >= page.count) break;
        nextOffset += page.limit;
      }

      list = collected;
    } catch (error) {
      const message = mapAdminError(error, "No se pudieron cargar los productos.");
      notify("Error al completar la acción", message, "error");
      throw new Error(message);
    }

    if (!list.length) return;

    try {
      for (const product of list) await deleteAdminProduct(product.id);

      notify(
        "Productos eliminados satisfactoriamente",
        `Se eliminaron ${list.length} producto${list.length === 1 ? "" : "s"}.`,
        "warning"
      );
    } catch (error) {
      const message = mapAdminError(error, "No se pudieron eliminar los productos.");
      notify("Error al eliminar los productos", message, "error");
      throw new Error(message);
    } finally {
      invalidateAdminProducts();
      invalidateStoreProducts();
    }
  },
};

export function useAdminProducts(query: AdminProductsListQuery = {}) {
  const normalizedQuery = useMemo(() => normalizeAdminProductsQuery(query), [query]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [count, setCount] = useState(0);
  const [productCount, setProductCount] = useState(0);
  const [limit, setLimit] = useState(normalizedQuery.limit);
  const [offset, setOffset] = useState(normalizedQuery.offset);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const refetch = useCallback(async () => {
    if (normalizedQuery.skip) {
      abortRef.current?.abort();
      abortRef.current = null;
      requestIdRef.current += 1;
      setProducts([]);
      setCount(0);
      setProductCount(0);
      setLimit(normalizedQuery.limit);
      setOffset(normalizedQuery.offset);
      setError(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const page = await listAdminProducts(normalizedQuery, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }
      setProducts(page.products);
      setCount(page.count);
      setProductCount(page.productCount);
      setLimit(page.limit);
      setOffset(page.offset);
    } catch (error) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) {
        return;
      }
      const message = mapAdminError(error, "No se pudo cargar la lista de productos.");
      setError(message);
      setProducts([]);
      setCount(0);
      setProductCount(0);
      setLimit(normalizedQuery.limit);
      setOffset(normalizedQuery.offset);
    } finally {
      if (requestId === requestIdRef.current && abortRef.current === controller) {
        abortRef.current = null;
      }
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [normalizedQuery]);

  useEffect(() => {
    void refetch();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [refetch]);

  useEffect(() => {
    const onInvalidate = () => void refetch();
    window.addEventListener(ADMIN_INVALIDATE_EVENT, onInvalidate);
    return () => window.removeEventListener(ADMIN_INVALIDATE_EVENT, onInvalidate);
  }, [refetch]);

  const categories = useMemo(() => ALL_CATEGORIES, []);

  return { products, count, productCount, limit, offset, loading, error, refetch, categories };
}





