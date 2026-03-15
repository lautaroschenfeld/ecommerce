import { toStoreMediaProxyUrl } from "@/lib/store-media-url";
import {
  EXPRESS_DISCOUNTED_SHIPPING_AMOUNT,
  EXPRESS_SHIPPING_AMOUNT,
  STANDARD_SHIPPING_AMOUNT,
} from "@/lib/store-shipping";

import type { CartItem } from "@/lib/store-cart";

export const CHECKOUT_DRAFT_KEY = "store:checkout:draft:v1";
export const BUY_NOW_INTENT_KEY = "store:checkout:buy-now:v1";
const CHECKOUT_DRAFT_OWNER_KEY = "_ownerKey";

export type DeliveryMethod = "standard" | "express" | "pickup";
export type PaymentMethod = "card" | "mercadopago" | "transfer";
export type InvoiceType = "consumidor_final" | "factura_a";
export type CheckoutStepKey = "datos" | "entrega" | "envio" | "pago";

export type CheckoutDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;

  dni: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  postalCode: string;
  notes: string;

  deliveryMethod: DeliveryMethod;

  paymentMethod: PaymentMethod;
  billingSameAsShipping: boolean;
  billingAddress1: string;
  billingCity: string;
  billingProvince: string;
  billingPostalCode: string;

  invoiceType: InvoiceType;
  cuit: string;
  razonSocial: string;

  subscribe: boolean;
  acceptTerms: boolean;
};

export const DEFAULT_DRAFT: CheckoutDraft = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",

  dni: "",
  address1: "",
  address2: "",
  city: "",
  province: "CABA",
  postalCode: "",
  notes: "",

  deliveryMethod: "standard",

  paymentMethod: "card",
  billingSameAsShipping: true,
  billingAddress1: "",
  billingCity: "",
  billingProvince: "CABA",
  billingPostalCode: "",

  invoiceType: "consumidor_final",
  cuit: "",
  razonSocial: "",

  subscribe: true,
  acceptTerms: false,
};

export const AR_PROVINCES = [
  "CABA",
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
] as const;

export const STEPS: Array<{ key: CheckoutStepKey; label: string; hint: string }> = [
  { key: "datos", label: "Datos", hint: "Contacto" },
  { key: "entrega", label: "Entrega", hint: "Dirección" },
  { key: "envio", label: "Envío", hint: "Método" },
  { key: "pago", label: "Pago", hint: "Finalizar" },
];

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function formatCardNumber(value: string) {
  const digits = digitsOnly(value).slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

export function formatExpiry(value: string) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function formatCvc(value: string) {
  return digitsOnly(value).slice(0, 4);
}

export function validateEmail(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function getPasswordStrengthError(valueRaw: string) {
  const value = String(valueRaw || "");
  if (value.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }

  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);
  if (!hasLower || !hasUpper || !hasDigit) {
    return "La contraseña debe incluir mayúscula, minúscula y un número.";
  }

  return null;
}

export function normalizeEmailInput(value: string) {
  return value.toLowerCase();
}

export function computeShippingArs(
  subtotalArs: number,
  method: DeliveryMethod,
  freeShippingThresholdArs: number
) {
  if (method === "pickup") return 0;

  const standard =
    subtotalArs >= freeShippingThresholdArs ? 0 : STANDARD_SHIPPING_AMOUNT;
  if (method === "standard") return standard;

  return subtotalArs >= freeShippingThresholdArs
    ? EXPRESS_DISCOUNTED_SHIPPING_AMOUNT
    : EXPRESS_SHIPPING_AMOUNT;
}

export function clampQty(value: number, min = 1, max = 99) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function sanitizeIntentItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];

  const out: CartItem[] = [];
  for (const raw of value) {
    const rec =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!rec) continue;

    const id = typeof rec.id === "string" ? rec.id : "";
    const name = typeof rec.name === "string" ? rec.name : "";
    const brand = typeof rec.brand === "string" ? rec.brand : "";
    const category = rec.category as CartItem["category"];
    const priceArs =
      typeof rec.priceArs === "number" ? rec.priceArs : Number(rec.priceArs);
    const qtyRaw = typeof rec.qty === "number" ? rec.qty : Number(rec.qty);
    const imageUrl =
      toStoreMediaProxyUrl(
        typeof rec.imageUrl === "string" ? rec.imageUrl : undefined
      ) || undefined;

    if (!id || !name || !brand) continue;
    if (!Number.isFinite(priceArs) || priceArs <= 0) continue;
    if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) continue;

    out.push({
      id,
      name,
      brand,
      category,
      priceArs,
      imageUrl,
      qty: clampQty(qtyRaw),
    });
  }

  return out;
}

export function safeReadDraft(): {
  draft: Partial<CheckoutDraft>;
  ownerKey: string | null;
} {
  if (typeof window === "undefined") {
    return { draft: {}, ownerKey: null };
  }
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
    if (!raw) return { draft: {}, ownerKey: null };
    const data: unknown = JSON.parse(raw);
    const rec =
      data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    if (!rec) return { draft: {}, ownerKey: null };

    const pickString = (key: keyof CheckoutDraft) =>
      typeof rec[key] === "string" ? (rec[key] as string) : undefined;
    const pickBool = (key: keyof CheckoutDraft) =>
      typeof rec[key] === "boolean" ? (rec[key] as boolean) : undefined;

    const province = pickString("province");
    const billingProvince = pickString("billingProvince");

    const deliveryMethod = pickString("deliveryMethod");
    const paymentMethod = pickString("paymentMethod");
    const invoiceType = pickString("invoiceType");

    const isProvince = (value: string | undefined) =>
      value && (AR_PROVINCES as readonly string[]).includes(value);

    return {
      ownerKey:
        typeof rec[CHECKOUT_DRAFT_OWNER_KEY] === "string"
          ? (rec[CHECKOUT_DRAFT_OWNER_KEY] as string)
          : null,
      draft: {
        firstName: pickString("firstName"),
        lastName: pickString("lastName"),
        email: pickString("email"),
        phone: pickString("phone"),

        dni: pickString("dni"),
        address1: pickString("address1"),
        address2: pickString("address2"),
        city: pickString("city"),
        province: isProvince(province) ? province : undefined,
        postalCode: pickString("postalCode"),
        notes: pickString("notes"),

        deliveryMethod:
          deliveryMethod === "standard" ||
          deliveryMethod === "express" ||
          deliveryMethod === "pickup"
            ? deliveryMethod
            : undefined,

        paymentMethod:
          paymentMethod === "card" ||
          paymentMethod === "mercadopago" ||
          paymentMethod === "transfer"
            ? paymentMethod
            : undefined,

        billingSameAsShipping: pickBool("billingSameAsShipping"),
        billingAddress1: pickString("billingAddress1"),
        billingCity: pickString("billingCity"),
        billingProvince: isProvince(billingProvince) ? billingProvince : undefined,
        billingPostalCode: pickString("billingPostalCode"),

        invoiceType:
          invoiceType === "consumidor_final" || invoiceType === "factura_a"
            ? invoiceType
            : undefined,
        cuit: pickString("cuit"),
        razonSocial: pickString("razonSocial"),

        subscribe: pickBool("subscribe"),
        acceptTerms: pickBool("acceptTerms"),
      },
    };
  } catch {
    return { draft: {}, ownerKey: null };
  }
}

export function safeWriteDraft(draft: CheckoutDraft, ownerKey: string | null) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    CHECKOUT_DRAFT_KEY,
    JSON.stringify({
      ...draft,
      [CHECKOUT_DRAFT_OWNER_KEY]: ownerKey,
    })
  );
}
