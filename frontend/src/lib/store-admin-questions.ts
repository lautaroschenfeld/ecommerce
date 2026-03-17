"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ADMIN_QUESTIONS_AUTO_REFRESH_MS,
  ADMIN_QUESTIONS_FETCH_TIMEOUT_MS,
  shouldRefreshAdminQuestionsInBackground,
  type AdminQuestionsBackgroundRefreshTrigger,
} from "@/lib/admin-questions-refresh";
import { notify } from "@/lib/notifications";
import { fetchJsonWithAuthRetry as fetchJson } from "@/lib/store-client";
import { mapFriendlyError } from "@/lib/user-facing-errors";

const ADMIN_INVALIDATE_EVENT = "store:invalidate:admin-product-questions";
const ADMIN_PRODUCT_QUESTION_ANSWER_MAX_CHARS = 500;

export type AdminProductQuestionStatus = "pending" | "answered";
export type AdminProductQuestionsSort =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "updated_asc";

export type AdminProductQuestion = {
  id: string;
  productId: string;
  productTitle: string;
  productHandle: string;
  question: string;
  answer: string;
  status: AdminProductQuestionStatus;
  customerName: string;
  customerEmail: string;
  answeredByAccountId: string;
  createdAt: number;
  updatedAt: number;
  answeredAt: number | null;
};

export type AdminProductQuestionsQuery = {
  q?: string;
  status?: AdminProductQuestionStatus | "all";
  productId?: string;
  sort?: AdminProductQuestionsSort;
  limit?: number;
  offset?: number;
  skip?: boolean;
};

type AdminProductQuestionsResponse = {
  questions?: unknown[];
  count?: unknown;
  limit?: unknown;
  offset?: unknown;
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

function normalizeStatus(value: unknown): AdminProductQuestionStatus {
  const normalized = toStringValue(value).trim().toLowerCase();
  if (normalized === "answered") return "answered";
  return "pending";
}

function mapAdminProductQuestion(raw: unknown): AdminProductQuestion | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const id = toStringValue(rec.id).trim();
  const productId = toStringValue(rec.product_id ?? rec.productId).trim();
  const question = toStringValue(rec.question).trim();
  const createdAt =
    toTimestamp(rec.created_at ?? rec.createdAt) ?? Date.now();
  const updatedAt =
    toTimestamp(rec.updated_at ?? rec.updatedAt) ?? createdAt;
  const answeredAt = toTimestamp(rec.answered_at ?? rec.answeredAt) ?? null;

  if (!id || !productId || !question) return null;

  return {
    id,
    productId,
    productTitle: toStringValue(rec.product_title ?? rec.productTitle).trim(),
    productHandle: toStringValue(rec.product_handle ?? rec.productHandle).trim(),
    question,
    answer: toStringValue(rec.answer).trim(),
    status: normalizeStatus(rec.status),
    customerName: toStringValue(rec.customer_name ?? rec.customerName).trim(),
    customerEmail: toStringValue(rec.customer_email ?? rec.customerEmail).trim(),
    answeredByAccountId: toStringValue(
      rec.answered_by_account_id ?? rec.answeredByAccountId
    ).trim(),
    createdAt,
    updatedAt,
    answeredAt,
  };
}

function mapAdminError(error: unknown, fallback: string) {
  return mapFriendlyError(error, fallback);
}

function normalizeQuery(query: AdminProductQuestionsQuery = {}) {
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const status =
    query.status === "all" ||
    query.status === "pending" ||
    query.status === "answered"
      ? query.status
      : "all";
  const productId =
    typeof query.productId === "string" ? query.productId.trim() : "";
  const sort =
    query.sort === "created_asc" ||
    query.sort === "updated_desc" ||
    query.sort === "updated_asc" ||
    query.sort === "created_desc"
      ? query.sort
      : "created_desc";
  const limit =
    typeof query.limit === "number" && Number.isFinite(query.limit)
      ? Math.max(1, Math.min(200, Math.trunc(query.limit)))
      : 50;
  const offset =
    typeof query.offset === "number" && Number.isFinite(query.offset)
      ? Math.max(0, Math.trunc(query.offset))
      : 0;

  return {
    q,
    status,
    productId,
    sort,
    limit,
    offset,
    skip: query.skip === true,
  };
}

function buildQueryString(query: ReturnType<typeof normalizeQuery>) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.productId) params.set("product_id", query.productId);
  if (query.sort) params.set("sort", query.sort);
  params.set("limit", String(query.limit));
  params.set("offset", String(query.offset));

  const raw = params.toString();
  return raw ? `?${raw}` : "";
}

type NormalizedAdminProductQuestionsQuery = ReturnType<typeof normalizeQuery>;
type AdminProductQuestionsFetchOptions = {
  signal?: AbortSignal;
};

async function fetchAdminProductQuestionsPage(
  normalized: NormalizedAdminProductQuestionsQuery,
  options?: AdminProductQuestionsFetchOptions
) {
  const qs = buildQueryString(normalized);

  const data = await fetchJson<AdminProductQuestionsResponse>(
    `/store/catalog/account/admin/questions${qs}`,
    {
      method: "GET",
      headers: adminHeaders(),
      credentials: "include",
      signal: options?.signal,
      timeoutMs: ADMIN_QUESTIONS_FETCH_TIMEOUT_MS,
    }
  );

  const questions = (data.questions ?? [])
    .map(mapAdminProductQuestion)
    .filter(Boolean) as AdminProductQuestion[];

  return {
    questions,
    count: toCount(data.count, questions.length),
    limit: toCount(data.limit, normalized.limit) || normalized.limit,
    offset: toCount(data.offset, normalized.offset),
  };
}

async function listAdminProductQuestions(
  query: AdminProductQuestionsQuery = {},
  options?: AdminProductQuestionsFetchOptions
) {
  const normalized = normalizeQuery(query);
  return await fetchAdminProductQuestionsPage(normalized, options);
}

async function patchAdminProductQuestion(
  id: string,
  payload: Record<string, unknown>
) {
  return await fetchJson<{ question?: unknown }>(
    `/store/catalog/account/admin/questions/${encodeURIComponent(id)}`,
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

async function deleteAdminProductQuestion(id: string) {
  await fetchJson(
    `/store/catalog/account/admin/questions/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: adminHeaders(),
      credentials: "include",
    }
  );
}

export function invalidateAdminProductQuestions() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ADMIN_INVALIDATE_EVENT));
}

export const adminProductQuestionsActions = {
  async update(
    id: string,
    input: {
      answer?: string;
      status?: AdminProductQuestionStatus;
    },
    options?: { toast?: boolean; invalidate?: boolean; successMessage?: string }
  ) {
    const shouldToast = options?.toast ?? true;
    const shouldInvalidate = options?.invalidate ?? true;
    const successMessage = options?.successMessage?.trim() || "Respuesta enviada";
    const payload: Record<string, unknown> = {};

    if (input.answer !== undefined) {
      payload.answer = input.answer
        .trim()
        .slice(0, ADMIN_PRODUCT_QUESTION_ANSWER_MAX_CHARS);
    }
    if (input.status !== undefined) payload.status = input.status;

    try {
      await patchAdminProductQuestion(id, payload);
      if (shouldToast) {
        notify(successMessage, undefined, "success");
      }
    } catch (error) {
      const message = mapAdminError(error, "No se pudo actualizar la pregunta.");
      if (shouldToast) {
        notify("Error al actualizar pregunta", message, "error");
      }
      throw new Error(message);
    }

    if (shouldInvalidate) {
      invalidateAdminProductQuestions();
    }
  },

  async remove(
    id: string,
    options?: { toast?: boolean; invalidate?: boolean; successMessage?: string }
  ) {
    const shouldToast = options?.toast ?? true;
    const shouldInvalidate = options?.invalidate ?? true;
    const successMessage = options?.successMessage?.trim() || "Pregunta eliminada";

    try {
      await deleteAdminProductQuestion(id);
      if (shouldToast) {
        notify(successMessage, undefined, "success");
      }
    } catch (error) {
      const message = mapAdminError(error, "No se pudo eliminar la pregunta.");
      if (shouldToast) {
        notify("Error al eliminar pregunta", message, "error");
      }
      throw new Error(message);
    }

    if (shouldInvalidate) {
      invalidateAdminProductQuestions();
    }
  },
};

export function useAdminProductQuestions(query: AdminProductQuestionsQuery = {}) {
  const {
    limit: queryLimit,
    offset: queryOffset,
    productId: queryProductId,
    sort: querySort,
    q: queryText,
    skip: querySkip,
    status: queryStatus,
  } = query;
  const normalized = useMemo(
    () =>
      normalizeQuery({
        limit: queryLimit,
        offset: queryOffset,
        productId: queryProductId,
        sort: querySort,
        q: queryText,
        skip: querySkip,
        status: queryStatus,
      }),
    [
      queryLimit,
      queryOffset,
      queryProductId,
      querySkip,
      querySort,
      queryStatus,
      queryText,
    ]
  );
  const [questions, setQuestions] = useState<AdminProductQuestion[]>([]);
  const [count, setCount] = useState(0);
  const [limit, setLimit] = useState(normalized.limit);
  const [offset, setOffset] = useState(normalized.offset);
  const [loading, setLoading] = useState(!normalized.skip);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const lastStartedAtRef = useRef<number | null>(null);
  const lastSettledAtRef = useRef<number | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const fetchLatest = useCallback(
    async (options?: {
      silent?: boolean;
      force?: boolean;
      trigger?: AdminQuestionsBackgroundRefreshTrigger | "manual" | "invalidate";
    }) => {
      const silent = options?.silent === true;
      const force = options?.force === true;
      const trigger = options?.trigger ?? "manual";

      if (normalized.skip) {
        abortRef.current?.abort();
        abortRef.current = null;
        requestIdRef.current += 1;
        lastStartedAtRef.current = null;
        lastSettledAtRef.current = null;
        hasLoadedOnceRef.current = false;
        setQuestions([]);
        setCount(0);
        setLimit(normalized.limit);
        setOffset(normalized.offset);
        setLoading(false);
        setError(null);
        return false;
      }

      if (
        (trigger === "poll" || trigger === "focus" || trigger === "visibility") &&
        !force &&
        !shouldRefreshAdminQuestionsInBackground({
          trigger,
          visibilityState: document.visibilityState,
          now: Date.now(),
          inFlight: abortRef.current !== null,
          lastStartedAt: lastStartedAtRef.current,
          lastSettledAt: lastSettledAtRef.current,
        })
      ) {
        return false;
      }

      if (abortRef.current) {
        if (!force) return false;
        abortRef.current.abort();
      }

      const controller = new AbortController();
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      abortRef.current = controller;
      lastStartedAtRef.current = Date.now();

      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const data = await listAdminProductQuestions(normalized, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return false;
        }

        hasLoadedOnceRef.current = true;
        lastSettledAtRef.current = Date.now();
        setQuestions(data.questions);
        setCount(data.count);
        setLimit(data.limit);
        setOffset(data.offset);
        setError(null);
        return true;
      } catch (fetchError) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return false;
        }

        lastSettledAtRef.current = Date.now();
        const message = mapAdminError(
          fetchError,
          "No se pudo cargar la lista de preguntas."
        );

        if (!silent || !hasLoadedOnceRef.current) {
          hasLoadedOnceRef.current = false;
          setQuestions([]);
          setCount(0);
          setLimit(normalized.limit);
          setOffset(normalized.offset);
          setError(message);
        } else {
          console.error("[admin.questions] Silent refresh failed", {
            error: fetchError,
            query: normalized,
          });
        }
        return false;
      } finally {
        if (requestId === requestIdRef.current && abortRef.current === controller) {
          abortRef.current = null;
        }
        if (!silent && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [normalized]
  );

  const refetch = useCallback(async () => {
    await fetchLatest({ force: true, trigger: "manual" });
  }, [fetchLatest]);

  useEffect(() => {
    void refetch();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [refetch]);

  useEffect(() => {
    const onInvalidate = () =>
      void fetchLatest({
        force: true,
        silent: hasLoadedOnceRef.current,
        trigger: "invalidate",
      });
    window.addEventListener(ADMIN_INVALIDATE_EVENT, onInvalidate);
    return () =>
      window.removeEventListener(ADMIN_INVALIDATE_EVENT, onInvalidate);
  }, [fetchLatest]);

  useEffect(() => {
    if (normalized.skip) return;

    const intervalId = window.setInterval(() => {
      void fetchLatest({ silent: true, trigger: "poll" });
    }, ADMIN_QUESTIONS_AUTO_REFRESH_MS);

    const onFocus = () => {
      void fetchLatest({ silent: true, trigger: "focus" });
    };

    const onVisibilityChange = () => {
      void fetchLatest({ silent: true, trigger: "visibility" });
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchLatest, normalized.skip]);

  return {
    questions,
    count,
    limit,
    offset,
    loading,
    error,
    refetch,
  };
}
