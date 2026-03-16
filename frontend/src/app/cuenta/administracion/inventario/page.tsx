"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Minus,
  Package,
  Plus,
  Search,
  TrendingDown,
  Warehouse,
} from "lucide-react";

import { notify } from "@/lib/notifications";
import { adminProductsActions } from "@/lib/store-admin-products";
import {
  getAdminInventoryPage,
  type AdminInventoryItem,
  type AdminInventorySort,
  type AdminInventoryStatusFilter,
  type AdminInventorySummary,
} from "@/lib/store-admin-inventory";
import { mapFriendlyError } from "@/lib/user-facing-errors";
import { cn } from "@/lib/utils";

import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import {
  ADMIN_INVENTORY_EMPTY_STATE_MESSAGES,
  resolveAdminEmptyStateMessage,
} from "@/components/admin/admin-empty-state-utils";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirmModal } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import styles from "./page.module.css";

const INVENTORY_PAGE_LIMIT = 50;
const EMPTY_SUMMARY: AdminInventorySummary = {
  totalProducts: 0,
  totalAvailableQty: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
  reorderCount: 0,
  productsWithActiveReservations: 0,
};

function statusLabel(item: AdminInventoryItem) {
  if (!item.inStock) return "Sin stock";
  if (item.lowStock) return "Stock bajo";
  return "En stock";
}

function statusVariant(item: AdminInventoryItem): "default" | "outline" | "destructive" {
  if (!item.inStock) return "destructive";
  if (item.lowStock) return "outline";
  return "default";
}

function productLifecycleLabel(item: AdminInventoryItem) {
  if (item.productStatus === "archived" || item.archived) return "Archivado";
  if (item.productStatus === "published") return "Publicado";
  return "Borrador";
}

function productLifecycleVariant(item: AdminInventoryItem): "secondary" | "outline" {
  if (item.productStatus === "published" && !item.archived) return "secondary";
  return "outline";
}

function sanitizeSignedInput(raw: string) {
  if (!raw) return "";
  const trimmed = raw.trim();
  const sign = trimmed.startsWith("-") ? "-" : "";
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return sign;
  return `${sign}${digits}`;
}

function parseSignedInteger(raw: string) {
  const normalized = sanitizeSignedInput(raw);
  if (!normalized || normalized === "-") return undefined;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed === 0) return undefined;
  return parsed;
}

function resolveStockTargetProductId(item: AdminInventoryItem) {
  const productId = item.productId.trim();
  return productId || item.id;
}

function mapInventoryError(error: unknown, fallback: string) {
  return mapFriendlyError(error, fallback);
}

function skuTitle(skuList: string[]) {
  return skuList.length > 0 ? skuList.join(", ") : undefined;
}

function applyInventoryDelta(item: AdminInventoryItem, deltaQty: number): AdminInventoryItem {
  const availableQty = Math.max(0, item.availableQty + deltaQty);
  const inStock = availableQty > 0;
  const lowStock = availableQty <= item.stockThreshold;
  return {
    ...item,
    availableQty,
    inStock,
    lowStock,
    reorderSuggestedQty: Math.max(0, item.stockThreshold - availableQty),
  };
}

async function waitBulkJob(jobId: string) {
  let lastStatus = "queued";
  for (let index = 0; index < 30; index += 1) {
    const job = await adminProductsActions.getBulkJob(jobId);
    lastStatus = job.status;
    if (job.status === "completed") {
      if (job.failed > 0) {
        throw new Error(job.error || "El ajuste masivo termino con errores.");
      }
      return;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "No se pudo completar el ajuste masivo.");
    }
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  throw new Error(
    lastStatus === "running"
      ? "El ajuste sigue ejecutandose. Revisa en unos segundos."
      : "No se pudo confirmar el estado del ajuste."
  );
}

export default function AdminInventarioPage() {
  const [inventory, setInventory] = useState<AdminInventoryItem[]>([]);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [hasAnyInventoryProducts, setHasAnyInventoryProducts] = useState<boolean | null>(null);
  const [inventorySummary, setInventorySummary] = useState<AdminInventorySummary>(EMPTY_SUMMARY);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminInventoryStatusFilter>("all");
  const [sortBy, setSortBy] = useState<AdminInventorySort>("stock_asc");
  const [page, setPage] = useState(1);

  const [selectedRowsById, setSelectedRowsById] = useState<Record<string, AdminInventoryItem>>({});
  const [deltaByRow, setDeltaByRow] = useState<Record<string, string>>({});
  const [bulkDelta, setBulkDelta] = useState("");
  const [reason, setReason] = useState("");
  const { confirm, confirmModal } = useConfirmModal();

  const inventoryOffset = (page - 1) * INVENTORY_PAGE_LIMIT;
  const pageFrom = inventoryCount > 0 ? inventoryOffset + 1 : 0;
  const pageTo = inventoryCount > 0 ? Math.min(inventoryCount, inventoryOffset + inventory.length) : 0;
  const totalPages = Math.max(1, Math.ceil(inventoryCount / INVENTORY_PAGE_LIMIT));
  const hasActiveInventoryFilters = query.trim().length > 0 || statusFilter !== "all";
  const emptyInventoryMessage = resolveAdminEmptyStateMessage({
    hasActiveFilters: hasActiveInventoryFilters,
    hasAnyRecords: hasAnyInventoryProducts,
    ...ADMIN_INVENTORY_EMPTY_STATE_MESSAGES,
  });

  const selectedSet = useMemo(() => new Set(Object.keys(selectedRowsById)), [selectedRowsById]);
  const selectedIds = useMemo(() => Object.keys(selectedRowsById), [selectedRowsById]);
  const selectedCount = selectedIds.length;
  const visibleRowIds = useMemo(() => inventory.map((item) => item.id), [inventory]);
  const allVisibleSelected =
    visibleRowIds.length > 0 && visibleRowIds.every((id) => selectedSet.has(id));

  const inventoryQuery = useMemo(
    () => ({
      q: query.trim() || undefined,
      status: statusFilter,
      sort: sortBy,
      limit: INVENTORY_PAGE_LIMIT,
      offset: inventoryOffset,
    }),
    [inventoryOffset, query, sortBy, statusFilter]
  );

  const loadInventory = useCallback(
    async (options?: { background?: boolean; silentError?: boolean }) => {
      if (!options?.background) setLoading(true);
      if (!options?.silentError) setError(null);

      try {
        const result = await getAdminInventoryPage(inventoryQuery);
        setInventory(result.inventory);
        setInventoryCount(result.count);
        setInventorySummary(result.summary);
      } catch (fetchError) {
        if (!options?.silentError) {
          setError(mapInventoryError(fetchError, "No se pudo cargar inventario."));
        }
        if (!options?.background) {
          setInventory([]);
          setInventoryCount(0);
          setInventorySummary(EMPTY_SUMMARY);
        }
      } finally {
        if (!options?.background) setLoading(false);
      }
    },
    [inventoryQuery]
  );

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  useEffect(() => {
    if (page <= totalPages) return;
    setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (loading) return;
    if (inventoryCount > 0) {
      setHasAnyInventoryProducts(true);
      return;
    }
    if (!hasActiveInventoryFilters) {
      setHasAnyInventoryProducts(false);
      return;
    }

    let cancelled = false;
    setHasAnyInventoryProducts(null);

    void getAdminInventoryPage({
      limit: 1,
      offset: 0,
      status: "all",
      sort: "name_asc",
    })
      .then((result) => {
        if (cancelled) return;
        setHasAnyInventoryProducts(result.count > 0);
      })
      .catch(() => {
        if (cancelled) return;
        setHasAnyInventoryProducts(null);
      });

    return () => {
      cancelled = true;
    };
  }, [hasActiveInventoryFilters, inventoryCount, loading]);

  useEffect(() => {
    setSelectedRowsById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of inventory) {
        if (!next[item.id]) continue;
        next[item.id] = item;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [inventory]);

  const patchInventorySnapshot = useCallback((targetIds: string[], deltaQty: number) => {
    const targetIdSet = new Set(targetIds);

    setInventory((prev) =>
      prev.map((item) => (targetIdSet.has(item.id) ? applyInventoryDelta(item, deltaQty) : item))
    );

    setSelectedRowsById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const targetId of targetIds) {
        const current = next[targetId];
        if (!current) continue;
        next[targetId] = applyInventoryDelta(current, deltaQty);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const runStockAdjustment = useCallback(
    async (targetRowIds: string[], deltaQty: number, motive: string) => {
      if (!targetRowIds.length) {
        notify("Sin productos", "No hay productos para ajustar.", "warning");
        return;
      }
      if (!motive.trim()) {
        setError("Debes completar un motivo para registrar el ajuste.");
        return;
      }
      if (!deltaQty) {
        setError("El ajuste debe ser distinto de cero.");
        return;
      }

      const targetItems = targetRowIds
        .map(
          (targetId) =>
            selectedRowsById[targetId] ?? inventory.find((item) => item.id === targetId) ?? null
        )
        .filter(Boolean) as AdminInventoryItem[];

      if (!targetItems.length) {
        notify("Sin productos", "Los productos seleccionados ya no existen en la vista.", "warning");
        return;
      }

      const targetProductIds = Array.from(
        new Set(targetItems.map((item) => resolveStockTargetProductId(item)))
      );

      if (!targetProductIds.length) {
        setError("No se pudieron resolver productos validos para aplicar el ajuste.");
        return;
      }

      const confirmed = await confirm({
        title: "Confirmar ajuste de stock",
        description: `Se aplicara un ajuste de ${
          deltaQty > 0 ? "+" : ""
        }${deltaQty} unidades sobre ${targetProductIds.length} producto(s).\nMotivo: ${motive.trim()}`,
        confirmLabel: "Aplicar ajuste",
        cancelLabel: "Cancelar",
        confirmVariant: "default",
      });
      if (!confirmed) return;

      setBusy(true);
      setError(null);
      const affectedRowIds = targetItems.map((item) => item.id);

      try {
        const job = await adminProductsActions.startBulkJob(
          {
            action: "adjust_stock",
            productIds: targetProductIds,
            stockDelta: deltaQty,
          },
          { toast: false }
        );
        await waitBulkJob(job.id);
        patchInventorySnapshot(affectedRowIds, deltaQty);
        notify(
          "Stock ajustado",
          `Ajuste aplicado en ${targetProductIds.length} producto(s).`,
          "success"
        );
        await loadInventory({ background: true, silentError: true });
      } catch (actionError) {
        if (targetProductIds.length === 1 && targetItems.length === 1) {
          const target = targetItems[0];
          if (target) {
            try {
              await adminProductsActions.update(
                targetProductIds[0],
                { stockAvailable: Math.max(0, target.availableQty + deltaQty) },
                { toast: false, invalidate: false }
            );
            patchInventorySnapshot([target.id], deltaQty);
            notify(
              "Stock ajustado",
              "Ajuste aplicado por actualizacion directa.",
              "success"
            );
            await loadInventory({ background: true, silentError: true });
              return;
            } catch {
              // fallback already failed
            }
          }
        }

        setError(mapInventoryError(actionError, "No se pudo ajustar stock."));
      } finally {
        setBusy(false);
      }
    },
    [confirm, inventory, loadInventory, patchInventorySnapshot, selectedRowsById]
  );

  const toggleSelectAllVisible = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedRowsById((prev) => {
          const next = { ...prev };
          for (const rowId of visibleRowIds) {
            delete next[rowId];
          }
          return next;
        });
        return;
      }

      setSelectedRowsById((prev) => {
        const next = { ...prev };
        for (const item of inventory) {
          next[item.id] = item;
        }
        return next;
      });
    },
    [inventory, visibleRowIds]
  );

  const toggleSelectRow = useCallback((item: AdminInventoryItem, checked: boolean) => {
    setSelectedRowsById((prev) => {
      if (checked) {
        return { ...prev, [item.id]: item };
      }
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  }, []);

  const applyRowDelta = useCallback(
    async (item: AdminInventoryItem) => {
      const parsed = parseSignedInteger(deltaByRow[item.id] ?? "");
      if (!parsed) {
        setError("Ingresa un ajuste valido por producto (ej: +5 o -3).");
        return;
      }
      await runStockAdjustment([item.id], parsed, reason);
      setDeltaByRow((prev) => ({ ...prev, [item.id]: "" }));
    },
    [deltaByRow, reason, runStockAdjustment]
  );

  const applyBulkDelta = useCallback(async () => {
    const parsed = parseSignedInteger(bulkDelta);
    if (!parsed) {
      setError("Ingresa un ajuste en masa valido (ej: +20 o -10).");
      return;
    }

    if (!selectedIds.length) {
      setError("Selecciona al menos un producto para aplicar ajuste masivo.");
      return;
    }

    await runStockAdjustment(selectedIds, parsed, reason);
    setBulkDelta("");
    setSelectedRowsById({});
  }, [bulkDelta, reason, runStockAdjustment, selectedIds]);

  return (
    <div className={styles.page}>
      <div className={styles.stats}>
        <Card className={`adminPanelSurface ${styles.card}`}>
          <CardContent className={`adminPanelContentSurface ${styles.statCard}`}>
            <Package className={styles.statIcon} />
            <div>
              <p className={styles.statLabel}>
                {hasActiveInventoryFilters ? "Productos visibles" : "Total productos"}
              </p>
              <p className={styles.statValue}>{inventorySummary.totalProducts}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`adminPanelSurface ${styles.card}`}>
          <CardContent className={`adminPanelContentSurface ${styles.statCard}`}>
            <Warehouse className={styles.statIcon} />
            <div>
              <p className={styles.statLabel}>
                {hasActiveInventoryFilters ? "Unidades visibles" : "Unidades disponibles"}
              </p>
              <p className={styles.statValue}>{inventorySummary.totalAvailableQty}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`adminPanelSurface ${styles.card}`}>
          <CardContent className={`adminPanelContentSurface ${styles.statCard}`}>
            <TrendingDown className={styles.statIcon} data-variant="warning" />
            <div>
              <p className={styles.statLabel}>
                {hasActiveInventoryFilters ? "Stock bajo visible" : "Stock bajo"}
              </p>
              <p className={styles.statValue}>{inventorySummary.lowStockCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`adminPanelSurface ${styles.card}`}>
          <CardContent className={`adminPanelContentSurface ${styles.statCard}`}>
            <AlertTriangle className={styles.statIcon} data-variant="error" />
            <div>
              <p className={styles.statLabel}>
                {hasActiveInventoryFilters ? "Sin stock visible" : "Sin stock"}
              </p>
              <p className={styles.statValue}>{inventorySummary.outOfStockCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <AdminPanelCard
            title="Filtros"
            className={styles.card}
            bodyClassName={styles.filtersCardBody}
          >
            <div className={styles.listFilterSection}>
              <Label htmlFor="inventory_query">Busqueda</Label>
              <div className={styles.searchWrap}>
                <Search size={16} className={styles.searchIcon} />
                <Input
                  id="inventory_query"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar producto o SKU"
                  className={styles.searchInput}
                />
              </div>
            </div>

            <Separator className={styles.listFilterSeparator} />

            <div className={styles.listFilterSection}>
              <Label htmlFor="inventory_sort">Orden</Label>
              <Select
                id="inventory_sort"
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value as AdminInventorySort);
                  setPage(1);
                }}
              >
                <option value="stock_asc">Stock: menor a mayor</option>
                <option value="stock_desc">Stock: mayor a menor</option>
                <option value="reorder_desc">Prioridad reposicion</option>
                <option value="name_asc">Nombre A-Z</option>
                <option value="name_desc">Nombre Z-A</option>
              </Select>
            </div>

            <Separator className={styles.listFilterSeparator} />

            <div className={styles.listFilterSection}>
              <Label htmlFor="inventory_filter_status">Estado</Label>
              <Select
                id="inventory_filter_status"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as AdminInventoryStatusFilter);
                  setPage(1);
                }}
              >
                <option value="all">Todos</option>
                <option value="in_stock">En stock</option>
                <option value="low_stock">Stock bajo</option>
                <option value="out_of_stock">Sin stock</option>
                <option value="to_buy">Por comprar</option>
              </Select>
            </div>
          </AdminPanelCard>

          <AdminPanelCard
            title="Ajuste en masa"
            className={styles.card}
            bodyClassName={styles.adjustBody}
            headerRight={
              <div className={styles.bulkHeaderMeta}>
                <Badge variant={selectedCount > 0 ? "secondary" : "outline"}>
                  {selectedCount} seleccionado{selectedCount === 1 ? "" : "s"}
                </Badge>
                {selectedCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setSelectedRowsById({})}
                    disabled={busy}
                  >
                    Limpiar
                  </Button>
                ) : null}
              </div>
            }
          >
            <div className={styles.reasonField}>
              <Label htmlFor="inventory_adjust_reason">Motivo obligatorio</Label>
              <Textarea
                id="inventory_adjust_reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej: Ajuste por conteo fisico del deposito."
                rows={3}
              />
            </div>

            <div className={styles.bulkAdjustRow}>
              <div className={styles.bulkDeltaField}>
                <Label htmlFor="inventory_bulk_delta">Ajuste en masa</Label>
                <Input
                  id="inventory_bulk_delta"
                  value={bulkDelta}
                  onChange={(event) =>
                    setBulkDelta(sanitizeSignedInput(event.target.value))
                  }
                  placeholder="+20 o -10"
                />
              </div>

              <Button type="button" onClick={() => void applyBulkDelta()} disabled={busy}>
                {busy ? "Aplicando..." : "Aplicar a seleccion"}
              </Button>
            </div>
          </AdminPanelCard>
        </aside>

        <div className={styles.contentStack}>
          <AdminPanelCard
            title="Inventario por producto"
            subtitle={
              loading
                ? "Cargando inventario..."
                : inventoryCount > 0
                ? `Mostrando ${pageFrom}-${pageTo} de ${inventoryCount} producto${inventoryCount === 1 ? "" : "s"}.`
                : undefined
            }
            className={styles.card}
            bodyClassName={styles.tableCardBody}
            headerRight={
              <div className={styles.listHeader}>
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAllVisible}
                  aria-label="Seleccionar todos los productos visibles"
                />
                <span>Seleccionar pagina</span>
              </div>
            }
          >
            {error ? <p className={styles.error}>{error}</p> : null}
            {loading ? <p className={styles.muted}>Cargando inventario...</p> : null}

            {!loading && inventory.length === 0 ? (
              <div className={styles.empty}>
                <Warehouse className={styles.emptyIcon} />
                <p className={styles.emptyText}>{emptyInventoryMessage}</p>
              </div>
            ) : null}

            {!loading && inventory.length > 0 ? (
              <>
                <div className={styles.table}>
                  <div className={styles.tableHeader}>
                    <div className={styles.colCheck} />
                    <div className={styles.colProduct}>Producto</div>
                    <div className={styles.colSku}>SKUs</div>
                    <div className={styles.colQty}>Disp.</div>
                    <div className={styles.colQty}>Res.</div>
                    <div className={styles.colQty}>Vend.</div>
                    <div className={styles.colQty}>Umbral</div>
                    <div className={styles.colQty}>Repos.</div>
                    <div className={styles.colStatus}>Estado</div>
                    <div className={styles.colAdjust}>Ajustar</div>
                  </div>

                  {inventory.map((item) => {
                    const rowBusy = busy;
                    const rowDelta = deltaByRow[item.id] ?? "";
                    return (
                      <div key={item.id} className={styles.tableRow}>
                        <div className={styles.colCheck}>
                          <Checkbox
                            checked={selectedSet.has(item.id)}
                            onCheckedChange={(checked) => toggleSelectRow(item, checked)}
                            disabled={rowBusy}
                            aria-label={`Seleccionar ${item.productName}`}
                          />
                        </div>

                        <div className={styles.colProduct}>
                          <div className={styles.productMain}>
                            <strong className={styles.productName}>{item.productName}</strong>
                            <div className={styles.productMetaRow}>
                              <Badge variant={productLifecycleVariant(item)}>
                                {productLifecycleLabel(item)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className={styles.colSku}>
                          <span className={styles.sku} title={skuTitle(item.skuList)}>
                            {item.sku || "-"}
                          </span>
                        </div>
                        <div className={styles.colQty}>{item.availableQty}</div>
                        <div className={styles.colQty}>{item.reservedQty}</div>
                        <div className={styles.colQty}>{item.soldQty}</div>
                        <div className={styles.colQty}>{item.stockThreshold}</div>
                        <div className={styles.colQty}>
                          <span
                            className={cn(
                              styles.reorderValue,
                              item.reorderSuggestedQty > 0 ? styles.reorderValueHot : ""
                            )}
                          >
                            {item.reorderSuggestedQty}
                          </span>
                        </div>
                        <div className={styles.colStatus}>
                          <Badge variant={statusVariant(item)}>{statusLabel(item)}</Badge>
                        </div>

                        <div className={styles.colAdjust}>
                          <div className={styles.adjustInline}>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="outline"
                              onClick={() => void runStockAdjustment([item.id], -1, reason)}
                              disabled={rowBusy}
                              title="Restar 1"
                              aria-label={`Restar 1 a ${item.productName}`}
                            >
                              <Minus size={13} />
                            </Button>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="outline"
                              onClick={() => void runStockAdjustment([item.id], 1, reason)}
                              disabled={rowBusy}
                              title="Sumar 1"
                              aria-label={`Sumar 1 a ${item.productName}`}
                            >
                              <Plus size={13} />
                            </Button>
                            <Input
                              value={rowDelta}
                              onChange={(event) =>
                                setDeltaByRow((prev) => ({
                                  ...prev,
                                  [item.id]: sanitizeSignedInput(event.target.value),
                                }))
                              }
                              className={styles.deltaInput}
                              placeholder="+5"
                            />
                            <Button
                              type="button"
                              size="xs"
                              onClick={() => void applyRowDelta(item)}
                              disabled={rowBusy}
                            >
                              Aplicar
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className={styles.paginationFooter}>
                  <PaginationNav
                    page={page}
                    totalPages={totalPages}
                    disabled={loading}
                    onPageChange={setPage}
                    ariaLabel="Paginacion de inventario"
                  />
                </div>
              </>
            ) : null}
          </AdminPanelCard>
        </div>
      </div>

      {confirmModal}
    </div>
  );
}
