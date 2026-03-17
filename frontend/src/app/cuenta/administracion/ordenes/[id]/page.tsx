"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Loader2,
} from "lucide-react";

import { formatMoney } from "@/lib/format";
import { downloadOrderInvoicePdf } from "@/lib/store-order-invoice";
import { getAdminOrder, type AdminOrderDetail } from "@/lib/store-admin-orders";
import { mapFriendlyError } from "@/lib/user-facing-errors";
import {
  fulfillmentStatusLabel,
  fulfillmentStatusUi,
  fulfillmentToneClassKey,
  parseFulfillmentStatus,
} from "@/lib/fulfillment-status-ui";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import styles from "./page.module.css";
import toneStyles from "@/styles/status-tone-chip.module.css";

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function readString(obj: Record<string, unknown> | null, key: string) {
  const raw = obj?.[key];
  return typeof raw === "string" ? raw : "";
}

function formatDateTime(timestamp: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function normalizePaymentStatus(value: unknown) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "pending";
  return raw;
}

function isBankTransfer(paymentMethod: unknown) {
  const raw = typeof paymentMethod === "string" ? paymentMethod.trim().toLowerCase() : "";
  if (!raw) return false;
  return raw.includes("transfer");
}

function humanizeFulfillmentStatus(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  const parsed = parseFulfillmentStatus(raw);
  if (!parsed) return raw;
  return fulfillmentStatusLabel(parsed, {
    readyPickupLabel: "dispatch",
    dispatchedLabel: "long",
  });
}

function humanizePaymentStatus(value: string, paymentMethod: unknown) {
  const key = normalizePaymentStatus(value);
  if (key === "paid") return "Pagado";
  if (key === "failed") return "Fallido";
  if (key === "pending") {
    return isBankTransfer(paymentMethod) ? "Pendiente de aprobacion" : "Pendiente";
  }
  return value.trim();
}

function extractTimelineValue(message: string, prefix: string) {
  const msg = message.trim();
  if (!msg) return "";
  const lower = msg.toLowerCase();
  const needle = prefix.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return "";
  const raw = msg.slice(idx + prefix.length).trim();
  return raw.replace(/[.!?]+$/, "").trim();
}

function humanizeTimelineEvent(
  event: { type: string; message: string },
  order: { payment_method?: string | null }
) {
  const type = (event.type ?? "").trim();
  const message = (event.message ?? "").trim();

  if (type === "order.status.changed") {
    const next = extractTimelineValue(message, "Estado actualizado a");
    return next ? `Estado actualizado: ${humanizeFulfillmentStatus(next)}` : "Estado actualizado.";
  }

  if (type === "order.payment.changed") {
    const next = extractTimelineValue(message, "Pago actualizado a");
    return next
      ? `Pago actualizado: ${humanizePaymentStatus(next, order.payment_method)}`
      : "Pago actualizado.";
  }

  if (type === "order.tracking.changed") return message || "Tracking actualizado.";
  if (type === "order.note.updated") return message || "Nota interna actualizada.";
  if (type === "order.tags.updated") return message || "Etiquetas actualizadas.";

  return message || type || "Evento.";
}

function fulfillmentBadgeUi(status: string) {
  const ui = fulfillmentStatusUi(status, {
    readyPickupLabel: "dispatch",
    dispatchedIcon: "send",
  });
  return {
    label: ui.label,
    variant: ui.badgeVariant,
    Icon: ui.icon,
    toneClassName: toneStyles[fulfillmentToneClassKey(ui.tone)],
  };
}

export default function AdminOrdenDetallePage({ params }: { params: { id: string } }) {
  const orderId = decodeURIComponent(params.id);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void getAdminOrder(orderId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(mapFriendlyError(e, "No se pudo cargar la orden."));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  type TimelineItem = {
    id: string;
    at: string;
    type: string;
    message: string;
  };

  const timeline = useMemo(() => {
    const meta = asRecord(detail?.order?.metadata);
    const raw = meta?.timeline;
    if (!Array.isArray(raw)) return [];

    return raw
      .map((entry) => {
        const rec = asRecord(entry);
        if (!rec) return null;
        return {
          id: readString(rec, "id"),
          at: readString(rec, "at"),
          type: readString(rec, "type"),
          message: readString(rec, "message"),
        };
      })
      .filter((item): item is TimelineItem => Boolean(item?.at && (item.message || item.type)))
      .slice()
      .reverse();
  }, [detail?.order?.metadata]);

  const order = detail?.order;

  async function handleDownloadInvoice() {
    if (!order || downloadingInvoice) return;
    setDownloadError(null);
    setDownloadingInvoice(true);
    try {
      await downloadOrderInvoicePdf(order.id, order.order_number);
    } catch (e) {
      setDownloadError(
        mapFriendlyError(e, "No se pudo descargar el comprobante interno.")
      );
    } finally {
      setDownloadingInvoice(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Button asChild variant="ghost" className={styles.backButton}>
          <Link href="/cuenta/administracion/ordenes">
            <ArrowLeft size={16} /> Volver a órdenes
          </Link>
        </Button>

        <Button
          type="button"
          variant="outline"
          className={styles.backButton}
          onClick={() => void handleDownloadInvoice()}
          disabled={!order || downloadingInvoice}
        >
          {downloadingInvoice ? (
            <Loader2 size={16} className={styles.spin} />
          ) : (
            <FileText size={16} />
          )}
          {downloadingInvoice ? "Descargando..." : "Descargar comprobante"}
        </Button>

        <div className={styles.heading}>
          <h1 className={styles.title}>
            {order?.order_number ? `Orden ${order.order_number}` : "Orden"}
          </h1>
          {order ? (
            <p className={styles.subtitle}>
              {formatMoney(order.total_ars)} - {order.item_count} items - {formatDateTime(order.created_at)}
            </p>
          ) : (
            <p className={styles.subtitle}>Detalle y actividad registrada de la orden.</p>
          )}
        </div>

        {downloadError ? <p className={styles.subtitle}>{downloadError}</p> : null}
      </div>

      {loading ? (
        <Card className={`adminPanelSurface ${styles.card}`}>
          <CardContent className={`adminPanelContentSurface ${styles.center}`}>
            <Loader2 size={18} className={styles.spin} />
            Cargando...
          </CardContent>
        </Card>
      ) : error ? (
        <Card className={`adminPanelSurface ${styles.card}`}>
          <CardContent className={`adminPanelContentSurface ${styles.center}`}>{error}</CardContent>
        </Card>
      ) : !order ? (
        <Card className={`adminPanelSurface ${styles.card}`}>
          <CardContent className={`adminPanelContentSurface ${styles.center}`}>
            Orden no encontrada.
          </CardContent>
        </Card>
      ) : (
        <Card className={`adminPanelSurface ${styles.card}`}>
          <CardHeader className={styles.cardHeader}>
            <CardTitle>Actividad registrada</CardTitle>
            <div className={styles.badges}>
              <Badge variant={normalizePaymentStatus(order.payment_status) === "paid" ? "default" : "outline"}>
                {humanizePaymentStatus(String(order.payment_status ?? ""), order.payment_method)}
              </Badge>
              {(() => {
                const fulfillment = fulfillmentBadgeUi(order.status);
                return (
                  <Badge
                    variant={fulfillment.variant}
                    className={`${toneStyles.statusToneChip} ${fulfillment.toneClassName}`}
                  >
                    <fulfillment.Icon size={14} />
                    {fulfillment.label}
                  </Badge>
                );
              })()}
            </div>
          </CardHeader>
          <CardContent className={`adminPanelContentSurface ${styles.cardBody}`}>
            {timeline.length ? (
              <div className={styles.timeline}>
                {timeline.map((event) => (
                  <div key={event.id || event.at} className={styles.event}>
                    <strong>{humanizeTimelineEvent(event, order)}</strong>
                    <span className={styles.muted}>{formatDateTime(event.at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.muted}>Todavía no hay eventos registrados.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
