import * as React from "react";

import { cn } from "@/lib/utils";
import styles from "./skeleton.module.css";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(styles.skeleton, className)}
      {...props}
    />
  );
}
