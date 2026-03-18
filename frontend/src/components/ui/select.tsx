import * as React from "react";
import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";

import { getDropdownMotionDurations } from "@/lib/dropdown-motion";
import { cn } from "@/lib/utils";
import styles from "./select.module.css";

type OptionItem = {
  value: string;
  label: string;
  disabled: boolean;
};

type OptionLikeProps = {
  value?: unknown;
  disabled?: boolean;
  children?: React.ReactNode;
};

type OptionGroupLikeProps = {
  disabled?: boolean;
  children?: React.ReactNode;
};

type OptionIconComponent = React.ComponentType<{ className?: string; size?: number }>;

export type SelectOptionAppearance = {
  icon?: OptionIconComponent;
  badgeStyle?: React.CSSProperties;
  badgeClassName?: string;
  iconClassName?: string;
};

type SelectProps = React.ComponentProps<"select"> & {
  optionAppearance?: Record<string, SelectOptionAppearance | undefined>;
};

function findNextEnabledOptionIndex(
  options: OptionItem[],
  startIndex: number,
  step: 1 | -1
) {
  if (!options.length) return -1;

  let index = startIndex;
  for (let attempt = 0; attempt < options.length; attempt += 1) {
    index = (index + step + options.length) % options.length;
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
}

function findFirstEnabledOptionIndex(options: OptionItem[]) {
  return options.findIndex((option) => !option.disabled);
}

function findLastEnabledOptionIndex(options: OptionItem[]) {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (options[index]?.disabled) continue;
    return index;
  }

  return -1;
}

function withMenuPositionCssVars(position: {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  motionHeight: number;
}, durations: { openMs: number; closeMs: number }): React.CSSProperties {
  return {
    ["--select-menu-top" as never]: `${position.top}px`,
    ["--select-menu-left" as never]: `${position.left}px`,
    ["--select-menu-width" as never]: `${position.width}px`,
    ["--select-menu-max-height" as never]: `${position.maxHeight}px`,
    ["--select-menu-motion-height" as never]: `${position.motionHeight}px`,
    ["--dropdown-motion-open-duration" as never]: `${durations.openMs}ms`,
    ["--dropdown-motion-close-duration" as never]: `${durations.closeMs}ms`,
  };
}

function withBadgeCssVars(style: React.CSSProperties | undefined): React.CSSProperties | undefined {
  if (!style) return undefined;

  const vars: Record<string, string> = {};

  if (style.background !== undefined) {
    vars["--select-badge-bg"] = String(style.background);
  } else if (style.backgroundColor !== undefined) {
    vars["--select-badge-bg"] = String(style.backgroundColor);
  }

  if (style.color !== undefined) {
    vars["--select-badge-color"] = String(style.color);
  }

  if (style.borderColor !== undefined) {
    vars["--select-badge-border"] = String(style.borderColor);
  }

  if (style.boxShadow !== undefined) {
    vars["--select-badge-shadow"] = String(style.boxShadow);
  }

  return Object.keys(vars).length > 0 ? (vars as React.CSSProperties) : undefined;
}

function toTextLabel(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((item) => toTextLabel(item)).join("");
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return toTextLabel(node.props.children);
  }
  return "";
}

function flattenOptions(children: React.ReactNode): OptionItem[] {
  const options: OptionItem[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<OptionLikeProps | OptionGroupLikeProps>(child)) return;

    if (child.type === "option") {
      const optionProps = child.props as OptionLikeProps;
      const value =
        optionProps.value === undefined || optionProps.value === null
          ? ""
          : String(optionProps.value);
      options.push({
        value,
        label: toTextLabel(optionProps.children),
        disabled: Boolean(optionProps.disabled),
      });
      return;
    }

    if (child.type === "optgroup") {
      const groupProps = child.props as OptionGroupLikeProps;

      React.Children.forEach(groupProps.children, (nested) => {
        if (!React.isValidElement<OptionLikeProps>(nested) || nested.type !== "option") return;
        const value =
          nested.props.value === undefined || nested.props.value === null
            ? ""
            : String(nested.props.value);
        options.push({
          value,
          label: toTextLabel(nested.props.children),
          disabled: Boolean(nested.props.disabled || groupProps.disabled),
        });
      });
    }
  });

  return options;
}

export function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  id,
  optionAppearance,
  ...props
}: SelectProps) {
  const options = React.useMemo(() => flattenOptions(children), [children]);
  const controlled = value !== undefined;
  const normalizedControlledValue = controlled ? String(value ?? "") : undefined;
  const [internalValue, setInternalValue] = React.useState(() =>
    defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : ""
  );
  const [open, setOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const generatedId = React.useId();
  const [menuPosition, setMenuPosition] = React.useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    motionHeight: number;
    direction: "down" | "up";
  } | null>(null);
  const [menuInOverlay, setMenuInOverlay] = React.useState(false);
  const [menuPhase, setMenuPhase] = React.useState<"closed" | "opening" | "open" | "closing">(
    "closed"
  );
  const menuMotionDurations = React.useMemo(
    () => getDropdownMotionDurations(menuPosition?.motionHeight),
    [menuPosition?.motionHeight]
  );

  React.useEffect(() => {
    if (controlled) return;
    if (internalValue) return;
    const firstEnabled = options.find((option) => !option.disabled);
    if (!firstEnabled) return;
    setInternalValue(firstEnabled.value);
  }, [controlled, internalValue, options]);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current) return;
      if (rootRef.current.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setOpen(false);
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    };

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleTab);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleTab);
    };
  }, [open]);

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const inOverlay = Boolean(trigger.closest("[data-ui-overlay-root='true']"));
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const menuGap = 6;

    const visualViewport = window.visualViewport;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;

    const width = Math.min(Math.max(rect.width, 160), viewportWidth - viewportPadding * 2);
    const viewport = menu.querySelector<HTMLElement>(".uiDropdownMotionViewport");
    const measuredMenuHeight = viewport?.scrollHeight ?? menu.scrollHeight;
    const naturalMenuHeight = Math.max(
      56,
      Math.min(viewportHeight - viewportPadding * 2, measuredMenuHeight)
    );

    const spaceBelow = viewportBottom - (rect.bottom + menuGap) - viewportPadding;
    const spaceAbove = rect.top - viewportTop - menuGap - viewportPadding;
    const shouldOpenUp = spaceBelow < naturalMenuHeight && spaceAbove > spaceBelow;
    const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
    const fallbackSpace = Math.max(spaceBelow, spaceAbove, 56);
    const maxHeight = Math.max(
      56,
      Math.ceil(availableSpace > 0 ? availableSpace : fallbackSpace)
    );
    const motionHeight = Math.max(
      1,
      Math.ceil(
        Math.min(measuredMenuHeight > 0 ? measuredMenuHeight : naturalMenuHeight, maxHeight)
      )
    );

    let left = rect.left;
    if (left + width > viewportRight - viewportPadding) {
      left = viewportRight - width - viewportPadding;
    }
    left = Math.max(viewportLeft + viewportPadding, left);

    const top = shouldOpenUp
      ? Math.max(viewportTop + viewportPadding, rect.top - menuGap)
      : Math.min(viewportBottom - viewportPadding, rect.bottom + menuGap);

    const nextPosition = {
      top,
      left,
      width,
      maxHeight,
      motionHeight,
      direction: shouldOpenUp ? "up" : "down",
    } as const;

    setMenuPosition((prev) => {
      if (
        prev &&
        prev.top === nextPosition.top &&
        prev.left === nextPosition.left &&
        prev.width === nextPosition.width &&
        prev.maxHeight === nextPosition.maxHeight &&
        prev.motionHeight === nextPosition.motionHeight &&
        prev.direction === nextPosition.direction
      ) {
        return prev;
      }
      return nextPosition;
    });
    setMenuInOverlay((prev) => (prev === inOverlay ? prev : inOverlay));
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;

    let frameId = 0;
    let menuResizeFrameId = 0;
    let triggerResizeFrameId = 0;
    let menuResizeObserver: ResizeObserver | null = null;
    let triggerResizeObserver: ResizeObserver | null = null;

    const schedulePositionSync = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(updateMenuPosition);
    };

    schedulePositionSync();

    if (typeof ResizeObserver !== "undefined") {
      const menu = menuRef.current;
      if (menu) {
        menuResizeObserver = new ResizeObserver(() => {
          if (menuResizeFrameId) {
            window.cancelAnimationFrame(menuResizeFrameId);
          }
          menuResizeFrameId = window.requestAnimationFrame(updateMenuPosition);
        });
        menuResizeObserver.observe(menu);
      }

      const trigger = triggerRef.current;
      if (trigger) {
        triggerResizeObserver = new ResizeObserver(() => {
          if (triggerResizeFrameId) {
            window.cancelAnimationFrame(triggerResizeFrameId);
          }
          triggerResizeFrameId = window.requestAnimationFrame(updateMenuPosition);
        });
        triggerResizeObserver.observe(trigger);
      }
    }

    const visualViewport = window.visualViewport;
    window.addEventListener("resize", schedulePositionSync);
    window.addEventListener("scroll", schedulePositionSync, true);
    visualViewport?.addEventListener("resize", schedulePositionSync);
    visualViewport?.addEventListener("scroll", schedulePositionSync);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      if (menuResizeFrameId) {
        window.cancelAnimationFrame(menuResizeFrameId);
      }
      if (triggerResizeFrameId) {
        window.cancelAnimationFrame(triggerResizeFrameId);
      }
      menuResizeObserver?.disconnect();
      triggerResizeObserver?.disconnect();
      window.removeEventListener("resize", schedulePositionSync);
      window.removeEventListener("scroll", schedulePositionSync, true);
      visualViewport?.removeEventListener("resize", schedulePositionSync);
      visualViewport?.removeEventListener("scroll", schedulePositionSync);
    };
  }, [open, updateMenuPosition]);

  React.useEffect(() => {
    if (open) {
      let timeoutId = 0;
      const frameId = window.requestAnimationFrame(() => {
        setMenuPhase("opening");
        timeoutId = window.setTimeout(() => {
          setMenuPhase("open");
        }, menuMotionDurations.openMs);
      });
      return () => {
        window.cancelAnimationFrame(frameId);
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      };
    }

    const frameId = window.requestAnimationFrame(() => {
      setMenuPhase((prev) => (prev === "closed" ? "closed" : "closing"));
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [open, menuMotionDurations.openMs]);

  React.useEffect(() => {
    if (menuPhase !== "closing") return;
    const timeoutId = window.setTimeout(() => {
      setMenuPhase("closed");
      setMenuPosition(null);
      setMenuInOverlay(false);
    }, menuMotionDurations.closeMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [menuMotionDurations.closeMs, menuPhase]);

  const selectedValue = normalizedControlledValue ?? internalValue;
  const selectedIndex = options.findIndex((option) => option.value === selectedValue);
  const selectedOption = (selectedIndex >= 0 ? options[selectedIndex] : undefined) ?? options[0];
  const triggerLabel = selectedOption?.label || "Seleccionar";
  const firstEnabledIndex = React.useMemo(() => findFirstEnabledOptionIndex(options), [options]);
  const lastEnabledIndex = React.useMemo(() => findLastEnabledOptionIndex(options), [options]);
  const triggerId = id ?? `select-trigger-${generatedId}`;
  const menuId = `select-menu-${generatedId}`;
  const optionIds = React.useMemo(
    () => options.map((_, index) => `select-option-${generatedId}-${index}`),
    [generatedId, options]
  );
  const activeOptionIndex =
    highlightedIndex >= 0 && !options[highlightedIndex]?.disabled
      ? highlightedIndex
      : selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : firstEnabledIndex;
  const activeOptionId =
    activeOptionIndex >= 0 ? optionIds[activeOptionIndex] : undefined;
  const canOpen = !disabled && options.some((option) => !option.disabled);

  const closeMenu = React.useCallback((options?: { focusTrigger?: boolean }) => {
    setOpen(false);
    setHighlightedIndex(-1);
    if (options?.focusTrigger === false) return;
    triggerRef.current?.focus();
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  const emitChange = React.useCallback(
    (nextValue: string) => {
      if (!onChange) return;
      const event = {
        target: { value: nextValue, name: name ?? "" },
        currentTarget: { value: nextValue, name: name ?? "" },
      } as unknown as React.ChangeEvent<HTMLSelectElement>;
      onChange(event);
    },
    [name, onChange]
  );

  const openMenu = React.useCallback(
    (preferredIndex?: number) => {
      if (!canOpen) return;

      const fallbackIndex =
        selectedIndex >= 0 && !options[selectedIndex]?.disabled
          ? selectedIndex
          : firstEnabledIndex;
      const nextIndex =
        typeof preferredIndex === "number" &&
        preferredIndex >= 0 &&
        !options[preferredIndex]?.disabled
          ? preferredIndex
          : fallbackIndex;

      setHighlightedIndex(nextIndex);
      setMenuPosition(null);
      setMenuInOverlay(false);
      setOpen(true);
    },
    [canOpen, firstEnabledIndex, options, selectedIndex]
  );

  const selectValue = React.useCallback(
    (nextValue: string) => {
      if (!controlled) setInternalValue(nextValue);
      emitChange(nextValue);
      closeMenu();
    },
    [closeMenu, controlled, emitChange]
  );

  const menuStyle = menuPosition
    ? withMenuPositionCssVars(menuPosition, menuMotionDurations)
    : undefined;
  const shouldRenderMenu = open || menuPhase !== "closed";
  const dropdownPhase = open ? (menuPhase === "open" ? "open" : "opening") : "closing";
  const dropdownDirection = menuPosition?.direction ?? "down";
  const menuFullyOpen = menuPhase === "open";
  const selectedOptionAppearance = selectedOption
    ? optionAppearance?.[selectedOption.value]
    : undefined;
  const selectedBadgeStyle = withBadgeCssVars(selectedOptionAppearance?.badgeStyle);
  const SelectedIcon = selectedOptionAppearance?.icon;

  const handleTriggerWheel = React.useCallback(
    (event: React.WheelEvent<HTMLButtonElement>) => {
      // Prevent accidental page/panel scroll when the pointer is over a dropdown trigger.
      event.preventDefault();
      event.stopPropagation();
    },
    []
  );

  const handleMenuWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      // Keep wheel interaction local to the dropdown menu.
      event.stopPropagation();
    },
    []
  );

  const moveHighlight = React.useCallback(
    (step: 1 | -1) => {
      if (!canOpen) return;
      const startIndex =
        highlightedIndex >= 0
          ? highlightedIndex
          : selectedIndex >= 0
            ? selectedIndex
            : step === 1
              ? firstEnabledIndex - 1
              : lastEnabledIndex + 1;
      const nextIndex = findNextEnabledOptionIndex(options, startIndex, step);
      if (nextIndex >= 0) {
        setHighlightedIndex(nextIndex);
      }
    },
    [canOpen, firstEnabledIndex, highlightedIndex, lastEnabledIndex, options, selectedIndex]
  );

  const handleTriggerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!canOpen) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        if (!open) {
          openMenu();
          return;
        }
        moveHighlight(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (!open) {
          openMenu(selectedIndex >= 0 ? selectedIndex : lastEnabledIndex);
          return;
        }
        moveHighlight(-1);
        return;
      }

      if (event.key === "Home") {
        if (!open && firstEnabledIndex < 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (!open) {
          openMenu(firstEnabledIndex);
          return;
        }
        setHighlightedIndex(firstEnabledIndex);
        return;
      }

      if (event.key === "End") {
        if (!open && lastEnabledIndex < 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (!open) {
          openMenu(lastEnabledIndex);
          return;
        }
        setHighlightedIndex(lastEnabledIndex);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        if (!open) {
          openMenu();
          return;
        }
        if (activeOptionIndex >= 0) {
          selectValue(options[activeOptionIndex]!.value);
        }
        return;
      }

      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
      }
    },
    [
      activeOptionIndex,
      canOpen,
      closeMenu,
      firstEnabledIndex,
      lastEnabledIndex,
      moveHighlight,
      open,
      openMenu,
      options,
      selectValue,
      selectedIndex,
    ]
  );

  React.useEffect(() => {
    if (!open) return;
    if (menuPhase !== "open") return;
    if (activeOptionId === undefined) return;

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(activeOptionId)?.scrollIntoView({
        block: "nearest",
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeOptionId, menuPhase, open]);

  return (
    <div ref={rootRef} className={cn(styles.wrap, className)}>
      <select
        className={styles.nativeSelectProxy}
        value={selectedValue}
        disabled={disabled}
        name={name}
        onChange={(event) => selectValue(event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        {...props}
      >
        {children}
      </select>

      <button
        id={triggerId}
        type="button"
        ref={triggerRef}
        className={cn(styles.trigger, open ? styles.triggerOpen : "")}
        onClick={() => {
          if (!canOpen) return;
          if (open) {
            closeMenu({ focusTrigger: false });
            return;
          }
          openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-expanded={open}
        onWheelCapture={handleTriggerWheel}
      >
        <span className={styles.value}>
          <span
            className={cn(
              styles.valueChip,
              selectedOptionAppearance ? styles.valueChipBadge : "",
              selectedOptionAppearance?.badgeClassName
            )}
            style={selectedBadgeStyle}
          >
            {SelectedIcon ? (
              <SelectedIcon
                size={14}
                className={cn(styles.valueIcon, selectedOptionAppearance?.iconClassName)}
              />
            ) : null}
            <span className={styles.valueLabel}>{triggerLabel}</span>
          </span>
        </span>
        <span className={cn(styles.chevron, open ? styles.chevronOpen : "")} aria-hidden>
          <ChevronDown size={16} strokeWidth={2} />
        </span>
      </button>

      {shouldRenderMenu
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className={cn(
                "uiDropdownMotionPanel",
                styles.menu,
                styles.menuPortal,
                menuInOverlay ? styles.menuPortalInOverlay : "",
                menuPosition?.direction === "up" ? styles.menuPortalUp : styles.menuPortalDown,
                !menuPosition ? styles.menuUnpositioned : ""
              )}
              style={menuStyle}
              role="listbox"
              aria-labelledby={triggerId}
              onWheelCapture={handleMenuWheel}
              data-dropdown-phase={dropdownPhase}
              data-dropdown-direction={dropdownDirection}
            >
              <div className={cn("uiDropdownMotionViewport", styles.menuViewport)}>
                {options.map((option, index) => {
                  const active = option.value === selectedValue;
                  const highlighted = optionIds[index] === activeOptionId;
                  const appearance = optionAppearance?.[option.value];
                  const OptionIcon = appearance?.icon;
                  const optionBadgeStyle = withBadgeCssVars(appearance?.badgeStyle);
                  return (
                    <button
                      key={`${option.value}-${option.label}`}
                      id={optionIds[index]}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cn(
                        "uiDropdownMotionItem",
                        styles.option,
                        active ? styles.optionActive : "",
                        highlighted ? styles.optionHighlighted : "",
                        option.disabled ? styles.optionDisabled : ""
                      )}
                      disabled={option.disabled}
                      onMouseEnter={() => {
                        if (option.disabled) return;
                        if (!menuFullyOpen) return;
                        setHighlightedIndex(index);
                      }}
                      onClick={() => {
                        if (option.disabled) return;
                        selectValue(option.value);
                      }}
                    >
                      <span
                        className={cn(
                          styles.optionBody,
                          appearance ? styles.optionBodyBadge : "",
                          appearance?.badgeClassName
                        )}
                        style={optionBadgeStyle}
                      >
                        {OptionIcon ? (
                          <OptionIcon
                            size={14}
                            className={cn(styles.optionIcon, appearance?.iconClassName)}
                          />
                        ) : null}
                        <span className={styles.optionLabel}>{option.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
