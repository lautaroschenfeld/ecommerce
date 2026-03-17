import { ApiHttpError } from "@/lib/store-client";
import { mapFriendlyError } from "@/lib/user-facing-errors";

import type { ProductCondition } from "@/lib/product";

export type StockCopy = { kind: "last" | "tier"; text: string };

type PendingProductQuestion = {
  productId: string;
  question: string;
  createdAt: number;
};

const PENDING_PRODUCT_QUESTION_KEY = "store:product:question:pending:v1";
const PENDING_PRODUCT_QUESTION_MAX_AGE_MS = 30 * 60 * 1000;

export const CONDITION_ORDER: Record<ProductCondition, number> = {
  nuevo: 0,
  reacondicionado: 1,
  usado: 2,
};

export const RELATED_TARGET_COUNT = 8;

export function getStockCopy(stockAvailable: number): StockCopy {
  const qty = Math.max(0, Math.trunc(stockAvailable));

  // Similar to MercadoLibre's "tiers", but without exposing the exact quantity.
  if (qty === 1) return { kind: "last", text: "¡Queda la última unidad!" };
  if (qty <= 4) return { kind: "tier", text: "2 disponibles" };
  if (qty <= 9) return { kind: "tier", text: "5 disponibles" };
  if (qty === 10) return { kind: "tier", text: "10 disponibles" };
  if (qty <= 49) return { kind: "tier", text: "+10 disponibles" };
  if (qty === 50) return { kind: "tier", text: "50 disponibles" };
  if (qty <= 99) return { kind: "tier", text: "+50 disponibles" };
  if (qty === 100) return { kind: "tier", text: "100 disponibles" };
  return { kind: "tier", text: "+100 disponibles" };
}

export function hasPersistedCharacteristics(
  metadata: Record<string, unknown> | undefined
) {
  const raw = metadata?.characteristics;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return false;
  return items.some((item) => item && typeof item === "object");
}

export function mapQuestionFormError(error: unknown, fallback: string) {
  if (error instanceof ApiHttpError) {
    if (error.status === 401 || error.status === 403) {
      return "Inicia sesión para enviar tu pregunta.";
    }
    if (error.status >= 500) return fallback;
  }

  const mapped = mapFriendlyError(error, fallback, "login");
  if (mapped === "Inicia sesión para continuar.") {
    return "Inicia sesión para enviar tu pregunta.";
  }
  return mapped;
}

export function formatQuestionShortDate(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function readPendingProductQuestion() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(PENDING_PRODUCT_QUESTION_KEY);
    if (!raw) return null;
    const rec =
      raw && typeof raw === "string"
        ? (JSON.parse(raw) as Record<string, unknown>)
        : null;
    if (!rec) return null;

    const productId =
      typeof rec.productId === "string" ? rec.productId.trim() : "";
    const question = typeof rec.question === "string" ? rec.question.trim() : "";
    const createdAt =
      typeof rec.createdAt === "number" ? rec.createdAt : Number(rec.createdAt);
    if (!productId || !question || !Number.isFinite(createdAt)) {
      window.sessionStorage.removeItem(PENDING_PRODUCT_QUESTION_KEY);
      return null;
    }

    if (Date.now() - createdAt > PENDING_PRODUCT_QUESTION_MAX_AGE_MS) {
      window.sessionStorage.removeItem(PENDING_PRODUCT_QUESTION_KEY);
      return null;
    }

    return {
      productId,
      question,
      createdAt,
    } as PendingProductQuestion;
  } catch {
    return null;
  }
}

export function writePendingProductQuestion(pending: {
  productId: string;
  question: string;
  createdAt: number;
}) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PENDING_PRODUCT_QUESTION_KEY,
      JSON.stringify(pending)
    );
  } catch {
    // Ignore session storage failures; redirect still works.
  }
}

export function clearPendingProductQuestion() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_PRODUCT_QUESTION_KEY);
  } catch {
    // Ignore session storage failures.
  }
}

export function uniqStrings(values: string[]) {
  return Array.from(new Set(values));
}
