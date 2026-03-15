"use client";

export const ADMIN_QUESTIONS_AUTO_REFRESH_MS = 30_000;
export const ADMIN_QUESTIONS_BACKGROUND_REFRESH_MIN_AGE_MS = 15_000;
export const ADMIN_QUESTIONS_BACKGROUND_REFRESH_DEDUPE_MS = 2_500;
export const ADMIN_QUESTIONS_FETCH_TIMEOUT_MS = 15_000;

export type AdminQuestionsBackgroundRefreshTrigger =
  | "poll"
  | "focus"
  | "visibility";

type ShouldRefreshAdminQuestionsInBackgroundInput = {
  trigger: AdminQuestionsBackgroundRefreshTrigger;
  visibilityState: DocumentVisibilityState;
  now: number;
  inFlight: boolean;
  lastStartedAt: number | null;
  lastSettledAt: number | null;
};

function resolveMinAge(trigger: AdminQuestionsBackgroundRefreshTrigger) {
  if (trigger === "poll") return ADMIN_QUESTIONS_AUTO_REFRESH_MS;
  return ADMIN_QUESTIONS_BACKGROUND_REFRESH_MIN_AGE_MS;
}

export function shouldRefreshAdminQuestionsInBackground(
  input: ShouldRefreshAdminQuestionsInBackgroundInput
) {
  if (input.visibilityState !== "visible") return false;
  if (input.inFlight) return false;

  if (
    input.lastStartedAt !== null &&
    input.now - input.lastStartedAt < ADMIN_QUESTIONS_BACKGROUND_REFRESH_DEDUPE_MS
  ) {
    return false;
  }

  if (input.lastSettledAt === null) return true;

  return input.now - input.lastSettledAt >= resolveMinAge(input.trigger);
}
