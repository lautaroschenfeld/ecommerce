import * as React from "react";

import { cn } from "@/lib/utils";
import styles from "./card.module.css";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.card, className)} {...props} />;
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn(styles.header, className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn(styles.title, className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn(styles.description, className)} {...props} />;
}

export function CardContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn(styles.content, className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn(styles.footer, className)} {...props} />;
}

