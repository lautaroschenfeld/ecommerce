"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchJson, fetchJsonWithAuthRetry } from "@/lib/store-client";
import { mapFriendlyError } from "@/lib/user-facing-errors";

export const DEFAULT_FREE_SHIPPING_THRESHOLD = 50000;
export const STANDARD_SHIPPING_AMOUNT = 8500;
export const EXPRESS_SHIPPING_AMOUNT = 14500;
export const EXPRESS_DISCOUNTED_SHIPPING_AMOUNT = 6500;
export const DEFAULT_DELIVERY_MIN_BUSINESS_DAYS = 6;
export const DEFAULT_DELIVERY_MAX_BUSINESS_DAYS = 16;

export type StoreDeliveryWindow = {
  from: Date;
  to: Date;
};

export type StoreShippingSettings = {
  freeShippingThresholdArs: number;
  standardShippingArs: number;
  expressShippingArs: number;
  expressDiscountedShippingArs: number;
};

function toNonNegativeInt(input: unknown, fallback: number) {
  const parsed =
    typeof input === "number" || typeof input === "string"
      ? Number(input)
      : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function toPositiveInt(input: unknown, fallback: number) {
  const parsed =
    typeof input === "number" || typeof input === "string"
      ? Number(input)
      : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : fallback;
}

function addBusinessDays(baseDate: Date, businessDays: number) {
  const next = new Date(baseDate);
  let added = 0;

  while (added < businessDays) {
    next.setDate(next.getDate() + 1);
    const day = next.getDay();
    if (day === 0 || day === 6) continue;
    added += 1;
  }

  return next;
}

export function estimateStoreDeliveryWindow(input: {
  now?: Date;
  minBusinessDays?: number;
  maxBusinessDays?: number;
} = {}): StoreDeliveryWindow {
  const now = input.now ? new Date(input.now) : new Date();
  now.setHours(0, 0, 0, 0);

  const minBusinessDays = toPositiveInt(
    input.minBusinessDays,
    DEFAULT_DELIVERY_MIN_BUSINESS_DAYS
  );
  const maxBusinessDays = Math.max(
    minBusinessDays,
    toPositiveInt(input.maxBusinessDays, DEFAULT_DELIVERY_MAX_BUSINESS_DAYS)
  );

  return {
    from: addBusinessDays(now, minBusinessDays),
    to: addBusinessDays(now, maxBusinessDays),
  };
}

export function formatStoreDeliveryWindow(
  window: StoreDeliveryWindow,
  locale = "es-AR"
) {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
  });
  return `${formatter.format(window.from)} y el ${formatter.format(window.to)}`;
}

function mapShippingSettings(raw: unknown): StoreShippingSettings {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

  return {
    freeShippingThresholdArs: toNonNegativeInt(
      rec?.free_shipping_threshold_ars ?? rec?.freeShippingThresholdArs,
      DEFAULT_FREE_SHIPPING_THRESHOLD
    ),
    standardShippingArs: toNonNegativeInt(
      rec?.standard_shipping_ars ?? rec?.standardShippingArs,
      STANDARD_SHIPPING_AMOUNT
    ),
    expressShippingArs: toNonNegativeInt(
      rec?.express_shipping_ars ?? rec?.expressShippingArs,
      EXPRESS_SHIPPING_AMOUNT
    ),
    expressDiscountedShippingArs: toNonNegativeInt(
      rec?.express_discounted_shipping_ars ?? rec?.expressDiscountedShippingArs,
      EXPRESS_DISCOUNTED_SHIPPING_AMOUNT
    ),
  };
}

export async function getStoreShippingSettings() {
  const data = await fetchJson<{ shipping?: unknown }>("/store/catalog/settings/shipping", {
    method: "GET",
    credentials: "include",
  });
  return mapShippingSettings(data.shipping);
}

export async function getAdminShippingSettings() {
  const data = await fetchJsonWithAuthRetry<{ shipping?: unknown }>(
    "/store/catalog/account/admin/settings/shipping",
    {
      method: "GET",
      credentials: "include",
    }
  );
  return mapShippingSettings(data.shipping);
}

export async function updateAdminShippingSettings(input: {
  freeShippingThresholdArs: number;
}) {
  const data = await fetchJsonWithAuthRetry<{ shipping?: unknown }>(
    "/store/catalog/account/admin/settings/shipping",
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        free_shipping_threshold_ars: Math.max(0, Math.trunc(input.freeShippingThresholdArs)),
      }),
    }
  );
  return mapShippingSettings(data.shipping);
}

export function computeStoreShippingAmount(input: {
  subtotalArs: number;
  deliveryMethod: "standard" | "express" | "pickup";
  settings: StoreShippingSettings;
}) {
  const subtotal = Math.max(0, Math.trunc(Number(input.subtotalArs) || 0));
  const threshold = toNonNegativeInt(
    input.settings.freeShippingThresholdArs,
    DEFAULT_FREE_SHIPPING_THRESHOLD
  );

  if (input.deliveryMethod === "pickup") return 0;
  if (input.deliveryMethod === "standard") {
    return subtotal >= threshold ? 0 : input.settings.standardShippingArs;
  }

  return subtotal >= threshold
    ? input.settings.expressDiscountedShippingArs
    : input.settings.expressShippingArs;
}

// Legacy alias kept to avoid breaking existing imports.
export const computeStoreShippingArs = computeStoreShippingAmount;

export function useStoreShippingSettings() {
  const [settings, setSettings] = useState<StoreShippingSettings>({
    freeShippingThresholdArs: DEFAULT_FREE_SHIPPING_THRESHOLD,
    standardShippingArs: STANDARD_SHIPPING_AMOUNT,
    expressShippingArs: EXPRESS_SHIPPING_AMOUNT,
    expressDiscountedShippingArs: EXPRESS_DISCOUNTED_SHIPPING_AMOUNT,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getStoreShippingSettings();
      setSettings(next);
    } catch (error) {
      setError(
        mapFriendlyError(error, "No se pudo cargar la configuración de envío.")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { settings, loading, error, refetch };
}

