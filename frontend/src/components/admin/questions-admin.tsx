"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageSquare, Search, Trash2 } from "lucide-react";

import { ADMIN_SEARCH_DEBOUNCE_MS } from "@/lib/admin-search";
import { notify } from "@/lib/notifications";
import { buildProductPath } from "@/lib/product-path";
import {
  adminProductQuestionsActions,
  type AdminProductQuestion,
  type AdminProductQuestionsSort,
  type AdminProductQuestionStatus,
  useAdminProductQuestions,
} from "@/lib/store-admin-questions";
import { mapFriendlyError } from "@/lib/user-facing-errors";

import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { PaginationNav } from "@/components/shared/pagination-nav";
import toneStyles from "@/styles/status-tone-chip.module.css";
import {
  ADMIN_QUESTIONS_EMPTY_STATE_MESSAGES,
  resolveAdminEmptyStateMessage,
} from "./admin-empty-state-utils";
import styles from "./questions-admin.module.css";

const PAGE_LIMIT = 50;
const MINUTE_MS = 60 * 1000;

type StatusFilter = "all" | "pending" | "answered";
type ConfirmAction = ReturnType<typeof useConfirmModal>["confirm"];

function isSameDay(a: number, b: number) {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function isSameMinute(a: number, b: number) {
  return Math.abs(a - b) < MINUTE_MS;
}

function isYesterday(input: number, reference: number) {
  const yesterday = new Date(reference);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(input, yesterday.getTime());
}

function formatTimelineDate(input: number) {
  if (!Number.isFinite(input)) return "-";

  const now = Date.now();
  const timeLabel = new Intl.DateTimeFormat("es-AR", {
    timeStyle: "short",
  }).format(new Date(input));

  const dateLabel = isSameDay(input, now)
    ? "hoy"
    : isYesterday(input, now)
      ? "ayer"
    : new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(input));

  return `${dateLabel}, ${timeLabel}`;
}

function buildTimelineLabel(label: string, timestamp: number | null | undefined) {
  if (!timestamp || !Number.isFinite(timestamp)) return `${label}: -`;
  return `${label} ${formatTimelineDate(timestamp)}`;
}

function statusLabel(status: AdminProductQuestionStatus) {
  if (status === "answered") return "Respondida";
  return "Pendiente";
}

function statusToneClass(status: AdminProductQuestionStatus) {
  if (status === "answered") return toneStyles.statusToneSuccess;
  return toneStyles.statusToneWarning;
}

function QuestionRow({
  question,
  confirm,
}: {
  question: AdminProductQuestion;
  confirm: ConfirmAction;
}) {
  const [answer, setAnswer] = useState(question.answer);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastQuestionIdRef = useRef(question.id);

  const syncAnswerTextareaHeight = useCallback(
    (node?: HTMLTextAreaElement | null) => {
      const target = node ?? answerTextareaRef.current;
      if (!target) return;
      target.style.height = "0px";
      target.style.height = `${target.scrollHeight}px`;
    },
    []
  );

  const productLabel = question.productTitle || question.productId;
  const hasEmail = Boolean(question.customerEmail);
  const hasName = Boolean(question.customerName);
  const trimmedCurrentAnswer = question.answer.trim();
  const trimmedDraftAnswer = answer.trim();
  const answerChanged = trimmedCurrentAnswer !== trimmedDraftAnswer;
  const isAnswered = question.status === "answered";
  const showUpdated =
    Number.isFinite(question.updatedAt) &&
    !isSameMinute(question.updatedAt, question.createdAt) &&
    (!isAnswered ||
      !question.answeredAt ||
      !isSameMinute(question.updatedAt, question.answeredAt));
  const busy = savingAnswer || removing;
  const toneClass =
    question.status === "answered"
      ? styles.questionCardAnswered
      : styles.questionCardPending;
  const statusTone = statusToneClass(question.status);

  useEffect(() => {
    const questionChanged = lastQuestionIdRef.current !== question.id;
    lastQuestionIdRef.current = question.id;

    if (!questionChanged && question.status === "pending" && answerChanged) {
      return;
    }

    setAnswer(question.answer);
    setError(null);
  }, [answerChanged, question.answer, question.id, question.status, question.updatedAt]);

  useEffect(() => {
    if (question.status === "answered") return;
    syncAnswerTextareaHeight();
  }, [answer, question.status, syncAnswerTextareaHeight]);

  async function saveAnswer() {
    if (isAnswered) return;
    if (!answerChanged) return;
    if (!trimmedDraftAnswer) {
      setError("Escribe una respuesta antes de enviarla.");
      return;
    }

    try {
      setSavingAnswer(true);
      setError(null);
      await adminProductQuestionsActions.update(
        question.id,
        { answer },
        { successMessage: "Respuesta enviada" }
      );
    } catch (saveError) {
      const message = mapFriendlyError(
        saveError,
        "No se pudo guardar la pregunta."
      );
      setError(message);
    } finally {
      setSavingAnswer(false);
    }
  }

  async function removeQuestion() {
    const shouldDelete = await confirm({
      title: "Eliminar pregunta",
      description: "La pregunta se eliminara definitivamente del sistema.",
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      confirmVariant: "destructive",
    });
    if (!shouldDelete) return;

    try {
      setRemoving(true);
      setError(null);
      await adminProductQuestionsActions.remove(question.id, { toast: false });
      notify("Pregunta eliminada", undefined, "success");
    } catch (removeError) {
      const message = mapFriendlyError(
        removeError,
        "No se pudo eliminar la pregunta."
      );
      setError(message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card className={`adminPanelSurface ${styles.questionCard} ${toneClass}`}>
      <CardContent className={`adminPanelContentSurface ${styles.questionCardBody}`}>
        <div className={styles.questionTop}>
          <div className={styles.questionProduct}>
            <p className={styles.questionProductLabel}>Producto</p>
            <Link
              href={buildProductPath(
                question.productId,
                question.productTitle || question.productId
              )}
              className={styles.productLink}
              target="_blank"
              rel="noreferrer"
            >
              {productLabel}
            </Link>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={styles.deleteIconButton}
            onClick={() => void removeQuestion()}
            disabled={busy}
            aria-label="Eliminar pregunta"
            title="Eliminar pregunta"
          >
            <Trash2 size={16} />
          </Button>
        </div>

        <div className={styles.questionMeta}>
          <span className={`${styles.questionStatus} ${toneStyles.statusToneChip} ${statusTone}`}>
            <span className={styles.questionStatusDot} aria-hidden />
            {statusLabel(question.status)}
          </span>
        </div>

        {hasName || hasEmail ? (
          <p className={styles.customerMeta}>
            Cliente:{" "}
            <strong>
              {hasName ? question.customerName : "Sin nombre"}
              {hasEmail ? ` (${question.customerEmail})` : ""}
            </strong>
          </p>
        ) : null}

        <div className={styles.questionBlock}>
          <p className={styles.blockLabel}>Pregunta</p>
          <p className={styles.questionText}>{question.question}</p>
        </div>

        <div className={styles.answerBlock}>
          {isAnswered ? (
            <>
              <p className={styles.blockLabel}>Respuesta</p>
              <p className={styles.answerText}>{question.answer || "-"}</p>
            </>
          ) : (
            <>
              <label className={styles.blockLabel} htmlFor={`answer_${question.id}`}>
                Respuesta
              </label>
              <Textarea
                id={`answer_${question.id}`}
                ref={answerTextareaRef}
                className={styles.answerInput}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                onInput={(event) =>
                  syncAnswerTextareaHeight(event.currentTarget)
                }
                rows={4}
                placeholder="Escribe una respuesta para el cliente..."
                disabled={busy}
              />
            </>
          )}
        </div>

        {!isAnswered ? (
          <div className={styles.actionsRow}>
            <div className={styles.timestampsRow}>
              <span className={styles.timestampItem}>
                {buildTimelineLabel("Recibida", question.createdAt)}
              </span>
              {showUpdated ? (
                <span className={styles.timestampItem}>
                  {buildTimelineLabel("Actualizada", question.updatedAt)}
                </span>
              ) : null}
            </div>
            <Button
              className={styles.sendButton}
              onClick={() => void saveAnswer()}
              disabled={busy || !answerChanged || !trimmedDraftAnswer}
            >
              {savingAnswer ? "Enviando..." : "Enviar respuesta"}
            </Button>
          </div>
        ) : (
          <div className={styles.actionsRow}>
            <div className={styles.timestampsRow}>
              <span className={styles.timestampItem}>
                {buildTimelineLabel("Recibida", question.createdAt)}
              </span>
              <span className={styles.timestampItem}>
                {buildTimelineLabel(
                  "Respondida",
                  question.answeredAt ?? question.updatedAt
                )}
              </span>
              {showUpdated ? (
                <span className={styles.timestampItem}>
                  {buildTimelineLabel("Actualizada", question.updatedAt)}
                </span>
              ) : null}
            </div>
          </div>
        )}

        {error ? <p className={styles.errorText}>{error}</p> : null}
      </CardContent>
    </Card>
  );
}

export function QuestionsAdmin() {
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [productId, setProductId] = useState("");
  const [productIdQuery, setProductIdQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<AdminProductQuestionsSort>("created_desc");
  const [offset, setOffset] = useState(0);
  const { confirm, confirmModal } = useConfirmModal();

  useEffect(() => {
    if (search === searchQuery) return;

    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        setOffset(0);
        setSearchQuery(search);
      });
    }, ADMIN_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [search, searchQuery]);

  useEffect(() => {
    if (productId === productIdQuery) return;

    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        setOffset(0);
        setProductIdQuery(productId);
      });
    }, ADMIN_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [productId, productIdQuery]);

  const query = useMemo(
    () => ({
      q: searchQuery,
      productId: productIdQuery,
      status,
      sort: sortBy,
      limit: PAGE_LIMIT,
      offset,
    }),
    [offset, productIdQuery, searchQuery, sortBy, status]
  );
  const hasAppliedFilters =
    searchQuery.trim().length > 0 || productIdQuery.trim().length > 0 || status !== "all";
  const hasAnyFilters =
    search.trim().length > 0 ||
    searchQuery.trim().length > 0 ||
    productId.trim().length > 0 ||
    productIdQuery.trim().length > 0 ||
    status !== "all";
  const presenceQuery = useMemo(
    () => ({
      limit: 1,
      offset: 0,
      sort: "created_desc" as const,
      skip: !hasAppliedFilters,
    }),
    [hasAppliedFilters]
  );

  const { questions: visibleQuestions, count, loading, error } = useAdminProductQuestions(query);
  const {
    count: allQuestionsCount,
    loading: allQuestionsLoading,
    error: allQuestionsError,
  } = useAdminProductQuestions(presenceQuery);
  const hasAnyQuestions =
    !hasAppliedFilters || allQuestionsLoading || allQuestionsError ? null : allQuestionsCount > 0;
  const emptyQuestionsMessage = resolveAdminEmptyStateMessage({
    hasActiveFilters: hasAppliedFilters,
    hasAnyRecords: hasAnyQuestions,
    ...ADMIN_QUESTIONS_EMPTY_STATE_MESSAGES,
  });

  const lastPageOffset =
    count > 0 ? Math.max(0, Math.floor((count - 1) / PAGE_LIMIT) * PAGE_LIMIT) : 0;
  const clampedOffset = Math.min(offset, lastPageOffset);
  const isClampingPage = clampedOffset !== offset;
  const effectiveLoading = loading || isClampingPage;
  const from = count > 0 ? clampedOffset + 1 : 0;
  const to = count > 0 ? Math.min(clampedOffset + PAGE_LIMIT, count) : 0;
  const currentPage = Math.floor(clampedOffset / PAGE_LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_LIMIT));

  useEffect(() => {
    if (!isClampingPage) return;
    const animationFrameId = window.requestAnimationFrame(() => {
      setOffset(clampedOffset);
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [clampedOffset, isClampingPage]);

  function clearFilters() {
    setSearch("");
    setSearchQuery("");
    setProductId("");
    setProductIdQuery("");
    setStatus("all");
    setOffset(0);
  }

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <AdminPanelCard
          title="Filtros"
          className={styles.filtersCard}
          headerClassName={styles.panelHeader}
          bodyClassName={styles.panelBody}
          headerRight={
            hasAnyFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={styles.clearButton}
                onClick={clearFilters}
              >
                Limpiar
              </Button>
            ) : null
          }
        >
          <div className={styles.field}>
            <Label htmlFor="questions_product_id">Producto ID</Label>
            <Input
              id="questions_product_id"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              placeholder="ID exacto del producto"
            />
          </div>

          <Separator className={styles.filterSeparator} />

          <div className={styles.field}>
            <Label htmlFor="questions_status">Estado</Label>
            <Select
              id="questions_status"
              value={status}
              onChange={(event) => {
                setOffset(0);
                setStatus(event.target.value as StatusFilter);
              }}
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="answered">Respondidas</option>
            </Select>
          </div>
        </AdminPanelCard>

        <div className={styles.results}>
          <div className={styles.controls}>
            <div className={styles.searchWrap}>
              <Search size={16} className={styles.searchIcon} />
              <Input
                id="questions_search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar pregunta"
                className={styles.searchField}
              />
            </div>

            <div className={styles.sortWrap}>
              <Select
                id="questions_sort"
                value={sortBy}
                onChange={(event) => {
                  setOffset(0);
                  setSortBy(event.target.value as AdminProductQuestionsSort);
                }}
              >
                <option value="created_desc">Ordenar: más recientes</option>
                <option value="created_asc">Ordenar: más antiguas</option>
                <option value="updated_desc">Ordenar: actualizadas recientemente</option>
                <option value="updated_asc">Ordenar: actualizadas hace más tiempo</option>
              </Select>
            </div>
          </div>

          <AdminPanelCard
            title={
              <span className={styles.titleRow}>
                <MessageSquare size={18} />
                Preguntas
              </span>
            }
            subtitle={
              effectiveLoading
                ? "Cargando preguntas..."
                : count > 0
                  ? `Mostrando ${from}-${to} de ${count} pregunta${count === 1 ? "" : "s"}.`
                  : emptyQuestionsMessage
            }
            className={styles.resultsCard}
            headerClassName={styles.panelHeader}
            bodyClassName={styles.resultsBody}
          >
            {error ? <div className={styles.emptyState}>{error}</div> : null}

            {!error && effectiveLoading ? (
              <div className={styles.emptyState}>Cargando preguntas...</div>
            ) : null}

            {!error && !effectiveLoading && visibleQuestions.length === 0 ? (
              <div className={styles.emptyState}>{emptyQuestionsMessage}</div>
            ) : null}

            {!error && !effectiveLoading && visibleQuestions.length > 0 ? (
              <div className={styles.list}>
                {visibleQuestions.map((question) => (
                  <QuestionRow key={question.id} question={question} confirm={confirm} />
                ))}
              </div>
            ) : null}
          </AdminPanelCard>

          {!error && count > 0 ? (
            <div className={styles.paginationFooter}>
              <PaginationNav
                page={currentPage}
                totalPages={totalPages}
                disabled={effectiveLoading}
                onPageChange={(nextPage) => setOffset((nextPage - 1) * PAGE_LIMIT)}
                ariaLabel="Paginación de preguntas"
              />
            </div>
          ) : null}
        </div>
      </div>

      {confirmModal}
    </div>
  );
}
