"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { ApiHttpError, fetchJson } from "@/lib/store-client";
import { normalizeCustomerRole, type CustomerRole } from "@/lib/account-roles";
import { CUSTOMER_AUTH_LOST_EVENT } from "@/lib/customer-auth-events";
import {
  markStoreBackendHealthy,
  markStoreBackendUnavailable,
} from "@/lib/store-backend-status";
import { trackStoreTelemetry as trackStoreTelemetryEvent } from "@/lib/store-telemetry";
import {
  readCartItemsSnapshot,
  replaceCartItems,
  type CartItem,
} from "@/lib/store-cart";

const AUTH_CHANGE_EVENT = "store:customer:auth:changed";

export type CustomerNotifications = {
  email: boolean;
  whatsapp: boolean;
};

export type CustomerAddress = {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  province: string;
  postalCode: string;
  isDefault: boolean;
};

export type CustomerAccount = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  documentNumber: string;
  role: CustomerRole;
  phone: string;
  whatsapp: string;
  notifications: CustomerNotifications;
  blockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerOrder = {
  timeline: Array<{
    id: string;
    at: string;
    type: string;
    message: string;
  }>;
  items: Array<{
    id: string;
    name: string;
    brand: string;
    category: string;
    qty: number;
    unitPriceArs: number;
    imageUrl?: string;
  }>;
  id: string;
  orderNumber: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  totalArs: number;
  itemCount: number;
  trackingCode: string | null;
};

export type CustomerSessionStatus =
  | "unknown"
  | "guest"
  | "authenticated"
  | "unavailable";

type SessionSnapshot = {
  customer: CustomerAccount | null;
  cart: CartItem[];
  addresses: CustomerAddress[];
  hydrated: boolean;
  updatedAt: number;
  status: CustomerSessionStatus;
  error: string | null;
};

export type CustomerLoginInput = {
  email: string;
  password: string;
  guestCartItems?: CartItem[];
};

export type CustomerRegisterInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  documentNumber?: string;
  phone?: string;
  whatsapp?: string;
  guestCartItems?: CartItem[];
};

export type CustomerAuthResult = {
  ok: boolean;
  error?: string;
  status?: number;
  code?: string | null;
  customer?: CustomerAccount | null;
};

export type CustomerAddressInput = Omit<CustomerAddress, "id">;

const SERVER_SNAPSHOT: SessionSnapshot = {
  customer: null,
  cart: [],
  addresses: [],
  hydrated: false,
  updatedAt: 0,
  status: "unknown",
  error: null,
};

const EMPTY_CLIENT_SNAPSHOT: SessionSnapshot = {
  customer: null,
  cart: [],
  addresses: [],
  hydrated: false,
  updatedAt: 0,
  status: "unknown",
  error: null,
};

let currentSnapshot: SessionSnapshot = EMPTY_CLIENT_SNAPSHOT;
let bootPromise: Promise<void> | null = null;
let bootstrapped = false;
let authLostListenerAttached = false;

function forceLoggedOutSnapshot() {
  replaceSnapshot({
    customer: null,
    cart: [],
    addresses: [],
    hydrated: true,
    updatedAt: Date.now(),
    status: "guest",
    error: null,
  });
}

function ensureAuthLostListener() {
  if (typeof window === "undefined") return;
  if (authLostListenerAttached) return;

  window.addEventListener(CUSTOMER_AUTH_LOST_EVENT, forceLoggedOutSnapshot);
  authLostListenerAttached = true;
}

function getPublishableKey() {
  return process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";
}

function storeHeaders(): Record<string, string> {
  const key = getPublishableKey();
  if (!key) return {};
  return { "x-publishable-api-key": key };
}

function normalizeText(input: unknown, max = 160) {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeEmail(input: unknown) {
  return normalizeText(input, 180).toLowerCase();
}

function normalizeNotifications(raw: unknown): CustomerNotifications {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

  return {
    email: rec?.email === false ? false : true,
    whatsapp: rec?.whatsapp === true,
  };
}

function mapAccount(raw: unknown): CustomerAccount | null {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!rec) return null;

  const id = normalizeText(rec.id, 120);
  const email = normalizeEmail(rec.email);
  if (!id || !email) return null;

  return {
    id,
    email,
    firstName: normalizeText(rec.first_name ?? rec.firstName, 80) || "Cliente",
    lastName: normalizeText(rec.last_name ?? rec.lastName, 80),
    documentNumber: normalizeText(
      rec.document_number ?? rec.documentNumber,
      32
    ),
    role: normalizeCustomerRole(rec.role),
    phone: normalizeText(rec.phone, 40),
    whatsapp: normalizeText(rec.whatsapp, 40),
    notifications: normalizeNotifications(rec.notifications),
    blockedUntil:
      typeof rec.blocked_until === "string" ? rec.blocked_until : null,
    lastLoginAt:
      typeof rec.last_login_at === "string" ? rec.last_login_at : null,
    createdAt:
      typeof rec.created_at === "string"
        ? rec.created_at
        : new Date().toISOString(),
    updatedAt:
      typeof rec.updated_at === "string"
        ? rec.updated_at
        : new Date().toISOString(),
  };
}

function mapCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CartItem[] = [];

  for (const entry of raw) {
    const rec =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : null;
    if (!rec) continue;

    const id = normalizeText(rec.id, 120);
    const name = normalizeText(rec.name, 180);
    const brand = normalizeText(rec.brand, 120);
    const category = normalizeText(rec.category, 120) as CartItem["category"];
    const imageUrl = normalizeText(rec.imageUrl, 500) || undefined;
    const priceArs =
      typeof rec.priceArs === "number" ? rec.priceArs : Number(rec.priceArs);
    const qty = typeof rec.qty === "number" ? rec.qty : Number(rec.qty);

    if (!id || !name || !brand || !category) continue;
    if (!Number.isFinite(priceArs) || priceArs <= 0) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;

    out.push({
      id,
      name,
      brand,
      category,
      imageUrl,
      priceArs: Math.trunc(priceArs),
      qty: Math.max(1, Math.min(99, Math.trunc(qty))),
    });
  }

  return out;
}

function mapAddress(raw: unknown): CustomerAddress | null {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!rec) return null;

  const id = normalizeText(rec.id, 120);
  const line1 = normalizeText(rec.line1, 200);
  const city = normalizeText(rec.city, 120);
  const province = normalizeText(rec.province, 120);
  if (!id || !line1 || !city || !province) return null;

  return {
    id,
    label: normalizeText(rec.label, 80) || "Dirección",
    recipient: normalizeText(rec.recipient, 120),
    phone: normalizeText(rec.phone, 40),
    line1,
    line2: normalizeText(rec.line2, 120),
    city,
    province,
    postalCode: normalizeText(rec.postal_code ?? rec.postalCode, 30),
    isDefault: rec.is_default === true || rec.isDefault === true,
  };
}

function publishSnapshot(next: Partial<SessionSnapshot>) {
  currentSnapshot = {
    ...currentSnapshot,
    ...next,
    hydrated: next.hydrated ?? true,
    updatedAt: Date.now(),
  };
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

function replaceSnapshot(next: SessionSnapshot) {
  currentSnapshot = next;
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AUTH_CHANGE_EVENT, onStoreChange);
  return () => window.removeEventListener(AUTH_CHANGE_EVENT, onStoreChange);
}

async function requestWithRefresh<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
  canRefresh = true
) {
  try {
    return await fetchJson<T>(path, {
      ...init,
      headers: {
        ...storeHeaders(),
        ...(init?.headers as Record<string, string> | undefined),
      },
      credentials: "include",
    });
  } catch (error) {
    if (!(error instanceof ApiHttpError)) throw error;
    if (!canRefresh || error.status !== 401) throw error;

    try {
      await fetchJson("/store/catalog/auth/refresh", {
        method: "POST",
        headers: storeHeaders(),
        credentials: "include",
      });
    } catch {
      throw error;
    }

    return await requestWithRefresh<T>(path, init, false);
  }
}

type SessionApiResponse = {
  authenticated?: boolean;
  account?: unknown;
  cart?: { items?: unknown[] };
  addresses?: unknown[];
};

function getSessionUnavailableMessage(error: unknown) {
  if (error instanceof ApiHttpError && error.status >= 500) {
    return "No pudimos validar tu sesión. Intenta nuevamente en unos minutos.";
  }

  if (error instanceof Error) {
    const normalized = error.message.trim().toLowerCase();
    if (
      normalized.includes("failed to fetch") ||
      normalized.includes("fetch failed") ||
      normalized.includes("networkerror") ||
      normalized.includes("network request failed") ||
      normalized.includes("econnrefused") ||
      normalized.includes("err_connection_refused") ||
      normalized.includes("timeout") ||
      normalized.includes("timed out")
    ) {
      return "No pudimos validar tu sesión. Intenta nuevamente en unos minutos.";
    }
  }

  return "No pudimos validar tu sesión en este momento.";
}

export function createUnavailableSessionSnapshot(
  at = Date.now(),
  error: unknown = null
): SessionSnapshot {
  return {
    customer: null,
    cart: [],
    addresses: [],
    hydrated: true,
    updatedAt: at,
    status: "unavailable",
    error: getSessionUnavailableMessage(error),
  };
}

async function syncSessionFromBackend() {
  try {
    const data = await requestWithRefresh<SessionApiResponse>(
      "/store/catalog/auth/session",
      {
        method: "GET",
      },
      true
    );

    const customer = mapAccount(data.account);
    const cart = mapCartItems(data.cart?.items ?? []);
    const addresses = (data.addresses ?? []).map(mapAddress).filter(Boolean) as CustomerAddress[];
    const status: CustomerSessionStatus = customer ? "authenticated" : "guest";

    replaceSnapshot({
      customer,
      cart,
      addresses,
      hydrated: true,
      updatedAt: Date.now(),
      status,
      error: null,
    });
    markStoreBackendHealthy();

    if (customer) {
      replaceCartItems(cart);
    }
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 401) {
      forceLoggedOutSnapshot();
      return;
    }
    markStoreBackendUnavailable("auth_session_sync_failed");
    replaceSnapshot(createUnavailableSessionSnapshot(Date.now(), error));
    return;
  }
}

async function ensureBootstrapped() {
  if (typeof window === "undefined") return;
  ensureAuthLostListener();
  if (bootstrapped) return;
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    try {
      await syncSessionFromBackend();
    } catch {
      // Guard against any unexpected runtime error in bootstrap.
    } finally {
      bootstrapped = true;
      bootPromise = null;
    }
  })();

  return bootPromise;
}

function mapApiError(error: unknown, fallback: string): CustomerAuthResult {
  const backendUnavailableMessage =
    "Servicio temporalmente no disponible. Intenta nuevamente en unos minutos.";

  const runtimeMessage =
    error instanceof Error ? error.message.trim().toLowerCase() : "";

  if (
    runtimeMessage.includes("failed to fetch") ||
    runtimeMessage.includes("fetch failed") ||
    runtimeMessage.includes("networkerror") ||
    runtimeMessage.includes("network request failed") ||
    runtimeMessage.includes("econnrefused") ||
    runtimeMessage.includes("err_connection_refused") ||
    runtimeMessage.includes("timeout") ||
    runtimeMessage.includes("timed out")
  ) {
    markStoreBackendUnavailable("auth_network_unavailable");
    return {
      ok: false,
      error: backendUnavailableMessage,
    };
  }

  function mapBackendValidationMessage(messageRaw: string) {
    const normalized = messageRaw.trim().toLowerCase();
    if (!normalized) return "";

    if (normalized.includes("password must be at least 8 characters")) {
      return "La contraseña debe tener al menos 8 caracteres.";
    }
    if (
      normalized.includes(
        "password must include uppercase, lowercase and a number"
      )
    ) {
      return "La contraseña debe incluir una mayúscula, una minúscula y un número.";
    }
    if (normalized.includes("valid email is required")) {
      return "Ingresa un correo electrónico válido.";
    }
    if (normalized.includes("first name is required")) {
      return "El nombre es obligatorio.";
    }
    if (normalized.includes("last name is required")) {
      return "El apellido es obligatorio.";
    }

    return "";
  }

  const messageByCode: Record<string, string> = {
    AUTH_INVALID_CREDENTIALS: "Email o contraseña incorrectos.",
    AUTH_ACCOUNT_LOCKED:
      "La cuenta está bloqueada temporalmente por intentos fallidos.",
    AUTH_EMAIL_ALREADY_EXISTS: "Ya existe una cuenta con ese email.",
    AUTH_REFRESH_FAILED: "Tu sesión expiró. Inicia sesión nuevamente.",
    AUTH_RATE_LIMITED: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    AUTH_RESET_INVALID_TOKEN: "El enlace para recuperar la contraseña no es válido.",
    AUTH_RESET_USED_TOKEN: "Este enlace ya fue utilizado.",
    AUTH_RESET_EXPIRED_TOKEN: "El enlace para recuperar la contraseña expiró.",
    AUTH_RESET_INVALID_ACCOUNT: "No pudimos validar la cuenta para recuperar la contraseña.",
  };

  const messageByStatus: Record<number, string> = {
    400: "No pudimos validar los datos enviados.",
    401: "No autorizado.",
    403: "No tenés permisos para realizar esta acción.",
    404: "No encontramos lo solicitado.",
    409: "Se produjo un conflicto con los datos enviados.",
    423: "La cuenta esta bloqueada temporalmente.",
    429: "Demasiados intentos. Espera un momento e intenta de nuevo.",
    500: backendUnavailableMessage,
    502: backendUnavailableMessage,
    503: backendUnavailableMessage,
    504: backendUnavailableMessage,
  };

  if (error instanceof ApiHttpError) {
    if (error.status >= 500) {
      markStoreBackendUnavailable(`auth_http_${error.status}`);
    }

    const normalizedCode = (error.code || "").trim().toUpperCase();
    const backendValidationMessage = mapBackendValidationMessage(error.message);
    const localized =
      (normalizedCode ? messageByCode[normalizedCode] : undefined) ??
      (error.status === 400 ? backendValidationMessage || undefined : undefined) ??
      messageByStatus[error.status] ??
      fallback;

    return {
      ok: false,
      error: localized,
      status: error.status,
      code: error.code,
    };
  }
  return {
    ok: false,
    error: fallback,
  };
}

export function getCustomerDisplayName(
  customer: Pick<CustomerAccount, "firstName" | "lastName" | "email"> | null
) {
  if (!customer) return "";
  const full = `${customer.firstName} ${customer.lastName}`.trim();
  if (full) return full;
  const local = customer.email.split("@")[0] || "Cliente";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function useCustomerSession() {
  const snap = useSyncExternalStore(
    subscribe,
    () => currentSnapshot,
    () => SERVER_SNAPSHOT
  );

  useEffect(() => {
    void ensureBootstrapped();
  }, []);

  const customer = snap.customer;
  const hydrated = snap.hydrated;
  const sessionUnavailable = snap.status === "unavailable";
  const isLoggedIn = snap.status === "authenticated" && Boolean(customer);
  const displayName = useMemo(() => getCustomerDisplayName(customer), [customer]);

  const syncSession = useCallback(async () => {
    await syncSessionFromBackend();
  }, []);

  const login = useCallback(
    async (input: CustomerLoginInput): Promise<CustomerAuthResult> => {
      try {
        const guestCartItems =
          input.guestCartItems && input.guestCartItems.length
            ? input.guestCartItems
            : readCartItemsSnapshot();

        const data = await requestWithRefresh<{
          account?: unknown;
          cart?: { items?: unknown[] };
        }>("/store/catalog/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: input.email,
            password: input.password,
            guest_cart_items: guestCartItems,
          }),
          headers: {
            "content-type": "application/json",
          },
          credentials: "include",
        });

        const nextCustomer = mapAccount(data.account);
        const cartItems = mapCartItems(data.cart?.items ?? []);
        publishSnapshot({
          customer: nextCustomer,
          cart: cartItems,
          status: nextCustomer ? "authenticated" : "guest",
          error: null,
        });
        replaceCartItems(cartItems);
        markStoreBackendHealthy();

        return { ok: true, customer: nextCustomer };
      } catch (error) {
        return mapApiError(error, "No se pudo iniciar sesión.");
      }
    },
    []
  );

  const register = useCallback(
    async (input: CustomerRegisterInput): Promise<CustomerAuthResult> => {
      try {
        const guestCartItems =
          input.guestCartItems && input.guestCartItems.length
            ? input.guestCartItems
            : readCartItemsSnapshot();

        const data = await requestWithRefresh<{
          account?: unknown;
          cart?: { items?: unknown[] };
        }>("/store/catalog/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: input.email,
            password: input.password,
            first_name: input.firstName,
            last_name: input.lastName,
            document_number: input.documentNumber,
            phone: input.phone,
            whatsapp: input.whatsapp,
            guest_cart_items: guestCartItems,
          }),
          headers: {
            "content-type": "application/json",
          },
          credentials: "include",
        });

        const nextCustomer = mapAccount(data.account);
        const cartItems = mapCartItems(data.cart?.items ?? []);
        publishSnapshot({
          customer: nextCustomer,
          cart: cartItems,
          status: nextCustomer ? "authenticated" : "guest",
          error: null,
        });
        replaceCartItems(cartItems);
        markStoreBackendHealthy();
        return { ok: true, customer: nextCustomer };
      } catch (error) {
        return mapApiError(error, "No se pudo crear la cuenta.");
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await requestWithRefresh(
        "/store/catalog/auth/logout",
        {
          method: "POST",
          credentials: "include",
        },
        false
      );
    } catch {
      // ignore logout errors
    } finally {
      publishSnapshot({
        customer: null,
        cart: [],
        addresses: [],
        status: "guest",
        error: null,
      });
    }
  }, []);

  const updateProfile = useCallback(
    async (patch: {
      email?: string;
      firstName?: string;
      lastName?: string;
      documentNumber?: string;
      phone?: string;
      whatsapp?: string;
    }) => {
      const data = await requestWithRefresh<{ account?: unknown }>(
        "/store/catalog/account/me",
        {
          method: "PATCH",
          body: JSON.stringify({
            email: patch.email,
            first_name: patch.firstName,
            last_name: patch.lastName,
            document_number: patch.documentNumber,
            phone: patch.phone,
            whatsapp: patch.whatsapp,
          }),
          headers: {
            "content-type": "application/json",
          },
          credentials: "include",
        }
      );

      publishSnapshot({
        customer: mapAccount(data.account),
        status: mapAccount(data.account) ? "authenticated" : "guest",
        error: null,
      });
    },
    []
  );

  const setNotifications = useCallback(
    async (next: Partial<CustomerNotifications>) => {
      const merged = {
        email: next.email ?? customer?.notifications.email ?? true,
        whatsapp: next.whatsapp ?? customer?.notifications.whatsapp ?? false,
      };

      const data = await requestWithRefresh<{ account?: unknown }>(
        "/store/catalog/account/me",
        {
          method: "PATCH",
          body: JSON.stringify({
            notifications: merged,
          }),
          headers: {
            "content-type": "application/json",
          },
          credentials: "include",
        }
      );

      publishSnapshot({
        customer: mapAccount(data.account),
        status: mapAccount(data.account) ? "authenticated" : "guest",
        error: null,
      });
    },
    [customer?.notifications.email, customer?.notifications.whatsapp]
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await requestWithRefresh<{ ok?: boolean }>(
        "/store/catalog/account/password",
        {
          method: "POST",
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
          headers: {
            "content-type": "application/json",
          },
          credentials: "include",
        }
      );
    },
    []
  );

  const syncAddresses = useCallback(async () => {
    const data = await requestWithRefresh<{ addresses?: unknown[] }>(
      "/store/catalog/account/addresses",
      {
        method: "GET",
        credentials: "include",
      }
    );
    const addresses = (data.addresses ?? [])
      .map(mapAddress)
      .filter(Boolean) as CustomerAddress[];
    publishSnapshot({ addresses });
    return addresses;
  }, []);

  const addAddress = useCallback(async (input: CustomerAddressInput) => {
    await requestWithRefresh("/store/catalog/account/addresses", {
      method: "POST",
      body: JSON.stringify({
        label: input.label,
        recipient: input.recipient,
        phone: input.phone,
        line1: input.line1,
        line2: input.line2,
        city: input.city,
        province: input.province,
        postal_code: input.postalCode,
        is_default: input.isDefault,
      }),
      headers: {
        "content-type": "application/json",
      },
      credentials: "include",
    });
    await syncAddresses();
    return true;
  }, [syncAddresses]);

  const updateAddress = useCallback(
    async (
      addressId: string,
      patch: Partial<Omit<CustomerAddress, "id">>
    ) => {
      await requestWithRefresh(
        `/store/catalog/account/addresses/${encodeURIComponent(addressId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            label: patch.label,
            recipient: patch.recipient,
            phone: patch.phone,
            line1: patch.line1,
            line2: patch.line2,
            city: patch.city,
            province: patch.province,
            postal_code: patch.postalCode,
            is_default: patch.isDefault,
          }),
          headers: {
            "content-type": "application/json",
          },
          credentials: "include",
        }
      );
      await syncAddresses();
    },
    [syncAddresses]
  );

  const removeAddress = useCallback(async (addressId: string) => {
    await requestWithRefresh(
      `/store/catalog/account/addresses/${encodeURIComponent(addressId)}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );
    await syncAddresses();
  }, [syncAddresses]);

  const setDefaultAddress = useCallback(
    async (addressId: string) => {
      const current = snap.addresses.find((address) => address.id === addressId);
      if (!current) return;

      await updateAddress(addressId, {
        ...current,
        isDefault: true,
      });
    },
    [snap.addresses, updateAddress]
  );

  return {
    hydrated,
    isLoggedIn,
    sessionStatus: snap.status,
    sessionUnavailable,
    sessionError: snap.error,
    customer,
    displayName,
    addresses: snap.addresses,
    login,
    register,
    logout,
    syncSession,
    updateProfile,
    setNotifications,
    changePassword,
    addAddress,
    updateAddress,
    removeAddress,
    setDefaultAddress,
    syncAddresses,
  };
}

function mapOrder(raw: unknown): CustomerOrder | null {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!rec) return null;

  const id = normalizeText(rec.id, 120);
  if (!id) return null;

  const rawItems = Array.isArray(rec.items) ? rec.items : [];
  const metadata =
    rec.metadata && typeof rec.metadata === "object" && !Array.isArray(rec.metadata)
      ? (rec.metadata as Record<string, unknown>)
      : null;
  const rawTimeline =
    metadata && Array.isArray(metadata.timeline) ? metadata.timeline : [];
  const timeline = rawTimeline
    .map((entry) => {
      const timelineRec =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : null;
      if (!timelineRec) return null;

      const at = normalizeText(timelineRec.at, 80);
      const type = normalizeText(timelineRec.type, 100);
      const message = normalizeText(timelineRec.message, 260);
      if (!at || (!type && !message)) return null;

      return {
        id: normalizeText(timelineRec.id, 120),
        at,
        type,
        message,
      };
    })
    .filter(Boolean) as CustomerOrder["timeline"];

  timeline.sort((a, b) => {
    const aTime = Date.parse(a.at);
    const bTime = Date.parse(b.at);
    if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return 0;
    return aTime - bTime;
  });

  const items = rawItems
    .map((entry) => {
      const item =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : null;
      if (!item) return null;

      const id = normalizeText(item.id, 120);
      const name = normalizeText(item.name, 180);
      const brand = normalizeText(item.brand, 120);
      const category = normalizeText(item.category, 120);
      const qty =
        typeof item.qty === "number" ? item.qty : Number(item.qty ?? 0);
      const unitPriceArs =
        typeof item.priceArs === "number"
          ? item.priceArs
          : Number(item.priceArs ?? item.unit_price_ars ?? 0);
      const imageUrl = normalizeText(item.imageUrl ?? item.image_url, 500) || undefined;

      if (!id || !name || !brand || !category) return null;
      if (!Number.isFinite(qty) || qty <= 0) return null;
      if (!Number.isFinite(unitPriceArs) || unitPriceArs <= 0) return null;

      return {
        id,
        name,
        brand,
        category,
        qty: Math.max(1, Math.min(999, Math.trunc(qty))),
        unitPriceArs: Math.max(1, Math.trunc(unitPriceArs)),
        imageUrl,
      };
    })
    .filter(Boolean) as CustomerOrder["items"];

  return {
    timeline,
    items,
    id,
    orderNumber: normalizeText(rec.order_number ?? rec.orderNumber, 120) || id,
    createdAt:
      typeof rec.created_at === "string"
        ? rec.created_at
        : new Date().toISOString(),
    status: normalizeText(rec.status, 60) || "processing",
    paymentStatus: normalizeText(rec.payment_status ?? rec.paymentStatus, 60) || "pending",
    totalArs:
      typeof rec.total_ars === "number"
        ? rec.total_ars
        : Number(rec.total_ars ?? rec.totalArs) || 0,
    itemCount:
      typeof rec.item_count === "number"
        ? rec.item_count
        : Number(rec.item_count ?? rec.itemCount) || 0,
    trackingCode: normalizeText(rec.tracking_code ?? rec.trackingCode, 80) || null,
  };
}

export function useCustomerOrders() {
  const { isLoggedIn, hydrated } = useCustomerSession();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!isLoggedIn) {
      setOrders([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await requestWithRefresh<{ orders?: unknown[] }>(
        "/store/catalog/account/orders",
        {
          method: "GET",
          credentials: "include",
        }
      );
      const mapped = (data.orders ?? [])
        .map(mapOrder)
        .filter(Boolean) as CustomerOrder[];
      setOrders(mapped);
    } catch (err) {
      const mapped = mapApiError(err, "No se pudieron cargar los pedidos.");
      setError(mapped.error ?? "No se pudieron cargar los pedidos.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!hydrated) return;
    void refetch();
  }, [hydrated, refetch]);

  return {
    orders,
    loading,
    error,
    refetch,
  };
}

export async function requestPasswordReset(email: string) {
  return await requestWithRefresh<{
    ok?: boolean;
    message?: string;
    dev_reset_token?: string;
  }>("/store/catalog/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
    headers: {
      "content-type": "application/json",
    },
    credentials: "include",
  });
}

export async function resetPassword(token: string, password: string) {
  return await requestWithRefresh<{ ok?: boolean }>(
    "/store/catalog/auth/reset-password",
    {
      method: "POST",
      body: JSON.stringify({ token, password }),
      headers: {
        "content-type": "application/json",
      },
      credentials: "include",
    }
  );
}

export async function trackStoreTelemetry(
  event: string,
  metadata?: Record<string, unknown>
) {
  await trackStoreTelemetryEvent(event, metadata);
}




