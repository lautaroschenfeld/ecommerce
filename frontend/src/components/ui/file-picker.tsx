"use client";

import * as React from "react";
import {
  FileText,
  Image as ImageIcon,
  UploadCloud,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import styles from "./file-picker.module.css";

export type FilePickerSize = "sm" | "md";

export type FilePickerProps = {
  id?: string;
  name?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  size?: FilePickerSize;
  placeholder?: string;
  showSubtitle?: boolean;
  value?: File[];
  onFiles: (files: File[]) => void;
  clearLabel?: string;
  "aria-label"?: string;
};

function toImageFilesFromClipboard(data: DataTransfer | null) {
  if (!data) return [];

  const fromFiles = Array.from(data.files ?? []).filter((file) =>
    file.type.toLowerCase().startsWith("image/")
  );
  if (fromFiles.length > 0) return fromFiles;

  const fromItems: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    if (!item.type.toLowerCase().startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) fromItems.push(file);
  }

  return fromItems;
}

function mimeToExt(mime: string) {
  const normalized = mime.trim().toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  const raw = normalized.split("/")[1] ?? "png";
  const cleaned = raw.replace(/[^a-z0-9]/g, "");
  return cleaned || "png";
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const rounded = idx === 0 ? Math.round(val) : Math.round(val * 10) / 10;
  return `${rounded} ${units[idx]}`;
}

function normalizeAcceptHint(accept?: string) {
  const raw = accept?.trim();
  if (!raw) return "";

  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const labels = tokens.map((token) => {
    const lower = token.toLowerCase();
    if (lower === "image/*") return "Imágenes";
    if (lower === "application/pdf") return "PDF";
    if (lower === "image/jpeg") return "JPG";
    if (lower === "image/png") return "PNG";
    if (lower === "image/webp") return "WEBP";
    if (lower.includes("/")) return lower.split("/").pop()?.toUpperCase() || token;
    return token.toUpperCase();
  });

  const deduped = Array.from(new Set(labels));
  if (!deduped.length) return "";

  // Keep it short.
  return deduped.slice(0, 4).join(" · ");
}

function guessKind(file: File | undefined) {
  const type = file?.type?.toLowerCase() || "";
  if (!type) return "file";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  return "file";
}

export function FilePicker({
  id,
  name,
  accept,
  multiple = false,
  disabled = false,
  className,
  size = "md",
  placeholder,
  showSubtitle = false,
  value,
  onFiles,
  clearLabel = "Quitar",
  "aria-label": ariaLabel,
  ...props
}: FilePickerProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [internalFiles, setInternalFiles] = React.useState<File[]>([]);
  const [hoverActive, setHoverActive] = React.useState(false);
  const subtitleId = React.useId();
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    inOverlay: boolean;
  } | null>(null);

  const controlled = value !== undefined;
  const files = controlled ? value : internalFiles;

  const acceptHint = React.useMemo(() => normalizeAcceptHint(accept), [accept]);
  const hasFiles = files.length > 0;
  const totalSize = React.useMemo(
    () => files.reduce((acc, file) => acc + (Number.isFinite(file.size) ? file.size : 0), 0),
    [files]
  );

  const openPicker = React.useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const commitFiles = React.useCallback(
    (next: File[]) => {
      if (!controlled) setInternalFiles(next);
      onFiles(next);
      // Allow selecting the same file again.
      if (inputRef.current) inputRef.current.value = "";
    },
    [controlled, onFiles]
  );

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    commitFiles(picked);
  };

  const commitPickedFiles = React.useCallback(
    (picked: File[]) => {
      if (!picked.length) return;
      commitFiles(multiple ? picked : picked.slice(0, 1));
    },
    [commitFiles, multiple]
  );

  const onClear = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled) return;
    commitFiles([]);
  };

  const onDragEnter = (event: React.DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  };

  const onDragOver = (event: React.DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  };

  const onDragLeave = (event: React.DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  };

  const onDrop = (event: React.DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (!dropped.length) return;
    commitPickedFiles(dropped);
  };

  const onPaste = (event: React.ClipboardEvent<HTMLElement>) => {
    if (disabled) return;
    const pasted = toImageFilesFromClipboard(event.clipboardData);
    if (!pasted.length) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(null);
    commitPickedFiles(pasted);
  };

  const pasteFromClipboardMenu = React.useCallback(async () => {
    if (disabled) return;
    setContextMenu(null);

    if (
      typeof navigator === "undefined" ||
      typeof navigator.clipboard?.read !== "function"
    ) {
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      const pasted: File[] = [];

      for (const item of clipboardItems) {
        for (const type of item.types) {
          const normalizedType = type.toLowerCase();
          if (!normalizedType.startsWith("image/")) continue;
          const blob = await item.getType(type);
          const ext = mimeToExt(normalizedType);
          const fileName = `pegado-${Date.now()}-${pasted.length + 1}.${ext}`;
          pasted.push(
            new File([blob], fileName, {
              type: normalizedType,
            })
          );
        }
      }

      if (!pasted.length) return;
      commitPickedFiles(pasted);
    } catch {
      // Ignore clipboard permission and unsupported browser errors.
    }
  }, [commitPickedFiles, disabled]);

  React.useEffect(() => {
    if (!hoverActive || disabled) return;

    const onWindowPaste = (event: ClipboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (active && !rootRef.current?.contains(active)) {
        const tag = active.tagName.toLowerCase();
        const editable =
          active.isContentEditable || tag === "input" || tag === "textarea";
        if (editable) return;
      }

      const pasted = toImageFilesFromClipboard(event.clipboardData);
      if (!pasted.length) return;
      event.preventDefault();
      setContextMenu(null);
      commitPickedFiles(pasted);
    };

    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [commitPickedFiles, disabled, hoverActive]);

  React.useEffect(() => {
    if (!contextMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setContextMenu(null);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setContextMenu(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [contextMenu]);

  const titleText = (() => {
    if (!hasFiles) {
      if (placeholder?.trim()) return placeholder.trim();
      return multiple ? "Elegí archivos" : "Elegí un archivo";
    }
    if (files.length === 1) return files[0]?.name || "Archivo seleccionado";
    return `${files.length} archivos seleccionados`;
  })();

  const subtitleText = (() => {
    if (!showSubtitle) return "";
    if (!hasFiles) return acceptHint || (multiple ? "Podés elegir varios archivos." : "");
    if (files.length === 1) {
      const kind = guessKind(files[0]);
      const kindLabel = kind === "image" ? "Imagen" : kind === "pdf" ? "PDF" : "Archivo";
      return `${kindLabel} · ${formatBytes(totalSize)}`;
    }
    return `${formatBytes(totalSize)} en total`;
  })();

  const tooltip = hasFiles ? files.map((file) => file.name).join("\n") : "";
  const kind = hasFiles ? guessKind(files[0]) : "none";
  const Icon = kind === "image" ? ImageIcon : kind === "pdf" ? FileText : UploadCloud;
  const contextMenuPositionStyle = contextMenu
    ? ({
        "--context-menu-x": `${contextMenu.x}px`,
        "--context-menu-y": `${contextMenu.y}px`,
      } as React.CSSProperties)
    : undefined;
  const describedBy = showSubtitle && subtitleText ? subtitleId : undefined;
  return (
    <div
      ref={rootRef}
      className={cn(styles.root, styles[`size_${size}`], className)}
      data-disabled={disabled ? "true" : "false"}
      data-drag={dragActive ? "true" : "false"}
      title={tooltip}
      onContextMenu={(event) => {
        if (disabled) return;
        event.preventDefault();
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          inOverlay: Boolean(
            (event.currentTarget as HTMLElement).closest("[data-ui-overlay-root='true']")
          ),
        });
      }}
      onMouseEnter={() => setHoverActive(true)}
      onMouseLeave={() => setHoverActive(false)}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      {...props}
    >
      <input
        ref={inputRef}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className={styles.nativeInput}
        onChange={onInputChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      <button
        id={id}
        type="button"
        className={styles.trigger}
        onClick={() => openPicker()}
        onPaste={onPaste}
        disabled={disabled}
        aria-label={ariaLabel ?? titleText}
        aria-describedby={describedBy}
      >
        <span className={styles.icon} aria-hidden>
          <Icon size={18} />
        </span>

        <span className={styles.content}>
          <span className={styles.title}>{titleText}</span>
          {showSubtitle && subtitleText ? (
            <span id={subtitleId} className={styles.subtitle}>
              {subtitleText}
            </span>
          ) : null}
        </span>
      </button>

      <span className={styles.actions}>
        <button
          type="button"
          data-file-picker-action="true"
          className={cn(
            styles.clearButton,
            hasFiles ? "" : styles.clearButtonHidden
          )}
          onClick={onClear}
          tabIndex={hasFiles && !disabled ? 0 : -1}
          disabled={!hasFiles || disabled}
          aria-label={clearLabel}
          title={clearLabel}
        >
          <X size={16} />
        </button>
      </span>

      {contextMenu ? (
        <div
          className={cn(
            styles.contextMenu,
            contextMenu.inOverlay ? styles.contextMenuInOverlay : ""
          )}
          role="menu"
          style={contextMenuPositionStyle}
          data-file-picker-action="true"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className={styles.contextMenuAction}
            data-file-picker-action="true"
            onClick={() => void pasteFromClipboardMenu()}
          >
            Pegar imagen (Ctrl+V)
          </button>
        </div>
      ) : null}
    </div>
  );
}
