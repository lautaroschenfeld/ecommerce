import { normalizeCustomerRole, type CustomerRole } from "@/lib/account-roles";
import type { AdminOrder } from "@/lib/store-admin-orders";
import { fetchJsonWithAuthRetry as fetchJson } from "@/lib/store-client";
import { mapFriendlyError } from "@/lib/user-facing-errors";

type AdminAddress = {
  label: string;
  line1: string;
  city: string;
  province: string;
  postalCode: string;
};

type AdminAccount = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: CustomerRole;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  blockedUntil: string | null;
  phone: string;
  whatsapp: string;
  adminNote: string;
  addresses: AdminAddress[];
};

type ClientRow = AdminAccount & {
  fullName: string;
  status: "active" | "blocked";
  ordersCount: number;
  totalSpentArs: number;
  avgTicketArs: number;
  lastPurchaseAt: string | null;
  lastActivityAt: string | null;
  note: string;
};

type ClientDetailRow = ClientRow & {
  orders: AdminOrder[];
};

type ClientSort = "latest_purchase" | "total_spent" | "newest";
type StatusFilter = "all" | "active" | "blocked";
type BulkMode = "role" | "status";

function normalizeText(input: unknown, max = 200) {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeEmail(input: unknown) {
  return normalizeText(input, 180).toLowerCase();
}

function asRecord(input: unknown) {
  return typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)
    : null;
}

function parseIsoDateOrNull(input: unknown) {
  const raw = normalizeText(input, 80);
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function formatDateTime(input: string | null | undefined) {
  if (!input) return "-";
  const timestamp = Date.parse(input);
  if (!Number.isFinite(timestamp)) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function toTimestamp(input: string | null | undefined) {
  if (!input) return 0;
  const timestamp = Date.parse(input);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function latestIsoDate(values: Array<string | null | undefined>) {
  let winner: string | null = null;
  let winnerTs = 0;

  for (const value of values) {
    const ts = toTimestamp(value);
    if (ts <= winnerTs) continue;
    winnerTs = ts;
    winner = value ?? null;
  }

  return winner;
}

function toNumber(input: unknown, fallback = 0) {
  const value = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function isBlockedByDate(blockedUntil: string | null) {
  if (!blockedUntil) return false;
  const now = Date.now();
  return toTimestamp(blockedUntil) > now;
}

function mapAddress(raw: unknown): AdminAddress | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const line1 = normalizeText(rec.line1 ?? rec.address1 ?? rec.street, 220);
  const city = normalizeText(rec.city, 120);
  const province = normalizeText(rec.province ?? rec.state, 120);
  if (!line1 && !city && !province) return null;

  return {
    label: normalizeText(rec.label, 80) || "Dirección",
    line1,
    city,
    province,
    postalCode: normalizeText(rec.postal_code ?? rec.postalCode ?? rec.zip, 24),
  };
}

function mapAdminAccount(raw: unknown): AdminAccount | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const id = normalizeText(rec.id, 120);
  const email = normalizeEmail(rec.email);
  if (!id || !email) return null;

  const metadata = asRecord(rec.metadata);
  const addressesRaw = Array.isArray(rec.addresses)
    ? rec.addresses
    : Array.isArray(metadata?.addresses)
      ? metadata.addresses
      : [];

  const addresses = addressesRaw.map(mapAddress).filter(Boolean) as AdminAddress[];

  return {
    id,
    email,
    firstName: normalizeText(rec.first_name ?? rec.firstName, 80) || "Cliente",
    lastName: normalizeText(rec.last_name ?? rec.lastName, 80),
    role: normalizeCustomerRole(rec.role),
    createdAt:
      parseIsoDateOrNull(rec.created_at ?? rec.createdAt) ?? new Date().toISOString(),
    updatedAt:
      parseIsoDateOrNull(rec.updated_at ?? rec.updatedAt) ??
      parseIsoDateOrNull(rec.created_at ?? rec.createdAt) ??
      new Date().toISOString(),
    lastLoginAt: parseIsoDateOrNull(rec.last_login_at ?? rec.lastLoginAt),
    blockedUntil: parseIsoDateOrNull(rec.blocked_until ?? rec.blockedUntil),
    phone: normalizeText(rec.phone, 40),
    whatsapp: normalizeText(rec.whatsapp, 40),
    adminNote: normalizeText(rec.admin_notes ?? rec.adminNotes, 4000),
    addresses,
  };
}

function buildClientRow(account: AdminAccount, rec: Record<string, unknown> | null): ClientRow {
  const fullName = `${account.firstName} ${account.lastName}`.trim() || "Cliente";
  const status: "active" | "blocked" = isBlockedByDate(account.blockedUntil)
    ? "blocked"
    : "active";
  const ordersCount = Math.max(
    0,
    Math.trunc(toNumber(rec?.orders_count ?? rec?.ordersCount, 0))
  );
  const totalSpentArs = Math.max(0, toNumber(rec?.total_spent_ars ?? rec?.totalSpentArs, 0));
  const avgTicketArs =
    ordersCount > 0
      ? Math.max(0, toNumber(rec?.avg_ticket_ars ?? rec?.avgTicketArs, totalSpentArs / ordersCount))
      : 0;
  const lastPurchaseAt = parseIsoDateOrNull(rec?.last_purchase_at ?? rec?.lastPurchaseAt);
  const lastActivityAt =
    parseIsoDateOrNull(rec?.last_activity_at ?? rec?.lastActivityAt) ??
    latestIsoDate([lastPurchaseAt, account.lastLoginAt, account.updatedAt]);

  return {
    ...account,
    fullName,
    status,
    ordersCount,
    totalSpentArs,
    avgTicketArs,
    lastPurchaseAt,
    lastActivityAt,
    note: account.adminNote,
  };
}

function mapClientRow(raw: unknown): ClientRow | null {
  const rec = asRecord(raw);
  const account = mapAdminAccount(raw);
  if (!account) return null;
  return buildClientRow(account, rec);
}

function mapClientDetailRow(accountRaw: unknown, ordersRaw: unknown): ClientDetailRow | null {
  const base = mapClientRow(accountRaw);
  if (!base) return null;
  const orders = Array.isArray(ordersRaw) ? (ordersRaw as AdminOrder[]) : [];
  return {
    ...base,
    orders,
  };
}

function mergeAccountIntoClientRow(row: ClientRow, account: AdminAccount): ClientRow {
  return buildClientRow(
    {
      ...row,
      ...account,
      addresses: account.addresses.length ? account.addresses : row.addresses,
    },
    {
      orders_count: row.ordersCount,
      total_spent_ars: row.totalSpentArs,
      avg_ticket_ars: row.avgTicketArs,
      last_purchase_at: row.lastPurchaseAt,
      last_activity_at: row.lastActivityAt,
    }
  );
}

function mapPanelError(error: unknown, fallback: string) {
  return mapFriendlyError(error, fallback);
}

function toCsvCell(input: unknown) {
  const raw = typeof input === "string" ? input : String(input ?? "");
  const escaped = raw.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

function statusLabel(value: "active" | "blocked") {
  return value === "blocked" ? "Bloqueado" : "Activo";
}

function roleLabel(role: CustomerRole) {
  if (role === "administrator") return "Administrador";
  if (role === "employee") return "Empleado";
  return "Usuario";
}

function normalizeOrderStatus(status: unknown) {
  return normalizeText(status, 80)
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function orderStatusLabel(status: unknown) {
  const normalized = normalizeOrderStatus(status);
  if (!normalized) return "-";

  if (normalized === "ready_for_dispatch") return "Lista para despacho";
  if (normalized === "ready_for_pickup") return "Lista para retiro";
  if (normalized === "processing" || normalized === "preparing") return "En preparación";
  if (
    normalized === "ready_to_dispatch" ||
    normalized === "dispatched" ||
    normalized === "shipped"
  ) {
    return "Despachada";
  }
  if (normalized === "in_transit") return "En tránsito";
  if (normalized === "out_for_delivery") return "En reparto";
  if (normalized === "ready_pickup") return "Lista para retiro";
  if (
    normalized === "delivered" ||
    normalized === "completed" ||
    normalized === "complete"
  ) {
    return "Entregada";
  }
  if (
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "anulado" ||
    normalized === "anulada"
  ) {
    return "Cancelada";
  }

  return normalizeText(status, 80) || "-";
}

async function patchAccountRecord(
  accountId: string,
  payload: Record<string, unknown>
) {
  const result = await fetchJson<{ account?: unknown }>(
    `/store/catalog/account/admin/accounts/${encodeURIComponent(accountId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  return mapAdminAccount(result.account) ?? null;
}

export type {
  AdminAddress,
  AdminAccount,
  ClientRow,
  ClientDetailRow,
  ClientSort,
  StatusFilter,
  BulkMode,
};

export {
  normalizeText,
  normalizeEmail,
  asRecord,
  parseIsoDateOrNull,
  formatDateTime,
  toTimestamp,
  latestIsoDate,
  isBlockedByDate,
  mapAddress,
  mapAdminAccount,
  mapClientRow,
  mapClientDetailRow,
  mergeAccountIntoClientRow,
  mapPanelError,
  toCsvCell,
  statusLabel,
  roleLabel,
  normalizeOrderStatus,
  orderStatusLabel,
  patchAccountRecord,
};
