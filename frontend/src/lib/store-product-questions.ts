"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiHttpError, fetchJson, fetchJsonWithAuthRetry } from "@/lib/store-client";
import { createLatestRequestController } from "@/lib/latest-request";
import { mapFriendlyError } from "@/lib/user-facing-errors";

const STORE_PRODUCT_QUESTIONS_TIMEOUT_MS = 4000;
const STORE_PRODUCT_QUESTION_MAX_CHARS = 120;

export type StoreProductQuestionStatus = "pending" | "answered";

export type StoreProductQuestion = {
  id: string;
  question: string;
  answer: string;
  status: StoreProductQuestionStatus;
  createdAt: number;
  answeredAt: number | null;
};

type StoreProductQuestionsQuery = {
  productId: string;
  limit?: number;
  offset?: number;
  skip?: boolean;
};

type StoreProductQuestionsApiResponse = {
  questions?: unknown[];
  count?: unknown;
  limit?: unknown;
  offset?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toCount(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function toTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeQuestionStatus(value: unknown): StoreProductQuestionStatus {
  const normalized = toStringValue(value).trim().toLowerCase();
  if (normalized === "answered") return "answered";
  return "pending";
}

function mapStoreProductQuestion(raw: unknown): StoreProductQuestion | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const id = toStringValue(rec.id).trim();
  const question = toStringValue(rec.question).trim();
  const answer = toStringValue(rec.answer).trim();
  const status = normalizeQuestionStatus(rec.status);
  const createdAt =
    toTimestamp(rec.created_at ?? rec.createdAt) ?? Date.now();
  const answeredAt = toTimestamp(rec.answered_at ?? rec.answeredAt) ?? null;

  if (!id || !question) return null;

  return {
    id,
    question,
    answer,
    status,
    createdAt,
    answeredAt,
  };
}

function mapStoreQuestionsError(
  error: unknown,
  fallback = "No pudimos cargar las preguntas por ahora."
) {
  if (error instanceof ApiHttpError) {
    if (error.status === 401 || error.status === 403) {
      return "Inicia sesión para enviar preguntas.";
    }
    if (error.status === 304) return fallback;
  }

  return mapFriendlyError(error, fallback, "login");
}

async function fetchStoreProductQuestionsOnce(query: {
  productId: string;
  limit: number;
  offset: number;
}, options?: { signal?: AbortSignal }) {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));
  const queryString = params.toString();

  const data = await fetchJson<StoreProductQuestionsApiResponse>(
    `/store/catalog/products/${encodeURIComponent(query.productId)}/questions${
      queryString ? `?${queryString}` : ""
    }`,
    {
      method: "GET",
      signal: options?.signal,
      timeoutMs: STORE_PRODUCT_QUESTIONS_TIMEOUT_MS,
    }
  );

  const questions = (data.questions ?? [])
    .map(mapStoreProductQuestion)
    .filter(Boolean) as StoreProductQuestion[];

  const count = toCount(data.count, questions.length);
  const limit = toCount(data.limit, query.limit) || query.limit;
  const offset = toCount(data.offset, query.offset);

  return { questions, count, limit, offset };
}

export async function createStoreProductQuestion(
  productIdRaw: string,
  input: {
    question: string;
    customerName?: string;
    customerEmail?: string;
  }
) {
  const productId = productIdRaw.trim();
  if (!productId) throw new Error("Producto inválido.");

  const question = input.question.trim().slice(0, STORE_PRODUCT_QUESTION_MAX_CHARS);
  if (!question) throw new Error("Escribe tu pregunta.");

  await fetchJsonWithAuthRetry(
    `/store/catalog/products/${encodeURIComponent(productId)}/questions`,
    {
      method: "POST",
      credentials: "include",
      timeoutMs: STORE_PRODUCT_QUESTIONS_TIMEOUT_MS,
      body: JSON.stringify({
        question,
        customerName: input.customerName?.trim() || undefined,
        customerEmail: input.customerEmail?.trim() || undefined,
      }),
    }
  );
}

export function useStoreProductQuestions(query: StoreProductQuestionsQuery) {
  const normalized = useMemo(() => {
    const productId = query.productId.trim();
    const limit =
      typeof query.limit === "number" && Number.isFinite(query.limit)
        ? Math.max(1, Math.min(100, Math.trunc(query.limit)))
        : 3;
    const offset =
      typeof query.offset === "number" && Number.isFinite(query.offset)
        ? Math.max(0, Math.trunc(query.offset))
        : 0;

    return {
      productId,
      limit,
      offset,
      skip: query.skip === true || !productId,
    };
  }, [query.limit, query.offset, query.productId, query.skip]);

  const [questions, setQuestions] = useState<StoreProductQuestion[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(!normalized.skip);
  const [error, setError] = useState<string | null>(null);
  const latestRequestRef = useRef(createLatestRequestController());

  const refetch = useCallback(async () => {
    if (normalized.skip) {
      latestRequestRef.current.invalidate();
      setQuestions([]);
      setCount(0);
      setLoading(false);
      setError(null);
      return;
    }

    const request = latestRequestRef.current.start();
    setLoading(true);
    setError(null);

    try {
      const next = await fetchStoreProductQuestionsOnce(normalized, {
        signal: request.controller.signal,
      });
      if (latestRequestRef.current.shouldIgnore(request)) return;
      setQuestions(next.questions);
      setCount(next.count);
    } catch (fetchError) {
      if (latestRequestRef.current.shouldIgnore(request)) return;
      setQuestions([]);
      setCount(0);
      setError(mapStoreQuestionsError(fetchError));
    } finally {
      const isLatest = latestRequestRef.current.isLatest(request);
      latestRequestRef.current.release(request);
      if (isLatest) {
        setLoading(false);
      }
    }
  }, [normalized]);

  useEffect(() => {
    const latestRequest = latestRequestRef.current;
    void refetch();
    return () => {
      latestRequest.abort();
    };
  }, [refetch]);

  return {
    questions,
    count,
    limit: normalized.limit,
    offset: normalized.offset,
    loading,
    error,
    refetch,
  };
}

