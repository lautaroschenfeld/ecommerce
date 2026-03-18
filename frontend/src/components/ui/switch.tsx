import * as React from "react";

import { cn } from "@/lib/utils";
import styles from "./switch.module.css";

export type SwitchProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "className" | "size"
> & {
  className?: string;
  size?: "sm" | "md" | "lg";
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({
  className,
  size = "md",
  checked,
  onCheckedChange,
  ...props
}: SwitchProps) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-checked={checked}
      className={cn(styles.switch, styles[`size_${size}`], className)}
      data-ui-switch="true"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  );
}
