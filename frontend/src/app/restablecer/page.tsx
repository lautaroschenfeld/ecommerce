import type { Metadata } from "next";

import { CustomerResetPasswordPage } from "@/components/account/customer-reset-password-page";

type RestablecerPageProps = {
  searchParams?: Promise<{
    token?: string | string[];
  }>;
};

export const metadata: Metadata = {
  title: "Restablecer contraseña",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RestablecerPage({
  searchParams,
}: RestablecerPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams);

  const tokenRaw = resolvedSearchParams?.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;

  return <CustomerResetPasswordPage token={token ?? null} />;
}
