"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

import styles from "./products-admin.module.css";

type ActionsMenuAction = "edit" | "add_variant" | "duplicate" | "delete";

type EntityActionsMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onEdit: () => void;
  onAddVariant?: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  deleteLabel?: string;
  showAddVariant?: boolean;
  showDuplicate?: boolean;
};

export function EntityActionsMenu({
  open,
  onOpenChange,
  busy,
  onEdit,
  onAddVariant,
  onDuplicate,
  onDelete,
  deleteLabel = "Eliminar",
  showAddVariant = true,
  showDuplicate = true,
}: EntityActionsMenuProps) {
  const [activeAction, setActiveAction] = useState<ActionsMenuAction>("edit");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const availableActions = useMemo<ActionsMenuAction[]>(() => {
    const out: ActionsMenuAction[] = ["edit"];
    if (showAddVariant && onAddVariant) out.push("add_variant");
    if (showDuplicate && onDuplicate) out.push("duplicate");
    out.push("delete");
    return out;
  }, [showAddVariant, onAddVariant, showDuplicate, onDuplicate]);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    maxHeight: number;
    direction: "down" | "up";
  } | null>(null);
  const [menuInOverlay, setMenuInOverlay] = useState(false);
  const resolvedActiveAction = availableActions.includes(activeAction)
    ? activeAction
    : (availableActions[0] ?? "edit");

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current) return;
      if (rootRef.current.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onOpenChange(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onOpenChange(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;

    let positionFrameId = 0;
    let connectObserverFrameId = 0;
    let menuResizeFrameId = 0;
    let resizeObserver: ResizeObserver | null = null;

    const schedulePositionSync = () => {
      if (positionFrameId) {
        window.cancelAnimationFrame(positionFrameId);
      }
      positionFrameId = window.requestAnimationFrame(updateMenuPosition);
    };

    const visibleActionsCount =
      2 +
      (showAddVariant && onAddVariant ? 1 : 0) +
      (showDuplicate && onDuplicate ? 1 : 0);

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const inOverlay = Boolean(trigger.closest("[data-ui-overlay-root='true']"));

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const menuWidth = Math.min(
        188,
        Math.max(160, viewportWidth - viewportPadding * 2)
      );
      const estimatedMenuHeight = 54 + visibleActionsCount * 44;
      const measuredMenuHeight = menuRef.current?.scrollHeight ?? 0;
      const naturalMenuHeight = Math.min(
        viewportHeight - viewportPadding * 2,
        measuredMenuHeight > 0 ? measuredMenuHeight : estimatedMenuHeight
      );
      const spaceBelow = viewportHeight - (rect.bottom + 6) - viewportPadding;
      const spaceAbove = rect.top - 6 - viewportPadding;
      const shouldOpenUp = spaceBelow < naturalMenuHeight && spaceAbove > spaceBelow;
      const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
      const fallbackSpace = Math.max(spaceBelow, spaceAbove, 56);
      const maxHeight = Math.max(
        56,
        Math.floor(availableSpace > 0 ? availableSpace : fallbackSpace)
      );

      let left = rect.right - menuWidth;
      if (left + menuWidth > viewportWidth - viewportPadding) {
        left = viewportWidth - menuWidth - viewportPadding;
      }
      left = Math.max(viewportPadding, left);

      const top = shouldOpenUp
        ? Math.max(viewportPadding, rect.top - 6)
        : Math.min(viewportHeight - viewportPadding, rect.bottom + 6);

      const nextPosition = {
        top,
        left,
        maxHeight,
        direction: shouldOpenUp ? "up" : "down",
      } as const;

      setMenuPosition((prev) => {
        if (
          prev &&
          prev.top === nextPosition.top &&
          prev.left === nextPosition.left &&
          prev.maxHeight === nextPosition.maxHeight &&
          prev.direction === nextPosition.direction
        ) {
          return prev;
        }
        return nextPosition;
      });
      setMenuInOverlay((prev) => (prev === inOverlay ? prev : inOverlay));
    };

    updateMenuPosition();

    // Re-measure once after mount.
    positionFrameId = window.requestAnimationFrame(() => {
      updateMenuPosition();
    });

    connectObserverFrameId = window.requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu) return;
      resizeObserver = new ResizeObserver(() => {
        if (menuResizeFrameId) {
          window.cancelAnimationFrame(menuResizeFrameId);
        }
        menuResizeFrameId = window.requestAnimationFrame(updateMenuPosition);
      });
      resizeObserver.observe(menu);
    });

    window.addEventListener("resize", schedulePositionSync);
    window.addEventListener("scroll", schedulePositionSync, true);
    return () => {
      if (positionFrameId) {
        window.cancelAnimationFrame(positionFrameId);
      }
      if (connectObserverFrameId) {
        window.cancelAnimationFrame(connectObserverFrameId);
      }
      if (menuResizeFrameId) {
        window.cancelAnimationFrame(menuResizeFrameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedulePositionSync);
      window.removeEventListener("scroll", schedulePositionSync, true);
      setMenuInOverlay(false);
    };
  }, [open, onAddVariant, onDuplicate, showAddVariant, showDuplicate]);

  const focusAction = useCallback((action: ActionsMenuAction) => {
    const menu = menuRef.current;
    if (!menu) return;
    const button = menu.querySelector<HTMLButtonElement>(`[data-action='${action}']`);
    button?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    focusAction(resolvedActiveAction);
  }, [open, resolvedActiveAction, focusAction]);

  function activate(action: ActionsMenuAction) {
    setActiveAction(action);
  }

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu || !menuPosition) return;
    menu.style.setProperty("--actions-menu-top", `${menuPosition.top}px`);
    menu.style.setProperty("--actions-menu-left", `${menuPosition.left}px`);
    menu.style.setProperty("--actions-menu-max-height", `${menuPosition.maxHeight}px`);
  }, [menuPosition]);

  const handleMenuWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      // Keep wheel interaction local to the floating menu.
      event.stopPropagation();
    },
    []
  );

  const handleTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (busy) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      onOpenChange(true);
      const nextAction =
        event.key === "ArrowUp"
          ? (availableActions[availableActions.length - 1] ?? "edit")
          : (availableActions[0] ?? "edit");
      setActiveAction(nextAction);
    },
    [busy, onOpenChange, availableActions]
  );

  const handleMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!availableActions.length) return;
      const currentIndex = Math.max(0, availableActions.indexOf(resolvedActiveAction));

      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex =
          (currentIndex + delta + availableActions.length) % availableActions.length;
        const nextAction = availableActions[nextIndex] ?? availableActions[0];
        if (!nextAction) return;
        setActiveAction(nextAction);
        focusAction(nextAction);
        return;
      }

      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const nextAction =
          event.key === "Home"
            ? availableActions[0]
            : availableActions[availableActions.length - 1];
        if (!nextAction) return;
        setActiveAction(nextAction);
        focusAction(nextAction);
      }
    },
    [resolvedActiveAction, availableActions, focusAction, onOpenChange]
  );

  function run(action: ActionsMenuAction) {
    onOpenChange(false);
    if (action === "edit") {
      onEdit();
      return;
    }
    if (action === "duplicate") {
      onDuplicate?.();
      return;
    }
    if (action === "add_variant") {
      onAddVariant?.();
      return;
    }
    onDelete();
  }

  return (
    <div ref={rootRef} className={styles.actionsMenuWrap}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.actionsMenuTrigger} ${open ? styles.actionsMenuTriggerOpen : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? "Cerrar acciones" : "Abrir acciones"}
        title={open ? "Cerrar acciones" : "Abrir acciones"}
        disabled={busy}
        onKeyDown={handleTriggerKeyDown}
        onClick={() => {
          if (busy) return;
          onOpenChange(!open);
          setActiveAction(availableActions[0] ?? "edit");
        }}
      >
        <MoreVertical size={16} />
      </button>

      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className={`${styles.actionsMenu} ${styles.actionsMenuPortal} ${
                menuInOverlay ? styles.actionsMenuPortalInOverlay : ""
              } ${
                menuPosition.direction === "up"
                  ? styles.actionsMenuPortalUp
                  : styles.actionsMenuPortalDown
              }`}
              role="menu"
              onWheelCapture={handleMenuWheel}
              onKeyDown={handleMenuKeyDown}
            >
              <button
                type="button"
                role="menuitem"
                data-action="edit"
                className={`${styles.actionsMenuOption} ${
                  resolvedActiveAction === "edit" ? styles.actionsMenuOptionActive : ""
                }`}
                onMouseEnter={() => activate("edit")}
                onFocus={() => activate("edit")}
                onClick={() => run("edit")}
              >
                Editar
              </button>
              {showAddVariant && onAddVariant ? (
                <button
                  type="button"
                  role="menuitem"
                  data-action="add_variant"
                  className={`${styles.actionsMenuOption} ${
                    resolvedActiveAction === "add_variant" ? styles.actionsMenuOptionActive : ""
                  }`}
                  onMouseEnter={() => activate("add_variant")}
                  onFocus={() => activate("add_variant")}
                  onClick={() => run("add_variant")}
                >
                  Agregar variante
                </button>
              ) : null}
              {showDuplicate && onDuplicate ? (
                <button
                  type="button"
                  role="menuitem"
                  data-action="duplicate"
                  className={`${styles.actionsMenuOption} ${
                    resolvedActiveAction === "duplicate" ? styles.actionsMenuOptionActive : ""
                  }`}
                  onMouseEnter={() => activate("duplicate")}
                  onFocus={() => activate("duplicate")}
                  onClick={() => run("duplicate")}
                >
                  Duplicar
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                data-action="delete"
                className={`${styles.actionsMenuOption} ${styles.actionsMenuOptionDanger} ${
                  resolvedActiveAction === "delete" ? styles.actionsMenuOptionActive : ""
                }`}
                onMouseEnter={() => activate("delete")}
                onFocus={() => activate("delete")}
                onClick={() => run("delete")}
              >
                {deleteLabel}
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
