import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./segmented-control.module.css";

export type SegmentedControlOption<TValue extends string = string> = {
  value: TValue;
  label: React.ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<TValue extends string = string> = {
  options: readonly SegmentedControlOption<TValue>[];
  value: TValue;
  onValueChange: (value: TValue) => void;
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
};

export function SegmentedControl<TValue extends string = string>({
  options,
  value,
  onValueChange,
  className,
  itemClassName,
  ariaLabel = "Selector segmentado",
}: SegmentedControlProps<TValue>) {
  return (
    <div className={cn(styles.root, className)} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={option.disabled}
            className={cn(
              styles.item,
              active ? styles.itemActive : "",
              option.disabled ? styles.itemDisabled : "",
              itemClassName
            )}
            onClick={() => {
              if (option.disabled || active) return;
              onValueChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

