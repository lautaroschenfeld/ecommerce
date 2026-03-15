import type { Metadata } from "next";
import { CustomerGate } from "@/components/account/auth-gates";

export const metadata: Metadata = {
  title: "Mi cuenta",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CuentaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CustomerGate>{children}</CustomerGate>;
}

