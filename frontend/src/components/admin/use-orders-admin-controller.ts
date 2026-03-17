"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useReducedMotion } from "framer-motion";

import { ADMIN_SEARCH_DEBOUNCE_MS } from "@/lib/admin-search";
import { downloadOrderInvoicePdf } from "@/lib/store-order-invoice";
import { mapFriendlyError } from "@/lib/user-facing-errors";
import {
  fulfillmentStatusUi,
  fulfillmentToneClassKey,
} from "@/lib/fulfillment-status-ui";
import {
  getAdminOrder,
  getAdminOrdersPage,
  invalidateAdminOrders,
  patchAdminOrder,
  subscribeAdminOrdersInvalidation,
  type AdminOrder,
  type AdminOrderDetail,
  type AdminOrdersQuery,
} from "@/lib/store-admin-orders";

import { useAdminToasts } from "@/components/shared/admin-toasts";
import { useConfirmModal } from "@/components/ui/confirm-modal";
import { type SelectOptionAppearance } from "@/components/ui/select";
import {
  DEFAULT_SORT,
  PAGE_LIMIT,
  STATUS_FILTER_VALUES,
  buildTimelinePreview,
  endOfLocalDay,
  isBankTransfer,
  normalizeFulfillmentStatus,
  normalizePaymentFilter,
  normalizePaymentStatus,
  parseLocalDateInput,
  readString,
  asRecord,
  type PaymentFilter,
  type SortBy,
} from "./orders-admin-utils";

import toneStyles from "@/styles/status-tone-chip.module.css";

function fulfillmentBadge(status: unknown) {
  const ui = fulfillmentStatusUi(status);
  return {
    label: ui.label,
    variant: ui.badgeVariant,
    Icon: ui.icon,
    toneClassName: toneStyles[fulfillmentToneClassKey(ui.tone)],
  };
}

function normalizeAdminNotesInput(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readAdminNotesDraftValue(order: Pick<AdminOrder, "metadata"> | null | undefined) {
  const meta = asRecord(order?.metadata);
  return readString(meta, "admin_notes") || readString(meta, "adminNotes");
}

function adminOrderUpdatedAt(value: unknown) {
  const timestamp =
    typeof value === "string" || value instanceof Date ? Date.parse(String(value)) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

type PrimaryActionPlan = {
  label: string;
  title: string;
  description: string;
  patch: Record<string, unknown>;
};

function buildPrimaryActionPlan(
  order: AdminOrder | null | undefined,
  trackingDraft: string
): PrimaryActionPlan | null {
  if (!order) return null;

  const payment = normalizePaymentStatus(order.payment_status);
  const status = normalizeFulfillmentStatus(order.status).toLowerCase();
  const orderLabel = order.order_number || order.id;

  if (status === "cancelled" || status === "delivered") return null;

  if (payment !== "paid") {
    if (!isBankTransfer(order.payment_method)) return null;

    return {
      label: "Confirmar pago",
      title: "Confirmar pago de la orden",
      description:
        status === "processing"
          ? `La orden ${orderLabel} se marcara como pagada y avanzara a En preparacion.`
          : `La orden ${orderLabel} se marcara como pagada.`,
      patch:
        status === "processing"
          ? { payment_status: "paid", status: "preparing" }
          : { payment_status: "paid" },
    };
  }

  if (status === "processing") {
    return {
      label: "Marcar en preparacion",
      title: "Mover orden a preparacion",
      description: `La orden ${orderLabel} pasara a En preparacion.`,
      patch: { status: "preparing" },
    };
  }

  if (status === "preparing") {
    return {
      label: "Marcar lista para despacho",
      title: "Marcar orden lista para despacho",
      description: `La orden ${orderLabel} pasara a Lista para despacho.`,
      patch: { status: "ready_to_dispatch" },
    };
  }

  if (status === "ready_to_dispatch") {
    const tracking = trackingDraft.trim();
    if (!tracking) return null;

    return {
      label: "Despachar",
      title: "Despachar orden",
      description: `La orden ${orderLabel} se marcara como despachada con tracking ${tracking}.`,
      patch: { status: "dispatched", tracking_code: tracking },
    };
  }

  if (status === "dispatched" || status === "shipped") {
    return {
      label: "Marcar en transito",
      title: "Marcar orden en transito",
      description: `La orden ${orderLabel} pasara a En transito.`,
      patch: { status: "in_transit" },
    };
  }

  if (status === "in_transit") {
    return {
      label: "Marcar en reparto",
      title: "Marcar orden en reparto",
      description: `La orden ${orderLabel} pasara a En reparto.`,
      patch: { status: "out_for_delivery" },
    };
  }

  if (status === "out_for_delivery" || status === "ready_pickup") {
    return {
      label: "Marcar como entregada",
      title: "Confirmar entrega de la orden",
      description: `La orden ${orderLabel} se marcara como Entregada.`,
      patch: { status: "delivered" },
    };
  }

  return null;
}

export function useOrdersAdminController() {
  const searchParams = useSearchParams();
  const paymentStatusParam = searchParams.get("payment_status");
  const reduceMotion = useReducedMotion();
  const { push } = useAdminToasts();
  const { confirm, confirmModal } = useConfirmModal();

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersCount, setOrdersCount] = useState(0);
  const [hasAnyOrders, setHasAnyOrders] = useState<boolean | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPayment, setFilterPayment] = useState<PaymentFilter>(() =>
    normalizePaymentFilter(paymentStatusParam)
  );
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>(DEFAULT_SORT);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const ordersAbortRef = useRef<AbortController | null>(null);
  const ordersRequestIdRef = useRef(0);
  const ordersPresenceAbortRef = useRef<AbortController | null>(null);
  const ordersPresenceRequestIdRef = useRef(0);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailRequestIdRef = useRef(0);
  const detailRequestOrderIdRef = useRef<string | null>(null);

  const [trackingDraft, setTrackingDraftState] = useState("");
  const [notesDraft, setNotesDraftState] = useState("");
  const [saving, setSaving] = useState(false);
  const [downloadingInvoiceOrderId, setDownloadingInvoiceOrderId] = useState<string | null>(null);
  const trackingDraftRef = useRef("");
  const notesDraftRef = useRef("");
  const trackingServerValueRef = useRef("");
  const notesServerValueRef = useRef("");

  const setTrackingDraft = useCallback((value: string) => {
    trackingDraftRef.current = value;
    setTrackingDraftState(value);
  }, []);

  const setNotesDraft = useCallback((value: string) => {
    notesDraftRef.current = value;
    setNotesDraftState(value);
  }, []);

  const resetOrderDrafts = useCallback(() => {
    trackingServerValueRef.current = "";
    notesServerValueRef.current = "";
    setTrackingDraft("");
    setNotesDraft("");
  }, [setNotesDraft, setTrackingDraft]);

  const syncOrderDraftsFromServer = useCallback(
    (order: AdminOrder, options?: { force?: boolean }) => {
      const nextTracking = order.tracking_code ?? "";
      const nextNotes = readAdminNotesDraftValue(order);
      const previousServerTracking = trackingServerValueRef.current;
      const previousServerNotes = notesServerValueRef.current;
      const shouldSyncTracking =
        options?.force === true || trackingDraftRef.current === previousServerTracking;
      const shouldSyncNotes =
        options?.force === true || notesDraftRef.current === previousServerNotes;

      trackingServerValueRef.current = nextTracking;
      notesServerValueRef.current = nextNotes;

      if (shouldSyncTracking) {
        setTrackingDraft(nextTracking);
      }
      if (shouldSyncNotes) {
        setNotesDraft(nextNotes);
      }
    },
    [setNotesDraft, setTrackingDraft]
  );

  useEffect(() => {
    const nextFilter = normalizePaymentFilter(paymentStatusParam);
    setFilterPayment((prev) => (prev === nextFilter ? prev : nextFilter));
    setOffset(0);
  }, [paymentStatusParam]);

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

  const hasActiveFilters =
    search.trim().length > 0 ||
    filterStatus !== "all" ||
    filterPayment !== "all" ||
    filterFrom.trim().length > 0 ||
    filterTo.trim().length > 0;

  const statusFilterOptionAppearance = useMemo<
    Record<string, SelectOptionAppearance>
  >(() => {
    const out: Record<string, SelectOptionAppearance> = {};
    for (const value of STATUS_FILTER_VALUES) {
      const statusBadge = fulfillmentBadge(value);
      out[value] = {
        icon: statusBadge.Icon,
        badgeClassName: `${toneStyles.statusToneChip} ${statusBadge.toneClassName}`,
      };
    }
    return out;
  }, []);

  function clearFilters() {
    setSearch("");
    setSearchQuery("");
    setFilterStatus("all");
    setFilterPayment("all");
    setFilterFrom("");
    setFilterTo("");
    setOffset(0);
  }

  function openOrder(orderId: string) {
    detailRequestOrderIdRef.current = orderId;
    setActiveOrderId(orderId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    resetOrderDrafts();
  }

  function closeOrder() {
    detailAbortRef.current?.abort();
    detailAbortRef.current = null;
    detailRequestIdRef.current += 1;
    detailRequestOrderIdRef.current = null;
    setActiveOrderId(null);
    setDetail(null);
    setDetailLoading(false);
    setDetailError(null);
    resetOrderDrafts();
  }

  const ordersQuery = useMemo<AdminOrdersQuery>(() => {
    let fromDate = parseLocalDateInput(filterFrom);
    let toDate = parseLocalDateInput(filterTo);

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      const tmp = fromDate;
      fromDate = toDate;
      toDate = tmp;
    }

    return {
      q: searchQuery.trim() || undefined,
      status: filterStatus !== "all" ? filterStatus : undefined,
      payment_status: filterPayment !== "all" ? filterPayment : undefined,
      from: fromDate ? fromDate.toISOString() : undefined,
      to: toDate ? endOfLocalDay(toDate).toISOString() : undefined,
      sort: sortBy,
      limit: PAGE_LIMIT,
      offset,
    };
  }, [searchQuery, filterStatus, filterPayment, filterFrom, filterTo, sortBy, offset]);

  const pageFrom = ordersCount > 0 ? offset + 1 : 0;
  const pageTo = ordersCount > 0 ? Math.min(ordersCount, offset + orders.length) : 0;
  const currentPage = Math.floor(offset / PAGE_LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(ordersCount / PAGE_LIMIT));

  const refreshOrders = useCallback(
    async (options?: { background?: boolean; silentError?: boolean }) => {
      ordersAbortRef.current?.abort();
      const controller = new AbortController();
      const requestId = ordersRequestIdRef.current + 1;
      ordersRequestIdRef.current = requestId;
      ordersAbortRef.current = controller;

      try {
        if (!options?.background) setLoading(true);
        const data = await getAdminOrdersPage(ordersQuery, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || requestId !== ordersRequestIdRef.current) return;
        setOrders(data.orders);
        setOrdersCount(data.count);
        setError(null);
      } catch (e) {
        if (controller.signal.aborted || requestId !== ordersRequestIdRef.current) return;
        if (!options?.silentError) {
          setError(mapFriendlyError(e, "No se pudieron cargar órdenes."));
        }
      } finally {
        if (requestId === ordersRequestIdRef.current && ordersAbortRef.current === controller) {
          ordersAbortRef.current = null;
        }
        if (requestId === ordersRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [ordersQuery]
  );

  const refreshOrdersPresence = useCallback(async () => {
    ordersPresenceAbortRef.current?.abort();
    const controller = new AbortController();
    const requestId = ordersPresenceRequestIdRef.current + 1;
    ordersPresenceRequestIdRef.current = requestId;
    ordersPresenceAbortRef.current = controller;

    try {
      const data = await getAdminOrdersPage(
        {
          limit: 1,
          offset: 0,
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted || requestId !== ordersPresenceRequestIdRef.current) return;
      setHasAnyOrders(data.count > 0);
    } catch {
      if (controller.signal.aborted || requestId !== ordersPresenceRequestIdRef.current) return;
      setHasAnyOrders((current) => current);
    } finally {
      if (
        requestId === ordersPresenceRequestIdRef.current &&
        ordersPresenceAbortRef.current === controller
      ) {
        ordersPresenceAbortRef.current = null;
      }
    }
  }, []);

  const refreshOrderDetail = useCallback(
    async (
      orderId: string,
      options?: { background?: boolean; silentError?: boolean }
    ) => {
      detailAbortRef.current?.abort();
      const controller = new AbortController();
      const requestId = detailRequestIdRef.current + 1;
      detailRequestIdRef.current = requestId;
      detailAbortRef.current = controller;
      detailRequestOrderIdRef.current = orderId;
      if (!options?.background) {
        setDetailLoading(true);
      }
      if (!options?.silentError) {
        setDetailError(null);
      }

      try {
        const data = await getAdminOrder(orderId, {
          signal: controller.signal,
        });
        if (
          controller.signal.aborted ||
          requestId !== detailRequestIdRef.current ||
          detailRequestOrderIdRef.current !== orderId
        ) {
          return;
        }
        setDetail(data);
      } catch (e) {
        if (
          controller.signal.aborted ||
          requestId !== detailRequestIdRef.current ||
          detailRequestOrderIdRef.current !== orderId
        ) {
          return;
        }
        if (!options?.silentError) {
          setDetailError(mapFriendlyError(e, "No se pudo cargar la orden."));
        }
      } finally {
        if (requestId === detailRequestIdRef.current && detailAbortRef.current === controller) {
          detailAbortRef.current = null;
        }
        if (requestId === detailRequestIdRef.current) {
          setDetailLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void refreshOrders();
    void refreshOrdersPresence();
  }, [refreshOrders, refreshOrdersPresence]);

  useEffect(() => {
    return () => {
      ordersAbortRef.current?.abort();
      ordersAbortRef.current = null;
      ordersPresenceAbortRef.current?.abort();
      ordersPresenceAbortRef.current = null;
      detailAbortRef.current?.abort();
      detailAbortRef.current = null;
      detailRequestOrderIdRef.current = null;
      trackingDraftRef.current = "";
      notesDraftRef.current = "";
      trackingServerValueRef.current = "";
      notesServerValueRef.current = "";
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAdminOrdersInvalidation(() => {
      void refreshOrders({ background: true, silentError: true });
      void refreshOrdersPresence();
      if (activeOrderId) {
        void refreshOrderDetail(activeOrderId, {
          background: true,
          silentError: true,
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeOrderId, refreshOrderDetail, refreshOrders, refreshOrdersPresence]);

  useEffect(() => {
    if (offset <= 0) return;
    if (ordersCount === 0) {
      setOffset(0);
      return;
    }
    if (offset < ordersCount) return;
    const lastPageOffset = Math.max(0, Math.floor((ordersCount - 1) / PAGE_LIMIT) * PAGE_LIMIT);
    setOffset(lastPageOffset);
  }, [offset, ordersCount]);

  useEffect(() => {
    if (!activeOrderId) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      resetOrderDrafts();
      return;
    }

    void refreshOrderDetail(activeOrderId)
      .catch(() => {
        // handled inside refreshOrderDetail
      });
  }, [activeOrderId, refreshOrderDetail, resetOrderDrafts]);

  useEffect(() => {
    const order = detail?.order;
    if (!order) return;
    syncOrderDraftsFromServer(order);
  }, [detail?.order, syncOrderDraftsFromServer]);

  const activeOrder = useMemo(() => {
    if (!activeOrderId) return null;
    return orders.find((order) => order.id === activeOrderId) ?? null;
  }, [activeOrderId, orders]);

  const detailOrder = useMemo(() => {
    if (detail?.order && activeOrder && detail.order.id === activeOrder.id) {
      if (adminOrderUpdatedAt(activeOrder.updated_at) > adminOrderUpdatedAt(detail.order.updated_at)) {
        return {
          ...detail.order,
          ...activeOrder,
          items: detail.order.items,
          metadata: detail.order.metadata,
        };
      }
      return detail.order;
    }

    return detail?.order ?? activeOrder;
  }, [activeOrder, detail?.order]);

  async function copyToClipboard(value: string, label: string) {
    const text = value.trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      push({
        variant: "success",
        title: "Copiado",
        message: `${label} copiado al portapapeles.`,
      });
    } catch {
      push({
        variant: "error",
        title: "No se pudo copiar",
        message: "Tu navegador bloqueó el portapapeles.",
      });
    }
  }

  async function downloadInvoice(order: AdminOrder) {
    if (downloadingInvoiceOrderId) return;

    setDownloadingInvoiceOrderId(order.id);
    try {
      const fileName = await downloadOrderInvoicePdf(order.id, order.order_number);
      push({
        variant: "success",
        title: "Comprobante descargado",
        message: fileName,
      });
    } catch (e) {
      push({
        variant: "error",
        title: "No se pudo descargar",
        message: mapFriendlyError(e, "No se pudo descargar el comprobante interno."),
      });
    } finally {
      setDownloadingInvoiceOrderId(null);
    }
  }

  const primaryActionPlan = useMemo(
    () => buildPrimaryActionPlan(detailOrder, trackingDraft),
    [detailOrder, trackingDraft]
  );
  const primaryActionLabel = primaryActionPlan?.label ?? "";

  const timelinePreview = useMemo(() => buildTimelinePreview(detailOrder), [detailOrder]);

  async function saveNotes() {
    if (!detailOrder || saving) return;
    try {
      setSaving(true);
      const updated = await patchAdminOrder(detailOrder.id, {
        admin_notes: normalizeAdminNotesInput(notesDraft),
      });
      syncOrderDraftsFromServer(updated.order, { force: true });
      setDetail(updated);
      setOrders((prev) => prev.map((o) => (o.id === updated.order.id ? updated.order : o)));
      invalidateAdminOrders();
      push({ variant: "success", title: "Guardado", message: "Nota interna actualizada." });
    } catch (e) {
      push({
        variant: "error",
        title: "Error",
        message: mapFriendlyError(e, "No se pudo guardar."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveTracking() {
    if (!detailOrder || saving) return;
    try {
      setSaving(true);
      const updated = await patchAdminOrder(detailOrder.id, {
        tracking_code: trackingDraft.trim() || null,
      });
      syncOrderDraftsFromServer(updated.order, { force: true });
      setDetail(updated);
      setOrders((prev) => prev.map((o) => (o.id === updated.order.id ? updated.order : o)));
      invalidateAdminOrders();
      push({
        variant: "success",
        title: "Tracking actualizado",
        message: "Se guardó el tracking.",
      });
    } catch (e) {
      push({
        variant: "error",
        title: "Error",
        message: mapFriendlyError(e, "No se pudo guardar."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function advancePrimaryAction() {
    if (!detailOrder || saving) return;

    const payment = normalizePaymentStatus(detailOrder.payment_status);
    const status = normalizeFulfillmentStatus(detailOrder.status).toLowerCase();

    if (payment !== "paid") {
      if (!isBankTransfer(detailOrder.payment_method)) {
        push({
          variant: "info",
          title: "Pago pendiente",
          message:
            "Este medio de pago se acredita automáticamente. La orden se puede avanzar cuando el pago esté confirmado.",
        });
        return;
      }
    }

    if (status === "ready_to_dispatch") {
      const tracking = trackingDraft.trim();
      if (!tracking) {
        push({
          variant: "warning",
          title: "Falta tracking",
          message: "Agrega un tracking para despachar.",
        });
        return;
      }
    }

    const plan = buildPrimaryActionPlan(detailOrder, trackingDraft);
    if (!plan) {
      return;
    }

    const confirmed = await confirm({
      title: plan.title,
      description: plan.description,
      confirmLabel: plan.label,
      cancelLabel: "Cancelar",
      confirmVariant: "default",
    });
    if (!confirmed) return;

    try {
      setSaving(true);
      const updated = await patchAdminOrder(detailOrder.id, plan.patch);
      setDetail(updated);
      setOrders((prev) => prev.map((o) => (o.id === updated.order.id ? updated.order : o)));
      invalidateAdminOrders();
      push({ variant: "success", title: "Orden actualizada", message: "Se guardó el nuevo estado." });
    } catch (e) {
      push({
        variant: "error",
        title: "Error",
        message: mapFriendlyError(e, "No se pudo actualizar la orden."),
      });
    } finally {
      setSaving(false);
    }
  }

  return {
    reduceMotion,
    search,
    setSearch,
    filterStatus,
    setFilterStatus,
    filterPayment,
    setFilterPayment,
    filterFrom,
    setFilterFrom,
    filterTo,
    setFilterTo,
    sortBy,
    setSortBy,
    orders,
    ordersCount,
    loading,
    error,
    hasAnyOrders,
    hasActiveFilters,
    statusFilterOptionAppearance,
    clearFilters,
    pageFrom,
    pageTo,
    currentPage,
    totalPages,
    refreshOrders,
    openOrder,
    closeOrder,
    activeOrderId,
    detail,
    detailOrder,
    detailLoading,
    detailError,
    trackingDraft,
    setTrackingDraft,
    notesDraft,
    setNotesDraft,
    saving,
    downloadingInvoiceOrderId,
    copyToClipboard,
    downloadInvoice,
    primaryActionLabel,
    timelinePreview,
    saveNotes,
    saveTracking,
    advancePrimaryAction,
    setOffset,
    confirmModal,
  };
}
