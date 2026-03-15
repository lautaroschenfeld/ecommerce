"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Loader2,
  Navigation,
  Package,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  Truck,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { MoneyAmount } from "@/components/ui/money-amount";
import { CustomerAccountLayout } from "@/components/shared/customer-account-layout";
import { Button } from "@/components/ui/button";
import { useCustomerOrders } from "@/lib/customer-auth";
import {
  fulfillmentStatusUi,
  fulfillmentToneClassKey,
  parseFulfillmentStatus,
} from "@/lib/fulfillment-status-ui";
import { downloadOrderInvoicePdf } from "@/lib/store-order-invoice";
import { mapFriendlyError } from "@/lib/user-facing-errors";
import styles from "./customer-account-orders-page.module.css";
import toneStyles from "@/styles/status-tone-chip.module.css";

function formatOrderDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

const SHIPPING_STEPS = [
  {
    key: "processing",
    label: "Orden recibida",
    desc: "Tu orden ingreso al sistema.",
  },
  {
    key: "preparing",
    label: "En preparacion",
    desc: "Estamos preparando tus productos.",
  },
  {
    key: "ready_to_dispatch",
    label: "Lista para despacho",
    desc: "Orden lista para salir.",
  },
  {
    key: "dispatched",
    label: "Despachada / Enviada",
    desc: "La orden ya fue despachada.",
  },
  {
    key: "in_transit",
    label: "En transito",
    desc: "El envío está en camino.",
  },
  {
    key: "out_for_delivery",
    label: "En reparto",
    desc: "Se entrega hoy.",
  },
  {
    key: "ready_pickup",
    label: "Lista para retiro",
    desc: "Ya podés retirarla.",
  },
  {
    key: "delivered",
    label: "Entregada",
    desc: "Pedido completado.",
  },
] as const;

type ShippingStepKey = (typeof SHIPPING_STEPS)[number]["key"];
const SHIPPING_STEP_KEYS = new Set<ShippingStepKey>(
  SHIPPING_STEPS.map((step) => step.key)
);

function canonicalStepKey(status: string): ShippingStepKey | "cancelled" | null {
  const parsed = parseFulfillmentStatus(status);
  if (!parsed) return null;
  if (parsed === "cancelled") return parsed;
  if (SHIPPING_STEP_KEYS.has(parsed as ShippingStepKey)) {
    return parsed as ShippingStepKey;
  }
  return null;
}

function statusMeta(status: string) {
  const ui = fulfillmentStatusUi(status, {
    readyPickupLabel: "pickup",
    dispatchedLabel: "long",
  });
  return {
    label: ui.label,
    icon: ui.icon,
    toneClassName: toneStyles[fulfillmentToneClassKey(ui.tone)],
  };
}

function stepTone(key: ShippingStepKey): {
  rgbVar: string;
  strongRgbVar: string;
} {
  if (key === "delivered") {
    return {
      rgbVar: "var(--ui-status-success-rgb)",
      strongRgbVar: "var(--ui-status-success-strong-rgb)",
    };
  }
  if (key === "out_for_delivery") {
    return {
      rgbVar: "var(--ui-status-warning-rgb)",
      strongRgbVar: "var(--ui-status-warning-strong-rgb)",
    };
  }
  if (key === "in_transit") {
    return {
      rgbVar: "var(--ui-status-info-rgb)",
      strongRgbVar: "var(--ui-status-info-strong-rgb)",
    };
  }
  if (key === "dispatched") {
    return {
      rgbVar: "var(--ui-status-indigo-rgb)",
      strongRgbVar: "var(--ui-status-indigo-strong-rgb)",
    };
  }
  if (key === "ready_to_dispatch" || key === "ready_pickup") {
    return {
      rgbVar: "var(--ui-status-blue-rgb)",
      strongRgbVar: "var(--ui-status-blue-strong-rgb)",
    };
  }
  if (key === "preparing") {
    return {
      rgbVar: "var(--ui-status-orange-rgb)",
      strongRgbVar: "var(--ui-status-orange-strong-rgb)",
    };
  }
  return {
    rgbVar: "var(--ui-status-neutral-rgb)",
    strongRgbVar: "var(--ui-status-neutral-strong-rgb)",
  };
}

function stepIconForKey(key: ShippingStepKey) {
  if (key === "delivered") return CheckCircle2;
  if (key === "ready_pickup") return Package;
  if (key === "out_for_delivery") return Navigation;
  if (key === "in_transit") return Truck;
  if (key === "dispatched") return Truck;
  if (key === "ready_to_dispatch") return PackageCheck;
  if (key === "preparing") return PackageOpen;
  return Clock3;
}

function stepIndexForStatus(status: string) {
  const key = canonicalStepKey(status);
  if (!key || key === "cancelled") return -1;
  return SHIPPING_STEPS.findIndex((step) => step.key === key);
}

function extractTimelineStatusKey(event: {
  type: string;
  message: string;
}) {
  const type = String(event.type || "").trim().toLowerCase();
  if (type !== "order.status.changed") return null;

  const message = String(event.message || "").trim();
  if (!message) return null;

  const marker = "estado actualizado a";
  const markerIndex = message.toLowerCase().indexOf(marker);
  if (markerIndex < 0) return null;

  const rawStatus = message.slice(markerIndex + marker.length).trim();
  if (!rawStatus) return null;

  const key = canonicalStepKey(rawStatus);
  return key && key !== "cancelled" ? key : null;
}

function resolveCompletedSteps(order: {
  status: string;
  timeline: Array<{ type: string; message: string }>;
}) {
  const completed = new Set<ShippingStepKey>();
  let hasTimelineStatuses = false;

  for (const event of order.timeline) {
    const stepKey = extractTimelineStatusKey(event);
    if (!stepKey) continue;
    completed.add(stepKey);
    hasTimelineStatuses = true;
  }

  const currentKey = canonicalStepKey(order.status);
  if (currentKey && currentKey !== "cancelled") {
    completed.add(currentKey);
  }

  // Fallback when old orders do not yet have timeline metadata.
  if (!hasTimelineStatuses) {
    const currentIndex = stepIndexForStatus(order.status);
    if (currentIndex >= 0) {
      for (let index = 0; index <= currentIndex; index += 1) {
        const step = SHIPPING_STEPS[index];
        if (step) completed.add(step.key);
      }
    }
  }

  return completed;
}

const RETRY_FEEDBACK_MS = 3000;

export function CustomerAccountOrdersPage() {
  const searchParams = useSearchParams();
  const { orders, loading, error, refetch } = useCustomerOrders();
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);
  const [downloadErrorOrderId, setDownloadErrorOrderId] = useState<string | null>(null);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);
  const orderRowRefs = useRef<Record<string, HTMLDetailsElement | null>>({});
  const autoOpenedOrderIdRef = useRef<string | null>(null);

  const highlightedOrderId = searchParams.get("orderId")?.trim() || "";

  const visibleError = error ?? (retrying ? retryMessage : null);

  useEffect(() => {
    if (!highlightedOrderId || loading || orders.length === 0) return;
    if (autoOpenedOrderIdRef.current === highlightedOrderId) return;

    const row = orderRowRefs.current[highlightedOrderId];
    if (!row) return;

    row.open = true;
    row.scrollIntoView({ behavior: "smooth", block: "start" });
    autoOpenedOrderIdRef.current = highlightedOrderId;
  }, [highlightedOrderId, loading, orders]);

  async function handleRetry() {
    if (retrying) return;
    setRetryMessage(error);
    setRetrying(true);
    await Promise.all([
      refetch(),
      new Promise((resolve) => globalThis.setTimeout(resolve, RETRY_FEEDBACK_MS)),
    ]);
    setRetrying(false);
    setRetryMessage(null);
  }

  async function handleDownloadInvoice(orderId: string, orderNumber: string) {
    if (downloadingOrderId) return;
    setDownloadErrorOrderId(null);
    setDownloadErrorMessage(null);
    setDownloadingOrderId(orderId);
    try {
      await downloadOrderInvoicePdf(orderId, orderNumber);
    } catch (downloadError) {
      const message = mapFriendlyError(
        downloadError,
        "No se pudo descargar el comprobante interno."
      );
      setDownloadErrorOrderId(orderId);
      setDownloadErrorMessage(message);
    } finally {
      setDownloadingOrderId(null);
    }
  }

  return (
    <CustomerAccountLayout
      tab="orders"
      title="Pedidos"
      subtitle="Historial completo de órdenes, pagos y seguimiento."
    >
      {() => {
        if (loading && !visibleError) {
          return (
            <Card>
              <CardContent className={styles.empty}>
                <p className={styles.emptyMessage}>Cargando pedidos...</p>
              </CardContent>
            </Card>
          );
        }

        if (visibleError) {
          return (
            <Card>
              <CardContent className={styles.empty}>
                <p className={styles.emptyMessage}>{visibleError}</p>
                <Button type="button" onClick={() => void handleRetry()} disabled={retrying}>
                  <RefreshCw size={16} className={retrying ? styles.spin : ""} />
                  {retrying ? "Reintentando..." : "Reintentar"}
                </Button>
              </CardContent>
            </Card>
          );
        }

        if (orders.length === 0) {
          return (
            <Card>
              <CardContent className={styles.empty}>
                <p className={styles.emptyMessage}>
                  Todavía no registramos pedidos en tu cuenta.
                </p>
              </CardContent>
            </Card>
          );
        }

        return (
          <div className={styles.stack}>
            {orders.map((order) => {
              const meta = statusMeta(order.status);
              const StatusIcon = meta.icon;
              const currentStep = stepIndexForStatus(order.status);
              const isCancelled = canonicalStepKey(order.status) === "cancelled";
              const completedSteps = resolveCompletedSteps(order);
              const furthestCompletedStep = Array.from(completedSteps).reduce(
                (maxStep, stepKey) => {
                  const stepIndex = SHIPPING_STEPS.findIndex((step) => step.key === stepKey);
                  return stepIndex > maxStep ? stepIndex : maxStep;
                },
                -1
              );
              const activeStep = Math.max(currentStep, furthestCompletedStep);
              const progressPercent = isCancelled
                ? 0
                : Math.max(
                    0,
                    Math.min(
                      100,
                      ((Math.max(activeStep, 0) /
                        Math.max(SHIPPING_STEPS.length - 1, 1)) *
                        100)
                    )
                  );
              const progressFillStyle = {
                "--progress-fill-width": `${progressPercent}%`,
              } as CSSProperties;
              return (
                <details
                  key={order.id}
                  className={styles.orderRow}
                  ref={(node) => {
                    orderRowRefs.current[order.id] = node;
                  }}
                >
                  <summary className={styles.orderSummary}>
                    <div className={styles.summaryGrid}>
                      <div className={styles.summaryCol}>
                        <span className={styles.colLabel}>Fecha</span>
                        <strong>{formatOrderDateTime(new Date(order.createdAt).getTime())}</strong>
                        <span className={styles.orderNumber}>{order.orderNumber}</span>
                      </div>

                      <div className={styles.summaryCol}>
                        <span className={styles.colLabel}>Productos</span>
                        <strong>
                          {order.itemCount} producto{order.itemCount === 1 ? "" : "s"}
                        </strong>
                      </div>

                      <div className={styles.summaryCol}>
                        <span className={styles.colLabel}>Total</span>
                        <strong>
                          <MoneyAmount value={order.totalArs} />
                        </strong>
                      </div>

                      <div className={styles.summaryCol}>
                        <span className={styles.colLabel}>Estado del pedido</span>
                        <span className={`${styles.statusChip} ${toneStyles.statusToneChip} ${meta.toneClassName}`}>
                          <StatusIcon size={14} />
                          {meta.label}
                        </span>
                      </div>
                    </div>
                    <span className={styles.toggleIcon} aria-hidden>
                      <ChevronDown size={16} />
                    </span>
                  </summary>

                  <div className={styles.orderDetails}>
                    <div className={styles.actionsRow}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={styles.downloadButton}
                        onClick={() => void handleDownloadInvoice(order.id, order.orderNumber)}
                        disabled={downloadingOrderId === order.id}
                      >
                        {downloadingOrderId === order.id ? (
                          <Loader2 size={14} className={styles.spin} />
                        ) : (
                          <FileText size={14} />
                        )}
                        {downloadingOrderId === order.id
                          ? "Descargando comprobante..."
                          : "Descargar comprobante PDF"}
                      </Button>
                      {downloadErrorOrderId === order.id && downloadErrorMessage ? (
                        <p className={styles.downloadError}>{downloadErrorMessage}</p>
                      ) : null}
                    </div>

                    {!isCancelled ? (
                      <div className={styles.progressWrap}>
                        <div className={styles.progressTrack}>
                          <div
                            className={styles.progressFill}
                            style={progressFillStyle}
                          />
                        </div>
                        <div
                          className={styles.progressSteps}
                          style={
                            {
                              "--steps-count": String(SHIPPING_STEPS.length),
                            } as CSSProperties
                          }
                        >
                          {SHIPPING_STEPS.map((step, index) => {
                            const isCurrent = index === currentStep;
                            const isDone = completedSteps.has(step.key);
                            const StepIcon = stepIconForKey(step.key);
                            const tone = stepTone(step.key);
                            return (
                              <article
                                key={`${order.id}:${step.key}`}
                                className={
                                  isCurrent
                                    ? `${styles.progressNode} ${styles.progressNodeCurrent}`
                                    : isDone
                                      ? `${styles.progressNode} ${styles.progressNodeDone}`
                                      : `${styles.progressNode} ${styles.progressNodePending}`
                                }
                                tabIndex={0}
                                aria-label={`${step.label}: ${step.desc}`}
                                title={step.label}
                                style={
                                  {
                                    "--step-rgb": tone.rgbVar,
                                    "--step-strong-rgb": tone.strongRgbVar,
                                  } as CSSProperties
                                }
                              >
                                <div className={styles.progressNodePill}>
                                  <span className={styles.progressNodeCircle}>
                                    <StepIcon size={13} />
                                  </span>
                                  <span className={styles.progressNodeText}>{step.label}</span>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className={styles.cancelledNote}>
                        Este pedido fue cancelado. No hay avances de entrega.
                      </p>
                    )}

                    <div className={styles.itemsSection}>
                      <h3 className={styles.itemsTitle}>
                        {order.itemCount} PRODUCTO{order.itemCount === 1 ? "" : "S"}
                      </h3>
                      {order.items.length > 0 ? (
                        <div className={styles.itemsList}>
                          {order.items.map((item) => (
                            <article key={`${order.id}:${item.id}`} className={styles.itemRow}>
                              <div className={styles.itemMain}>
                                <strong>{item.name}</strong>
                                <span>
                                  {item.brand} - {item.category}
                                </span>
                              </div>
                              <div className={styles.itemQty}>x{item.qty}</div>
                              <div className={styles.itemTotal}>
                                <MoneyAmount value={item.qty * item.unitPriceArs} />
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.noItems}>No hay detalle de productos para este pedido.</p>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        );
      }}
    </CustomerAccountLayout>
  );
}

