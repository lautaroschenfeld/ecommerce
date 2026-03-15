"use client";

import Link from "next/link";
import { Clipboard, FileText, Loader2 } from "lucide-react";

import { formatMoney } from "@/lib/format";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  FULFILLMENT_STEPS,
  addressAlerts,
  buildTransferProofAdminUrl,
  formatOrderDate,
  humanizeTimelineEvent,
  readCustomerName,
  readShippingAddress,
  readTransferProofFiles,
  stepIndexForStatus,
  stockFlag,
} from "./orders-admin-utils";
import type { useOrdersAdminController } from "./use-orders-admin-controller";
import styles from "./orders-admin.module.css";

type OrdersAdminController = ReturnType<typeof useOrdersAdminController>;

type OrdersAdminDetailSheetProps = Pick<
  OrdersAdminController,
  | "activeOrderId"
  | "closeOrder"
  | "detail"
  | "detailOrder"
  | "detailLoading"
  | "detailError"
  | "trackingDraft"
  | "setTrackingDraft"
  | "notesDraft"
  | "setNotesDraft"
  | "saving"
  | "downloadingInvoiceOrderId"
  | "copyToClipboard"
  | "downloadInvoice"
  | "primaryActionLabel"
  | "timelinePreview"
  | "saveNotes"
  | "saveTracking"
  | "advancePrimaryAction"
>;

export function OrdersAdminDetailSheet({
  activeOrderId,
  closeOrder,
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
}: OrdersAdminDetailSheetProps) {
  const dismissible = !saving;

  return (
    <Sheet
      open={Boolean(activeOrderId)}
      onOpenChange={(open) => {
        if (open || !dismissible) return;
        closeOrder();
      }}
    >
      <SheetContent className={styles.sheet} dismissible={dismissible}>
        <SheetHeader>
          <SheetTitle className={styles.sheetTitle}>
            <span className={styles.sheetTitleText}>
              {detailOrder?.order_number ? `Orden ${detailOrder.order_number}` : "Orden"}
            </span>
            {detailOrder?.order_number ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => void copyToClipboard(detailOrder.order_number, "Orden")}
                title="Copiar orden"
                aria-label="Copiar número de orden"
              >
                <Clipboard size={16} />
              </Button>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {detailOrder ? `${readCustomerName(detailOrder)} - ${formatMoney(detailOrder.total_ars)}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className={styles.sheetBody}>
          {detailLoading ? (
            <Card>
              <CardContent className={`adminPanelContentSurface ${styles.emptyInner}`}>
                <p className={styles.muted}>
                  <Loader2 size={16} className={styles.spin} /> Cargando detalle...
                </p>
              </CardContent>
            </Card>
          ) : detailError ? (
            <Card>
              <CardContent className={`adminPanelContentSurface ${styles.emptyInner}`}>
                <p>{detailError}</p>
              </CardContent>
            </Card>
          ) : !detailOrder ? (
            <Card>
              <CardContent className={`adminPanelContentSurface ${styles.emptyInner}`}>
                <p className={styles.muted}>Selecciona una orden para ver el detalle.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <section className={styles.sheetBlock}>
                <div className={styles.sheetBlockHeader}>
                  <h3 className={styles.sheetBlockTitle}>Datos de la orden</h3>
                </div>

                <div className={styles.tagRow}>
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.copyButton}
                    title="Descargar comprobante interno en PDF"
                    onClick={() => void downloadInvoice(detailOrder)}
                    disabled={downloadingInvoiceOrderId === detailOrder.id}
                  >
                    {downloadingInvoiceOrderId === detailOrder.id ? (
                      <Loader2 size={15} className={styles.spin} />
                    ) : (
                      <FileText size={15} />
                    )}
                    {downloadingInvoiceOrderId === detailOrder.id
                      ? "Descargando..."
                      : "Descargar comprobante"}
                  </Button>

                  {(() => {
                    const files = readTransferProofFiles(detailOrder);
                    if (!files.length) return null;

                    const latest = files[files.length - 1]!;
                    const url = buildTransferProofAdminUrl(detailOrder.id, latest.id);
                    const label =
                      files.length === 1
                        ? "Ver comprobante"
                        : `Ver comprobante (${files.length})`;

                    return (
                      <Button
                        asChild
                        variant="outline"
                        className={styles.copyButton}
                        title="Ver comprobante de transferencia"
                      >
                        <a href={url} target="_blank" rel="noreferrer">
                          <FileText size={15} />
                          {label}
                        </a>
                      </Button>
                    );
                  })()}
                </div>

                {(() => {
                  const activeIndex = stepIndexForStatus(detailOrder.status);
                  return (
                    <div className={styles.stepper}>
                      {FULFILLMENT_STEPS.map((step, index) => {
                        const isDone = activeIndex >= 0 && index < activeIndex;
                        const isCurrent = activeIndex >= 0 && index === activeIndex;
                        const rowStateClass = isCurrent
                          ? styles.stepRowCurrent
                          : isDone
                            ? styles.stepRowDone
                            : styles.stepRowPending;

                        return (
                          <div key={step.key} className={`${styles.stepRow} ${rowStateClass}`}>
                            <div className={styles.stepRail} aria-hidden>
                              <span
                                className={`${styles.stepDot} ${isCurrent ? styles.stepDotCurrent : ""}`}
                              />
                              {index < FULFILLMENT_STEPS.length - 1 ? (
                                <span className={styles.stepConnector} />
                              ) : null}
                            </div>

                            <div className={styles.stepText}>
                              <span className={styles.stepLabel}>{step.label}</span>
                              {step.desc ? <span className={styles.stepDesc}>{step.desc}</span> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {primaryActionLabel ? (
                  <Button
                    type="button"
                    onClick={() => void advancePrimaryAction()}
                    disabled={saving}
                    className={styles.primaryActionButton}
                  >
                    {saving ? "Guardando..." : primaryActionLabel}
                  </Button>
                ) : null}
              </section>

              <Separator />

              <section className={styles.sheetBlock}>
                <div className={styles.sheetBlockHeader}>
                  <h3 className={styles.sheetBlockTitle}>Cliente</h3>
                </div>

                <div className={styles.sheetBlock}>
                  <p>
                    <strong>{readCustomerName(detailOrder)}</strong>
                  </p>
                  <div className={styles.valueRow}>
                    <span className={`${styles.valueText} ${styles.muted}`}>
                      {detailOrder.email ? detailOrder.email : "Sin email"}
                    </span>
                    {detailOrder.email ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => void copyToClipboard(detailOrder.email ?? "", "Email")}
                        title="Copiar email"
                        aria-label="Copiar email"
                      >
                        <Clipboard size={16} />
                      </Button>
                    ) : null}
                  </div>

                  <div className={styles.valueRow}>
                    <span className={`${styles.valueText} ${styles.muted}`}>
                      {detailOrder.phone ? detailOrder.phone : "Sin teléfono"}
                    </span>
                    {detailOrder.phone ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => void copyToClipboard(detailOrder.phone ?? "", "Teléfono")}
                        title="Copiar teléfono"
                        aria-label="Copiar teléfono"
                      >
                        <Clipboard size={16} />
                      </Button>
                    ) : null}
                  </div>
                </div>

                {(() => {
                  const address = readShippingAddress(detailOrder);
                  const alerts = addressAlerts(address);
                  const addressLine = `${address.line1}${address.line2 ? `, ${address.line2}` : ""}`.trim();
                  const cityLine = `${address.city}${address.province ? `, ${address.province}` : ""}${
                    address.postalCode ? ` ${address.postalCode}` : ""
                  }`.trim();
                  return (
                    <div className={styles.sheetBlock}>
                      <div>
                        <p>{addressLine || <span className={styles.muted}>Dirección sin completar</span>}</p>
                        <p className={styles.muted}>{cityLine || ""}</p>
                      </div>

                      <div className={styles.tagRow}>
                        {alerts.incomplete ? (
                          <Badge variant="destructive">Dirección incompleta</Badge>
                        ) : null}
                        {alerts.invalidPostal ? <Badge variant="destructive">CP inválido</Badge> : null}
                      </div>
                    </div>
                  );
                })()}
              </section>

              <Separator />

              <section className={styles.sheetBlock}>
                <div className={styles.sheetBlockHeader}>
                  <h3 className={styles.sheetBlockTitle}>Items</h3>
                  <Badge variant="secondary">{detailOrder.item_count} items</Badge>
                </div>

                <div className={styles.sheetBlock}>
                  {(detailOrder.items ?? []).length ? (
                    (detailOrder.items ?? []).map((item) => {
                      const sku = detail?.item_skus?.[item.id] ?? "";
                      const stock = detail?.item_stock?.[item.id];
                      const flag = stockFlag(stock);
                      return (
                        <div key={`${detailOrder.id}:${item.id}`} className={styles.tagRow}>
                          <span>
                            <strong>{item.qty}x</strong> {item.name}
                            {sku ? <span className={styles.muted}>{" - "}SKU {sku}</span> : null}
                          </span>
                          {flag ? <Badge variant={flag.variant}>{flag.label}</Badge> : null}
                        </div>
                      );
                    })
                  ) : (
                    <p className={styles.muted}>No hay detalle de items.</p>
                  )}
                </div>
              </section>

              <Separator />

              <section className={styles.sheetBlock}>
                <div className={styles.sheetBlockHeader}>
                  <h3 className={styles.sheetBlockTitle}>Envío</h3>
                </div>

                <div className={styles.field}>
                  <Label>Método</Label>
                  <p className={styles.muted}>{detailOrder.shipping_method || "No definido"}</p>
                </div>

                <div className={styles.field}>
                  <Label htmlFor="order_tracking_input">Tracking</Label>
                  <div className={styles.valueRow}>
                    <span className={`${styles.valueText} ${styles.muted}`}>
                      {trackingDraft.trim() ? trackingDraft.trim() : "Sin tracking"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => void copyToClipboard(trackingDraft, "Tracking")}
                      disabled={!trackingDraft.trim()}
                      title="Copiar tracking"
                      aria-label="Copiar tracking"
                    >
                      <Clipboard size={16} />
                    </Button>
                  </div>
                  <Input
                    id="order_tracking_input"
                    value={trackingDraft}
                    onChange={(e) => setTrackingDraft(e.target.value)}
                    placeholder="Ej: 1Z999..."
                    disabled={saving}
                  />
                  <Button type="button" variant="outline" onClick={() => void saveTracking()} disabled={saving}>
                    {saving ? "Guardando..." : "Guardar tracking"}
                  </Button>
                </div>
              </section>

              <Separator />

              <section className={styles.sheetBlock}>
                <div className={styles.sheetBlockHeader}>
                  <h3 className={styles.sheetBlockTitle}>Notas internas</h3>
                  <Button type="button" variant="outline" onClick={() => void saveNotes()} disabled={saving}>
                    {saving ? "Guardando..." : "Guardar"}
                  </Button>
                </div>

                <div className={styles.field}>
                  <Label htmlFor="order_admin_notes">Notas internas</Label>
                  <Textarea
                    id="order_admin_notes"
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={4}
                    disabled={saving}
                  />
                </div>
              </section>

              <Separator />

              <section className={styles.sheetBlock}>
                <div className={styles.sheetBlockHeader}>
                  <h3 className={styles.sheetBlockTitle}>Actividad reciente</h3>
                  <Button asChild variant="ghost">
                    <Link href={`/cuenta/administracion/ordenes/${encodeURIComponent(detailOrder.id)}`}>
                      Ver detalle de la orden
                    </Link>
                  </Button>
                </div>

                {timelinePreview.length ? (
                  <div className={styles.timeline}>
                    {timelinePreview.map((event) => (
                      <div key={event.id || event.at} className={styles.timelineItem}>
                        <strong>{humanizeTimelineEvent(event, detailOrder?.payment_method)}</strong>
                        <span className={styles.muted}>{event.at ? formatOrderDate(event.at) : ""}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.muted}>Todavía no hay eventos registrados.</p>
                )}
              </section>
            </>
          )}
        </div>

        <SheetFooter />
      </SheetContent>
    </Sheet>
  );
}
