"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";

import { CustomerCartSync } from "@/components/cart/customer-cart-sync";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { StorePageTelemetry } from "@/components/telemetry/store-page-telemetry";
import { type StorefrontSettings } from "@/lib/storefront-settings";

import styles from "@/app/layout.module.css";

type RouteAwareSiteShellProps = {
  storefront: StorefrontSettings;
  children: React.ReactNode;
};

function isAdminPath(pathname: string | null) {
  if (!pathname) return false;
  return pathname === "/cuenta/administracion" || pathname.startsWith("/cuenta/administracion/");
}

function isMaintenancePath(pathname: string | null) {
  if (!pathname) return false;
  return pathname === "/mantenimiento" || pathname.startsWith("/mantenimiento/");
}

export function RouteAwareSiteShell({
  storefront,
  children,
}: RouteAwareSiteShellProps) {
  const pathname = usePathname();
  const adminRoute = isAdminPath(pathname);
  const maintenanceRoute = isMaintenancePath(pathname);

  if (maintenanceRoute) {
    return <main className={`container ${styles.mainAdmin}`}>{children}</main>;
  }

  return (
    <>
      <SiteHeader storefront={storefront} />
      {adminRoute ? null : <CustomerCartSync />}
      {adminRoute ? null : (
        <Suspense fallback={null}>
          <StorePageTelemetry />
        </Suspense>
      )}

      <main className={adminRoute ? styles.mainAdmin : `container ${styles.main}`}>
        {children}
      </main>

      {adminRoute ? null : <SiteFooter storefront={storefront} />}
    </>
  );
}
