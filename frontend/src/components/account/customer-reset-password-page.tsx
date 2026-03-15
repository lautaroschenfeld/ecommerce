"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { resetPassword } from "@/lib/customer-auth";
import { mapFriendlyError } from "@/lib/user-facing-errors";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import styles from "./customer-reset-password-page.module.css";

type CustomerResetPasswordPageProps = {
  token?: string | null;
};

function normalizeToken(value: string | null | undefined) {
  return (value || "").trim();
}

function validatePasswordStrength(password: string) {
  if (password.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (!/[a-z]/.test(password)) {
    return "La contraseña debe incluir al menos una minúscula.";
  }
  if (!/[A-Z]/.test(password)) {
    return "La contraseña debe incluir al menos una mayúscula.";
  }
  if (!/\d/.test(password)) {
    return "La contraseña debe incluir al menos un número.";
  }
  return null;
}

export function CustomerResetPasswordPage({
  token,
}: CustomerResetPasswordPageProps) {
  const safeToken = useMemo(() => normalizeToken(token), [token]);
  const hasToken = Boolean(safeToken);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submitResetPassword() {
    setError(null);

    if (!hasToken) {
      setError("El enlace no es válido o está incompleto.");
      return;
    }

    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    try {
      setBusy(true);
      await resetPassword(safeToken, password);
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(mapFriendlyError(err, "No se pudo restablecer la contraseña.", "login"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <Card className={styles.card}>
        <CardContent className={styles.content}>
          <header className={styles.header}>
            <h1 className={styles.title}>Restablecer contraseña</h1>
            <p className={styles.subtitle}>
              Ingresá una nueva contraseña para recuperar tu acceso.
            </p>
          </header>

          {error ? <p className={styles.error}>{error}</p> : null}

          {success ? (
            <div className={styles.successBox}>
              <p className={styles.successTitle}>Contraseña actualizada</p>
              <p className={styles.successSubtitle}>
                Ya podés iniciar sesión con tu nueva contraseña.
              </p>
              <Button asChild>
                <Link href="/ingresar">Ir a ingresar</Link>
              </Button>
            </div>
          ) : !hasToken ? (
            <div className={styles.successBox}>
              <p className={styles.successTitle}>Link inválido</p>
              <p className={styles.successSubtitle}>
                Falta el token de recuperación. Solicitá un nuevo enlace desde
                la pantalla de ingreso.
              </p>
              <Button asChild variant="outline">
                <Link href="/ingresar">Volver a ingresar</Link>
              </Button>
            </div>
          ) : (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void submitResetPassword();
              }}
            >
              <div className={styles.field}>
                <Label htmlFor="reset_password">Nueva contraseña</Label>
                <PasswordInput
                  id="reset_password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="********"
                  withRevealToggle
                  disabled={busy}
                  required
                />
              </div>

              <div className={styles.field}>
                <Label htmlFor="reset_password_confirm">
                  Confirmar contraseña
                </Label>
                <PasswordInput
                  id="reset_password_confirm"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="********"
                  withRevealToggle
                  disabled={busy}
                  required
                />
              </div>

              <div className={styles.actions}>
                <Button type="submit" disabled={busy}>
                  {busy ? "Actualizando..." : "Actualizar contraseña"}
                </Button>
                <Button asChild variant="outline">
                  <Link href="/ingresar">Volver a ingresar</Link>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


