"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";

import {
  probeStoreBackend,
  STORE_BACKEND_RETRY_SUCCESS_EVENT,
  useStoreBackendStatus,
} from "@/lib/store-backend-status";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import styles from "./store-backend-modal.module.css";

const RETRY_FEEDBACK_MS = 3000;
const RETRY_STATUS_FEEDBACK_MS = 1800;
const RETRY_SUCCESS_CLOSE_DELAY_MS = 700;

type RetryStatusTone = "idle" | "success" | "error";

function isStorefrontCriticalPath(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname.startsWith("/productos") ||
    pathname.startsWith("/carrito") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/ingresar")
  );
}

function needsProbing(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname.startsWith("/carrito") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/ingresar")
  );
}

export function StoreBackendModal() {
  const pathname = usePathname();
  const { unavailable } = useStoreBackendStatus();
  const [retrying, setRetrying] = useState(false);
  const [retryTone, setRetryTone] = useState<RetryStatusTone>("idle");
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled = useMemo(
    () => isStorefrontCriticalPath(pathname),
    [pathname]
  );

  useEffect(() => {
    if (!needsProbing(pathname)) return;
    void probeStoreBackend();
  }, [pathname]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) globalThis.clearTimeout(feedbackTimerRef.current);
      if (closeTimerRef.current) globalThis.clearTimeout(closeTimerRef.current);
    },
    []
  );

  function setRetryToneWithAutoReset(tone: RetryStatusTone) {
    if (feedbackTimerRef.current) globalThis.clearTimeout(feedbackTimerRef.current);
    setRetryTone(tone);
    if (tone === "idle") return;
    feedbackTimerRef.current = globalThis.setTimeout(() => {
      setRetryTone("idle");
      feedbackTimerRef.current = null;
    }, RETRY_STATUS_FEEDBACK_MS);
  }

  const shouldOpen = enabled && unavailable;
  const keepOpenForSuccess = enabled && retryTone === "success";

  return (
    <Dialog open={shouldOpen || keepOpenForSuccess}>
      <DialogContent className={styles.dialog} dismissible={false}>
        <DialogHeader className={styles.header}>
          <div className={styles.iconWrap} aria-hidden>
            <AlertCircle size={18} />
          </div>
          <DialogTitle>Servicio temporalmente no disponible</DialogTitle>
          <DialogDescription>
            No pudimos conectar con el sistema en este momento. Volve a intentarlo en
            unos minutos.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className={styles.footer}>
          <Button
            type="button"
            className={cn(
              styles.retryButton,
              retryTone === "success" ? styles.retryButtonSuccess : "",
              retryTone === "error" ? styles.retryButtonError : ""
            )}
            onClick={async () => {
              if (retrying || retryTone === "error") return;
              if (closeTimerRef.current) {
                globalThis.clearTimeout(closeTimerRef.current);
                closeTimerRef.current = null;
              }
              setRetrying(true);
              setRetryToneWithAutoReset("idle");
              const [ok] = await Promise.all([
                probeStoreBackend(),
                new Promise((resolve) =>
                  globalThis.setTimeout(resolve, RETRY_FEEDBACK_MS)
                ),
              ]);
              setRetrying(false);
              if (ok) {
                window.dispatchEvent(new Event(STORE_BACKEND_RETRY_SUCCESS_EVENT));
                setRetryToneWithAutoReset("success");
                closeTimerRef.current = globalThis.setTimeout(() => {
                  closeTimerRef.current = null;
                }, RETRY_SUCCESS_CLOSE_DELAY_MS);
                return;
              }
              setRetryToneWithAutoReset("error");
            }}
            disabled={retrying || retryTone === "error"}
          >
            {retrying || retryTone === "idle" ? (
              <RefreshCw size={16} className={retrying ? styles.spin : ""} />
            ) : null}
            {retrying
              ? "Reintentando..."
              : retryTone === "success"
                ? "Conexion restablecida"
                : retryTone === "error"
                  ? "Sin conexion"
                  : "Reintentar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
