"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { canAccessAdminPanel, normalizeCustomerRole } from "@/lib/account-roles";
import { useCustomerSession } from "@/lib/customer-auth";
import { Button } from "@/components/ui/button";
import styles from "./auth-gates.module.css";

function GateSkeleton() {
  return (
    <div className={styles.gateSkeleton}>
      <Loader2 className="animate-spin" size={22} aria-label="Cargando" />
    </div>
  );
}

function GateUnavailable({ message }: { message?: string | null }) {
  return (
    <div className={styles.gateUnavailable}>
      <strong>No pudimos validar tu sesión.</strong>
      <p>{message || "Intenta nuevamente en unos minutos."}</p>
      <Button
        type="button"
        variant="outline"
        onClick={() => window.location.reload()}
      >
        Reintentar
      </Button>
    </div>
  );
}

function buildRequestedPath(
  pathname: string | null,
  fallbackPath: string
) {
  if (!pathname) return fallbackPath;
  if (typeof window === "undefined") return pathname;
  const query = window.location.search || "";
  return `${pathname}${query}`;
}

function buildLoginRedirect(
  pathname: string | null,
  fallbackPath: string
) {
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
  const { hydrated, isLoggedIn, sessionUnavailable, sessionError } = useCustomerSession();
  const router = useRouter();
  const pathname = usePathname();
  const resolvedRedirectTo = redirectTo ?? buildLoginRedirect(pathname, "/cuenta");

  useEffect(() => {
    if (!hydrated) return;
    if (sessionUnavailable) return;
    if (!isLoggedIn) {
      router.replace(resolvedRedirectTo);
    }
  }, [hydrated, isLoggedIn, resolvedRedirectTo, router, sessionUnavailable]);

  if (!hydrated) return <GateSkeleton />;
  if (sessionUnavailable) return <GateUnavailable message={sessionError} />;
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
  const { hydrated, customer, sessionUnavailable, sessionError } = useCustomerSession();
  const router = useRouter();
  const pathname = usePathname();

  const role = normalizeCustomerRole(customer?.role);
  const allowed = canAccessAdminPanel(role);
  const resolvedRedirectTo =
    redirectTo ??
    buildLoginRedirect(pathname, "/cuenta/administracion/resumen");

  useEffect(() => {
    if (!hydrated) return;
    if (sessionUnavailable) return;
    if (!customer) {
      router.replace(resolvedRedirectTo);
      return;
    }
    if (!allowed) {
      router.replace(fallback);
    }
  }, [hydrated, customer, allowed, resolvedRedirectTo, fallback, router, sessionUnavailable]);

  if (!hydrated) return <GateSkeleton />;
  if (sessionUnavailable) return <GateUnavailable message={sessionError} />;
  if (!customer || !allowed) return null;
  return <>{children}</>;
}
