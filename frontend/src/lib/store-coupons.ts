"use client";

import type { CartItem } from "@/lib/store-cart";
import { fetchJson } from "@/lib/store-client";
import { FRIENDLY_ERROR_MESSAGES } from "@/lib/user-facing-errors";

export type ValidatedCoupon = {
  id: string;
  code: string;
  title: string;
  percentage: number;
  percentageTenths: number;
  subtotalArs: number;
  discountArs: number;
  totalArs: number;
};

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";
}

function storeHeaders(): Record<string, string> {
  const key = getPublishableKey();
  if (!key) return {};
  return { "x-publishable-api-key": key };
}

function asRecord(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown, fallback = 0) {
  const n =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCartItems(items: CartItem[] | undefined) {
  if (!items?.length) return [];

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    brand: item.brand,
    category: item.category,
    priceArs: item.priceArs,
    imageUrl: item.imageUrl,
    qty: item.qty,
  }));
}

export async function validateStoreCoupon(input: {
  code: string;
  subtotalArs: number;
  items?: CartItem[];
  timeoutMs?: number;
}): Promise<ValidatedCoupon> {
  const code = input.code.trim().toUpperCase();
  if (!code) {
    throw new Error("Ingresá un cupón.");
  }

  if (!getPublishableKey()) {
    throw new Error(FRIENDLY_ERROR_MESSAGES.serviceUnavailable);
  }

  const data = await fetchJson<{
    coupon?: unknown;
    subtotal_ars?: unknown;
    discount_ars?: unknown;
    total_ars?: unknown;
  }>("/store/catalog/coupons/validate", {
    method: "POST",
    headers: storeHeaders(),
    body: JSON.stringify({
      code,
      subtotal_ars: Math.max(0, Math.trunc(input.subtotalArs ?? 0)),
      items: normalizeCartItems(input.items),
    }),
    timeoutMs: input.timeoutMs ?? 1400,
  });

  const couponRec = asRecord(data.coupon);
  if (!couponRec) {
    throw new Error(FRIENDLY_ERROR_MESSAGES.actionFailed);
  }

  const id = typeof couponRec.id === "string" ? couponRec.id : "";
  const resCode =
    typeof couponRec.code === "string" ? couponRec.code.toUpperCase() : "";
  const title = typeof couponRec.title === "string" ? couponRec.title : "";
  const percentage = toNumber(couponRec.percentage, 0);
  const percentageTenths = Math.max(
    0,
    Math.trunc(toNumber(couponRec.percentage_tenths, Math.round(percentage * 10)))
  );
  const subtotalArs = Math.max(0, Math.trunc(toNumber(data.subtotal_ars)));
  const discountArs = Math.max(0, Math.trunc(toNumber(data.discount_ars)));
  const totalArs = Math.max(0, Math.trunc(toNumber(data.total_ars)));

  if (!id || !resCode || !title) {
    throw new Error(FRIENDLY_ERROR_MESSAGES.actionFailed);
  }

  return {
    id,
    code: resCode,
    title,
    percentage,
    percentageTenths,
    subtotalArs,
    discountArs,
    totalArs,
  };
}



