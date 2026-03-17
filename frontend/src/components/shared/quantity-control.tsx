"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./quantity-control.module.css";

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function QuantityControl({
  value,
  min = 1,
  max = 99,
  disabled = false,
  decrementStyle = "minus",
  variant = "default",
  className,
  onDecrementClick,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  decrementStyle?: "minus" | "trash";
  variant?: "default" | "cta";
  className?: string;
  onDecrementClick?: () => void;
  onChange: (next: number) => void;
}) {
  const safeValue = useMemo(() => clampInt(value, min, max), [value, min, max]);
  const [text, setText] = useState(String(safeValue));
  const buttonVariant = variant === "cta" ? "outline" : "secondary";

  useEffect(() => {
    setText(String(safeValue));
  }, [safeValue]);

  const canDec = safeValue > min && !disabled;
  const canInc = safeValue < max && !disabled;
  const decrementLabel = decrementStyle === "trash" ? "Quitar" : "Restar";

  return (
    <div
      className={cn(
        styles.wrap,
        disabled && styles.wrapDisabled,
        variant === "cta" && styles.wrapCta,
        className
      )}
      aria-label="Cantidad"
    >
      <Button
        type="button"
        size="icon-xs"
        variant={buttonVariant}
        disabled={!canDec}
        onClick={() => {
          if (onDecrementClick) {
            onDecrementClick();
            return;
          }
          onChange(clampInt(safeValue - 1, min, max));
        }}
        aria-label={decrementLabel}
        title={decrementLabel}
      >
        {decrementStyle === "trash" ? <Trash2 size={14} /> : <Minus size={14} />}
      </Button>

      <Input
        className={styles.input}
        inputMode="numeric"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);

          const n = Number(next);
          if (!Number.isFinite(n)) return;
          onChange(clampInt(n, min, max));
        }}
        onBlur={() => {
          const n = Number(text);
          const next = Number.isFinite(n) ? clampInt(n, min, max) : safeValue;
          setText(String(next));
          onChange(next);
        }}
        aria-label="Cantidad"
      />

      <Button
        type="button"
        size="icon-xs"
        variant={buttonVariant}
        disabled={!canInc}
        onClick={() => onChange(clampInt(safeValue + 1, min, max))}
        aria-label="Sumar"
        title="Sumar"
      >
        <Plus size={14} />
      </Button>
    </div>
  );
}
