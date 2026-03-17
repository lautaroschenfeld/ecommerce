"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Loader2, Search, Truck, User, X } from "lucide-react";

import { formatMoney } from "@/lib/format";
import {
  fulfillmentStatusUi,
  fulfillmentToneClassKey,
} from "@/lib/fulfillment-status-ui";

import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PaginationNav } from "@/components/shared/pagination-nav";
import {
  PAGE_LIMIT,
  STATUS_FILTER_VALUES,
  formatOrderDate,
  normalizePaymentFilter,
  paymentBadge,
  readCustomerName,
  type SortBy,
} from "./orders-admin-utils";
import {
  ADMIN_ORDERS_EMPTY_STATE_MESSAGES,
  resolveAdminEmptyStateMessage,
} from "./admin-empty-state-utils";

import styles from "./orders-admin.module.css";
import toneStyles from "@/styles/status-tone-chip.module.css";
import { OrdersAdminDetailSheet } from "./orders-admin-detail-sheet";
import { useOrdersAdminController } from "./use-orders-admin-controller";

function fulfillmentBadge(status: unknown) {
  const ui = fulfillmentStatusUi(status);
  return {
    label: ui.label,
    variant: ui.badgeVariant,
    Icon: ui.icon,
    toneClassName: toneStyles[fulfillmentToneClassKey(ui.tone)],
  };
}

export function OrdersAdmin() {
  const {
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
    hasActiveFilters: filtersApplied,
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
  } = useOrdersAdminController();

  const emptyOrdersMessage = resolveAdminEmptyStateMessage({
    hasActiveFilters: filtersApplied,
    hasAnyRecords: hasAnyOrders,
    ...ADMIN_ORDERS_EMPTY_STATE_MESSAGES,
  });

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <AdminPanelCard
          title="Filtros"
          className={styles.filtersCard}
          bodyClassName={styles.panelBody}
          headerRight={
            <AnimatePresence initial={false}>
              {filtersApplied ? (
                <motion.div
                  initial={reduceMotion ? undefined : { y: -4 }}
                  animate={reduceMotion ? undefined : { y: 0 }}
                  exit={reduceMotion ? undefined : { y: -4 }}
                  transition={{ duration: 0.16 }}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={styles.clearButton}
                    onClick={clearFilters}
                  >
                    <X size={16} />
                    Limpiar
                  </Button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          }
        >
            <div className={styles.field}>
              <Label>Estado</Label>
              <Select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setOffset(0);
                }}
                optionAppearance={statusFilterOptionAppearance}
              >
                <option value="all">Todos</option>
                {STATUS_FILTER_VALUES.map((status) => (
                  <option key={status} value={status}>
                    {fulfillmentBadge(status).label}
                  </option>
                ))}
              </Select>
            </div>

            <Separator className={styles.filterSeparator} />

            <div className={styles.field}>
              <Label>Pago</Label>
              <Select
                value={filterPayment}
                onChange={(e) => {
                  setFilterPayment(normalizePaymentFilter(e.target.value));
                  setOffset(0);
                }}
              >
                <option value="all">Todos</option>
                <option value="paid">Pagado</option>
                <option value="pending">Pendiente</option>
                <option value="failed">Fallido</option>
                <option value="refunded">Reintegrado</option>
              </Select>
            </div>

            <Separator className={styles.filterSeparator} />

            <div className={styles.field}>
              <Label>Fecha</Label>
              <div className={styles.dateInputs}>
                <DateInput
                  className={styles.dateField}
                  value={filterFrom}
                  onValueChange={(value) => {
                    setFilterFrom(value);
                    setOffset(0);
                  }}
                  aria-label="Desde"
                  title="Desde"
                />
                <DateInput
                  className={styles.dateField}
                  value={filterTo}
                  onValueChange={(value) => {
                    setFilterTo(value);
                    setOffset(0);
                  }}
                  aria-label="Hasta"
                  title="Hasta"
                />
              </div>
            </div>
        </AdminPanelCard>

        <div className={styles.results}>
          <div className={styles.controls}>
            <div className={styles.searchWrap}>
              <Search size={16} className={styles.searchIcon} />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar orden"
                className={styles.searchField}
              />
            </div>

            <div className={styles.sortWrap}>
              <Select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortBy);
                  setOffset(0);
                }}
              >
                <option value="created_desc">Ordenar: más recientes</option>
                <option value="created_asc">Ordenar: más antiguas</option>
                <option value="total_desc">Ordenar: total mayor a menor</option>
                <option value="total_asc">Ordenar: total menor a mayor</option>
              </Select>
            </div>
          </div>

          <div className={styles.paginationBar}>
            {loading || ordersCount > 0 ? (
              <p className={styles.paginationMeta}>
                {loading
                  ? "Cargando ordenes..."
                  : `Mostrando del ${pageFrom} al ${pageTo} de ${ordersCount} órdenes.`}
              </p>
            ) : null}
          </div>

          {loading ? (
            <Card className={`adminPanelSurface ${styles.emptyCard}`}>
              <CardContent className={`adminPanelContentSurface ${styles.emptyInner}`}>
                <p className={styles.muted}>
                  <Loader2 size={16} className={styles.spin} /> Cargando órdenes...
                </p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card className={`adminPanelSurface ${styles.emptyCard}`}>
              <CardContent className={`adminPanelContentSurface ${styles.emptyInner}`}>
                <p>{error}</p>
                <Button type="button" onClick={() => void refreshOrders()}>
                  Reintentar
                </Button>
              </CardContent>
            </Card>
          ) : orders.length === 0 ? (
            <Card className={`adminPanelSurface ${styles.emptyCard}`}>
              <CardContent className={`adminPanelContentSurface ${styles.emptyInner}`}>
                <p className={styles.muted}>{emptyOrdersMessage}</p>
              </CardContent>
            </Card>
          ) : (
            orders.map((order) => {
              const payment = paymentBadge(order.payment_status, order.payment_method);
              const fulfillment = fulfillmentBadge(order.status);
              const customerName = readCustomerName(order);

              return (
                <Card
                  key={order.id}
                  className={`adminPanelSurface ${styles.orderCard}`}
                  onClick={() => openOrder(order.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    openOrder(order.id);
                  }}
                >
                  <CardContent className={styles.orderRow}>
                    <div className={styles.orderMain}>
                      <p className={styles.orderNumber}>{order.order_number}</p>
                      <div className={styles.orderMeta}>
                        <span className={styles.metaItem}>
                          <User size={15} />
                          {customerName}
                        </span>
                        <span className={styles.metaItem}>
                          <Calendar size={15} />
                          {formatOrderDate(order.created_at)}
                        </span>
                        <span className={styles.metaItem}>
                          <Truck size={15} />
                          {order.item_count} item{order.item_count === 1 ? "" : "s"}{" - "}
                          {formatMoney(order.total_ars)}
                        </span>
                      </div>
                    </div>

                    <div className={styles.badges}>
                      <Badge variant={payment.variant}>{payment.label}</Badge>
                      <Badge
                        variant={fulfillment.variant}
                        className={`${toneStyles.statusToneChip} ${fulfillment.toneClassName}`}
                      >
                        <fulfillment.Icon size={14} />
                        {fulfillment.label}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          {!error ? (
            <div className={styles.paginationFooter}>
              <PaginationNav
                page={currentPage}
                totalPages={totalPages}
                disabled={loading}
                onPageChange={(nextPage) => setOffset((nextPage - 1) * PAGE_LIMIT)}
                ariaLabel="Paginación de órdenes"
              />
            </div>
          ) : null}
        </div>
      </div>

      <OrdersAdminDetailSheet
        activeOrderId={activeOrderId}
        closeOrder={closeOrder}
        detail={detail}
        detailOrder={detailOrder}
        detailLoading={detailLoading}
        detailError={detailError}
        trackingDraft={trackingDraft}
        setTrackingDraft={setTrackingDraft}
        notesDraft={notesDraft}
        setNotesDraft={setNotesDraft}
        saving={saving}
        downloadingInvoiceOrderId={downloadingInvoiceOrderId}
        copyToClipboard={copyToClipboard}
        downloadInvoice={downloadInvoice}
        primaryActionLabel={primaryActionLabel}
        timelinePreview={timelinePreview}
        saveNotes={saveNotes}
        saveTracking={saveTracking}
        advancePrimaryAction={advancePrimaryAction}
      />
      {confirmModal}
    </div>
  );
}
