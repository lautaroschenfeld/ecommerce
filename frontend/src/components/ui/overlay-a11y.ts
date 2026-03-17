"use client";

export const OVERLAY_SURFACE_SELECTOR = "[data-ui-overlay-surface='true']";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isFocusableElement(element: HTMLElement) {
  if (element.hasAttribute("hidden")) return false;
  if (element.getAttribute("aria-hidden") === "true") return false;
  if (element.getAttribute("disabled") !== null) return false;
  if (element.getClientRects().length === 0) return false;
  return true;
}

export function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    isFocusableElement
  );
}

export function isTopOverlaySurface(element: HTMLElement | null) {
  if (!element) return false;
  const surfaces = Array.from(
    document.querySelectorAll<HTMLElement>(OVERLAY_SURFACE_SELECTOR)
  );
  return surfaces[surfaces.length - 1] === element;
}

export function focusFirstOverlayElement(
  container: HTMLElement | null,
  preferred?: HTMLElement | null
) {
  if (!container) return;

  if (preferred && isFocusableElement(preferred)) {
    preferred.focus();
    return;
  }

  const focusable = getFocusableElements(container);
  if (focusable.length > 0) {
    focusable[0]?.focus();
    return;
  }

  container.focus();
}

export function trapOverlayTabKey(
  event: KeyboardEvent,
  container: HTMLElement | null
) {
  if (!container || event.key !== "Tab") return;

  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (event.shiftKey) {
    if (active === first || !active || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last || !active || !container.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

export function restoreFocus(target: HTMLElement | null) {
  if (!target) return;
  if (!target.isConnected) return;
  target.focus();
}
