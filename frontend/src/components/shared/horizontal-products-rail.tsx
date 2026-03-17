"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";
import styles from "./horizontal-products-rail.module.css";

const EDGE_VISUAL_TOLERANCE_PX = 0.5;
const FADE_MIN_SCROLL_PX = 1;
const FADE_FULL_STRENGTH_PX = 52;
const FADE_MIN_SIZE_PX = 6;
const FADE_MAX_SIZE_PX = 38;
const THUMB_MIN_WIDTH_PX = 36;
const TRACK_HORIZONTAL_PADDING_PX = 1;

type HorizontalProductsRailProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  itemClassName?: string;
};

type RailMetrics = {
  maxScrollLeft: number;
  scrollLeft: number;
  trackInnerWidth: number;
  thumbWidth: number;
  thumbOffset: number;
  maxThumbOffset: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function HorizontalProductsRail({
  ariaLabel,
  children,
  className,
  itemClassName,
}: HorizontalProductsRailProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const items = useMemo(() => Children.toArray(children), [children]);

  const readMetrics = useCallback((): RailMetrics | null => {
    const rail = railRef.current;
    const track = scrollbarTrackRef.current;
    if (!rail || !track) return null;

    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const scrollLeft = clamp(rail.scrollLeft, 0, maxScrollLeft);
    const trackInnerWidth = Math.max(
      0,
      track.clientWidth - TRACK_HORIZONTAL_PADDING_PX * 2
    );

    const thumbWidth =
      maxScrollLeft <= 0 || rail.scrollWidth <= 0
        ? trackInnerWidth
        : clamp(
            (rail.clientWidth / rail.scrollWidth) * trackInnerWidth,
            THUMB_MIN_WIDTH_PX,
            trackInnerWidth
          );

    const maxThumbOffset = Math.max(0, trackInnerWidth - thumbWidth);
    const thumbOffset =
      maxScrollLeft <= 0 || maxThumbOffset <= 0
        ? 0
        : (scrollLeft / maxScrollLeft) * maxThumbOffset;

    return {
      maxScrollLeft,
      scrollLeft,
      trackInnerWidth,
      thumbWidth,
      thumbOffset,
      maxThumbOffset,
    };
  }, []);

  const syncVisualState = useCallback(() => {
    const root = rootRef.current;
    const rail = railRef.current;
    if (!root || !rail) return;

    const metrics = readMetrics();
    if (!metrics) return;

    const {
      maxScrollLeft,
      scrollLeft,
      thumbWidth,
      thumbOffset,
    } = metrics;

    root.style.setProperty("--rail-thumb-width", `${thumbWidth.toFixed(2)}px`);
    root.style.setProperty("--rail-thumb-offset", `${thumbOffset.toFixed(2)}px`);

    if (maxScrollLeft <= 1) {
      root.style.setProperty("--rail-fade-left-opacity", "0");
      root.style.setProperty("--rail-fade-right-opacity", "0");
      root.style.setProperty("--rail-fade-left-size", `${FADE_MIN_SIZE_PX}px`);
      root.style.setProperty("--rail-fade-right-size", `${FADE_MIN_SIZE_PX}px`);
      return;
    }

    const remainingRight = Math.max(0, maxScrollLeft - scrollLeft);
    const railRect = rail.getBoundingClientRect();
    const firstItem = rail.firstElementChild as HTMLElement | null;
    const lastItem = rail.lastElementChild as HTMLElement | null;

    const leftOverflowPx = firstItem
      ? Math.max(0, railRect.left - firstItem.getBoundingClientRect().left)
      : scrollLeft;
    const rightOverflowPx = lastItem
      ? Math.max(0, lastItem.getBoundingClientRect().right - railRect.right)
      : remainingRight;

    const leftDistance =
      leftOverflowPx > EDGE_VISUAL_TOLERANCE_PX
        ? Math.max(0, leftOverflowPx - FADE_MIN_SCROLL_PX)
        : 0;
    const rightDistance =
      rightOverflowPx > EDGE_VISUAL_TOLERANCE_PX
        ? Math.max(0, rightOverflowPx - FADE_MIN_SCROLL_PX)
        : 0;

    const leftProgress = clamp(leftDistance / FADE_FULL_STRENGTH_PX, 0, 1);
    const rightProgress = clamp(rightDistance / FADE_FULL_STRENGTH_PX, 0, 1);
    const leftSize =
      FADE_MIN_SIZE_PX + (FADE_MAX_SIZE_PX - FADE_MIN_SIZE_PX) * leftProgress;
    const rightSize =
      FADE_MIN_SIZE_PX + (FADE_MAX_SIZE_PX - FADE_MIN_SIZE_PX) * rightProgress;

    root.style.setProperty("--rail-fade-left-opacity", leftProgress.toFixed(3));
    root.style.setProperty("--rail-fade-right-opacity", rightProgress.toFixed(3));
    root.style.setProperty("--rail-fade-left-size", `${leftSize.toFixed(2)}px`);
    root.style.setProperty("--rail-fade-right-size", `${rightSize.toFixed(2)}px`);
  }, [readMetrics]);

  useEffect(() => {
    const rail = railRef.current;
    const root = rootRef.current;
    const track = scrollbarTrackRef.current;
    if (!rail || !root || !track) return;

    syncVisualState();
    const rafId = window.requestAnimationFrame(syncVisualState);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncVisualState);

    resizeObserver?.observe(rail);
    resizeObserver?.observe(root);
    resizeObserver?.observe(track);
    rail.addEventListener("scroll", syncVisualState, { passive: true });
    window.addEventListener("resize", syncVisualState);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      rail.removeEventListener("scroll", syncVisualState);
      window.removeEventListener("resize", syncVisualState);
      root.style.removeProperty("--rail-fade-left-opacity");
      root.style.removeProperty("--rail-fade-right-opacity");
      root.style.removeProperty("--rail-fade-left-size");
      root.style.removeProperty("--rail-fade-right-size");
      root.style.removeProperty("--rail-thumb-width");
      root.style.removeProperty("--rail-thumb-offset");
    };
  }, [items.length, syncVisualState]);

  const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-rail-thumb='true']")) return;

    const rail = railRef.current;
    const track = scrollbarTrackRef.current;
    const metrics = readMetrics();
    if (!rail || !track || !metrics) return;
    if (metrics.maxThumbOffset <= 0 || metrics.maxScrollLeft <= 0) return;

    const rect = track.getBoundingClientRect();
    const pointerX = clamp(
      event.clientX - rect.left - TRACK_HORIZONTAL_PADDING_PX,
      0,
      metrics.trackInnerWidth
    );
    const targetThumbOffset = clamp(
      pointerX - metrics.thumbWidth / 2,
      0,
      metrics.maxThumbOffset
    );
    const targetScrollLeft =
      (targetThumbOffset / metrics.maxThumbOffset) * metrics.maxScrollLeft;

    rail.scrollTo({ left: targetScrollLeft, behavior: "smooth" });
  };

  const handleThumbPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const rail = railRef.current;
    const metrics = readMetrics();
    if (!rail || !metrics) return;
    if (metrics.maxThumbOffset <= 0 || metrics.maxScrollLeft <= 0) return;

    setDragging(true);
    const startClientX = event.clientX;
    const startThumbOffset = metrics.thumbOffset;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startClientX;
      const nextThumbOffset = clamp(
        startThumbOffset + deltaX,
        0,
        metrics.maxThumbOffset
      );
      const nextScrollLeft =
        (nextThumbOffset / metrics.maxThumbOffset) * metrics.maxScrollLeft;
      rail.scrollLeft = nextScrollLeft;
    };

    const handlePointerUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  return (
    <div
      ref={rootRef}
      className={cn(styles.root, dragging ? styles.rootDragging : "", className)}
    >
      <div ref={railRef} className={styles.rail} role="region" aria-label={ariaLabel}>
        {items.map((child, index) => (
          <div
            key={isValidElement(child) && child.key != null ? child.key : index}
            className={cn(styles.item, itemClassName)}
          >
            {child}
          </div>
        ))}
      </div>

      <div
        ref={scrollbarTrackRef}
        className={styles.scrollbar}
        onPointerDown={handleTrackPointerDown}
        aria-hidden="true"
      >
        <div
          className={styles.scrollbarThumb}
          data-rail-thumb="true"
          onPointerDown={handleThumbPointerDown}
        />
      </div>
    </div>
  );
}
