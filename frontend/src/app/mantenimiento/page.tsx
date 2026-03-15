import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import {
  isDevMaintenanceEnabled,
  normalizeMaintenanceRedirectPath,
} from "@/lib/dev-maintenance";

import styles from "./page.module.css";

type MaintenancePageProps = {
  searchParams?: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
};

export const metadata: Metadata = {
  title: "Mantenimiento",
  robots: {
    index: false,
    follow: false,
  },
};

function pickQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MaintenancePage({
  searchParams,
}: MaintenancePageProps) {
  if (!isDevMaintenanceEnabled()) {
    redirect("/");
  }

  const resolvedSearchParams = await Promise.resolve(searchParams);
  const nextPath = normalizeMaintenanceRedirectPath(
    pickQueryValue(resolvedSearchParams?.next)
  );
  const invalidPassword = pickQueryValue(resolvedSearchParams?.error) === "1";

  return (
    <section className={styles.page}>
      <div className={styles.hero}>
        <h1 className={styles.title}>Estamos mejorando el sitio</h1>
        <p className={styles.lead}>
          Estamos realizando ajustes a nuestro sitio web para ofrecerte una
          mejor experiencia. Si eres del equipo, ingresa tu clave para acceder.
        </p>

        <form action="/mantenimiento/unlock" method="post" className={styles.form}>
          <input type="hidden" name="next" value={nextPath} />
          <PasswordInput
            id="maintenance_password"
            name="password"
            required
            autoFocus
            withRevealToggle
            placeholder="Clave de acceso"
            wrapperClassName={styles.passwordWrapper}
            className={styles.input}
          />
          <Button type="submit" size="default" variant="default" className={styles.button}>
            Entrar
          </Button>
          {invalidPassword ? (
            <p className={styles.errorVisible} role="alert" aria-live="polite">
              Clave incorrecta.
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
