"use client";

import { useCallback, useEffect, useState } from "react";

import { notify } from "@/lib/notifications";
import { fetchJsonWithAuthRetry as fetchJson } from "@/lib/store-client";
import { mapFriendlyError } from "@/lib/user-facing-errors";

const ADMIN_INVALIDATE_EVENT = "store:invalidate:admin-coupons";
const ADMIN_COUPONS_PAGE_LIMIT = 50;

type AdminCouponsPageResponse = {
  coupons?: unknown[];
  count?: unknown;
  limit?: unknown;
  offset?: unknown;
};

type AdminCouponDto = {
  id?: unknown;
  code?: unknown;
  title?: unknown;
  percentage?: unknown;
  percentage_tenths?: unknown;
  active?: unknown;
  is_active?: unknown;
  used_count?: unknown;
  usedCount?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
};

export type AdminCoupon = {
  id: string;
  code: string;
  title: string;
  percentage: number;
  active: boolean;
  usedCount: number;
  createdAt: number;
  updatedAt: number;
};

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";
}

function adminHeaders(): Record<string, string> {
  const key = getPublishableKey();
  if (!key) return {};
  return { "x-publishable-api-key": key };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function toString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toNonNegativeInt(value: unknown, fallback: number) {
  const parsed = toNumber(value);
  if (parsed === undefined) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function toTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function mapAdminCoupon(dto: unknown): AdminCoupon | null {
  const rec = asRecord(dto) as AdminCouponDto | null;
  if (!rec) return null;

  const id = toString(rec.id)?.trim() || "";
  const code = toString(rec.code)?.trim() || "";
  const title = toString(rec.title)?.trim() || "";
  const percentageRaw =
    toNumber(rec.percentage) ??
    (() => {
      const tenths = toNumber(rec.percentage_tenths);
      return tenths === undefined ? undefined : tenths / 10;
    })();
  const active =
    typeof rec.active === "boolean"
      ? rec.active
      : typeof rec.is_active === "boolean"
        ? rec.is_active
        : true;
  const usedCountRaw = toNumber(rec.used_count) ?? toNumber(rec.usedCount) ?? 0;
  const createdAt =
    toTimestamp(rec.created_at) ?? toTimestamp(rec.createdAt) ?? Date.now();
  const updatedAt =
    toTimestamp(rec.updated_at) ?? toTimestamp(rec.updatedAt) ?? createdAt;

  if (!id || !code || !title || percentageRaw === undefined || percentageRaw <= 0) {
    return null;
  }

  return {
    id,
    code,
    title,
    percentage: Number(percentageRaw),
    active,
    usedCount: Math.max(0, Math.trunc(usedCountRaw)),
    createdAt,
    updatedAt,
  };
}

function mapAdminError(error: unknown, fallback: string) {
  return mapFriendlyError(error, fallback);
}

export function invalidateAdminCoupons() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ADMIN_INVALIDATE_EVENT));
}

async function listAdminCoupons(query?: { limit?: number; offset?: number }) {
  const params = new URLSearchParams();
  params.set("limit", String(Math.max(1, Math.trunc(query?.limit ?? ADMIN_COUPONS_PAGE_LIMIT))));
  params.set("offset", String(Math.max(0, Math.trunc(query?.offset ?? 0))));
  const queryString = params.toString();

  const data = await fetchJson<AdminCouponsPageResponse>(
    `/store/catalog/account/admin/coupons${queryString ? `?${queryString}` : ""}`,
    {
      method: "GET",
      headers: adminHeaders(),
      credentials: "include",
    }
  );

  const coupons = (data.coupons ?? [])
    .map(mapAdminCoupon)
    .filter(Boolean) as AdminCoupon[];

  return {
    coupons,
    count: toNonNegativeInt(data.count, coupons.length),
    limit: Math.max(1, toNonNegativeInt(data.limit, query?.limit ?? ADMIN_COUPONS_PAGE_LIMIT)),
    offset: toNonNegativeInt(data.offset, query?.offset ?? 0),
  };
}

async function createAdminCoupon(payload: Record<string, unknown>) {
  return await fetchJson<{ coupon?: unknown }>(
    "/store/catalog/account/admin/coupons",
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

async function updateAdminCoupon(id: string, payload: Record<string, unknown>) {
  return await fetchJson<{ coupon?: unknown }>(
    `/store/catalog/account/admin/coupons/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(),
      },
      credentials: "include",
      body: JSON.stringify(payload),
    }
  );
}

async function deleteAdminCoupon(id: string) {
  await fetchJson(`/store/catalog/account/admin/coupons/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: adminHeaders(),
    credentials: "include",
  });
}

export const adminCouponsActions = {
  async create(
    input: {
      code: string;
      title: string;
      percentage: number;
      active?: boolean;
    },
    options?: { toast?: boolean; invalidate?: boolean }
  ) {
    const shouldToast = options?.toast ?? true;
    const shouldInvalidate = options?.invalidate ?? true;

    const payload = {
      code: input.code.trim().toUpperCase(),
      title: input.title.trim(),
      percentage: input.percentage,
      active: input.active ?? true,
    };

    try {
      await createAdminCoupon(payload);

      if (shouldToast) {
        notify("Cupón creado satisfactoriamente", undefined, "success");
      }
    } catch (error) {
      const message = mapAdminError(error, "No se pudo crear el cupón.");
      if (shouldToast) {
        notify("Error al crear el cupón", message, "error");
      }
      throw new Error(message);
    }

    if (shouldInvalidate) {
      invalidateAdminCoupons();
    }
  },

  async update(
    id: string,
    input: {
      code?: string;
      title?: string;
      percentage?: number;
      active?: boolean;
    },
    options?: { toast?: boolean; invalidate?: boolean }
  ) {
    const shouldToast = options?.toast ?? true;
    const shouldInvalidate = options?.invalidate ?? true;
    const payload: Record<string, unknown> = {};

    if (input.code !== undefined) payload.code = input.code.trim().toUpperCase();
    if (input.title !== undefined) payload.title = input.title.trim();
    if (input.percentage !== undefined) payload.percentage = input.percentage;
    if (input.active !== undefined) payload.active = input.active;

    try {
      await updateAdminCoupon(id, payload);

      if (shouldToast) {
        notify("Cupón actualizado satisfactoriamente", undefined, "success");
      }
    } catch (error) {
      const message = mapAdminError(error, "No se pudo actualizar el cupón.");
      if (shouldToast) {
        notify("Error al actualizar el cupón", message, "error");
      }
      throw new Error(message);
    }

    if (shouldInvalidate) {
      invalidateAdminCoupons();
    }
  },

  async remove(
    id: string,
    options?: { toast?: boolean; invalidate?: boolean }
  ) {
    const shouldToast = options?.toast ?? true;
    const shouldInvalidate = options?.invalidate ?? true;

    try {
      await deleteAdminCoupon(id);

      if (shouldToast) {
        notify("Cupón eliminado satisfactoriamente", undefined, "warning");
      }
    } catch (error) {
      const message = mapAdminError(error, "No se pudo eliminar el cupón.");
      if (shouldToast) {
        notify("Error al eliminar el cupón", message, "error");
      }
      throw new Error(message);
    }

    if (shouldInvalidate) {
      invalidateAdminCoupons();
    }
  },
};

export function useAdminCoupons(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [count, setCount] = useState(0);
  const [limit, setLimit] = useState(ADMIN_COUPONS_PAGE_LIMIT);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const page = await listAdminCoupons({
        limit: ADMIN_COUPONS_PAGE_LIMIT,
        offset,
      });
      setCoupons(page.coupons);
      setCount(page.count);
      setLimit(page.limit);
    } catch (error) {
      const message = mapAdminError(error, "No se pudo cargar la lista de cupones.");
      setError(message);
      setCoupons([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [enabled, offset]);

  useEffect(() => {
    if (!enabled) return;
    void refetch();
  }, [enabled, refetch]);

  useEffect(() => {
    if (offset <= 0) return;
    if (count === 0) {
      setOffset(0);
      return;
    }
    if (offset < count) return;
    setOffset(Math.floor((count - 1) / limit) * limit);
  }, [count, limit, offset]);

  useEffect(() => {
    if (!enabled) return;
    const onInvalidate = () => void refetch();
    window.addEventListener(ADMIN_INVALIDATE_EVENT, onInvalidate);
    return () => window.removeEventListener(ADMIN_INVALIDATE_EVENT, onInvalidate);
  }, [enabled, refetch]);

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(count / limit));
  const pageFrom = count > 0 ? offset + 1 : 0;
  const pageTo = count > 0 ? Math.min(count, offset + coupons.length) : 0;

  return {
    coupons,
    count,
    loading,
    error,
    refetch,
    currentPage,
    totalPages,
    pageFrom,
    pageTo,
    setPage: (page: number) => {
      const safePage = Math.max(1, Math.trunc(page || 1));
      setOffset((safePage - 1) * limit);
    },
  };
}
