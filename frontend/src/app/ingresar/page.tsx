import type { Metadata } from "next";

import { CustomerLoginPage } from "@/components/account/customer-login-page";
import { mapOAuthErrorMessage } from "@/lib/user-facing-errors";

type IngresarPageProps = {
  searchParams?: Promise<{
    redirect?: string | string[];
    oauth_error?: string | string[];
    session_expired?: string | string[];
  }>;
};

export const metadata: Metadata = {
  title: "Ingresar",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function IngresarPage({ searchParams }: IngresarPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams);

  const redirectRaw = resolvedSearchParams?.redirect;
  const redirectPath = Array.isArray(redirectRaw) ? redirectRaw[0] : redirectRaw;
  const oauthErrorRaw = resolvedSearchParams?.oauth_error;
  const oauthError = mapOAuthErrorMessage(
    Array.isArray(oauthErrorRaw) ? oauthErrorRaw[0] : oauthErrorRaw
  );
  const sessionExpiredRaw = resolvedSearchParams?.session_expired;
  const sessionExpired =
    (Array.isArray(sessionExpiredRaw) ? sessionExpiredRaw[0] : sessionExpiredRaw) ===
    "1";

  return (
    <CustomerLoginPage
      redirectPath={redirectPath ?? null}
      oauthError={oauthError ?? null}
      sessionExpired={sessionExpired}
    />
  );
}

