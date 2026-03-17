import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./input.module.css";

type DateInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode"
> & {
  value: string;
  onValueChange?: (value: string) => void;
};

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function isValidDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || year < 1) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;

  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function formatIsoDateForDisplay(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function sanitizeDateDraft(value: string) {
  return value.replace(/[^\d/.-]/g, "").slice(0, 10);
}

function parseIsoDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidDateParts(year, month, day)) return null;

  return `${year.toString().padStart(4, "0")}-${padDatePart(month)}-${padDatePart(day)}`;
}

function parseDisplayDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoValue = parseIsoDate(trimmed);
  if (isoValue) return isoValue;

  const slashMatch = trimmed.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return `${year.toString().padStart(4, "0")}-${padDatePart(month)}-${padDatePart(day)}`;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (!isValidDateParts(year, month, day)) return null;

  return `${year.toString().padStart(4, "0")}-${padDatePart(month)}-${padDatePart(day)}`;
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput(
    {
      className,
      value,
      onValueChange,
      onBlur,
      placeholder = "DD/MM/AAAA",
      autoComplete = "off",
      ...props
    },
    ref
  ) {
    const [draft, setDraft] = React.useState(() => formatIsoDateForDisplay(value));

    React.useEffect(() => {
      setDraft(formatIsoDateForDisplay(value));
    }, [value]);

    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextDraft = sanitizeDateDraft(event.target.value);
        setDraft(nextDraft);

        if (!nextDraft.trim()) {
          onValueChange?.("");
          return;
        }

        const parsed = parseDisplayDate(nextDraft);
        if (parsed) onValueChange?.(parsed);
      },
      [onValueChange]
    );

    const handleBlur = React.useCallback(
      (event: React.FocusEvent<HTMLInputElement>) => {
        const trimmed = draft.trim();
        if (!trimmed) {
          setDraft("");
          onValueChange?.("");
          onBlur?.(event);
          return;
        }

        const parsed = parseDisplayDate(trimmed);
        if (parsed) {
          const formatted = formatIsoDateForDisplay(parsed);
          setDraft(formatted);
          if (parsed !== value) onValueChange?.(parsed);
        } else {
          setDraft(formatIsoDateForDisplay(value));
        }

        onBlur?.(event);
      },
      [draft, onBlur, onValueChange, value]
    );

    return (
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={draft}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(styles.input, className)}
      />
    );
  }
);
