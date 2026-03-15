import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import styles from "./admin-panel-card.module.css";

type AdminPanelCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  headerRightClassName?: string;
  bodyClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  headerRight?: ReactNode;
};

export function AdminPanelCard({
  title,
  subtitle,
  children,
  className,
  headerClassName,
  headerRightClassName,
  bodyClassName,
  titleClassName,
  subtitleClassName,
  headerRight,
}: AdminPanelCardProps) {
  return (
    <Card className={cn(styles.card, className)}>
      <CardHeader className={cn(styles.header, headerClassName)}>
        <div className={styles.headerMain}>
          <CardTitle className={cn(styles.title, titleClassName)}>{title}</CardTitle>
          {subtitle ? <p className={cn(styles.subtitle, subtitleClassName)}>{subtitle}</p> : null}
        </div>

        {headerRight ? (
          <div className={cn(styles.headerRight, headerRightClassName)}>{headerRight}</div>
        ) : null}
      </CardHeader>

      <CardContent className={styles.body}>
        <div className={cn(styles.bodySurface, bodyClassName)}>{children}</div>
      </CardContent>
    </Card>
  );
}
