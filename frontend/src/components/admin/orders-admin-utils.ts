import {
  canonicalFulfillmentStatus,
  fulfillmentStatusLabel,
  parseFulfillmentStatus,
} from "@/lib/fulfillment-status-ui";
import { STORE_BACKEND_URL } from "@/lib/store-client";
import type { AdminOrder, AdminOrderItemStock } from "@/lib/store-admin-orders";

type SortBy = "created_desc" | "created_asc" | "total_desc" | "total_asc";
type PaymentFilter = "all" | "paid" | "pending" | "failed" | "refunded";

const DEFAULT_SORT: SortBy = "created_desc";
const PAGE_LIMIT = 50;

const STATUS_FILTER_VALUES = [
  "processing",
  "preparing",
  "ready_to_dispatch",
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

const FULFILLMENT_STEPS = [
  {
    key: "received",
    label: "Orden recibida",
    desc: "Se creo la orden. Todavía no se empezó a preparar.",
  },
  {
    key: "preparing",
    label: "En preparación",
    desc: "Están seleccionando/armando los ítems (picking/packing).",
  },
  {
    key: "ready_to_dispatch",
    label: "Lista para despacho",
    desc: "Ya está embalada, falta que salga.",
  },
  {
    key: "dispatched",
    label: "Despachada / Enviada",
    desc: "Salió del depósito y tiene tracking (idealmente).",
  },
  {
    key: "in_transit",
    label: "En tránsito",
    desc: "El envío está en camino.",
  },
  {
    key: "out_for_delivery",
    label: "En reparto",
    desc: "Se entrega hoy.",
  },
  {
    key: "delivered",
    label: "Entregada",
    desc: "",
  },
] as const;

type FulfillmentStepKey = (typeof FULFILLMENT_STEPS)[number]["key"];

type TransferProofFile = {
  id: string;
  mime: string;
  originalName: string;
  uploadedAt: string;
};

type TimelinePreviewItem = {
  id: string;
  at: string;
  type: string;
  message: string;
};

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function readString(obj: Record<string, unknown> | null, key: string) {
  const raw = obj?.[key];
  return typeof raw === "string" ? raw : "";
}

function composeStreetLine(line1Raw: string, streetNumberRaw: string) {
  const line1 = line1Raw.trim();
  const streetNumber = streetNumberRaw.trim();
  if (!line1) return streetNumber;
  if (!streetNumber) return line1;

  const normalizedLine1 = line1.toLowerCase();
  const normalizedStreetNumber = streetNumber.toLowerCase();
  if (
    normalizedLine1 === normalizedStreetNumber ||
    normalizedLine1.endsWith(` ${normalizedStreetNumber}`)
  ) {
    return line1;
  }

  return `${line1} ${streetNumber}`.trim();
}

function formatOrderDate(timestamp: string) {
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
  if (raw.includes("refund") || raw.includes("reintegr") || raw.includes("chargeback")) {
    return "refunded";
  }
  if (
    raw.includes("fail") ||
    raw.includes("reject") ||
    raw.includes("denied") ||
    raw.includes("cancel")
  ) {
    return "failed";
  }
  if (
    raw.includes("paid") ||
    raw.includes("approve") ||
    raw.includes("accredit") ||
    raw.includes("success")
  ) {
    return "paid";
  }
  if (raw.includes("pend")) return "pending";
  return raw;
}

function normalizePaymentFilter(value: string | null | undefined): PaymentFilter {
  const normalized = normalizePaymentStatus(value);
  if (
    normalized === "paid" ||
    normalized === "pending" ||
    normalized === "failed" ||
    normalized === "refunded"
  ) {
    return normalized;
  }
  return "all";
}

function isBankTransfer(paymentMethod: unknown) {
  const raw = typeof paymentMethod === "string" ? paymentMethod.trim().toLowerCase() : "";
  if (!raw) return false;
  return raw.includes("transfer");
}

function readTransferProofFiles(order: { metadata?: Record<string, unknown> | null }) {
  const meta =
    order.metadata && typeof order.metadata === "object" ? order.metadata : null;

  const proofRaw = asRecord(meta?.transfer_proof);

  const filesRaw = Array.isArray(proofRaw?.files) ? proofRaw.files : [];

  const out: TransferProofFile[] = [];
  for (const entry of filesRaw) {
    const file = asRecord(entry);
    if (!file) continue;

    const id = readString(file, "id");
    if (!id) continue;

    out.push({
      id,
      mime: readString(file, "mime"),
      originalName: readString(file, "original_name"),
      uploadedAt: readString(file, "uploaded_at"),
    });
  }

  return out;
}

function buildTransferProofAdminUrl(orderId: string, fileId: string) {
  return `${STORE_BACKEND_URL}/store/catalog/account/admin/orders/${encodeURIComponent(
    orderId
  )}/transfer-proof/${encodeURIComponent(fileId)}`;
}

function paymentBadge(paymentStatus: unknown, paymentMethod?: string | null) {
  const normalized = normalizePaymentStatus(paymentStatus);
  const method = (paymentMethod ?? "").trim().toLowerCase();

  if (normalized === "paid") {
    return { label: "Pagado", variant: "default" as const };
  }
  if (normalized === "refunded") {
    return { label: "Reintegrado", variant: "outline" as const };
  }
  if (normalized === "failed") {
    return { label: "Pago fallido", variant: "destructive" as const };
  }
  if (method.includes("transfer")) {
    return { label: "Pendiente de aprobación", variant: "outline" as const };
  }
  return { label: "Pago pendiente", variant: "outline" as const };
}

function normalizeFulfillmentStatus(status: unknown) {
  return canonicalFulfillmentStatus(status);
}

function fulfillmentStepKey(status: unknown): FulfillmentStepKey {
  const normalized = normalizeFulfillmentStatus(status).toLowerCase();
  if (normalized === "delivered") return "delivered";
  if (normalized === "out_for_delivery") return "out_for_delivery";
  if (normalized === "in_transit") return "in_transit";
  if (normalized === "dispatched" || normalized === "shipped") return "dispatched";
  if (normalized === "ready_to_dispatch" || normalized === "ready_pickup") return "ready_to_dispatch";
  if (normalized === "preparing") return "preparing";
  return "received";
}

function stepIndexForStatus(status: unknown) {
  const normalized = normalizeFulfillmentStatus(status).toLowerCase();
  if (normalized === "cancelled") return -1;
  const key = fulfillmentStepKey(status);
  return Math.max(0, FULFILLMENT_STEPS.findIndex((step) => step.key === key));
}

function parseLocalDateInput(value: string) {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year) return null;
  if (date.getMonth() !== month - 1) return null;
  if (date.getDate() !== day) return null;
  return date;
}

function endOfLocalDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  );
}

function readCustomerName(order: AdminOrder) {
  const meta = asRecord(order.metadata);
  const customer = asRecord(meta?.customer) ?? asRecord(meta?.customer_data);
  const first = readString(customer, "first_name") || readString(customer, "firstName");
  const last = readString(customer, "last_name") || readString(customer, "lastName");
  const full = `${first} ${last}`.trim();
  return full || "Cliente";
}

function readShippingAddress(order: AdminOrder) {
  const meta = asRecord(order.metadata);
  const address = asRecord(meta?.shipping_address) ?? asRecord(meta?.shippingAddress);

  const line1Base = readString(address, "line1") || readString(address, "address1");
  const streetNumber =
    readString(address, "street_number") ||
    readString(address, "streetNumber") ||
    readString(address, "address_number") ||
    readString(address, "addressNumber");
  const line1 = composeStreetLine(line1Base, streetNumber);
  const line2 = readString(address, "line2") || readString(address, "address2");
  const city = readString(address, "city");
  const province = readString(address, "province") || readString(address, "state");
  const postalCode =
    readString(address, "postal_code") ||
    readString(address, "postalCode") ||
    readString(address, "zip");

  return { line1, line2, city, province, postalCode };
}

function addressAlerts(address: ReturnType<typeof readShippingAddress>) {
  const incomplete =
    !address.line1.trim() ||
    !address.city.trim() ||
    !address.province.trim() ||
    !address.postalCode.trim();
  const cp = address.postalCode.trim();
  const hasDigit = /\d/.test(cp);
  const invalidPostal = Boolean(cp) && (!hasDigit || cp.length < 4 || cp.length > 10);
  return { incomplete, invalidPostal };
}

function stockFlag(stock: AdminOrderItemStock | undefined) {
  if (!stock) return null;
  if (stock.inStock === false) return { label: "Sin stock", variant: "destructive" as const };
  if (typeof stock.availableQty === "number" && stock.availableQty <= 0)
    return { label: "Sin stock", variant: "destructive" as const };
  if (stock.lowStock) return { label: "Stock bajo", variant: "outline" as const };
  return null;
}

function buildTimelinePreview(detailOrder: AdminOrder | null | undefined): TimelinePreviewItem[] {
  if (!detailOrder) return [];
  const meta = asRecord(detailOrder.metadata);
  const raw = meta?.timeline;
  if (!Array.isArray(raw)) return [];

  const items = raw
    .map((entry) => {
      const timelineEntry = asRecord(entry);
      if (!timelineEntry) return null;

      return {
        id: readString(timelineEntry, "id"),
        at: readString(timelineEntry, "at"),
        type: readString(timelineEntry, "type"),
        message: readString(timelineEntry, "message"),
      };
    })
    .filter((item): item is TimelinePreviewItem => Boolean(item?.at && (item.message || item.type)));

  return items.slice(-6).reverse();
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

function humanizePaymentStatus(value: string, paymentMethod?: string | null) {
  const key = normalizePaymentStatus(value);
  if (key === "paid") return "Pagado";
  if (key === "refunded") return "Reintegrado";
  if (key === "failed") return "Fallido";
  if (key === "pending") {
    return isBankTransfer(paymentMethod) ? "Pendiente de aprobación" : "Pendiente";
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

function humanizeTimelineEvent(event: { type: string; message: string }, paymentMethod?: string | null) {
  const type = (event.type ?? "").trim();
  const message = (event.message ?? "").trim();

  if (type === "order.status.changed") {
    const next = extractTimelineValue(message, "Estado actualizado a");
    return next ? `Estado actualizado: ${humanizeFulfillmentStatus(next)}` : "Estado actualizado.";
  }

  if (type === "order.payment.changed") {
    const next = extractTimelineValue(message, "Pago actualizado a");
    return next
      ? `Pago actualizado: ${humanizePaymentStatus(next, paymentMethod)}`
      : "Pago actualizado.";
  }

  if (type === "order.tracking.changed") return message || "Tracking actualizado.";
  if (type === "order.note.updated") return message || "Nota interna actualizada.";
  if (type === "order.tags.updated") return message || "Etiquetas actualizadas.";

  return message || type || "Evento.";
}

export type {
  SortBy,
  PaymentFilter,
  FulfillmentStepKey,
  TransferProofFile,
  TimelinePreviewItem,
};

export {
  DEFAULT_SORT,
  PAGE_LIMIT,
  STATUS_FILTER_VALUES,
  FULFILLMENT_STEPS,
  asRecord,
  readString,
  formatOrderDate,
  normalizePaymentStatus,
  normalizePaymentFilter,
  isBankTransfer,
  readTransferProofFiles,
  buildTransferProofAdminUrl,
  paymentBadge,
  normalizeFulfillmentStatus,
  fulfillmentStepKey,
  stepIndexForStatus,
  parseLocalDateInput,
  endOfLocalDay,
  readCustomerName,
  readShippingAddress,
  addressAlerts,
  stockFlag,
  buildTimelinePreview,
  humanizeFulfillmentStatus,
  humanizePaymentStatus,
  extractTimelineValue,
  humanizeTimelineEvent,
};
