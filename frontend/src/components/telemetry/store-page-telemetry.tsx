"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import {
  ensureStoreTelemetrySessionStarted,
  trackStoreTelemetry,
} from "@/lib/store-telemetry";

function shouldTrackPage(pathname: string) {
  if (!pathname) return false;
  if (pathname.startsWith("/cuenta/administracion")) return false;
  if (pathname.startsWith("/admin")) return false;
  if (pathname.startsWith("/api")) return false;
  return true;
}

export function StorePageTelemetry() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedRef = useRef("");

  const queryString = searchParams?.toString() ?? "";

  useEffect(() => {
    if (!pathname) return;
    if (!shouldTrackPage(pathname)) return;

    const locationKey = queryString ? `${pathname}?${queryString}` : pathname;
    if (lastTrackedRef.current === locationKey) return;
    lastTrackedRef.current = locationKey;

    ensureStoreTelemetrySessionStarted({
      path: pathname,
      query: queryString || null,
    });

    void trackStoreTelemetry("page_view", {
      path: pathname,
      query: queryString || null,
      title: document.title || null,
      referrer: document.referrer || null,
    });
  }, [pathname, queryString]);

  return null;
}
