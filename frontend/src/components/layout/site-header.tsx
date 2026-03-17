"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ChevronDown,
  History,
  LayoutDashboard,
  ListPlus,
  LogOut,
  Menu,
  Package,
  UserRound,
  X,
} from "lucide-react";

import { CartDrawer } from "@/components/cart/cart-drawer";
import { useCustomerSession } from "@/lib/customer-auth";
import { canAccessAdminPanel } from "@/lib/account-roles";
import { cn } from "@/lib/utils";
import {
  STOREFRONT_RUNTIME_UPDATED_EVENT,
  type StorefrontSettings,
} from "@/lib/storefront-settings";
import {
  ADMIN_MOBILE_SIDEBAR_ID,
  ADMIN_SIDEBAR_STATE_EVENT,
  ADMIN_SIDEBAR_TOGGLE_EVENT,
} from "@/lib/admin-sidebar-events";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";
import styles from "./site-header.module.css";

const navItems = [
  { href: "/productos", label: "Productos" },
  { href: "/nosotros", label: "Nosotros" },
  { href: "/contacto", label: "Contacto" },
] as const;

type SiteHeaderProps = {
  storefront: StorefrontSettings;
};

export function SiteHeader({ storefront }: SiteHeaderProps) {
  const pathname = usePathname();
  const { hydrated, customer, isLoggedIn, logout, sessionUnavailable, sessionError } =
    useCustomerSession();
  const [runtimeStorefront, setRuntimeStorefront] = useState(storefront);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountDropdownMinWidth, setAccountDropdownMinWidth] = useState(0);
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState("");
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const rightActionsRef = useRef<HTMLDivElement | null>(null);

  const normalizePath = (value: string) =>
    value.length > 1 ? value.replace(/\/+$/, "") : value;

  const isSamePath = (href: string) => {
    if (!pathname) return false;
    return normalizePath(pathname) === normalizePath(href);
  };

  const handleSamePathClick = (href: string, event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isSamePath(href)) return;
    event.preventDefault();
  };

  const loginHref = useMemo(() => {
    const redirect = pathname || "/";
    return `/ingresar?redirect=${encodeURIComponent(redirect)}`;
  }, [pathname]);

  useEffect(() => {
    setRuntimeStorefront(storefront);
  }, [storefront]);

  useEffect(() => {
    const logoInput = runtimeStorefront.logoUrl.trim();
    const normalizedLogoUrl = logoInput ? toStoreMediaProxyUrl(logoInput) : "";
    if (!normalizedLogoUrl) {
      setResolvedLogoUrl("");
      return;
    }

    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (cancelled) return;
      setResolvedLogoUrl(normalizedLogoUrl);
    };
    image.onerror = () => {
      if (cancelled) return;
      setResolvedLogoUrl("");
    };
    image.src = normalizedLogoUrl;

    return () => {
      cancelled = true;
    };
  }, [runtimeStorefront.logoUrl]);

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

  useEffect(() => {
    if (!accountMenuOpen) return;

    const onClickOutside = (event: MouseEvent) => {
      if (!accountMenuRef.current) return;
      if (accountMenuRef.current.contains(event.target as Node)) return;
      setAccountMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };

    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

  const syncAccountDropdownMinWidth = useCallback(() => {
    const accountMenu = accountMenuRef.current;
    if (!accountMenu) return;

    const accountRect = accountMenu.getBoundingClientRect();
    const cartTrigger = rightActionsRef.current?.querySelector<HTMLElement>(
      "[data-cart-trigger='true']"
    );
    const cartAlignedWidth = cartTrigger
      ? accountRect.right - cartTrigger.getBoundingClientRect().left
      : accountRect.width;
    const nextWidth = Math.max(accountRect.width, cartAlignedWidth);
    const roundedWidth = Math.max(0, Math.ceil(nextWidth));

    setAccountDropdownMinWidth((prevWidth) =>
      prevWidth === roundedWidth ? prevWidth : roundedWidth
    );
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;

    let animationFrame = 0;
    const sync = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(syncAccountDropdownMinWidth);
    };

    sync();

    const resizeObserver = new ResizeObserver(sync);
    if (accountMenuRef.current) {
      resizeObserver.observe(accountMenuRef.current);
    }
    if (rightActionsRef.current) {
      resizeObserver.observe(rightActionsRef.current);
    }

    window.addEventListener("resize", sync);
    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      resizeObserver.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [accountMenuOpen, syncAccountDropdownMinWidth]);

  const greeting = customer?.firstName?.trim() || "Cliente";
  const isAdminRoute = pathname?.startsWith("/cuenta/administracion");
  const storeName = runtimeStorefront.storeName.trim();
  const hasStoreName = Boolean(storeName);
  const hasLogo = Boolean(resolvedLogoUrl);
  const logoOnly = hasLogo && !hasStoreName;
  const fallbackStoreName = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "FR Motos";
  const brandName = hasStoreName ? storeName : hasLogo ? "" : fallbackStoreName;
  const logoAlt = hasStoreName ? `Logo ${storeName}` : "Logo de la tienda";
  const brandHref = "/";
  const innerClassName = cn(
    styles.inner,
    !isAdminRoute ? "container" : "",
    isAdminRoute ? styles.innerAdmin : "",
    logoOnly && !isAdminRoute ? styles.innerLogoOnly : ""
  );
  const accountMenuStyle = useMemo(
    () =>
      ({
        "--account-dropdown-min-width": `${accountDropdownMinWidth}px`,
      }) as CSSProperties,
    [accountDropdownMinWidth]
  );

  useEffect(() => {
    if (!isAdminRoute) {
      setAdminSidebarOpen(false);
      return;
    }

    const onSidebarState = (event: Event) => {
      const custom = event as CustomEvent<{ open?: boolean }>;
      setAdminSidebarOpen(Boolean(custom.detail?.open));
    };

    window.addEventListener(ADMIN_SIDEBAR_STATE_EVENT, onSidebarState as EventListener);
    return () => {
      window.removeEventListener(ADMIN_SIDEBAR_STATE_EVENT, onSidebarState as EventListener);
    };
  }, [isAdminRoute]);

  const headerInner = (
    <div className={isAdminRoute ? styles.innerAdminFrame : undefined}>
      <div className={innerClassName}>
        <Link
          href={brandHref}
          className={cn(styles.brand, logoOnly ? styles.brandNoName : "")}
          onClick={(event) => handleSamePathClick(brandHref, event)}
        >
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvedLogoUrl}
              alt={logoAlt}
              className={styles.logoImage}
              width={320}
              height={96}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : null}

          {brandName ? (
            <div className={styles.brandText}>
              <span className={styles.brandName}>{brandName}</span>
            </div>
          ) : null}
        </Link>

        {isAdminRoute ? null : (
          <nav className={styles.centerNav} aria-label="Navegacion principal">
            {navItems.map((item) => {
              const active =
                pathname === item.href || pathname?.startsWith(item.href + "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(event) => handleSamePathClick(item.href, event)}
                  className={cn(
                    styles.navLink,
                    active ? styles.navLinkActive : styles.navLinkInactive
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className={styles.rightActions} ref={rightActionsRef}>
          {isAdminRoute ? null : <CartDrawer />}

          {!hydrated ? (
            <span className={styles.accountLoading} title="Cuenta">
              <UserRound size={16} aria-hidden="true" />
              <span className="srOnly">Cuenta</span>
            </span>
          ) : sessionUnavailable ? (
            <span
              className={styles.accountLoading}
              title={sessionError || "Cuenta no disponible"}
              aria-label={sessionError || "Cuenta no disponible"}
            >
              <UserRound size={16} aria-hidden="true" />
              <span className="srOnly">Cuenta no disponible</span>
            </span>
          ) : !isLoggedIn ? (
            <Link
              href={loginHref}
              className={styles.accountLogin}
              aria-label="Ingresar"
              title="Ingresar"
            >
              <UserRound size={16} />
            </Link>
          ) : (
            <div className={styles.accountMenu} ref={accountMenuRef} style={accountMenuStyle}>
              <button
                type="button"
                className={styles.accountTrigger}
                onClick={() => setAccountMenuOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
              >
                <span className={styles.accountTriggerLabel}>Mi cuenta</span>
                <span className={styles.accountTriggerGreeting}>Hola, {greeting}</span>
                <ChevronDown
                  size={16}
                  className={cn(
                    styles.accountTriggerChevron,
                    accountMenuOpen ? styles.accountTriggerChevronOpen : ""
                  )}
                />
              </button>

              {accountMenuOpen ? (
                <div className={styles.accountDropdown} role="menu">
                  <div className={styles.accountDropdownHeader}>
                    <strong>Hola, {greeting}</strong>
                    <span>{customer?.email}</span>
                  </div>

                  <Link
                    href="/cuenta/pedidos"
                    className={styles.accountItem}
                    role="menuitem"
                    onClick={(event) => {
                      handleSamePathClick("/cuenta/pedidos", event);
                      setAccountMenuOpen(false);
                    }}
                  >
                    <Package size={15} />
                    Pedidos
                  </Link>

                  <Link
                    href="/cuenta"
                    className={styles.accountItem}
                    role="menuitem"
                    onClick={(event) => {
                      handleSamePathClick("/cuenta", event);
                      setAccountMenuOpen(false);
                    }}
                  >
                    <UserRound size={15} />
                    Mi cuenta
                  </Link>

                  <Link
                    href="/cuenta/listas"
                    className={styles.accountItem}
                    role="menuitem"
                    onClick={(event) => {
                      handleSamePathClick("/cuenta/listas", event);
                      setAccountMenuOpen(false);
                    }}
                  >
                    <ListPlus size={15} />
                    Mis listas
                  </Link>

                  <Link
                    href="/cuenta/historial"
                    className={styles.accountItem}
                    role="menuitem"
                    onClick={(event) => {
                      handleSamePathClick("/cuenta/historial", event);
                      setAccountMenuOpen(false);
                    }}
                  >
                    <History size={15} />
                    Historial
                  </Link>

                  {customer && canAccessAdminPanel(customer.role) ? (
                    <Link
                      href="/cuenta/administracion/resumen"
                      className={styles.accountItem}
                      role="menuitem"
                      onClick={(event) => {
                        handleSamePathClick("/cuenta/administracion/resumen", event);
                        setAccountMenuOpen(false);
                      }}
                    >
                      <LayoutDashboard size={15} />
                      Panel de administración
                    </Link>
                  ) : null}

                  <div className={styles.accountDivider} aria-hidden />

                  <button
                    type="button"
                    className={styles.accountItem}
                    onClick={() => {
                      void logout();
                      setAccountMenuOpen(false);
                    }}
                    role="menuitem"
                  >
                    <LogOut size={15} />
                    Cerrar sesión
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {isAdminRoute ? (
            <button
              type="button"
              className={cn(
                styles.adminMenuTrigger,
                adminSidebarOpen ? styles.adminMenuTriggerOpen : ""
              )}
              aria-label={adminSidebarOpen ? "Cerrar menú del panel" : "Abrir menú del panel"}
              aria-haspopup="dialog"
              aria-controls={ADMIN_MOBILE_SIDEBAR_ID}
              aria-expanded={adminSidebarOpen}
              title={adminSidebarOpen ? "Cerrar menú del panel" : "Abrir menú del panel"}
              onClick={() => {
                window.dispatchEvent(new Event(ADMIN_SIDEBAR_TOGGLE_EVENT));
              }}
            >
              {adminSidebarOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <header className={styles.header} data-site-header>
      {headerInner}
    </header>
  );
}
