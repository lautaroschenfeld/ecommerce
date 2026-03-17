"use client";

import {
  Download,
  ShieldBan,
  ShieldCheck,
} from "lucide-react";

import { normalizeCustomerRole, type CustomerRole } from "@/lib/account-roles";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import {
  ADMIN_CLIENTS_EMPTY_STATE_MESSAGES,
  resolveAdminEmptyStateMessage,
} from "@/components/admin/admin-empty-state-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { PaginationNav } from "@/components/shared/pagination-nav";
import {
  formatDateTime,
  statusLabel,
  roleLabel,
  orderStatusLabel,
  type ClientSort,
  type StatusFilter,
  type BulkMode,
} from "./page.utils";

import styles from "./page.module.css";
import { useAdminClientesController } from "./use-admin-clientes-controller";
export default function AdminClientesPage() {
  const {
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
    pageSize,
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
  } = useAdminClientesController();
  const emptyClientsMessage = resolveAdminEmptyStateMessage({
    hasActiveFilters,
    hasAnyRecords: hasAnyClients,
    ...ADMIN_CLIENTS_EMPTY_STATE_MESSAGES,
  });
  return (
    <div className={styles.page}>
      <div className={styles.mainGrid}>
        <AdminPanelCard
          title="Filtros"
          className={styles.toolbarCard}
          bodyClassName={styles.toolbarBody}
        >
            <div className={styles.searchField}>
              <Label htmlFor="clients_query">Buscar</Label>
              <Input
                id="clients_query"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOffset(0);
                }}
                placeholder="Buscar cliente"
              />
            </div>

            <div className={styles.filtersRow}>
              <div className={styles.filterField}>
                <Label htmlFor="clients_filter_role">Rol</Label>
                <Select
                  id="clients_filter_role"
                  value={roleFilter}
                  onChange={(event) => {
                    setRoleFilter(event.target.value as "all" | CustomerRole);
                    setOffset(0);
                  }}
                >
                  <option value="all">Todos</option>
                  <option value="administrator">Administrador</option>
                  <option value="employee">Empleado</option>
                  <option value="user">Usuario</option>
                </Select>
              </div>

              <div className={styles.filterField}>
                <Label htmlFor="clients_filter_status">Estado</Label>
                <Select
                  id="clients_filter_status"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as StatusFilter);
                    setOffset(0);
                  }}
                >
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="blocked">Bloqueados</option>
                </Select>
              </div>

              <div className={styles.filterField}>
                <Label htmlFor="clients_filter_from">Alta desde</Label>
                <DateInput
                  id="clients_filter_from"
                  value={createdFrom}
                  onValueChange={(value) => {
                    setCreatedFrom(value);
                    setOffset(0);
                  }}
                />
              </div>

              <div className={styles.filterField}>
                <Label htmlFor="clients_filter_to">Alta hasta</Label>
                <DateInput
                  id="clients_filter_to"
                  value={createdTo}
                  onValueChange={(value) => {
                    setCreatedTo(value);
                    setOffset(0);
                  }}
                />
              </div>

              <div className={styles.filterField}>
                <Label htmlFor="clients_sort">Ordenar por</Label>
                <Select
                  id="clients_sort"
                  value={sortBy}
                  onChange={(event) => {
                    setSortBy(event.target.value as ClientSort);
                    setOffset(0);
                  }}
                >
                  <option value="latest_purchase">Última compra</option>
                  <option value="total_spent">Gasto total</option>
                  <option value="newest">Más reciente</option>
                </Select>
              </div>
            </div>

            <div className={styles.searchActions}>
              <Button
                type="button"
                variant="outline"
                onClick={() => void exportCsv(selectedCount > 0 ? "selected" : "filtered")}
                disabled={loading || exporting || (!rows.length && !selectedCount)}
              >
                <Download size={14} />
                {exporting ? "Exportando..." : "Exportar CSV"}
              </Button>
            </div>
        </AdminPanelCard>

        <AdminPanelCard
          title="Clientes"
          subtitle={
            loading
              ? "Cargando clientes..."
              : rowsCount > 0
              ? `Mostrando ${pageFrom}-${pageTo} de ${rowsCount} cliente${rowsCount === 1 ? "" : "s"}.`
              : undefined
          }
          className={styles.listCard}
          bodyClassName={styles.listBody}
          headerRight={<Badge variant="outline">{rowsCount} total</Badge>}
        >
            {selectedCount > 0 ? (
              <div className={styles.bulkPanel}>
                <div className={styles.bulkTop}>
                  <strong>{selectedCount} seleccionados</strong>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={clearSelection}
                    disabled={bulkBusy}
                  >
                    Limpiar
                  </Button>
                </div>

                <div className={styles.bulkControls}>
                  <div className={styles.bulkModeRow}>
                    <Label htmlFor="clients_bulk_mode">Acción</Label>
                    <Select
                      id="clients_bulk_mode"
                      value={bulkMode}
                      onChange={(event) =>
                        setBulkMode(event.target.value as BulkMode)
                      }
                    >
                      <option value="role">Cambiar rol</option>
                      <option value="status">Cambiar estado</option>
                    </Select>
                  </div>

                  {bulkMode === "role" ? (
                    <div className={styles.bulkModeRow}>
                      <Label htmlFor="clients_bulk_role">Nuevo rol</Label>
                      <Select
                        id="clients_bulk_role"
                        value={bulkRole}
                        onChange={(event) =>
                          setBulkRole(normalizeCustomerRole(event.target.value))
                        }
                      >
                        <option value="administrator">Administrador</option>
                        <option value="employee">Empleado</option>
                        <option value="user">Usuario</option>
                      </Select>
                    </div>
                  ) : (
                    <div className={styles.bulkModeRow}>
                      <Label htmlFor="clients_bulk_status">Nuevo estado</Label>
                      <Select
                        id="clients_bulk_status"
                        value={bulkStatus}
                        onChange={(event) =>
                          setBulkStatus(event.target.value as "active" | "blocked")
                        }
                      >
                        <option value="active">Activo</option>
                        <option value="blocked">Bloqueado</option>
                      </Select>
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    void (bulkMode === "role" ? runBulkRole() : runBulkStatus())
                  }
                  disabled={bulkBusy}
                >
                  {bulkBusy ? "Procesando..." : "Aplicar selección"}
                </Button>
              </div>
            ) : null}

            {error ? <p className={styles.error}>{error}</p> : null}
            {loading ? <p className={styles.muted}>Cargando clientes...</p> : null}
            {!loading && !rows.length ? (
              <p className={styles.muted}>{emptyClientsMessage}</p>
            ) : null}

            {!loading && rows.length > 0 ? (
              <>
                <div className={styles.listHeader}>
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleSelectAllVisible}
                    aria-label="Seleccionar todos los clientes visibles"
                  />
                  <span>Seleccionar pagina</span>
                </div>

                <div className={styles.clientList}>
                  {rows.map((row) => {
                    const selected = row.id === selectedClientId;
                    const rowBusy = Boolean(savingIds[row.id]) || bulkBusy;
                    return (
                      <article
                        key={row.id}
                        className={cn(
                          styles.clientRow,
                          selected ? styles.clientRowSelected : ""
                        )}
                      >
                        <div className={styles.clientHead}>
                          <Checkbox
                            checked={selectedIdSet.has(row.id)}
                            onCheckedChange={(checked) => toggleSelectOne(row, checked)}
                            aria-label={`Seleccionar ${row.fullName}`}
                            disabled={rowBusy}
                          />

                          <button
                            type="button"
                            className={styles.clientOpen}
                            onClick={() => openClientDetail(row.id)}
                          >
                            <span className={styles.clientName}>{row.fullName}</span>
                            <span className={styles.clientEmail}>{row.email}</span>
                          </button>
                        </div>

                        <div className={styles.clientBadges}>
                          <Badge variant="outline">{roleLabel(row.role)}</Badge>
                          <Badge
                            variant={row.status === "blocked" ? "destructive" : "secondary"}
                          >
                            {statusLabel(row.status)}
                          </Badge>
                        </div>

                        <div className={styles.clientStats}>
                          <span>{row.ordersCount} pedidos</span>
                          <span>{formatMoney(row.totalSpentArs)}</span>
                          <span>
                            Última compra:{" "}
                            {row.lastPurchaseAt ? formatDateTime(row.lastPurchaseAt) : "-"}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className={styles.paginationFooter}>
                  <PaginationNav
                    page={currentPage}
                    totalPages={totalPages}
                    disabled={loading}
                    onPageChange={(nextPage) => setOffset((nextPage - 1) * pageSize)}
                    ariaLabel="Paginacion de clientes"
                  />
                </div>
              </>
            ) : null}
        </AdminPanelCard>

      </div>

      <Sheet
        open={detailOpen && Boolean(selectedRow)}
        onOpenChange={(open) => {
          setDetailOpen(open);
        }}
      >
        <SheetContent className={styles.sheet}>
          <SheetHeader className={styles.sheetHeader}>
            <div className={styles.sheetTitleRow}>
              <SheetTitle className={styles.sheetTitleMain}>Ficha del cliente</SheetTitle>
              {selectedRow ? (
                <Badge variant="outline">{selectedRow.id.slice(0, 8)}</Badge>
              ) : null}
            </div>
            {selectedRow ? (
              <p className={styles.muted}>
                {selectedRow.fullName} · {selectedRow.email}
              </p>
            ) : null}
          </SheetHeader>

          <div className={styles.sheetBody}>
            {!selectedRow && !detailLoading ? (
              <p className={styles.muted}>Selecciona un cliente para ver el detalle.</p>
            ) : detailLoading && !selectedRow ? (
              <p className={styles.muted}>Cargando ficha del cliente...</p>
            ) : detailError && !selectedRow ? (
              <p className={styles.error}>{detailError}</p>
            ) : selectedRow ? (
              <>
                {detailError ? <p className={styles.error}>{detailError}</p> : null}
                <section className={styles.detailBlock}>
                  <h3 className={styles.blockTitle}>Contacto y estado</h3>
                  <div className={styles.keyValueGrid}>
                    <p>
                      <strong>Nombre</strong>
                      <span>{selectedRow.fullName}</span>
                    </p>
                    <p>
                      <strong>Email</strong>
                      <span>{selectedRow.email}</span>
                    </p>
                    <p>
                      <strong>Teléfono</strong>
                      <span>{selectedRow.phone || "-"}</span>
                    </p>
                    <p>
                      <strong>WhatsApp</strong>
                      <span>{selectedRow.whatsapp || "-"}</span>
                    </p>
                    <p>
                      <strong>Alta</strong>
                      <span>{formatDateTime(selectedRow.createdAt)}</span>
                    </p>
                    <p>
                      <strong>Última actividad</strong>
                      <span>{formatDateTime(selectedRow.lastActivityAt)}</span>
                    </p>
                  </div>

                  <div className={styles.inlineActions}>
                    <div className={styles.actionField}>
                      <Label htmlFor="client_role_select">Rol</Label>
                      <Select
                        id="client_role_select"
                        value={selectedRow.role}
                        disabled={Boolean(savingIds[selectedRow.id]) || bulkBusy}
                        onChange={(event) =>
                          void handleRoleChange(
                            selectedRow,
                            normalizeCustomerRole(event.target.value)
                          )
                        }
                      >
                        <option value="administrator">Administrador</option>
                        <option value="employee">Empleado</option>
                        <option value="user">Usuario</option>
                      </Select>
                    </div>

                    <Button
                      type="button"
                      variant={
                        selectedRow.status === "blocked" ? "secondary" : "destructive"
                      }
                      onClick={() =>
                        void handleToggleBlocked(
                          selectedRow,
                          selectedRow.status !== "blocked"
                        )
                      }
                      disabled={Boolean(savingIds[selectedRow.id]) || bulkBusy}
                    >
                      {selectedRow.status === "blocked" ? (
                        <>
                          <ShieldCheck size={14} />
                          Reactivar cuenta
                        </>
                      ) : (
                        <>
                          <ShieldBan size={14} />
                          Bloquear cuenta
                        </>
                      )}
                    </Button>

                  </div>

                </section>

                <section className={styles.detailBlock}>
                  <h3 className={styles.blockTitle}>Direcciones</h3>
                  {selectedRow.addresses.length === 0 ? (
                    <p className={styles.muted}>No hay direcciones registradas.</p>
                  ) : (
                    <div className={styles.addressList}>
                      {selectedRow.addresses.map((address, index) => (
                        <article key={`${address.label}-${index}`} className={styles.addressItem}>
                          <p className={styles.addressLabel}>{address.label}</p>
                          <p className={styles.addressLine}>{address.line1 || "-"}</p>
                          <p className={styles.addressLine}>
                            {address.city || "-"} · {address.province || "-"} ·{" "}
                            {address.postalCode || "-"}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className={styles.detailBlock}>
                  <h3 className={styles.blockTitle}>Pedidos y metricas</h3>
                  <div className={styles.metricGrid}>
                    <p>
                      <strong>Pedidos</strong>
                      <span>{selectedRow.ordersCount}</span>
                    </p>
                    <p>
                      <strong>Total gastado</strong>
                      <span>{formatMoney(selectedRow.totalSpentArs)}</span>
                    </p>
                    <p>
                      <strong>Ticket promedio</strong>
                      <span>{formatMoney(selectedRow.avgTicketArs)}</span>
                    </p>
                    <p>
                      <strong>Última compra</strong>
                      <span>{formatDateTime(selectedRow.lastPurchaseAt)}</span>
                    </p>
                  </div>

                  <p className={styles.muted}>
                    {detailOrdersCount > 0
                      ? `Mostrando del ${detailOrdersFrom} al ${detailOrdersTo} de ${detailOrdersCount} pedidos registrados.`
                      : "Sin pedidos registrados para este cliente."}
                  </p>

                  {selectedRow.orders.length > 0 ? (
                    <>
                      <div className={styles.ordersTable}>
                        <div className={styles.ordersHead}>
                          <span className={styles.ordersColOrder}>Pedido</span>
                          <span className={styles.ordersColDate}>Fecha</span>
                          <span className={styles.ordersColStatus}>Estado</span>
                          <span className={styles.ordersColTotal}>Total</span>
                        </div>
                        {selectedRow.orders.map((order) => (
                          <div key={order.id} className={styles.ordersRow}>
                            <span className={styles.ordersColOrder}>#{order.order_number}</span>
                            <span className={styles.ordersColDate}>
                              {formatDateTime(order.created_at)}
                            </span>
                            <span className={styles.ordersColStatus}>
                              {orderStatusLabel(order.status)}
                            </span>
                            <span className={styles.ordersColTotal}>
                              {formatMoney(order.total_ars)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {detailOrdersTotalPages > 1 ? (
                        <div className={styles.paginationFooter}>
                          <PaginationNav
                            page={detailOrdersPage}
                            totalPages={detailOrdersTotalPages}
                            disabled={detailLoading}
                            onPageChange={(nextPage) =>
                              setDetailOrdersOffset((nextPage - 1) * detailOrdersLimit)
                            }
                            ariaLabel="Paginacion de pedidos del cliente"
                          />
                        </div>
                      ) : null}
                    </>
                  ) : detailLoading ? (
                    <p className={styles.muted}>Cargando pedidos del cliente...</p>
                  ) : (
                    <p className={styles.muted}>Sin pedidos registrados.</p>
                  )}
                </section>

                <section className={styles.detailBlock}>
                  <h3 className={styles.blockTitle}>Notas internas</h3>
                  <Textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="Escribe observaciones internas del cliente."
                    rows={4}
                  />
                  <div className={styles.noteActions}>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSaveNote()}
                      disabled={Boolean(selectedRow && savingIds[selectedRow.id]) || bulkBusy}
                    >
                      Guardar nota
                    </Button>
                  </div>
                </section>

                <section className={styles.detailBlock}>
                  <h3 className={styles.blockTitle}>Actividad reciente</h3>
                  <p className={styles.muted}>
                    Se muestra la pagina actual de pedidos junto con eventos persistidos de la cuenta.
                  </p>
                  {selectedTimeline.length === 0 ? (
                    <p className={styles.muted}>
                      {detailLoading ? "Cargando actividad del cliente..." : "Sin actividad registrada."}
                    </p>
                  ) : (
                    <div className={styles.timeline}>
                      {selectedTimeline.map((event) => (
                        <article key={event.id} className={styles.timelineItem}>
                          <p className={styles.timelineTitle}>{event.title}</p>
                          <p className={styles.timelineDetail}>{event.detail}</p>
                          <p className={styles.timelineDate}>{formatDateTime(event.at)}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      {confirmModal}
    </div>
  );
}



