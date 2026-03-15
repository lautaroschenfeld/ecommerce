"use client";

export type ToastVariant = "success" | "info" | "warning" | "error";

export type ToastAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export type ToastInput = {
  variant: ToastVariant;
  title: string;
  message?: string;
  durationMs?: number;
  action?: ToastAction;
};

export type NotifyInput = {
  title: string;
  subtitle?: string;
  type?: ToastVariant;
  durationMs?: number;
  action?: ToastAction;
};

const TOAST_EVENT = "app:toast";
const LEGACY_ADMIN_TOAST_EVENT = "admin:toast";

function normalizeVariant(type: unknown): ToastVariant {
  if (
    type === "success" ||
    type === "info" ||
    type === "warning" ||
    type === "error"
  ) {
    return type;
  }
  return "info";
}

export function pushToast(input: ToastInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: input }));
}

/**
 * API simple global para notificaciones.
 * Uso:
 * `notify("Producto guardado", "Se actualizó satisfactoriamente", "success")`
 * `notify({ title: "Error", subtitle: err.message, type: "error" })`
 */
export function notify(
  input: NotifyInput | string,
  subtitle?: string,
  type: ToastVariant = "info"
) {
  if (typeof input === "string") {
    pushToast({
      variant: normalizeVariant(type),
      title: input,
      message: subtitle?.trim() || undefined,
    });
    return;
  }

  pushToast({
    variant: normalizeVariant(input.type),
    title: input.title,
    message: input.subtitle?.trim() || undefined,
    durationMs: input.durationMs,
    action: input.action,
  });
}

export const toasts = {
  success(
    title: string,
    subtitle?: string,
    input?: Omit<NotifyInput, "title" | "subtitle" | "type">
  ) {
    notify({
      title,
      subtitle,
      type: "success",
      durationMs: input?.durationMs,
      action: input?.action,
    });
  },
  info(
    title: string,
    subtitle?: string,
    input?: Omit<NotifyInput, "title" | "subtitle" | "type">
  ) {
    notify({
      title,
      subtitle,
      type: "info",
      durationMs: input?.durationMs,
      action: input?.action,
    });
  },
  warning(
    title: string,
    subtitle?: string,
    input?: Omit<NotifyInput, "title" | "subtitle" | "type">
  ) {
    notify({
      title,
      subtitle,
      type: "warning",
      durationMs: input?.durationMs,
      action: input?.action,
    });
  },
  error(
    title: string,
    subtitle?: string,
    input?: Omit<NotifyInput, "title" | "subtitle" | "type">
  ) {
    notify({
      title,
      subtitle,
      type: "error",
      durationMs: input?.durationMs,
      action: input?.action,
    });
  },
};

export function subscribeToasts(handler: (input: ToastInput) => void) {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const detail = event instanceof CustomEvent ? (event.detail as ToastInput) : null;
    if (!detail || typeof detail !== "object") return;
    if (typeof detail.title !== "string" || typeof detail.variant !== "string") return;
    handler(detail);
  };

  window.addEventListener(TOAST_EVENT, listener);
  // Compatibilidad: escuchar también el evento viejo.
  window.addEventListener(LEGACY_ADMIN_TOAST_EVENT, listener);

  return () => {
    window.removeEventListener(TOAST_EVENT, listener);
    window.removeEventListener(LEGACY_ADMIN_TOAST_EVENT, listener);
  };
}
