"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import styles from "./input.module.css";

function isModifierShortcut(event: React.KeyboardEvent<HTMLInputElement>) {
  return event.metaKey || event.ctrlKey || event.altKey;
}

function allowsDecimalByStep(step: React.ComponentProps<"input">["step"]) {
  if (step === undefined || step === null) return false;
  const raw = String(step).trim().toLowerCase();
  if (!raw) return false;
  if (raw === "any") return true;
  return raw.includes(".") || raw.includes(",");
}

function sanitizeNumericValue(value: string, allowDecimal: boolean) {
  if (!value) return "";

  let out = "";
  let hasSeparator = false;
  for (const ch of value) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if (allowDecimal && (ch === "." || ch === ",")) {
      if (!hasSeparator) {
        out += ch;
        hasSeparator = true;
      }
    }
  }
  return out;
}

function hasDecimalSeparator(value: string) {
  return value.includes(".") || value.includes(",");
}

export function Input({
  className,
  type = "text",
  inputMode,
  step,
  onKeyDown,
  onChange,
  ...props
}: React.ComponentProps<"input">) {
  const numericGuard = type === "number" || inputMode === "numeric" || inputMode === "decimal";
  const allowDecimal = inputMode === "decimal" || (type === "number" && allowsDecimalByStep(step));
  const resolvedInputMode =
    inputMode ?? (type === "number" ? (allowDecimal ? "decimal" : "numeric") : undefined);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || !numericGuard) return;
      if (isModifierShortcut(event)) return;

      const key = event.key;
      const navigationKeys = new Set([
        "Backspace",
        "Delete",
        "Tab",
        "Enter",
        "Escape",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ]);
      if (navigationKeys.has(key)) return;
      if (key >= "0" && key <= "9") return;

      if (allowDecimal && (key === "." || key === ",")) {
        const input = event.currentTarget;
        const value = input.value;
        const start = input.selectionStart ?? value.length;
        const end = input.selectionEnd ?? value.length;
        const valueWithoutSelection = `${value.slice(0, start)}${value.slice(end)}`;
        if (!hasDecimalSeparator(valueWithoutSelection)) {
          return;
        }
      }

      event.preventDefault();
    },
    [allowDecimal, numericGuard, onKeyDown]
  );

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (numericGuard) {
        const input = event.currentTarget;
        const sanitized = sanitizeNumericValue(input.value, allowDecimal);
        if (sanitized !== input.value) {
          input.value = sanitized;
        }
      }
      onChange?.(event);
    },
    [allowDecimal, numericGuard, onChange]
  );

  return (
    <input
      type={type}
      inputMode={resolvedInputMode}
      step={step}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      className={cn(styles.input, className)}
      {...props}
    />
  );
}
