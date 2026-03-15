import * as React from "react";

import { resolveVariantColorSwatch } from "@/lib/variant-colors";
import { cn } from "@/lib/utils";
import styles from "./color-swatch-selector.module.css";

export type ColorSwatchSelectorSize = "sm" | "md" | "lg";
export type ColorSwatchSelectorAppearance = "default" | "detail";

export type ColorSwatchOption = {
  value: string;
  label?: string;
  swatch?: string;
  disabled?: boolean;
};

function normalizeHexColor(color: string) {
  const raw = color.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return null;
  if (raw.length === 4) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return raw.toLowerCase();
}

function isLightColor(color: string | undefined) {
  if (!color) return false;
  const normalized = normalizeHexColor(color);
  if (!normalized) return false;

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance >= 200;
}

function withSwatchCssVar(value: string): React.CSSProperties {
  return {
    ["--swatch-fill" as never]: value,
  };
}

export function ColorSwatchSelector({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel = "Seleccionar color",
  className,
  size = "md",
  appearance = "default",
}: {
  options: ColorSwatchOption[];
  value?: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  size?: ColorSwatchSelectorSize;
  appearance?: ColorSwatchSelectorAppearance;
}) {
  const normalizedValue = value?.trim().toLowerCase() || "";

  const normalizedOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const next: Required<ColorSwatchOption>[] = [];

    for (const option of options) {
      const optionValue = option.value.trim();
      if (!optionValue) continue;
      const key = optionValue.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      next.push({
        value: optionValue,
        label: option.label?.trim() || optionValue,
        swatch: option.swatch?.trim() || resolveVariantColorSwatch(optionValue) || "",
        disabled: Boolean(option.disabled),
      });
    }

    return next;
  }, [options]);

  if (!normalizedOptions.length) return null;

  return (
    <div
      className={cn(
        styles.rail,
        styles[`size_${size}`],
        styles[`appearance_${appearance}`],
        className
      )}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      {normalizedOptions.map((option) => {
        const selected = option.value.toLowerCase() === normalizedValue;
        const swatchStyle = option.swatch ? withSwatchCssVar(option.swatch) : undefined;
        const disabledOption = disabled || option.disabled;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            className={cn(
              styles.swatchButton,
              selected ? styles.swatchButtonActive : "",
              disabledOption ? styles.swatchButtonDisabled : ""
            )}
            disabled={disabledOption}
            onClick={() => onChange(option.value)}
          >
            <span
              aria-hidden
              className={cn(styles.dot, isLightColor(option.swatch) ? styles.dotLight : "")}
              style={swatchStyle}
            />
            <span className={styles.tooltip}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
