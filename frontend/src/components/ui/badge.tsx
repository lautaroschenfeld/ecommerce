import * as React from "react";

import { cn } from "@/lib/utils";
import styles from "./badge.module.css";

export type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      data-variant={variant}
      className={cn(styles.badge, styles[`variant_${variant}`], className)}
      {...props}
    />
  );
}
