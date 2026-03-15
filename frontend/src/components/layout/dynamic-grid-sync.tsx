"use client";

import { useEffect } from "react";

const GRID_BASE = 72;
const GRID_MIN = 64;
const GRID_MAX = 84;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computeGridStep(availableSize: number) {
  const safeSize = Math.max(1, Math.round(availableSize));

  const minSegments = Math.max(1, Math.ceil(safeSize / GRID_MAX));
  const maxSegments = Math.max(1, Math.floor(safeSize / GRID_MIN));

  if (minSegments <= maxSegments) {
    const targetSegments = Math.round(safeSize / GRID_BASE);
    const segments = clamp(targetSegments, minSegments, maxSegments);
    return safeSize / segments;
  }

  return safeSize;
}

export function DynamicGridSync() {
  useEffect(() => {
    const root = document.documentElement;
    let observedHeader: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const syncObservedHeader = () => {
      const nextHeader = document.querySelector<HTMLElement>("[data-site-header]");
      if (nextHeader === observedHeader) return;

      if (resizeObserver && observedHeader) {
        resizeObserver.unobserve(observedHeader);
      }

      observedHeader = nextHeader;

      if (resizeObserver && observedHeader) {
        resizeObserver.observe(observedHeader);
      }
    };

    const updateGrid = () => {
      syncObservedHeader();
      const headerHeight = Math.max(
        0,
        Math.round(observedHeader?.getBoundingClientRect().height ?? 0)
      );
      const viewportWidth = Math.max(1, root.clientWidth);
      const viewportHeight = Math.max(1, window.innerHeight);
      const availableHeight = viewportHeight - headerHeight;
      const gridCellX = computeGridStep(viewportWidth);
      const gridCellY = computeGridStep(availableHeight);

      root.style.setProperty("--dynamic-grid-top", `${headerHeight}px`);
      root.style.setProperty("--dynamic-grid-bottom", "0px");
      root.style.setProperty("--dynamic-grid-cell-x", `${gridCellX.toFixed(3)}px`);
      root.style.setProperty("--dynamic-grid-cell-y", `${gridCellY.toFixed(3)}px`);
      root.style.setProperty("--dynamic-footer-row-height", `${gridCellY.toFixed(3)}px`);
    };

    updateGrid();

    resizeObserver = new ResizeObserver(updateGrid);
    resizeObserver.observe(root);
    syncObservedHeader();

    const mutationObserver = new MutationObserver(updateGrid);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", updateGrid);
    window.addEventListener("orientationchange", updateGrid);

    return () => {
      mutationObserver.disconnect();
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      window.removeEventListener("resize", updateGrid);
      window.removeEventListener("orientationchange", updateGrid);
      root.style.removeProperty("--dynamic-grid-top");
      root.style.removeProperty("--dynamic-grid-bottom");
      root.style.removeProperty("--dynamic-grid-cell-x");
      root.style.removeProperty("--dynamic-grid-cell-y");
      root.style.removeProperty("--dynamic-footer-row-height");
    };
  }, []);

  return null;
}
