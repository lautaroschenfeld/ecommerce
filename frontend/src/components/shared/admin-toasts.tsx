"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Info,
  X,
} from "lucide-react";
import { nanoid } from "nanoid";

import type { ToastInput, ToastVariant } from "@/lib/notifications";
import { subscribeToasts } from "@/lib/notifications";
import { STORE_BACKEND_URL } from "@/lib/store-client";
import { invalidateAdminOrders } from "@/lib/store-admin-orders";
import { invalidateAdminProductQuestions } from "@/lib/store-admin-questions";

import styles from "./admin-toasts.module.css";

type Toast = ToastInput & {
  id: string;
  createdAt: number;
  durationMs: number;
};

type ToastState = {
  visible: Toast[];
  queue: Toast[];
};

type ToastAction =
  | { type: "PUSH"; toast: Toast; forceVisible?: boolean }
  | { type: "DISMISS"; id: string }
  | { type: "UPDATE"; id: string; patch: Partial<Toast> };

type ToastTimer = {
  timeoutId: number | null;
  startedAtMs: number;
  remainingMs: number;
};

type AdminToastsContextValue = {
  push: (input: ToastInput) => string;
  dismiss: (id: string) => void;
};

const AdminToastsContext = createContext<AdminToastsContextValue | null>(null);

const MAX_VISIBLE = 3;

const DEFAULT_DURATIONS_MS: Record<ToastVariant, number> = {
  success: 3800,
  info: 5200,
  warning: 6000,
  error: 9000,
};

function newToastId() {
  return `t_${nanoid(16)}`;
}

function getDurationMs(input: ToastInput) {
  if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs)) {
    return Math.max(0, Math.trunc(input.durationMs));
  }
  return DEFAULT_DURATIONS_MS[input.variant];
}

function iconForVariant(variant: ToastVariant) {
  if (variant === "success") return Check;
  if (variant === "warning") return AlertTriangle;
  if (variant === "error") return X;
  return Info;
}

function toastReducer(state: ToastState, action: ToastAction): ToastState {
  if (action.type === "PUSH") {
    if (state.visible.length < MAX_VISIBLE) {
      return { ...state, visible: [...state.visible, action.toast] };
    }
    if (action.forceVisible) {
      return { ...state, visible: [...state.visible.slice(1), action.toast] };
    }
    return { ...state, queue: [...state.queue, action.toast] };
  }

  if (action.type === "DISMISS") {
    const nextVisible = state.visible.filter((t) => t.id !== action.id);
    const nextQueue = state.queue.filter((t) => t.id !== action.id);

    // Nothing removed from visible; only clean up queue.
    if (nextVisible.length === state.visible.length) {
      return { visible: nextVisible, queue: nextQueue };
    }

    if (nextVisible.length < MAX_VISIBLE && nextQueue.length > 0) {
      const [head, ...rest] = nextQueue;
      return { visible: [...nextVisible, head], queue: rest };
    }

    return { visible: nextVisible, queue: nextQueue };
  }

  const applyPatch = (list: Toast[]) => {
    let changed = false;
    const next = list.map((toast) => {
      if (toast.id !== action.id) return toast;
      changed = true;
      return { ...toast, ...action.patch };
    });
    return { changed, next };
  };

  const updatedVisible = applyPatch(state.visible);
  const updatedQueue = applyPatch(state.queue);
  if (!updatedVisible.changed && !updatedQueue.changed) return state;

  return { visible: updatedVisible.next, queue: updatedQueue.next };
}

export function AdminToastsProvider({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const [state, dispatch] = useReducer(toastReducer, { visible: [], queue: [] });
  const visible = state.visible;
  const timersRef = useRef(new Map<string, ToastTimer>());
  const orderBurstRef = useRef<{ toastId: string | null; count: number; lastAtMs: number }>({
    toastId: null,
    count: 0,
    lastAtMs: 0,
  });

  const clearTimer = useCallback((id: string) => {
    const current = timersRef.current.get(id);
    if (current?.timeoutId != null) {
      window.clearTimeout(current.timeoutId);
    }
    timersRef.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);

      if (orderBurstRef.current.toastId === id) {
        orderBurstRef.current = { toastId: null, count: 0, lastAtMs: 0 };
      }

      dispatch({ type: "DISMISS", id });
    },
    [clearTimer]
  );

  const pauseTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (!timer || timer.timeoutId == null) return;

    const elapsed = Date.now() - timer.startedAtMs;
    const remaining = Math.max(0, timer.remainingMs - elapsed);
    window.clearTimeout(timer.timeoutId);
    timersRef.current.set(id, {
      timeoutId: null,
      startedAtMs: Date.now(),
      remainingMs: remaining,
    });
  }, []);

  const resumeTimer = useCallback(
    (id: string) => {
      const timer = timersRef.current.get(id);
      if (!timer || timer.timeoutId != null) return;

      if (timer.remainingMs <= 0) {
        dismiss(id);
        return;
      }

      const timeoutId = window.setTimeout(() => dismiss(id), timer.remainingMs);
      timersRef.current.set(id, {
        timeoutId,
        startedAtMs: Date.now(),
        remainingMs: timer.remainingMs,
      });
    },
    [dismiss]
  );

  const push = useCallback(
    (input: ToastInput) => {
      const toast: Toast = {
        ...input,
        id: newToastId(),
        createdAt: Date.now(),
        durationMs: getDurationMs(input),
      };

      dispatch({ type: "PUSH", toast });

      return toast.id;
    },
    []
  );

  const pushForceVisible = useCallback((input: ToastInput) => {
    const toast: Toast = {
      ...input,
      id: newToastId(),
      createdAt: Date.now(),
      durationMs: getDurationMs(input),
    };
    dispatch({ type: "PUSH", toast, forceVisible: true });
    return toast.id;
  }, []);

  const updateToast = useCallback(
    (id: string, patch: Partial<ToastInput> & { durationMs?: number }) => {
      clearTimer(id);
      dispatch({
        type: "UPDATE",
        id,
        patch: {
          ...patch,
          createdAt: Date.now(),
          ...(patch.durationMs !== undefined ? { durationMs: patch.durationMs } : null),
        } as Partial<Toast>,
      });
    },
    [clearTimer]
  );

  const ctxValue = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  useEffect(() => {
    return subscribeToasts((input) => {
      push(input);
    });
  }, [push]);

  useEffect(() => {
    const visibleIds = new Set(visible.map((t) => t.id));

    // Start timers for new visible toasts.
    for (const toast of visible) {
      if (toast.durationMs <= 0) continue;
      if (timersRef.current.has(toast.id)) continue;

      const timeoutId = window.setTimeout(() => dismiss(toast.id), toast.durationMs);
      timersRef.current.set(toast.id, {
        timeoutId,
        startedAtMs: Date.now(),
        remainingMs: toast.durationMs,
      });
    }

    // Clean up timers for removed toasts.
    for (const [id] of timersRef.current.entries()) {
      if (visibleIds.has(id)) continue;
      clearTimer(id);
    }

    // Reset burst tracking if the toast was removed (e.g. overflow trimming).
    const burstId = orderBurstRef.current.toastId;
    if (burstId) {
      const stillVisible = visibleIds.has(burstId);
      const stillQueued = state.queue.some((t) => t.id === burstId);
      if (!stillVisible && !stillQueued) {
        orderBurstRef.current = { toastId: null, count: 0, lastAtMs: 0 };
      }
    }
  }, [clearTimer, dismiss, state.queue, visible]);

  useEffect(() => {
    const url = new URL("/admin/notifications/stream", STORE_BACKEND_URL).toString();

    let es: EventSource | null = null;
    try {
      es = new EventSource(url, { withCredentials: true });
    } catch {
      return;
    }

    const onOrderCreated = (event: MessageEvent) => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(String(event.data || ""));
      } catch {
        return;
      }

      const parsedRecord =
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      const payload = parsedRecord?.payload ?? parsed;
      const payloadRecord =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
      const orderNumber =
        typeof payloadRecord?.orderNumber === "string" ? payloadRecord.orderNumber : "";

      invalidateAdminOrders();

      const now = Date.now();
      const burst = orderBurstRef.current;
      const withinBurst = burst.toastId && now - burst.lastAtMs < 15000;

      if (withinBurst && burst.toastId) {
        burst.count += 1;
        burst.lastAtMs = now;

        const count = burst.count;
        const title = "Pedidos nuevos recibidos";
        const message =
          count === 1 && orderNumber
            ? `Pedido ${orderNumber}`
            : `Llegaron ${count} pedidos nuevos.`;

        updateToast(burst.toastId, {
          variant: "info",
          title,
          message,
          action: { label: "Ver pedidos", href: "/cuenta/administracion/ordenes" },
          durationMs: 6500,
        });
        return;
      }

      const title = "Nuevo pedido recibido";
      const message = orderNumber ? `Pedido ${orderNumber}` : "Se recibió un nuevo pedido.";

      const toastId = pushForceVisible({
        variant: "info",
        title,
        message,
        durationMs: 6500,
        action: { label: "Ver pedidos", href: "/cuenta/administracion/ordenes" },
      });

      orderBurstRef.current = { toastId, count: 1, lastAtMs: now };
    };

    const onProductQuestionChanged = () => {
      invalidateAdminProductQuestions();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    es.addEventListener("order.created", onOrderCreated as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    es.addEventListener("product_question.created", onProductQuestionChanged as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    es.addEventListener("product_question.updated", onProductQuestionChanged as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    es.addEventListener("product_question.deleted", onProductQuestionChanged as any);

    return () => {
      try {
        es?.close();
      } catch {
        // ignore
      }
    };
  }, [pushForceVisible, updateToast]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        if (timer.timeoutId != null) window.clearTimeout(timer.timeoutId);
      }
      timers.clear();
    };
  }, []);

  const motionProps = reduceMotion
    ? {
        initial: { y: 0, scale: 1 },
        animate: { y: 0, scale: 1 },
        exit: { y: 0, scale: 1 },
        transition: { duration: 0.12 },
      }
    : {
        initial: { y: -10, scale: 0.98 },
        animate: { y: 0, scale: 1 },
        exit: { y: -10, scale: 0.98 },
        transition: { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.7 },
      };

  return (
    <AdminToastsContext.Provider value={ctxValue}>
      {children}

      <div
        className={styles.viewport}
        role="region"
        aria-label="Notificaciones"
        aria-live="polite"
        aria-relevant="additions removals"
      >
        <AnimatePresence initial={false}>
          {visible.map((toast) => (
            <motion.div key={toast.id} {...motionProps} layout>
              <div
                className={`${styles.toast} ${styles[`tone_${toast.variant}`]} ${
                  !toast.message && !toast.action ? styles.toastCompact : ""
                }`}
                onPointerEnter={() => pauseTimer(toast.id)}
                onPointerLeave={() => resumeTimer(toast.id)}
              >
                <div className={styles.iconWrap} aria-hidden>
                  {(() => {
                    const Icon = iconForVariant(toast.variant);
                    return <Icon size={18} />;
                  })()}
                </div>

                <div className={styles.content}>
                  <p className={styles.title}>{toast.title}</p>
                  {toast.message ? (
                    <p className={styles.message}>{toast.message}</p>
                  ) : null}

                  {toast.action ? (
                    <div className={styles.actions}>
                      {toast.action.href ? (
                        <Link
                          href={toast.action.href}
                          className={styles.action}
                          onClick={() => dismiss(toast.id)}
                        >
                          {toast.action.label}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className={styles.action}
                          onClick={() => {
                            toast.action?.onClick?.();
                            dismiss(toast.id);
                          }}
                        >
                          {toast.action.label}
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  className={styles.close}
                  aria-label="Cerrar"
                  onClick={() => dismiss(toast.id)}
                >
                  <X size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AdminToastsContext.Provider>
  );
}

export function useAdminToasts() {
  const ctx = useContext(AdminToastsContext);
  if (!ctx) {
    throw new Error("useAdminToasts must be used within <AdminToastsProvider />");
  }
  return ctx;
}
