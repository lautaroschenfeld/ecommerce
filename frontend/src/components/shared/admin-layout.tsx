"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  X,
  ShoppingCart,
  Package,
  MessageSquare,
  Warehouse,
  Users,
  Cog,
  Tag,
} from "lucide-react";
import {
  SegmentedControl,
  type SegmentedControlOption,
} from "@/components/ui/segmented-control";
import { CUSTOMER_AUTH_LOST_EVENT } from "@/lib/customer-auth-events";
import {
  ADMIN_MOBILE_SIDEBAR_ID,
  ADMIN_SIDEBAR_CLOSE_EVENT,
  ADMIN_SIDEBAR_OPEN_EVENT,
  ADMIN_SIDEBAR_STATE_EVENT,
  ADMIN_SIDEBAR_TOGGLE_EVENT,
} from "@/lib/admin-sidebar-events";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { AdminToastsProvider } from "./admin-toasts";
import styles from "./admin-layout.module.css";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const primaryNavItems: NavItem[] = [
  { label: "Resumen", href: "/cuenta/administracion/resumen", icon: BarChart3 },
  { label: "Órdenes", href: "/cuenta/administracion/ordenes", icon: ShoppingCart },
  { label: "Productos", href: "/cuenta/administracion/productos", icon: Package },
  { label: "Preguntas", href: "/cuenta/administracion/preguntas", icon: MessageSquare },
  { label: "Clientes", href: "/cuenta/administracion/clientes", icon: Users },
  { label: "Inventario", href: "/cuenta/administracion/inventario", icon: Warehouse },
  { label: "Cupones", href: "/cuenta/administracion/promociones", icon: Tag },
];

const secondaryNavItems: NavItem[] = [
  { label: "Configuración", href: "/cuenta/administracion/apariencia", icon: Cog },
];

const navItems = [...primaryNavItems, ...secondaryNavItems];

type RangeKey = "today" | "week" | "month" | "year" | "custom";

const RANGE_OPTIONS: readonly SegmentedControlOption<RangeKey>[] = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "year", label: "Año" },
  { value: "custom", label: "Personalizado" },
];

function addDays(input: Date, days: number) {
  const date = new Date(input);
  date.setDate(date.getDate() + days);
  return date;
}

function toDateInputValue(input: Date) {
  const yyyy = String(input.getFullYear());
  const mm = String(input.getMonth() + 1).padStart(2, "0");
  const dd = String(input.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isValidDateInput(input: string | null): input is string {
  if (!input) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const date = new Date(`${input}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

type AdminLayoutProps = {
  children: React.ReactNode;
};

export function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onAuthLost = () => {
      const currentPath = `${window.location.pathname}${window.location.search}`;
      const params = new URLSearchParams({
        redirect: currentPath || "/cuenta/administracion/resumen",
        session_expired: "1",
      });
      router.replace(`/ingresar?${params.toString()}`);
    };

    window.addEventListener(CUSTOMER_AUTH_LOST_EVENT, onAuthLost);
    return () => {
      window.removeEventListener(CUSTOMER_AUTH_LOST_EVENT, onAuthLost);
    };
  }, [router]);

  useEffect(() => {
    const onToggle = () => {
      if (!mobileViewport) return;
      setMobileSidebarOpen((prev) => !prev);
    };
    const onOpen = () => {
      if (!mobileViewport) return;
      setMobileSidebarOpen(true);
    };
    const onClose = () => setMobileSidebarOpen(false);

    window.addEventListener(ADMIN_SIDEBAR_TOGGLE_EVENT, onToggle);
    window.addEventListener(ADMIN_SIDEBAR_OPEN_EVENT, onOpen);
    window.addEventListener(ADMIN_SIDEBAR_CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(ADMIN_SIDEBAR_TOGGLE_EVENT, onToggle);
      window.removeEventListener(ADMIN_SIDEBAR_OPEN_EVENT, onOpen);
      window.removeEventListener(ADMIN_SIDEBAR_CLOSE_EVENT, onClose);
    };
  }, [mobileViewport]);

  useEffect(() => {
    if (!mobileViewport || !mobileSidebarOpen) return;

    const sidebar = sidebarRef.current;
    const header = document.querySelector<HTMLElement>("[data-site-header]");
    const main = mainRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    const toggleModalSiblingState = (element: HTMLElement | null, disabled: boolean) => {
      if (!element) return () => {};
      const previousAriaHidden = element.getAttribute("aria-hidden");
      const hadInert = element.hasAttribute("inert");

      if (disabled) {
        element.setAttribute("aria-hidden", "true");
        element.setAttribute("inert", "");
      }

      return () => {
        if (previousAriaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", previousAriaHidden);
        }
        if (!hadInert) {
          element.removeAttribute("inert");
        }
      };
    };

    const restoreHeaderState = toggleModalSiblingState(header, true);
    const restoreMainState = toggleModalSiblingState(main, true);

    const getFocusableElements = () => {
      if (!sidebar) return [] as HTMLElement[];
      return Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) =>
          !element.hasAttribute("hidden") &&
          element.getAttribute("aria-hidden") !== "true" &&
          element.tabIndex !== -1
      );
    };

    const focusInsideSidebar = () => {
      const focusable = getFocusableElements();
      if (closeButtonRef.current && !closeButtonRef.current.disabled) {
        closeButtonRef.current.focus();
        return;
      }
      if (focusable.length > 0) {
        focusable[0].focus();
        return;
      }
      sidebar?.focus();
    };

    document.body.style.overflow = "hidden";
    focusInsideSidebar();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileSidebarOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        sidebar?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (active === first || !active || !sidebar?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !active || !sidebar?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      restoreHeaderState();
      restoreMainState();
      previousFocus?.focus();
    };
  }, [mobileSidebarOpen, mobileViewport]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = () => {
      const nextMobile = mediaQuery.matches;
      setMobileViewport(nextMobile);
      if (!nextMobile) {
        setMobileSidebarOpen(false);
      }
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new Event(ADMIN_SIDEBAR_CLOSE_EVENT));
  }, [pathname]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<{ open: boolean }>(ADMIN_SIDEBAR_STATE_EVENT, {
        detail: { open: mobileViewport && mobileSidebarOpen },
      })
    );
  }, [mobileSidebarOpen, mobileViewport]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    if (mobileViewport && !mobileSidebarOpen) {
      sidebar.setAttribute("inert", "");
      return;
    }

    sidebar.removeAttribute("inert");
  }, [mobileSidebarOpen, mobileViewport]);

  function closeMobileSidebar() {
    setMobileSidebarOpen(false);
  }

  const isActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + "/");
  };

  const isSummaryRoute = isActive("/cuenta/administracion/resumen");
  const isProductsListRoute = pathname === "/cuenta/administracion/productos";
  const isPromotionsListRoute = pathname === "/cuenta/administracion/promociones";
  const isProductCreateRoute = pathname === "/cuenta/administracion/productos/crear";
  const isPromotionCreateRoute = pathname === "/cuenta/administracion/promociones/crear";
  const isOrderDetailRoute =
    Boolean(pathname) &&
    pathname !== "/cuenta/administracion/ordenes" &&
    pathname.startsWith("/cuenta/administracion/ordenes/");
  const activeSectionLabel =
    navItems.find((n) => isActive(n.href))?.label || "Administración";
  const contextualTopbarLink = isProductCreateRoute
    ? {
        href: "/cuenta/administracion/productos",
        label: "Volver a productos",
        context: "Nuevo producto",
      }
    : isPromotionCreateRoute
      ? {
          href: "/cuenta/administracion/promociones",
          label: "Volver a cupones",
          context: "Nuevo cupon",
        }
      : isOrderDetailRoute
        ? {
            href: "/cuenta/administracion/ordenes",
            label: "Volver a ordenes",
            context: "Detalle de orden",
          }
        : null;
  const rangeParam = searchParams.get("r");
  const selectedRange: RangeKey =
    rangeParam === "today" ||
    rangeParam === "week" ||
    rangeParam === "month" ||
    rangeParam === "year" ||
    rangeParam === "custom"
      ? rangeParam
      : "month";
  const defaultTo = toDateInputValue(new Date());
  const defaultFrom = toDateInputValue(addDays(new Date(), -13));
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const customFrom = isValidDateInput(fromParam) ? fromParam : defaultFrom;
  const customTo = isValidDateInput(toParam) ? toParam : defaultTo;
  const customRangeOpen = isSummaryRoute && selectedRange === "custom";

  function handleRangeChange(nextRange: RangeKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextRange === "month") {
      params.delete("r");
    } else {
      params.set("r", nextRange);
    }

    if (nextRange === "custom") {
      if (!isValidDateInput(params.get("from"))) params.set("from", customFrom);
      if (!isValidDateInput(params.get("to"))) params.set("to", customTo);
    } else {
      params.delete("from");
      params.delete("to");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function handleCustomDateChange(field: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("r", "custom");

    const currentFrom = params.get("from") ?? customFrom;
    const currentTo = params.get("to") ?? customTo;

    if (field === "from") {
      params.set("from", value);
      if (value > currentTo) params.set("to", value);
    } else {
      params.set("to", value);
      if (currentFrom > value) params.set("from", value);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className={styles.container}>
      <AdminToastsProvider>
        {mobileSidebarOpen ? (
          <button
            type="button"
            className={styles.sidebarBackdrop}
            aria-label="Cerrar menú del panel"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeMobileSidebar}
          />
        ) : null}

        <aside
          id={ADMIN_MOBILE_SIDEBAR_ID}
          ref={sidebarRef}
          className={`${styles.sidebar} ${mobileSidebarOpen ? styles.sidebarOpen : ""}`}
          role={mobileViewport ? "dialog" : undefined}
          aria-modal={mobileViewport && mobileSidebarOpen ? true : undefined}
          aria-label="Menú del panel"
          aria-hidden={mobileViewport ? !mobileSidebarOpen : undefined}
          tabIndex={mobileViewport ? -1 : undefined}
        >
          <div className={styles.sidebarBox}>
            <button
              type="button"
              ref={closeButtonRef}
              className={styles.sidebarCloseButton}
              onClick={closeMobileSidebar}
              aria-label="Cerrar menú del panel"
            >
              <X size={16} />
            </button>

            <nav className={styles.nav}>
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                    onClick={closeMobileSidebar}
                  >
                    <Icon className={styles.navIcon} />
                    <span className={styles.navLabel}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className={styles.navFooter} aria-label="Configuración">
              <div className={styles.navDivider} aria-hidden />
              {secondaryNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                    onClick={closeMobileSidebar}
                  >
                    <Icon className={styles.navIcon} />
                    <span className={styles.navLabel}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <main ref={mainRef} className={styles.main}>
          <div className={styles.topbar}>
            <div className={styles.panelTitleBlock}>
              {contextualTopbarLink?.context ? (
                <span className={styles.panelContext}>{contextualTopbarLink.context}</span>
              ) : null}
              <h2 className={styles.panelTitle}>{activeSectionLabel}</h2>
            </div>
            {isSummaryRoute ? (
              <div className={styles.topbarControls}>
                <SegmentedControl
                  options={RANGE_OPTIONS}
                  value={selectedRange}
                  onValueChange={handleRangeChange}
                  ariaLabel="Selección de rango"
                  className={styles.topbarRangeControl}
                />

                <div
                  className={`${styles.topbarCustomRange} ${customRangeOpen ? styles.topbarCustomRangeOpen : ""}`}
                >
                  <DateInput
                    value={customFrom}
                    onValueChange={(value) => handleCustomDateChange("from", value)}
                    max={customTo || undefined}
                    className={styles.topbarDateInput}
                    disabled={!customRangeOpen}
                    aria-label="Desde"
                  />
                  <DateInput
                    value={customTo}
                    onValueChange={(value) => handleCustomDateChange("to", value)}
                    min={customFrom || undefined}
                    className={styles.topbarDateInput}
                    disabled={!customRangeOpen}
                    aria-label="Hasta"
                  />
                </div>
              </div>
            ) : null}
            {!isSummaryRoute && contextualTopbarLink ? (
              <Button
                asChild
                variant="ghost"
                size="xs"
                className={styles.topbarContextButton}
              >
                <Link href={contextualTopbarLink.href}>
                  <ArrowLeft size={14} />
                  {contextualTopbarLink.label}
                </Link>
              </Button>
            ) : null}
            {!isSummaryRoute && !contextualTopbarLink && isProductsListRoute ? (
              <Button asChild size="xs" className={styles.topbarIntegratedButton}>
                <Link href="/cuenta/administracion/productos/crear">Crear nuevo producto</Link>
              </Button>
            ) : null}
            {!isSummaryRoute && !contextualTopbarLink && isPromotionsListRoute ? (
              <Button asChild size="xs" className={styles.topbarIntegratedButton}>
                <Link href="/cuenta/administracion/promociones/crear">Crear nuevo cupón</Link>
              </Button>
            ) : null}
          </div>

          <div className={styles.content}>{children}</div>
        </main>
      </AdminToastsProvider>
    </div>
  );
}

