"use client";

import { useEffect } from "react";

import {
  markStoreBackendUnavailable,
  STORE_BACKEND_RETRY_SUCCESS_EVENT,
} from "@/lib/store-backend-status";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app.error]", {
      message: error?.message,
      digest: error?.digest,
    });
    markStoreBackendUnavailable("app_error");
  }, [error]);

  useEffect(() => {
    const onRetrySuccess = () => {
      reset();
    };

    window.addEventListener(STORE_BACKEND_RETRY_SUCCESS_EVENT, onRetrySuccess);
    return () =>
      window.removeEventListener(STORE_BACKEND_RETRY_SUCCESS_EVENT, onRetrySuccess);
  }, [reset]);

  return null;
}
