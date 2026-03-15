"use client";

import * as React from "react";
import { ArrowUp, Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import styles from "./password-input.module.css";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  withRevealToggle?: boolean;
  wrapperClassName?: string;
};

export function PasswordInput({
  withRevealToggle = false,
  wrapperClassName,
  className,
  onKeyDown,
  onKeyUp,
  onBlur,
  disabled,
  ...props
}: PasswordInputProps) {
  const [capsLockOn, setCapsLockOn] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const syncCapsLock = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      setCapsLockOn(event.getModifierState("CapsLock"));
    },
    []
  );

  return (
    <div className={cn(styles.wrapper, wrapperClassName)}>
      {capsLockOn ? (
        <span className={styles.capsIndicator} aria-hidden>
          <ArrowUp size={12} strokeWidth={2.5} />
        </span>
      ) : null}

      <Input
        {...props}
        type={withRevealToggle && showPassword ? "text" : "password"}
        disabled={disabled}
        className={cn(
          className,
          capsLockOn && styles.hasCapsIndicator,
          withRevealToggle && styles.hasRevealToggle
        )}
        onKeyDown={(event) => {
          syncCapsLock(event);
          onKeyDown?.(event);
        }}
        onKeyUp={(event) => {
          syncCapsLock(event);
          onKeyUp?.(event);
        }}
        onBlur={(event) => {
          setCapsLockOn(false);
          onBlur?.(event);
        }}
      />

      {withRevealToggle ? (
        <button
          type="button"
          className={styles.revealToggle}
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          disabled={disabled}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      ) : null}
    </div>
  );
}

