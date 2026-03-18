function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getDropdownMotionDurations(motionHeight: number | null | undefined) {
  const normalizedHeight =
    typeof motionHeight === "number" && Number.isFinite(motionHeight)
      ? Math.max(1, motionHeight)
      : 240;

  // Keep short menus faster than tall ones, but still visibly animated.
  const openMs = clamp(Math.round(180 + normalizedHeight * 0.9), 240, 720);
  const closeMs = clamp(Math.round(140 + normalizedHeight * 0.55), 180, 420);

  return { openMs, closeMs };
}
