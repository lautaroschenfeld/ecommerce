import * as React from "react";

import { cn } from "@/lib/utils";
import styles from "./label.module.css";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn(styles.label, className)} {...props} />;
}

