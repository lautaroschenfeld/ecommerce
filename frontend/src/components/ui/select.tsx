import * as React from "react";
import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";

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
}): React.CSSProperties {
  return {
    ["--select-menu-top" as never]: `${position.top}px`,
    ["--select-menu-left" as never]: `${position.left}px`,
    ["--select-menu-width" as never]: `${position.width}px`,
    ["--select-menu-max-height" as never]: `${position.maxHeight}px`,
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
    scrollable: boolean;
    direction: "down" | "up";
  } | null>(null);
  const [menuInOverlay, setMenuInOverlay] = React.useState(false);

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

  React.useEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const inOverlay = Boolean(trigger.closest("[data-ui-overlay-root='true']"));

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const menuGap = 6;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(rect.width, 160), viewportWidth - viewportPadding * 2);
      const optionApproxHeight = 38;
      const menuVerticalChrome = 14;
      const estimatedHeightFromOptions = options.length * optionApproxHeight + menuVerticalChrome;
      const measuredMenuHeight = menuRef.current?.scrollHeight ?? 0;
      const naturalMenuHeight = Math.min(
        viewportHeight - viewportPadding * 2,
        measuredMenuHeight > 0 ? measuredMenuHeight : estimatedHeightFromOptions
      );
      const spaceBelow = viewportHeight - (rect.bottom + menuGap) - viewportPadding;
      const spaceAbove = rect.top - menuGap - viewportPadding;
      const shouldOpenUp = spaceBelow < naturalMenuHeight && spaceAbove > spaceBelow;
      const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;
      const fallbackSpace = Math.max(spaceBelow, spaceAbove, 56);
      const maxHeight = Math.max(
        56,
        Math.floor(Math.min(naturalMenuHeight, availableSpace > 0 ? availableSpace : fallbackSpace))
      );
      const scrollable = naturalMenuHeight > maxHeight + 1;

      let left = rect.left;
      if (left + width > viewportWidth - viewportPadding) {
        left = viewportWidth - width - viewportPadding;
      }
      left = Math.max(viewportPadding, left);

      const top = shouldOpenUp
        ? Math.max(viewportPadding, rect.top - menuGap)
        : Math.min(viewportHeight - viewportPadding, rect.bottom + menuGap);

      setMenuPosition({
        top,
        left,
        width,
        maxHeight,
        scrollable,
        direction: shouldOpenUp ? "up" : "down",
      });
      setMenuInOverlay(inOverlay);
    };

    updateMenuPosition();
    const frameId = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      setMenuInOverlay(false);
    };
  }, [open, options.length]);

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

  const menuStyle = menuPosition ? withMenuPositionCssVars(menuPosition) : undefined;
  const selectedOptionAppearance = selectedOption
    ? optionAppearance?.[selectedOption.value]
    : undefined;
  const selectedBadgeStyle = withBadgeCssVars(selectedOptionAppearance?.badgeStyle);
  const SelectedIcon = selectedOptionAppearance?.icon;
  const menuScrollable = Boolean(menuPosition?.scrollable);

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
      if (!menuScrollable) {
        event.preventDefault();
      }
    },
    [menuScrollable]
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
    if (activeOptionId === undefined) return;

    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(activeOptionId)?.scrollIntoView({
        block: "nearest",
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeOptionId, open]);

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

      {open && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className={cn(
                styles.menu,
                menuPosition.scrollable ? styles.menuScrollable : "",
                styles.menuPortal,
                menuInOverlay ? styles.menuPortalInOverlay : "",
                menuPosition.direction === "up" ? styles.menuPortalUp : styles.menuPortalDown
              )}
              style={menuStyle}
              role="listbox"
              aria-labelledby={triggerId}
              onWheelCapture={handleMenuWheel}
            >
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
                      styles.option,
                      active ? styles.optionActive : "",
                      highlighted ? styles.optionHighlighted : "",
                      option.disabled ? styles.optionDisabled : ""
                    )}
                    disabled={option.disabled}
                    onMouseEnter={() => {
                      if (option.disabled) return;
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
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
