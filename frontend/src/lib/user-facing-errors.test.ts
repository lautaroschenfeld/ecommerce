import { describe, expect, it } from "vitest";

import { ApiHttpError } from "@/lib/store-client";
import {
  FRIENDLY_ERROR_MESSAGES,
  mapFriendlyError,
} from "@/lib/user-facing-errors";

describe("mapFriendlyError", () => {
  it("maps 401 publishable key errors as service unavailable", () => {
    const error = new ApiHttpError({
      status: 401,
      message: "Publishable API key required.",
    });

    const mapped = mapFriendlyError(
      error,
      "No pudimos cargar el producto. Intenta nuevamente."
    );

    expect(mapped).toBe(FRIENDLY_ERROR_MESSAGES.serviceUnavailable);
  });

  it("keeps session-expired mapping for 401 auth errors", () => {
    const error = new ApiHttpError({
      status: 401,
      message: "Not authenticated",
    });

    const mapped = mapFriendlyError(
      error,
      "No pudimos cargar el producto. Intenta nuevamente."
    );

    expect(mapped).toBe(FRIENDLY_ERROR_MESSAGES.sessionExpired);
  });
});
