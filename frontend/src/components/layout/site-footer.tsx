"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  STOREFRONT_RUNTIME_UPDATED_EVENT,
  type StorefrontSettings,
} from "@/lib/storefront-settings";
import { SITE_NAME } from "@/lib/seo";

import styles from "@/app/layout.module.css";

function isAdminPath(pathname: string | null) {
  if (!pathname) return false;
  return pathname === "/cuenta/administracion" || pathname.startsWith("/cuenta/administracion/");
}

export function SiteFooter({ storefront }: { storefront: StorefrontSettings }) {
  const pathname = usePathname();
  const [runtimeStorefront, setRuntimeStorefront] = useState(storefront);
  const hidden = isAdminPath(pathname);
  const storeName = runtimeStorefront.storeName?.trim() || "";
  const brandName = storeName || SITE_NAME;

  useEffect(() => {
    setRuntimeStorefront(storefront);
  }, [storefront]);

  useEffect(() => {
    const onStorefrontUpdated = (event: Event) => {
      const custom = event as CustomEvent<StorefrontSettings>;
      if (!custom.detail || typeof custom.detail !== "object") return;
      setRuntimeStorefront(custom.detail);
    };

    window.addEventListener(
      STOREFRONT_RUNTIME_UPDATED_EVENT,
      onStorefrontUpdated as EventListener
    );
    return () => {
      window.removeEventListener(
        STOREFRONT_RUNTIME_UPDATED_EVENT,
        onStorefrontUpdated as EventListener
      );
    };
  }, []);

  return (
    <footer className={styles.footer} data-site-footer hidden={hidden}>
      <div className={`container ${styles.footerInner}`}>
        <p className={styles.footerBrand}>
          {"\u00A9"} 2026 {brandName}
        </p>
        <nav className={styles.footerNav} aria-label="Enlaces del footer">
          <Link href="/terminos-y-condiciones">Términos y condiciones</Link>
          <Link href="/politica-de-privacidad">Política de privacidad</Link>
          <Link href="/cambios-y-devoluciones">Cambios y devoluciones</Link>
          <Link href="/politica-de-envios">Política de envíos</Link>
          <Link href="/boton-de-arrepentimiento">Botón de arrepentimiento</Link>
        </nav>
      </div>
    </footer>
  );
}
