import type { Metadata } from "next";
import { AdminGate } from "@/components/account/auth-gates";
import { AdminLayout as AdminLayoutComponent } from "@/components/shared/admin-layout";

export const metadata: Metadata = {
  title: "Administración",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGate>
      <AdminLayoutComponent>{children}</AdminLayoutComponent>
    </AdminGate>
  );
}

