"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LoaderCircle,
  LogOut,
  Package,
  UserRound,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useCustomerSession } from "@/lib/customer-auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import styles from "./customer-account-layout.module.css";

type AccountTab =
  | "home"
  | "orders"
  | "history"
  | "lists"
  | "favorites"
  | "profile"
  | "admin";

type CustomerSessionApi = ReturnType<typeof useCustomerSession>;

type CustomerAccountLayoutProps = {
  tab: AccountTab;
  title: string;
  subtitle: string;
  children: (context: {
    session: CustomerSessionApi;
    customer: NonNullable<CustomerSessionApi["customer"]>;
  }) => React.ReactNode;
};

const BASE_TABS = [
  {
    key: "home",
    href: "/cuenta",
    label: "Inicio",
    icon: UserRound,
  },
  {
    key: "orders",
    href: "/cuenta/pedidos",
    label: "Pedidos",
    icon: Package,
  },
  {
    key: "profile",
    href: "/cuenta/datos-personales",
    label: "Datos personales",
    icon: UserRound,
  },
] as const;

export function CustomerAccountLayout({
  tab,
  title,
  subtitle,
  children,
}: CustomerAccountLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useCustomerSession();

  if (!session.hydrated) {
    return (
      <Card className={styles.stateCard}>
        <CardContent className={styles.loadingState}>
          <LoaderCircle size={18} className={styles.spin} />
          <span>Cargando cuenta...</span>
        </CardContent>
      </Card>
    );
  }

  if (session.sessionUnavailable) {
    return null;
  }

  if (!session.customer) {
    const redirect = pathname || "/cuenta";

    return (
      <Card className={styles.stateCard}>
        <CardHeader>
          <CardTitle>Necesitas ingresar</CardTitle>
        </CardHeader>
        <CardContent className={styles.missingSession}>
          <p>
            Tu cuenta muestra pedidos, datos personales y direcciones guardadas.
          </p>
          <Button asChild>
            <Link href={`/ingresar?redirect=${encodeURIComponent(redirect)}`}>
              Ingresar
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await session.logout();
            router.push("/");
          }}
        >
          <LogOut size={16} />
          Cerrar sesión
        </Button>
      </div>

      <div className={styles.profileBar}>
        <div className={styles.profileMeta}>
          <strong>Hola, {session.displayName}</strong>
          <span>{session.customer.email}</span>
        </div>

        <nav className={styles.tabs} aria-label="Secciones de cuenta">
          {BASE_TABS.map((entry) => {
            const Icon = entry.icon;
            const active = entry.key === tab;
            return (
              <Link
                key={entry.key}
                href={entry.href}
                className={cn(styles.tab, active ? styles.tabActive : "")}
              >
                <Icon size={14} />
                {entry.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children({ session, customer: session.customer })}
    </div>
  );
}
