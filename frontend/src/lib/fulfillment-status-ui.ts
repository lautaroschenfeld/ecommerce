import {
  CheckCircle2,
  Clock3,
  Navigation,
  Package,
  PackageCheck,
  PackageOpen,
  Send,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

export type FulfillmentStatusTone =
  | "neutral"
  | "orange"
  | "blue"
  | "indigo"
  | "info"
  | "warning"
  | "success"
  | "danger";

export type CanonicalFulfillmentStatus =
  | "processing"
  | "preparing"
  | "ready_to_dispatch"
  | "ready_pickup"
  | "dispatched"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

const CANONICAL_STATUSES = new Set<CanonicalFulfillmentStatus>([
  "processing",
  "preparing",
  "ready_to_dispatch",
  "ready_pickup",
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

const STATUS_ALIASES: Record<string, CanonicalFulfillmentStatus> = {
  shipped: "dispatched",
  ready_for_dispatch: "ready_to_dispatch",
  ready_for_pickup: "ready_pickup",
  en_preparacion: "preparing",
  en_transito: "in_transit",
  en_reparto: "out_for_delivery",
  entregada: "delivered",
  entregado: "delivered",
  completed: "delivered",
  complete: "delivered",
  canceled: "cancelled",
  anulado: "cancelled",
  anulada: "cancelled",
};

function normalizeFulfillmentStatus(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseFulfillmentStatus(
  value: unknown
): CanonicalFulfillmentStatus | null {
  const normalized = normalizeFulfillmentStatus(value);
  if (!normalized) return null;

  const alias = STATUS_ALIASES[normalized];
  if (alias) return alias;

  if (CANONICAL_STATUSES.has(normalized as CanonicalFulfillmentStatus)) {
    return normalized as CanonicalFulfillmentStatus;
  }
  return null;
}

export function canonicalFulfillmentStatus(
  value: unknown
): CanonicalFulfillmentStatus {
  return parseFulfillmentStatus(value) ?? "processing";
}

export type FulfillmentStatusUiOptions = {
  readyPickupLabel?: "dispatch" | "pickup";
  dispatchedLabel?: "short" | "long";
  dispatchedIcon?: "truck" | "send";
};

export type FulfillmentStatusUi = {
  key: CanonicalFulfillmentStatus;
  label: string;
  icon: LucideIcon;
  tone: FulfillmentStatusTone;
  badgeVariant: "outline" | "destructive";
};

export function fulfillmentStatusUi(
  value: unknown,
  options: FulfillmentStatusUiOptions = {}
): FulfillmentStatusUi {
  const key = canonicalFulfillmentStatus(value);
  const readyPickupLabel =
    options.readyPickupLabel === "pickup"
      ? "Lista para retiro"
      : "Lista para despacho";
  const dispatchedLabel =
    options.dispatchedLabel === "long" ? "Despachada / Enviada" : "Despachada";
  const dispatchedIcon = options.dispatchedIcon === "send" ? Send : Truck;

  if (key === "cancelled") {
    return {
      key,
      label: "Cancelada",
      icon: XCircle,
      tone: "danger",
      badgeVariant: "destructive",
    };
  }

  if (key === "delivered") {
    return {
      key,
      label: "Entregada",
      icon: CheckCircle2,
      tone: "success",
      badgeVariant: "outline",
    };
  }

  if (key === "out_for_delivery") {
    return {
      key,
      label: "En reparto",
      icon: Navigation,
      tone: "warning",
      badgeVariant: "outline",
    };
  }

  if (key === "in_transit") {
    return {
      key,
      label: "En transito",
      icon: Truck,
      tone: "info",
      badgeVariant: "outline",
    };
  }

  if (key === "dispatched") {
    return {
      key,
      label: dispatchedLabel,
      icon: dispatchedIcon,
      tone: "indigo",
      badgeVariant: "outline",
    };
  }

  if (key === "ready_to_dispatch" || key === "ready_pickup") {
    return {
      key,
      label: readyPickupLabel,
      icon: key === "ready_pickup" ? Package : PackageCheck,
      tone: "blue",
      badgeVariant: "outline",
    };
  }

  if (key === "preparing") {
    return {
      key,
      label: "En preparacion",
      icon: PackageOpen,
      tone: "orange",
      badgeVariant: "outline",
    };
  }

  return {
    key: "processing",
    label: "Orden recibida",
    icon: Clock3,
    tone: "neutral",
    badgeVariant: "outline",
  };
}

export function fulfillmentStatusLabel(
  value: unknown,
  options?: FulfillmentStatusUiOptions
) {
  return fulfillmentStatusUi(value, options).label;
}

export function fulfillmentToneClassKey(tone: FulfillmentStatusTone) {
  if (tone === "success") return "statusToneSuccess";
  if (tone === "warning") return "statusToneWarning";
  if (tone === "info") return "statusToneInfo";
  if (tone === "indigo") return "statusToneIndigo";
  if (tone === "blue") return "statusToneBlue";
  if (tone === "orange") return "statusToneOrange";
  if (tone === "danger") return "statusToneDanger";
  return "statusToneNeutral";
}
