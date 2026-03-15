"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Monitor, Smartphone, Tablet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useConfirmModal } from "@/components/ui/confirm-modal";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import styles from "./hero-banner-editor-dialog.module.css";

const CANVAS_WIDTH = 2560;
const STRIP_HEIGHT = 423;
const TABLET_WIDTH = 1855;
const ALL_DEVICES_WIDTH = 1546;

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function formatAspectRatio(width: number, height: number) {
  return `${(width / height).toFixed(2)}:1`;
}

const DESKTOP_SPEC = `${CANVAS_WIDTH}x${STRIP_HEIGHT} - ${formatAspectRatio(
  CANVAS_WIDTH,
  STRIP_HEIGHT
)}`;
const TABLET_SPEC = `${TABLET_WIDTH}x${STRIP_HEIGHT} - ${formatAspectRatio(
  TABLET_WIDTH,
  STRIP_HEIGHT
)}`;
const ALL_DEVICES_SPEC = `${ALL_DEVICES_WIDTH}x${STRIP_HEIGHT} - ${formatAspectRatio(
  ALL_DEVICES_WIDTH,
  STRIP_HEIGHT
)}`;

type HeroBannerEditorDialogProps = {
  open: boolean;
  imageUrl: string;
  initialFocusX: number;
  initialFocusY: number;
  initialZoom: number;
  onCancel: () => void;
  onApply: (next: { focusX: number; focusY: number; zoom: number }) => void;
};

type ImageSize = {
  width: number;
  height: number;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function toFixed2(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function toCoverSize(
  frameWidth: number,
  frameHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  zoom: number
) {
  const scale = Math.max(frameWidth / sourceWidth, frameHeight / sourceHeight);
  return {
    width: sourceWidth * scale * zoom,
    height: sourceHeight * scale * zoom,
  };
}

function focusToOffset(frameSize: number, imageSize: number, focusPercent: number) {
  return (frameSize - imageSize) * (focusPercent / 100);
}

function offsetToFocus(frameSize: number, imageSize: number, offset: number) {
  const delta = frameSize - imageSize;
  if (Math.abs(delta) < 0.0001) return 50;
  return clampPercent((offset / delta) * 100);
}

export function HeroBannerEditorDialog({
  open,
  imageUrl,
  initialFocusX,
  initialFocusY,
  initialZoom,
  onCancel,
  onApply,
}: HeroBannerEditorDialogProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    frameWidth: number;
    frameHeight: number;
    startFocusX: number;
    startFocusY: number;
  } | null>(null);

  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [focusX, setFocusX] = useState(clampPercent(initialFocusX));
  const [focusY, setFocusY] = useState(clampPercent(initialFocusY));
  const [zoom, setZoom] = useState(clampZoom(initialZoom));
  const { confirm, confirmModal } = useConfirmModal();

  const normalizedInitialFocusX = clampPercent(initialFocusX);
  const normalizedInitialFocusY = clampPercent(initialFocusY);
  const normalizedInitialZoom = clampZoom(initialZoom);
  const hasDirtyChanges =
    toFixed2(focusX) !== toFixed2(normalizedInitialFocusX) ||
    toFixed2(focusY) !== toFixed2(normalizedInitialFocusY) ||
    toFixed2(zoom) !== toFixed2(normalizedInitialZoom);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.setProperty("--banner-focus-position", `${focusX}% ${focusY}%`);
    stage.style.setProperty("--banner-focus-scale", String(zoom));
  }, [focusX, focusY, zoom]);

  function nudgeFocus(axis: "x" | "y", delta: number) {
    if (axis === "x") {
      setFocusX((current) => clampPercent(current + delta));
      return;
    }
    setFocusY((current) => clampPercent(current + delta));
  }

  function stopDragging() {
    pointerRef.current = null;
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !stageRef.current || !imageSize) return;

    const rect = stageRef.current.getBoundingClientRect();
    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      frameWidth: rect.width,
      frameHeight: rect.height,
      startFocusX: focusX,
      startFocusY: focusY,
    };

    stageRef.current.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current || pointerRef.current.pointerId !== event.pointerId || !imageSize) {
      return;
    }

    const drag = pointerRef.current;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const cover = toCoverSize(
      drag.frameWidth,
      drag.frameHeight,
      imageSize.width,
      imageSize.height,
      zoom
    );

    const startOffsetX = focusToOffset(drag.frameWidth, cover.width, drag.startFocusX);
    const startOffsetY = focusToOffset(drag.frameHeight, cover.height, drag.startFocusY);
    const nextOffsetX = startOffsetX + deltaX;
    const nextOffsetY = startOffsetY + deltaY;

    setFocusX(offsetToFocus(drag.frameWidth, cover.width, nextOffsetX));
    setFocusY(offsetToFocus(drag.frameHeight, cover.height, nextOffsetY));
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current || pointerRef.current.pointerId !== event.pointerId) return;
    if (stageRef.current?.hasPointerCapture(event.pointerId)) {
      stageRef.current.releasePointerCapture(event.pointerId);
    }
    stopDragging();
  }

  function onPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current || pointerRef.current.pointerId !== event.pointerId) return;
    stopDragging();
  }

  function onStageKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 5 : 1;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudgeFocus("x", -step);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      nudgeFocus("x", step);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      nudgeFocus("y", -step);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      nudgeFocus("y", step);
    }
  }

  async function requestCancel() {
    stopDragging();
    if (!hasDirtyChanges) {
      onCancel();
      return;
    }

    const confirmed = await confirm({
      title: "Descartar ajustes del banner",
      description:
        "Hay cambios sin aplicar en el encuadre y el zoom. Si cierras ahora, se van a perder.",
      confirmLabel: "Descartar cambios",
      cancelLabel: "Seguir editando",
      confirmVariant: "destructive",
    });

    if (confirmed) {
      onCancel();
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && void requestCancel()}>
        <DialogContent className={styles.dialog}>
          <DialogHeader>
            <DialogTitle>Personalizar banner del hero</DialogTitle>
          </DialogHeader>

          <div className={styles.stageShell}>
            <div
              ref={stageRef}
              className={styles.stage}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onLostPointerCapture={stopDragging}
              onKeyDown={onStageKeyDown}
              tabIndex={0}
              aria-label="Vista previa del banner. Usa arrastrar o las flechas para ajustar el encuadre."
            >
              {imageUrl ? (
                <Image
                  key={imageUrl}
                  src={imageUrl}
                  alt=""
                  fill
                  draggable={false}
                  className={styles.stageImage}
                  sizes="(max-width: 900px) 100vw, 70rem"
                  loading="lazy"
                  onLoad={(event) => {
                    const target = event.currentTarget as HTMLImageElement;
                    const width = target.naturalWidth;
                    const height = target.naturalHeight;
                    if (!width || !height) return;
                    setImageSize({ width, height });
                    setImageFailed(false);
                  }}
                  onError={() => {
                    setImageFailed(true);
                    setImageSize(null);
                  }}
                />
              ) : null}

              <div className={styles.overlayRoot} aria-hidden>
                <div className={styles.overlayDesktop} />
                <div className={styles.overlayTablet} />
                <div className={styles.overlayAllDevices} />
                <div className={styles.labelDesktop}>
                  <span className={styles.labelTitle}>
                    <Monitor size={14} />
                    Computadoras
                  </span>
                  <br />
                  <span className={styles.labelSpec}>{DESKTOP_SPEC}</span>
                </div>
                <div className={styles.labelTablet}>
                  <span className={styles.labelTitle}>
                    <Tablet size={14} />
                    Tablets
                  </span>
                  <br />
                  <span className={styles.labelSpec}>{TABLET_SPEC}</span>
                </div>
                <div className={styles.labelMobile}>
                  <span className={styles.labelTitle}>
                    <Smartphone size={14} />
                    Todos los dispositivos
                  </span>
                  <br />
                  <span className={styles.labelSpec}>{ALL_DEVICES_SPEC}</span>
                </div>
              </div>

              {!imageSize && !imageFailed ? (
                <div className={styles.loading}>Cargando imagen...</div>
              ) : null}
              {imageFailed ? (
                <div className={styles.loading}>No se pudo cargar la imagen.</div>
              ) : null}
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.controlField}>
              <div className={styles.controlHeader}>
                <label className={styles.sliderLabel} htmlFor="banner_focus_x_range">
                  Encuadre horizontal
                </label>
                <span className={styles.controlValue}>{formatPercent(focusX)}</span>
              </div>
              <input
                id="banner_focus_x_range"
                className={styles.slider}
                type="range"
                min={0}
                max={100}
                step={1}
                value={focusX}
                onChange={(event) => setFocusX(clampPercent(Number(event.target.value)))}
              />
            </div>

            <div className={styles.controlField}>
              <div className={styles.controlHeader}>
                <label className={styles.sliderLabel} htmlFor="banner_focus_y_range">
                  Encuadre vertical
                </label>
                <span className={styles.controlValue}>{formatPercent(focusY)}</span>
              </div>
              <input
                id="banner_focus_y_range"
                className={styles.slider}
                type="range"
                min={0}
                max={100}
                step={1}
                value={focusY}
                onChange={(event) => setFocusY(clampPercent(Number(event.target.value)))}
              />
            </div>

            <div className={styles.controlField}>
              <div className={styles.controlHeader}>
                <label className={styles.sliderLabel} htmlFor="banner_zoom_range">
                  Zoom
                </label>
                <span className={styles.controlValue}>{zoom.toFixed(2)}x</span>
              </div>
              <input
                id="banner_zoom_range"
                className={styles.slider}
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(event) => setZoom(clampZoom(Number(event.target.value)))}
              />
            </div>
          </div>

          <DialogFooter className={styles.footer}>
            <Button type="button" variant="ghost" onClick={() => void requestCancel()}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() =>
                onApply({
                  focusX: toFixed2(focusX),
                  focusY: toFixed2(focusY),
                  zoom: toFixed2(zoom),
                })
              }
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmModal}
    </>
  );
}
