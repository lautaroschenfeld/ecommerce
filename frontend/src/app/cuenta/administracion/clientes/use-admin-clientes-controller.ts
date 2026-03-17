"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { type CustomerRole } from "@/lib/account-roles";
import { formatMoney } from "@/lib/format";
import { notify } from "@/lib/notifications";
import { fetchJsonWithAuthRetry as fetchJson } from "@/lib/store-client";

import { useConfirmModal } from "@/components/ui/confirm-modal";

import {
  toTimestamp,
  mapAdminAccount,
  mapClientDetailRow,
  mapClientRow,
  mapPanelError,
  toCsvCell,
  statusLabel,
  roleLabel,
  orderStatusLabel,
  patchAccountRecord,
  mergeAccountIntoClientRow,
  type AdminAccount,
  type ClientRow,
  type ClientDetailRow,
  type ClientSort,
  type StatusFilter,
  type BulkMode,
} from "./page.utils";

const CLIENTS_PAGE_LIMIT = 50;
const CLIENT_EXPORT_PAGE_SIZE = 200;
const CLIENT_DETAIL_ORDERS_PAGE_LIMIT = 12;

type AdminAccountsPageResponse = {
  accounts?: unknown[];
  count?: number | string;
  limit?: number | string;
  offset?: number | string;
};

type AdminAccountDetailResponse = {
  account?: unknown;
  orders?: unknown[];
  orders_total_count?: number | string;
  orders_limit?: number | string;
  orders_offset?: number | string;
};

type AdminClientsQuery = {
  q?: string;
  role?: "all" | CustomerRole;
  status?: StatusFilter;
  from?: string;
  to?: string;
  sort?: ClientSort;
  limit?: number;
  offset?: number;
};

type ClientTimelineEvent = {
  id: string;
  at: string;
  kind: "account" | "session" | "order";
  title: string;
  detail: string;
};

function toNonNegativeInt(input: unknown, fallback: number) {
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}

function appendQueryParam(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  const text = typeof value === "string" ? value.trim() : String(value);
  if (!text) return;
  params.set(key, text);
}

function describeClient(row: Pick<ClientRow, "fullName" | "email">) {
  return `${row.fullName} (${row.email})`;
}

function summarizeSelectedClients(rows: ClientRow[]) {
  const preview = rows.slice(0, 3).map((row) => row.fullName).join(", ");
  if (rows.length <= 3) return preview;
  return `${preview} y ${rows.length - 3} mas`;
}

async function getAdminClientsPage(query: AdminClientsQuery = {}) {
  const params = new URLSearchParams();
  appendQueryParam(params, "q", query.q);
  appendQueryParam(params, "role", query.role && query.role !== "all" ? query.role : undefined);
  appendQueryParam(
    params,
    "status",
    query.status && query.status !== "all" ? query.status : undefined
  );
  appendQueryParam(params, "from", query.from);
  appendQueryParam(params, "to", query.to);
  appendQueryParam(params, "sort", query.sort);
  appendQueryParam(params, "limit", query.limit);
  appendQueryParam(params, "offset", query.offset);

  const queryString = params.toString();
  const response = await fetchJson<AdminAccountsPageResponse>(
    `/store/catalog/account/admin/accounts${queryString ? `?${queryString}` : ""}`,
    {
      method: "GET",
      credentials: "include",
      headers: {},
    }
  );

  const rows = (response.accounts ?? []).map(mapClientRow).filter(Boolean) as ClientRow[];
  const count = toNonNegativeInt(response.count, rows.length);
  const limit = Math.max(1, toNonNegativeInt(response.limit, CLIENTS_PAGE_LIMIT));
  const offset = toNonNegativeInt(response.offset, 0);

  return {
    rows,
    count,
    limit,
    offset,
  };
}

async function getAllAdminClientRows(
  query: Omit<AdminClientsQuery, "limit" | "offset"> = {},
  pageSize = CLIENT_EXPORT_PAGE_SIZE
) {
  const safePageSize = Math.max(1, Math.min(200, Math.trunc(pageSize || CLIENT_EXPORT_PAGE_SIZE)));
  const collected: ClientRow[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  let fetchedPages = 0;

  while (collected.length < total) {
    const page = await getAdminClientsPage({
      ...query,
      limit: safePageSize,
      offset,
    });

    collected.push(...page.rows);
    total = Math.max(0, page.count);
    fetchedPages += 1;

    if (page.rows.length === 0 || page.rows.length < page.limit) {
      break;
    }

    offset += page.limit;

    if (Number.isFinite(total) && fetchedPages > Math.ceil(total / safePageSize) + 2) {
      break;
    }
  }

  if (Number.isFinite(total) && collected.length < total) {
    throw new Error(
      "La exportacion de clientes quedo incompleta. Intenta nuevamente."
    );
  }

  return collected.slice(0, Number.isFinite(total) ? total : collected.length);
}

type AdminClientDetailPage = {
  detail: ClientDetailRow;
  ordersTotalCount: number;
  ordersLimit: number;
  ordersOffset: number;
};

async function getAdminClientDetail(accountId: string, query?: { ordersLimit?: number; ordersOffset?: number }) {
  const params = new URLSearchParams();
  appendQueryParam(params, "orders_limit", query?.ordersLimit);
  appendQueryParam(params, "orders_offset", query?.ordersOffset);
  const queryString = params.toString();
  const response = await fetchJson<AdminAccountDetailResponse>(
    `/store/catalog/account/admin/accounts/${encodeURIComponent(accountId)}${queryString ? `?${queryString}` : ""}`,
    {
      method: "GET",
      credentials: "include",
      headers: {},
    }
  );

  const detail = mapClientDetailRow(response.account, response.orders);
  if (!detail) {
    throw new Error("No se pudo interpretar la ficha del cliente.");
  }

  return {
    detail,
    ordersTotalCount: toNonNegativeInt(response.orders_total_count, detail.orders.length),
    ordersLimit: Math.max(1, toNonNegativeInt(response.orders_limit, CLIENT_DETAIL_ORDERS_PAGE_LIMIT)),
    ordersOffset: toNonNegativeInt(response.orders_offset, 0),
  } satisfies AdminClientDetailPage;
}

export function useAdminClientesController() {
  const { confirm, confirmModal } = useConfirmModal();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [rowsCount, setRowsCount] = useState(0);
  const [hasAnyClients, setHasAnyClients] = useState<boolean | null>(null);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailOrdersOffset, setDetailOrdersOffset] = useState(0);
  const [detailOrdersCount, setDetailOrdersCount] = useState(0);
  const [detailOrdersLimit, setDetailOrdersLimit] = useState(CLIENT_DETAIL_ORDERS_PAGE_LIMIT);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | CustomerRole>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sortBy, setSortBy] = useState<ClientSort>("latest_purchase");

  const [selectedRowsById, setSelectedRowsById] = useState<Record<string, ClientRow>>({});
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ClientDetailRow | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const [bulkMode, setBulkMode] = useState<BulkMode>("role");
  const [bulkRole, setBulkRole] = useState<CustomerRole>("employee");
  const [bulkStatus, setBulkStatus] = useState<"active" | "blocked">("active");

  const setSaving = useCallback((accountId: string, value: boolean) => {
    setSavingIds((prev) => {
      const next = { ...prev };
      if (value) next[accountId] = true;
      else delete next[accountId];
      return next;
    });
  }, []);

  const queryState = useMemo(
    () => ({
      q: query.trim() || undefined,
      role: roleFilter !== "all" ? roleFilter : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      from: createdFrom || undefined,
      to: createdTo || undefined,
      sort: sortBy,
    }),
    [createdFrom, createdTo, query, roleFilter, sortBy, statusFilter]
  );
  const hasActiveFilters =
    query.trim().length > 0 ||
    roleFilter !== "all" ||
    statusFilter !== "all" ||
    createdFrom.trim().length > 0 ||
    createdTo.trim().length > 0;

  const loadPage = useCallback(
    async (options?: { background?: boolean; silentError?: boolean }) => {
      if (!options?.background) setLoading(true);
      if (!options?.silentError) setError(null);

      try {
        const page = await getAdminClientsPage({
          ...queryState,
          limit: CLIENTS_PAGE_LIMIT,
          offset,
        });
        setRows(page.rows);
        setRowsCount(page.count);
      } catch (fetchError) {
        if (!options?.silentError) {
          setError(mapPanelError(fetchError, "No se pudo cargar clientes."));
        }
        if (!options?.background) {
          setRows([]);
          setRowsCount(0);
        }
      } finally {
        if (!options?.background) setLoading(false);
      }
    },
    [offset, queryState]
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (offset <= 0) return;
    if (rowsCount === 0) {
      setOffset(0);
      return;
    }
    if (offset < rowsCount) return;
    const lastPageOffset = Math.max(
      0,
      Math.floor((rowsCount - 1) / CLIENTS_PAGE_LIMIT) * CLIENTS_PAGE_LIMIT
    );
    setOffset(lastPageOffset);
  }, [offset, rowsCount]);

  useEffect(() => {
    if (loading) return;
    if (rowsCount > 0) {
      setHasAnyClients(true);
      return;
    }
    if (!hasActiveFilters) {
      setHasAnyClients(false);
      return;
    }

    let cancelled = false;
    setHasAnyClients(null);

    void getAdminClientsPage({
      limit: 1,
      offset: 0,
      sort: "latest_purchase",
    })
      .then((page) => {
        if (cancelled) return;
        setHasAnyClients(page.count > 0);
      })
      .catch(() => {
        if (cancelled) return;
        setHasAnyClients(null);
      });

    return () => {
      cancelled = true;
    };
  }, [hasActiveFilters, loading, rowsCount]);

  useEffect(() => {
    setSelectedRowsById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const row of rows) {
        if (!next[row.id]) continue;
        next[row.id] = row;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [rows]);

  const pageFrom = rowsCount > 0 ? offset + 1 : 0;
  const pageTo = rowsCount > 0 ? Math.min(rowsCount, offset + rows.length) : 0;
  const currentPage = Math.floor(offset / CLIENTS_PAGE_LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(rowsCount / CLIENTS_PAGE_LIMIT));

  const selectedIdSet = useMemo(
    () => new Set(Object.keys(selectedRowsById)),
    [selectedRowsById]
  );
  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIdSet.has(id));
  const selectedRows = useMemo(
    () => Object.values(selectedRowsById),
    [selectedRowsById]
  );
  const selectedCount = selectedRows.length;

  const selectedRowPreview = useMemo(() => {
    if (!selectedClientId) return null;
    return rows.find((row) => row.id === selectedClientId) ?? selectedRowsById[selectedClientId] ?? null;
  }, [rows, selectedClientId, selectedRowsById]);

  const selectedRow = useMemo<ClientDetailRow | null>(() => {
    if (!selectedClientId) return null;
    if (detail && detail.id === selectedClientId) return detail;
    if (!selectedRowPreview) return null;
    return {
      ...selectedRowPreview,
      orders: [],
    };
  }, [detail, selectedClientId, selectedRowPreview]);

  const openClientDetail = useCallback((clientId: string) => {
    setSelectedClientId(clientId);
    setDetailOrdersOffset(0);
    setDetailOrdersCount(0);
    setDetailOrdersLimit(CLIENT_DETAIL_ORDERS_PAGE_LIMIT);
    setDetailOpen(true);
  }, []);

  useEffect(() => {
    if (!detailOpen || !selectedClientId) {
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    void getAdminClientDetail(selectedClientId, {
      ordersLimit: CLIENT_DETAIL_ORDERS_PAGE_LIMIT,
      ordersOffset: detailOrdersOffset,
    })
      .then((clientDetailPage) => {
        if (cancelled) return;
        setDetail(clientDetailPage.detail);
        setDetailOrdersCount(clientDetailPage.ordersTotalCount);
        setDetailOrdersLimit(clientDetailPage.ordersLimit);
        setSelectedRowsById((prev) =>
          prev[clientDetailPage.detail.id]
            ? { ...prev, [clientDetailPage.detail.id]: clientDetailPage.detail }
            : prev
        );
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setDetailError(
          mapPanelError(fetchError, "No se pudo cargar la ficha del cliente.")
        );
      })
      .finally(() => {
        if (cancelled) return;
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailOpen, detailOrdersOffset, selectedClientId]);

  useEffect(() => {
    setNoteDraft(selectedRow?.note ?? "");
  }, [selectedRow?.id, selectedRow?.note]);

  const clearSelection = useCallback(() => {
    setSelectedRowsById({});
  }, []);

  const detailOrdersPage = Math.floor(detailOrdersOffset / detailOrdersLimit) + 1;
  const detailOrdersTotalPages = Math.max(1, Math.ceil(detailOrdersCount / detailOrdersLimit));
  const detailOrdersFrom = detailOrdersCount > 0 ? detailOrdersOffset + 1 : 0;
  const detailOrdersTo =
    detailOrdersCount > 0 && selectedRow
      ? Math.min(detailOrdersCount, detailOrdersOffset + selectedRow.orders.length)
      : 0;

  useEffect(() => {
    if (detailOrdersOffset <= 0) return;
    if (detailOrdersCount === 0) {
      setDetailOrdersOffset(0);
      return;
    }
    if (detailOrdersOffset < detailOrdersCount) return;
    const lastPageOffset = Math.max(
      0,
      Math.floor((detailOrdersCount - 1) / detailOrdersLimit) * detailOrdersLimit
    );
    setDetailOrdersOffset(lastPageOffset);
  }, [detailOrdersCount, detailOrdersLimit, detailOrdersOffset]);

  const toggleSelectAllVisible = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedRowsById((prev) => {
          const next = { ...prev };
          for (const id of visibleIds) {
            delete next[id];
          }
          return next;
        });
        return;
      }

      setSelectedRowsById((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          next[row.id] = row;
        }
        return next;
      });
    },
    [rows, visibleIds]
  );

  const toggleSelectOne = useCallback((row: ClientRow, checked: boolean) => {
    setSelectedRowsById((prev) => {
      if (checked) {
        return {
          ...prev,
          [row.id]: row,
        };
      }

      const next = { ...prev };
      delete next[row.id];
      return next;
    });
  }, []);

  const applyAccountUpdate = useCallback((accountId: string, nextAccount: AdminAccount) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === accountId ? mergeAccountIntoClientRow(row, nextAccount) : row
      )
    );
    setSelectedRowsById((prev) => {
      if (!prev[accountId]) return prev;
      return {
        ...prev,
        [accountId]: mergeAccountIntoClientRow(prev[accountId], nextAccount),
      };
    });
    setDetail((prev) => {
      if (!prev || prev.id !== accountId) return prev;
      return {
        ...mergeAccountIntoClientRow(prev, nextAccount),
        orders: prev.orders,
      };
    });
  }, []);

  const updateRoleInternal = useCallback(
    async (row: ClientRow, role: CustomerRole, withToast: boolean) => {
      const result = await fetchJson<{ account?: unknown }>(
        `/store/catalog/account/admin/accounts/${encodeURIComponent(row.id)}/role`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ role }),
        }
      );

      const updatedAccount = mapAdminAccount(result.account);
      if (!updatedAccount) {
        throw new Error("No se pudo interpretar la cuenta actualizada.");
      }

      applyAccountUpdate(row.id, updatedAccount);

      if (withToast) {
        notify("Rol actualizado", `${row.fullName}: ${roleLabel(role)}.`, "success");
      }
    },
    [applyAccountUpdate]
  );

  const setBlockedInternal = useCallback(
    async (row: ClientRow, blocked: boolean, withToast: boolean) => {
      const blockedUntil = blocked ? "2099-12-31T23:59:59.000Z" : null;
      const updatedAccount = await patchAccountRecord(row.id, {
        blocked_until: blockedUntil,
      });

      if (!updatedAccount) {
        throw new Error("No se pudo interpretar la cuenta actualizada.");
      }

      applyAccountUpdate(row.id, updatedAccount);

      if (withToast) {
        notify(
          blocked ? "Cuenta bloqueada" : "Cuenta reactivada",
          `${row.fullName}: ${blocked ? "bloqueada" : "activa"}.`,
          blocked ? "warning" : "success"
        );
      }
    },
    [applyAccountUpdate]
  );

  const refreshAfterMutations = useCallback(async () => {
    await loadPage({ background: true, silentError: true });
    if (detailOpen && selectedClientId) {
      try {
        const refreshedDetailPage = await getAdminClientDetail(selectedClientId, {
          ordersLimit: CLIENT_DETAIL_ORDERS_PAGE_LIMIT,
          ordersOffset: detailOrdersOffset,
        });
        setDetail(refreshedDetailPage.detail);
        setDetailOrdersCount(refreshedDetailPage.ordersTotalCount);
        setDetailOrdersLimit(refreshedDetailPage.ordersLimit);
      } catch {
        // keep the current detail snapshot if the background refresh fails
      }
    }
  }, [detailOpen, detailOrdersOffset, loadPage, selectedClientId]);

  const handleRoleChange = useCallback(
    async (row: ClientRow, nextRole: CustomerRole) => {
      if (row.role === nextRole) return;

      const confirmed = await confirm({
        title: "Confirmar cambio de rol",
        description: `${describeClient(row)} pasara de ${roleLabel(row.role)} a ${roleLabel(nextRole)}.`,
        confirmLabel: "Cambiar rol",
        confirmVariant: "default",
      });
      if (!confirmed) return;

      setSaving(row.id, true);
      setError(null);
      try {
        await updateRoleInternal(row, nextRole, true);
        await refreshAfterMutations();
      } catch (actionError) {
        setError(mapPanelError(actionError, "No se pudo actualizar el rol."));
      } finally {
        setSaving(row.id, false);
      }
    },
    [confirm, refreshAfterMutations, setSaving, updateRoleInternal]
  );

  const handleToggleBlocked = useCallback(
    async (row: ClientRow, blocked: boolean) => {
      const confirmed = await confirm({
        title: blocked ? "Confirmar bloqueo de cuenta" : "Confirmar reactivacion de cuenta",
        description: blocked
          ? `${describeClient(row)} quedara bloqueado y no podra iniciar sesion hasta que lo reactivas.`
          : `${describeClient(row)} recuperara el acceso a su cuenta.`,
        confirmLabel: blocked ? "Bloquear cuenta" : "Reactivar cuenta",
        confirmVariant: blocked ? "destructive" : "default",
      });
      if (!confirmed) return;

      setSaving(row.id, true);
      setError(null);
      try {
        await setBlockedInternal(row, blocked, true);
        await refreshAfterMutations();
      } catch (actionError) {
        setError(mapPanelError(actionError, "No se pudo actualizar el estado."));
      } finally {
        setSaving(row.id, false);
      }
    },
    [confirm, refreshAfterMutations, setBlockedInternal, setSaving]
  );

  const handleSaveNote = useCallback(async () => {
    if (!selectedRow) return;
    const nextNote = noteDraft.trim();
    setSaving(selectedRow.id, true);
    setError(null);
    try {
      const updatedAccount = await patchAccountRecord(selectedRow.id, {
        admin_notes: nextNote,
      });

      if (!updatedAccount) {
        throw new Error("No se pudo interpretar la cuenta actualizada.");
      }

      applyAccountUpdate(selectedRow.id, updatedAccount);
      notify("Nota guardada", `${selectedRow.fullName}: nota actualizada.`, "success");
    } catch (actionError) {
      setError(mapPanelError(actionError, "No se pudo guardar la nota interna."));
    } finally {
      setSaving(selectedRow.id, false);
    }
  }, [applyAccountUpdate, noteDraft, selectedRow, setSaving]);

  const runBulkRole = useCallback(async () => {
    if (!selectedRows.length) return;
    const confirmed = await confirm({
      title: "Confirmar cambio masivo de rol",
      description: `Se actualizara el rol a ${roleLabel(bulkRole)} en ${selectedRows.length} cuentas: ${summarizeSelectedClients(selectedRows)}.`,
      confirmLabel: "Aplicar cambio",
      confirmVariant: "default",
    });
    if (!confirmed) return;

    setBulkBusy(true);
    setError(null);

    let ok = 0;
    let failed = 0;
    try {
      for (const row of selectedRows) {
        try {
          await updateRoleInternal(row, bulkRole, false);
          ok += 1;
        } catch {
          failed += 1;
        }
      }

      notify(
        "Accion masiva completada",
        `Rol actualizado en ${ok} cuentas${failed ? `, con ${failed} fallidas` : ""}.`,
        failed ? "warning" : "success"
      );
      clearSelection();
      await refreshAfterMutations();
    } finally {
      setBulkBusy(false);
    }
  }, [
    bulkRole,
    clearSelection,
    confirm,
    refreshAfterMutations,
    selectedRows,
    updateRoleInternal,
  ]);

  const runBulkStatus = useCallback(async () => {
    if (!selectedRows.length) return;
    const blocked = bulkStatus === "blocked";
    const confirmed = await confirm({
      title: blocked
        ? "Confirmar bloqueo masivo de cuentas"
        : "Confirmar reactivacion masiva de cuentas",
      description: blocked
        ? `Se bloquearan ${selectedRows.length} cuentas: ${summarizeSelectedClients(selectedRows)}.`
        : `Se reactivaran ${selectedRows.length} cuentas: ${summarizeSelectedClients(selectedRows)}.`,
      confirmLabel: blocked ? "Bloquear cuentas" : "Reactivar cuentas",
      confirmVariant: blocked ? "destructive" : "default",
    });
    if (!confirmed) return;

    setBulkBusy(true);
    setError(null);

    let ok = 0;
    let failed = 0;
    try {
      for (const row of selectedRows) {
        try {
          await setBlockedInternal(row, blocked, false);
          ok += 1;
        } catch {
          failed += 1;
        }
      }

      notify(
        "Accion masiva completada",
        `${blocked ? "Bloqueo" : "Reactivacion"} aplicado en ${ok} cuentas${
          failed ? `, con ${failed} fallidas` : ""
        }.`,
        failed ? "warning" : "success"
      );
      clearSelection();
      await refreshAfterMutations();
    } finally {
      setBulkBusy(false);
    }
  }, [
    bulkStatus,
    clearSelection,
    confirm,
    refreshAfterMutations,
    selectedRows,
    setBlockedInternal,
  ]);

  const exportCsv = useCallback(
    async (scope: "selected" | "filtered") => {
      try {
        let source: ClientRow[] = [];
        if (scope === "selected") {
          source = selectedRows;
        } else {
          setExporting(true);
          try {
            source = await getAllAdminClientRows(queryState);
          } finally {
            setExporting(false);
          }
        }

        if (!source.length) {
          notify("Sin datos para exportar", "Selecciona cuentas o aplica filtros.", "warning");
          return;
        }

        const header = [
          "id",
          "nombre",
          "email",
          "telefono",
          "whatsapp",
          "rol",
          "estado",
          "fecha_alta",
          "ultima_compra",
          "total_gastado",
          "ticket_promedio",
          "cantidad_pedidos",
          "ultima_actividad",
        ];

        const lines = source.map((row) =>
          [
            row.id,
            row.fullName,
            row.email,
            row.phone,
            row.whatsapp,
            roleLabel(row.role),
            statusLabel(row.status),
            row.createdAt,
            row.lastPurchaseAt ?? "",
            row.totalSpentArs,
            row.avgTicketArs,
            row.ordersCount,
            row.lastActivityAt ?? "",
          ]
            .map(toCsvCell)
            .join(",")
        );

        const csv = [header.map(toCsvCell).join(","), ...lines].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
        anchor.href = url;
        anchor.download = `clientes-${scope}-${stamp}.csv`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);

        notify(
          "Exportacion completada",
          `CSV generado con ${source.length} registros.`,
          "success"
        );
      } catch (error) {
        notify(
          "No se pudo exportar clientes",
          mapPanelError(error, "La exportacion fallo antes de completarse."),
          "error"
        );
      } finally {
        setExporting(false);
      }
    },
    [queryState, selectedRows]
  );

  const selectedTimeline = useMemo(() => {
    if (!selectedRow) return [];

    const createdAtTs = toTimestamp(selectedRow.createdAt);
    const lastLoginTs = toTimestamp(selectedRow.lastLoginAt);
    const updatedAtTs = toTimestamp(selectedRow.updatedAt);

    const accountEvents = [
      {
        id: `account-created-${selectedRow.id}`,
        at: selectedRow.createdAt,
        kind: "account",
        title: "Alta de cuenta",
        detail: "Cuenta registrada en la tienda.",
      },
      lastLoginTs > 0
        ? {
            id: `account-last-login-${selectedRow.id}`,
            at: selectedRow.lastLoginAt ?? selectedRow.updatedAt,
            kind: "session",
            title: "Ultimo acceso",
            detail: "Sesion iniciada por el cliente.",
          }
        : null,
      updatedAtTs > createdAtTs && updatedAtTs !== lastLoginTs
        ? {
            id: `account-updated-${selectedRow.id}`,
            at: selectedRow.updatedAt,
            kind: "account",
            title: "Ficha actualizada",
            detail: "La cuenta tuvo cambios persistidos en el servidor.",
          }
        : null,
    ].filter((event): event is ClientTimelineEvent => Boolean(event));

    const orderEvents = selectedRow.orders.map<ClientTimelineEvent>((order) => ({
      id: `ord-${order.id}`,
      at: order.created_at,
      kind: "order",
      title: `Pedido #${order.order_number}`,
      detail: `${formatMoney(order.total_ars)} - ${orderStatusLabel(order.status)}`,
    }));

    return [...accountEvents, ...orderEvents].sort(
      (a, b) => toTimestamp(b.at) - toTimestamp(a.at)
    );
  }, [selectedRow]);

  return {
    confirmModal,
    loading,
    error,
    query,
    setQuery,
    hasActiveFilters,
    hasAnyClients,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    createdFrom,
    setCreatedFrom,
    createdTo,
    setCreatedTo,
    sortBy,
    setSortBy,
    exportCsv,
    exporting,
    selectedCount,
    rows,
    rowsCount,
    pageSize: CLIENTS_PAGE_LIMIT,
    pageFrom,
    pageTo,
    currentPage,
    totalPages,
    setOffset,
    allVisibleSelected,
    toggleSelectAllVisible,
    selectedIdSet,
    toggleSelectOne,
    selectedClientId,
    openClientDetail,
    bulkBusy,
    clearSelection,
    bulkMode,
    setBulkMode,
    bulkRole,
    setBulkRole,
    bulkStatus,
    setBulkStatus,
    runBulkRole,
    runBulkStatus,
    detailOpen,
    setDetailOpen,
    selectedRow,
    detailLoading,
    detailError,
    detailOrdersCount,
    detailOrdersPage,
    detailOrdersLimit,
    detailOrdersTotalPages,
    detailOrdersFrom,
    detailOrdersTo,
    setDetailOrdersOffset,
    savingIds,
    handleRoleChange,
    handleToggleBlocked,
    noteDraft,
    setNoteDraft,
    handleSaveNote,
    selectedTimeline,
  };
}
