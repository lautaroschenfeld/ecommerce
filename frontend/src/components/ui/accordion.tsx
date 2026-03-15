import * as React from "react";

import { cn } from "@/lib/utils";
import styles from "./accordion.module.css";

export function Accordion({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  type?: "single" | "multiple";
  collapsible?: boolean;
}) {
  const { type, collapsible, ...domProps } = props;

  return (
    <div
      className={cn(styles.accordion, className)}
      data-accordion-type={type}
      data-collapsible={collapsible ? "true" : "false"}
      {...domProps}
    />
  );
}

export function AccordionItem({
  className,
  ...props
}: React.ComponentProps<"details"> & { value?: string }) {
  return <details className={cn(styles.item, className)} {...props} />;
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"summary">) {
  return (
    <summary className={cn(styles.trigger, className)} {...props}>
      <span className={styles.triggerLabel}>{children}</span>
      <span className={styles.chevron} aria-hidden>
        v
      </span>
    </summary>
  );
}

export function AccordionContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.content, className)} {...props} />;
}

