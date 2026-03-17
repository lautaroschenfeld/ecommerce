"use client";

import { useSyncExternalStore } from "react";

const STORE_BACKEND_STATUS_EVENT = "store:store:backend-status";
export const STORE_BACKEND_RETRY_SUCCESS_EVENT = "store:backend:retry:success";

type StoreBackendStatus = {
  unavailable: boolean;
  reason: string | null;
  updatedAt: number;
};

let statusSnapshot: StoreBackendStatus = {
  unavailable: false,
  reason: null,
  updatedAt: 0,
};

function notifyStatusChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STORE_BACKEND_STATUS_EVENT));
}

function setStatus(next: StoreBackendStatus) {
  statusSnapshot = next;
  notifyStatusChange();
}

export function markStoreBackendUnavailable(reason = "service_unavailable") {
  setStatus({
    unavailable: true,
    reason,
    updatedAt: Date.now(),
  });
}

export function markStoreBackendHealthy() {
  setStatus({
    unavailable: false,
    reason: null,
    updatedAt: Date.now(),
  });
}

export function getStoreBackendStatusSnapshot() {
  return statusSnapshot;
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const onChange = () => onStoreChange();
  window.addEventListener(STORE_BACKEND_STATUS_EVENT, onChange);
  return () => {
    window.removeEventListener(STORE_BACKEND_STATUS_EVENT, onChange);
  };
}

export function useStoreBackendStatus() {
  return useSyncExternalStore(
    subscribe,
    getStoreBackendStatusSnapshot,
    getStoreBackendStatusSnapshot
  );
}

export async function probeStoreBackend(timeoutMs = 900) {
  const backend =
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:9000";
  const key = process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY?.trim() || "";

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${backend}/store/catalog/brands`, {
      method: "GET",
      headers: key ? { "x-publishable-api-key": key } : undefined,
      signal: controller.signal,
    });

    if (res.ok) {
      markStoreBackendHealthy();
      return true;
    }

    markStoreBackendUnavailable(`http_${res.status}`);
    return false;
  } catch {
    markStoreBackendUnavailable("network");
    return false;
  } finally {
    globalThis.clearTimeout(timer);
  }
}



