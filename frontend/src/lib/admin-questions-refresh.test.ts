import { describe, expect, it } from "vitest";

import {
  ADMIN_QUESTIONS_AUTO_REFRESH_MS,
  ADMIN_QUESTIONS_BACKGROUND_REFRESH_DEDUPE_MS,
  ADMIN_QUESTIONS_BACKGROUND_REFRESH_MIN_AGE_MS,
  shouldRefreshAdminQuestionsInBackground,
} from "@/lib/admin-questions-refresh";

describe("shouldRefreshAdminQuestionsInBackground", () => {
  it("skips background refresh while the tab is hidden", () => {
    expect(
      shouldRefreshAdminQuestionsInBackground({
        trigger: "poll",
        visibilityState: "hidden",
        now: ADMIN_QUESTIONS_AUTO_REFRESH_MS * 2,
        inFlight: false,
        lastStartedAt: null,
        lastSettledAt: 0,
      })
    ).toBe(false);
  });

  it("skips background refresh while a request is already in flight", () => {
    expect(
      shouldRefreshAdminQuestionsInBackground({
        trigger: "focus",
        visibilityState: "visible",
        now: ADMIN_QUESTIONS_BACKGROUND_REFRESH_MIN_AGE_MS * 2,
        inFlight: true,
        lastStartedAt: 0,
        lastSettledAt: 0,
      })
    ).toBe(false);
  });

  it("dedupes focus and visibility events fired right after a fetch starts", () => {
    expect(
      shouldRefreshAdminQuestionsInBackground({
        trigger: "visibility",
        visibilityState: "visible",
        now: ADMIN_QUESTIONS_BACKGROUND_REFRESH_DEDUPE_MS - 1,
        inFlight: false,
        lastStartedAt: 0,
        lastSettledAt: 0,
      })
    ).toBe(false);
  });

  it("refreshes on focus only when the page data is stale enough", () => {
    expect(
      shouldRefreshAdminQuestionsInBackground({
        trigger: "focus",
        visibilityState: "visible",
        now: ADMIN_QUESTIONS_BACKGROUND_REFRESH_MIN_AGE_MS - 1,
        inFlight: false,
        lastStartedAt: 0,
        lastSettledAt: 0,
      })
    ).toBe(false);

    expect(
      shouldRefreshAdminQuestionsInBackground({
        trigger: "focus",
        visibilityState: "visible",
        now: ADMIN_QUESTIONS_BACKGROUND_REFRESH_MIN_AGE_MS,
        inFlight: false,
        lastStartedAt: 0,
        lastSettledAt: 0,
      })
    ).toBe(true);
  });

  it("refreshes polling only after the full polling window", () => {
    expect(
      shouldRefreshAdminQuestionsInBackground({
        trigger: "poll",
        visibilityState: "visible",
        now: ADMIN_QUESTIONS_AUTO_REFRESH_MS - 1,
        inFlight: false,
        lastStartedAt: 0,
        lastSettledAt: 0,
      })
    ).toBe(false);

    expect(
      shouldRefreshAdminQuestionsInBackground({
        trigger: "poll",
        visibilityState: "visible",
        now: ADMIN_QUESTIONS_AUTO_REFRESH_MS,
        inFlight: false,
        lastStartedAt: 0,
        lastSettledAt: 0,
      })
    ).toBe(true);
  });
});
