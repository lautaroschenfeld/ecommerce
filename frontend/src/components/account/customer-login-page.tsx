"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { canAccessAdminPanel } from "@/lib/account-roles";
import { requestPasswordReset, useCustomerSession } from "@/lib/customer-auth";
import { probeStoreBackend, useStoreBackendStatus } from "@/lib/store-backend-status";
import { mapFriendlyError, mapOAuthErrorMessage } from "@/lib/user-facing-errors";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import styles from "./customer-login-page.module.css";

function normalizeRedirectPath(rawPath: string | null) {
  if (!rawPath) return "/cuenta";
  const path = rawPath.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "/cuenta";
  if (path.startsWith("/admin")) return "/cuenta";
  return path;
}

function normalizeEmailInput(value: string) {
  return value.toLowerCase();
}

type PasswordChecks = {
  minLength: boolean;
  hasLower: boolean;
  hasUpper: boolean;
  hasDigit: boolean;
};

function buildPasswordChecks(value: string): PasswordChecks {
  const source = String(value || "");
  return {
    minLength: source.length >= 8,
    hasLower: /[a-z]/.test(source),
    hasUpper: /[A-Z]/.test(source),
    hasDigit: /\d/.test(source),
  };
}

function isPasswordValid(checks: PasswordChecks) {
  return (
    checks.minLength &&
    checks.hasLower &&
    checks.hasUpper &&
    checks.hasDigit
  );
}

function passwordRequirementsMessage() {
  return "La contraseña debe tener al menos 8 caracteres, una minúscula, una mayúscula y un número.";
}

function isAdminRedirectPath(path: string) {
  return path === "/cuenta/administracion" || path.startsWith("/cuenta/administracion/");
}

export function resolvePostLoginPath(nextPath: string, role: unknown) {
  const allowAdmin = canAccessAdminPanel(role);

  if (isAdminRedirectPath(nextPath)) {
    if (!allowAdmin) return "/cuenta";
    return nextPath === "/cuenta/administracion"
      ? "/cuenta/administracion/resumen"
      : nextPath;
  }

  if (allowAdmin && nextPath === "/cuenta") {
    return "/cuenta/administracion/resumen";
  }

  return nextPath;
}

function isBackendUnavailableMessage(messageRaw: string | null | undefined) {
  const message = String(messageRaw || "").trim().toLowerCase();
  if (!message) return false;
  return (
    message.includes("servicio temporalmente no disponible") ||
    message.includes("intenta nuevamente en unos minutos")
  );
}


type ViewMode = "login" | "register" | "forgot";

type CustomerLoginPageProps = {
  redirectPath?: string | null;
  oauthError?: string | null;
  sessionExpired?: boolean;
};

export function CustomerLoginPage({
  redirectPath,
  oauthError,
  sessionExpired = false,
}: CustomerLoginPageProps) {
  const router = useRouter();
  const { hydrated, isLoggedIn, customer, login, register } = useCustomerSession();
  const { unavailable: backendUnavailable } = useStoreBackendStatus();

  const [viewMode, setViewMode] = useState<ViewMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [devResetLink, setDevResetLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [backendChecking, setBackendChecking] = useState(true);
  const [showPasswordRequirementsOnFailure, setShowPasswordRequirementsOnFailure] =
    useState(false);

  const nextPath = normalizeRedirectPath(redirectPath ?? null);
  const postLoginPath = useMemo(
    () => resolvePostLoginPath(nextPath, customer?.role),
    [customer?.role, nextPath]
  );
  const safeOAuthError = useMemo(
    () => mapOAuthErrorMessage(oauthError),
    [oauthError]
  );
  const passwordChecks = useMemo(() => buildPasswordChecks(password), [password]);
  const showPasswordRequirements =
    viewMode === "register" &&
    showPasswordRequirementsOnFailure &&
    !isPasswordValid(passwordChecks);
  const controlsDisabled = busy || backendChecking || backendUnavailable;
  const backendBase =
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:9000";
  const oauthRedirectPath = `/ingresar?redirect=${encodeURIComponent(nextPath)}`;
  const oauthGoogleHref = `${backendBase}/store/catalog/auth/oauth/google/start?redirect=${encodeURIComponent(
    oauthRedirectPath
  )}`;
  const visibleError =
    error && !isBackendUnavailableMessage(error) ? error : null;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setBackendChecking(true);
      try {
        await probeStoreBackend();
      } finally {
        if (!cancelled) setBackendChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!isLoggedIn) return;
    router.replace(postLoginPath);
  }, [hydrated, isLoggedIn, postLoginPath, router]);

  useEffect(() => {
    setError(null);
    setShowPasswordRequirementsOnFailure(false);
    if (viewMode !== "login") {
      setInfo(null);
    }
    if (viewMode !== "forgot") {
      setDevResetLink(null);
    }
  }, [viewMode]);

  useEffect(() => {
    if (!backendUnavailable) return;
    if (isBackendUnavailableMessage(error)) {
      setError(null);
    }
  }, [backendUnavailable, error]);

  const headerTitle = useMemo(() => {
    if (viewMode === "forgot") {
      return "Recuperá tu contraseña";
    }
    if (viewMode === "register") {
      return "Crea tu cuenta";
    }
    return "Ingresá tu correo electrónico para iniciar sesión";
  }, [viewMode]);

  const headerSubtitle = useMemo(() => {
    if (viewMode === "forgot") {
      return "Escribí tu email y te enviamos un enlace para restablecer tu acceso.";
    }
    if (viewMode === "register") {
      return "Completá nombre y apellido para crear tu cuenta.";
    }
    return "";
  }, [viewMode]);

  async function submitLogin() {
    if (controlsDisabled) return;

    setError(null);
    setInfo(null);
    setBusy(true);

    const result = await login({
      email,
      password,
    });

    if (!result.ok) {
      if (isBackendUnavailableMessage(result.error)) {
        setBusy(false);
        return;
      }
      setError(result.error ?? "No se pudo iniciar sesión.");
      setBusy(false);
      return;
    }

    const destination = resolvePostLoginPath(
      nextPath,
      result.customer?.role ?? customer?.role
    );
    router.replace(destination);
  }

  async function submitRegister() {
    if (controlsDisabled) return;

    setError(null);
    setInfo(null);
    setBusy(true);

    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      setError("Nombre y apellido son obligatorios.");
      setBusy(false);
      return;
    }
    if (!isPasswordValid(passwordChecks)) {
      setShowPasswordRequirementsOnFailure(true);
      setError(passwordRequirementsMessage());
      setBusy(false);
      return;
    }

    const result = await register({
      email,
      password,
      firstName: first,
      lastName: last,
    });

    if (!result.ok) {
      if (isBackendUnavailableMessage(result.error)) {
        setBusy(false);
        return;
      }
      setError(result.error ?? "No se pudo crear la cuenta.");
      setBusy(false);
      return;
    }

    const destination = resolvePostLoginPath(
      nextPath,
      result.customer?.role ?? customer?.role
    );
    router.replace(destination);
  }

  async function submitForgotPassword() {
    if (controlsDisabled) return;

    setError(null);
    setInfo(null);
    setDevResetLink(null);
    setBusy(true);

    try {
      const data = await requestPasswordReset(forgotEmail);
      const devToken =
        typeof data.dev_reset_token === "string"
          ? data.dev_reset_token.trim()
          : "";

      if (devToken) {
        setDevResetLink(`/restablecer?token=${encodeURIComponent(devToken)}`);
        setInfo(
          "Solicitud enviada. Como estás en entorno local, podés abrir el enlace de restablecimiento."
        );
      } else {
        setInfo(
          "Si el email existe, te enviamos instrucciones para recuperar tu cuenta."
        );
      }
    } catch (err) {
      const mapped = mapFriendlyError(
        err,
        "No se pudo iniciar la recuperación de contraseña.",
        "login"
      );
      if (isBackendUnavailableMessage(mapped)) {
        setError(null);
      } else {
        setError(mapped);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <Card className={styles.card}>
        <CardContent className={styles.content}>
          <header className={styles.header}>
            <h1 className={styles.title}>{headerTitle}</h1>
            {headerSubtitle ? (<p className={styles.subtitle}>{headerSubtitle}</p>) : null}
          </header>

          {visibleError ? <p className={styles.error}>{visibleError}</p> : null}
          {safeOAuthError && viewMode === "login" ? (
            <p className={styles.error}>{safeOAuthError}</p>
          ) : null}
          {sessionExpired && viewMode === "login" ? (
            <div className={styles.info}>
              <p className={styles.infoTitle}>Sesión expirada</p>
              <p className={styles.infoSubtitle}>Tu sesión expiró. Ingresá nuevamente.</p>
            </div>
          ) : null}
          {info ? <p className={styles.info}>{info}</p> : null}
          {devResetLink && viewMode === "forgot" ? (
            <p className={styles.infoLinkWrap}>
              <a className={styles.infoLink} href={devResetLink}>
                Abrir enlace de restablecimiento
              </a>
            </p>
          ) : null}

          {viewMode === "forgot" ? (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                void submitForgotPassword();
              }}
            >
              <div className={styles.field}>
                <Label htmlFor="forgot_email">Correo electrónico</Label>
                <Input
                  id="forgot_email"
                  type="email"
                  value={forgotEmail}
                  onChange={(event) =>
                    setForgotEmail(normalizeEmailInput(event.target.value))
                  }
                  placeholder="tu@email.com"
                  autoComplete="email"
                  disabled={controlsDisabled}
                  required
                />
              </div>

              <Button type="submit" disabled={controlsDisabled}>
                {busy ? "Enviando..." : "Enviar enlace"}
              </Button>

              <button
                type="button"
                className={styles.textLink}
                disabled={controlsDisabled}
                onClick={() => setViewMode("login")}
              >
                Volver a ingresar
              </button>
            </form>
          ) : (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                if (viewMode === "register") {
                  void submitRegister();
                } else {
                  void submitLogin();
                }
              }}
            >
              {viewMode === "register" ? (
                <div className={styles.nameRow}>
                  <div className={styles.field}>
                    <Label htmlFor="customer_first_name">Nombre</Label>
                    <Input
                      id="customer_first_name"
                      type="text"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      placeholder="Juan"
                      autoComplete="given-name"
                      disabled={controlsDisabled}
                      required
                    />
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="customer_last_name">Apellido</Label>
                    <Input
                      id="customer_last_name"
                      type="text"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      placeholder="Perez"
                      autoComplete="family-name"
                      disabled={controlsDisabled}
                      required
                    />
                  </div>
                </div>
              ) : null}

              <div className={styles.field}>
                <Label htmlFor="customer_email">Correo electrónico</Label>
                <Input
                  id="customer_email"
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(normalizeEmailInput(event.target.value))
                  }
                  placeholder="nombre@ejemplo.com"
                  autoComplete="email"
                  disabled={controlsDisabled}
                  required
                />
              </div>

              <div className={styles.field}>
                <Label htmlFor="customer_password">Contraseña</Label>
                <PasswordInput
                  id="customer_password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="********"
                  autoComplete={
                    viewMode === "register" ? "new-password" : "current-password"
                  }
                  aria-describedby={
                    showPasswordRequirements ? "register_password_requirements" : undefined
                  }
                  withRevealToggle
                  disabled={controlsDisabled}
                  required
                />
                {showPasswordRequirements ? (
                  <ul
                    id="register_password_requirements"
                    className={styles.passwordRequirements}
                    aria-live="polite"
                  >
                    <li
                      className={`${styles.passwordRequirement} ${
                        passwordChecks.minLength ? "" : styles.passwordRequirementFailed
                      }`}
                    >
                      Mínimo 8 caracteres
                    </li>
                    <li
                      className={`${styles.passwordRequirement} ${
                        passwordChecks.hasLower ? "" : styles.passwordRequirementFailed
                      }`}
                    >
                      Al menos una letra minúscula
                    </li>
                    <li
                      className={`${styles.passwordRequirement} ${
                        passwordChecks.hasUpper ? "" : styles.passwordRequirementFailed
                      }`}
                    >
                      Al menos una letra mayúscula
                    </li>
                    <li
                      className={`${styles.passwordRequirement} ${
                        passwordChecks.hasDigit ? "" : styles.passwordRequirementFailed
                      }`}
                    >
                      Al menos un número
                    </li>
                  </ul>
                ) : null}
              </div>

              {viewMode === "login" ? (
                <button
                  type="button"
                  className={styles.textLink}
                  disabled={controlsDisabled}
                  onClick={() => {
                    setForgotEmail(email);
                    setViewMode("forgot");
                  }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.textLink}
                  disabled={controlsDisabled}
                  onClick={() => setViewMode("login")}
                >
                  ¿Ya tenés una cuenta? Ingresá
                </button>
              )}

              <div className={styles.actions}>
                <Button type="submit" disabled={controlsDisabled}>
                  {busy
                    ? viewMode === "register"
                      ? "Creando..."
                      : "Ingresando..."
                    : viewMode === "register"
                      ? "Crear cuenta"
                      : "Continuar"}
                </Button>
                {viewMode === "login" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={controlsDisabled}
                    onClick={() => setViewMode("register")}
                  >
                    Crear cuenta
                  </Button>
                ) : null}
              </div>
            </form>
          )}

          {viewMode === "login" ? (
            <>
              <div className={styles.divider}>
                <span>o</span>
              </div>

           <div className={styles.oauthStack}>
             <Button asChild variant="outline" disabled={controlsDisabled}>
               <a
                 className={styles.oauthButton}
                 href={oauthGoogleHref}
                 aria-disabled={controlsDisabled}
                 onClick={(event) => {
                   if (controlsDisabled) event.preventDefault();
                 }}
               >
                 <span className={styles.oauthIconWrapper}>
                  <Image
                    src="/assets/auth/logo_google.svg"
                    alt=""
                    width={18}
                    height={18}
                    aria-hidden="true"
                  />
                </span>
                 Iniciar sesión con Google
               </a>
             </Button>
           </div>
             </>
           ) : null}
         </CardContent>
       </Card>
    </div>
  );
}




