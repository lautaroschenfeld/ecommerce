"use client";

import { useEffect, useRef } from "react";

import { trackStoreTelemetry } from "@/lib/store-telemetry";

export function HomeViewTelemetry() {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;

    void trackStoreTelemetry("home_view", {
      path: "/",
    });
  }, []);

  return null;
}
