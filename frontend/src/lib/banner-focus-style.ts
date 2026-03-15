import type { CSSProperties } from "react";

const bannerFocusPositionVar = "--banner-focus-position" as const;
const bannerFocusScaleVar = "--banner-focus-scale" as const;

export function bannerFocusVars(focusX: number, focusY: number, zoom: number) {
  return {
    [bannerFocusPositionVar]: `${focusX}% ${focusY}%`,
    [bannerFocusScaleVar]: String(zoom),
  } as const;
}

export function bannerFocusStyle(
  focusX: number,
  focusY: number,
  zoom: number
): CSSProperties {
  return bannerFocusVars(focusX, focusY, zoom) as CSSProperties;
}
