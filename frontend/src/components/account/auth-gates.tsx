"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { canAccessAdminPanel, normalizeCustomerRole } from "@/lib/account-roles";
import { useCustomerSession } from "@/lib/customer-auth";
import styles from "./auth-gates.module.css";

function GateSkeleton() {
  return (
    <div className={styles.gateSkeleton}>
      <Loader2 className="animate-spin" size={22} aria-label="Cargando" />
    </div>
  );
}

function buildRequestedPath(pathname: string | null, fallbackPath: string) {
  if (!pathname) return fallbackPath;
  if (typeof window === "undefined") return pathname;
  const query = window.location.search || "";
  return `${pathname}${query}`;
}

function buildLoginRedirect(pathname: string | null, fallbackPath: string) {
  const requestedPath = buildRequestedPath(pathname, fallbackPath);
  return `/ingresar?redirect=${encodeURIComponent(requestedPath)}`;
}

export function CustomerGate({
  redirectTo,
  children,
}: {
  redirectTo?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const { hydrated, isLoggedIn, sessionUnavailable } = useCustomerSession();
  const router = useRouter();
  const pathname = usePathname();
  const resolvedRedirectTo = redirectTo ?? buildLoginRedirect(pathname, "/cuenta");

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!hydrated) return;
    if (sessionUnavailable) return;
    if (!isLoggedIn) {
      router.replace(resolvedRedirectTo);
    }
  }, [hydrated, isLoggedIn, mounted, resolvedRedirectTo, router, sessionUnavailable]);

  if (!mounted) return <GateSkeleton />;
  if (!hydrated) return <GateSkeleton />;
  if (sessionUnavailable) return null;
  if (!isLoggedIn) return null;
  return <>{children}</>;
}

export function AdminGate({
  redirectTo,
  fallback = "/cuenta",
  children,
}: {
  redirectTo?: string;
  fallback?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const { hydrated, customer, sessionUnavailable } = useCustomerSession();
  const router = useRouter();
  const pathname = usePathname();

  const role = normalizeCustomerRole(customer?.role);
  const allowed = canAccessAdminPanel(role);
  const resolvedRedirectTo =
    redirectTo ??
    buildLoginRedirect(pathname, "/cuenta/administracion/resumen");

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!hydrated) return;
    if (sessionUnavailable) return;
    if (!customer) {
      router.replace(resolvedRedirectTo);
      return;
    }
    if (!allowed) {
      router.replace(fallback);
    }
  }, [hydrated, customer, allowed, mounted, resolvedRedirectTo, fallback, router, sessionUnavailable]);

  if (!mounted) return <GateSkeleton />;
  if (!hydrated) return <GateSkeleton />;
  if (sessionUnavailable) return null;
  if (!customer || !allowed) return null;
  return <>{children}</>;
}
