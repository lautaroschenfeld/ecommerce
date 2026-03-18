import { describe, expect, it } from "vitest";

import { createUnavailableSessionSnapshot } from "@/lib/customer-auth";

describe("createUnavailableSessionSnapshot", () => {
  it("drops any authenticated session state and marks the snapshot as unavailable", () => {
    const snapshot = createUnavailableSessionSnapshot(
      1234,
      new Error("Failed to fetch")
    );

    expect(snapshot).toEqual({
      customer: null,
      cart: [],
      addresses: [],
      hydrated: true,
      updatedAt: 1234,
      status: "unavailable",
      error: "Servicio temporalmente no disponible. Intenta nuevamente en unos minutos.",
    });
  });
});
