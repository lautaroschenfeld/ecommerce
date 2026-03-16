"use client";

import type { ComponentType, CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import type { Product } from "@/lib/product";
import type { Category } from "@/lib/catalog";
import { buildProductPath } from "@/lib/product-path";
import {
  resolveProductColorSummary,
  type ProductColorVariantInput,
} from "@/lib/product-color-summary";
import { useCart } from "@/lib/store-cart";
import { trackStoreTelemetry } from "@/lib/store-telemetry";

import {
  ArrowRight,
  Battery,
  Bike,
  Bolt,
  CircleDot,
  Gauge,
  Disc3,
  Droplet,
  Filter,
  Fuel,
  Layers,
  Lightbulb,
  PlugZap,
  Shield,
  Shirt,
  ShoppingCart,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MoneyAmount } from "@/components/ui/money-amount";
import styles from "./product-card.module.css";

import { QuantityControl } from "@/components/shared/quantity-control";

const categoryIcon: Partial<Record<Category, ComponentType<{ className?: string }>>> = {
  Motor: Gauge,
  "Transmisión": Disc3,
  Lubricantes: Droplet,
  Frenos: Shield,
  Electricidad: PlugZap,
  Ruedas: Bike,
  Accesorios: Sparkles,
  Indumentaria: Shirt,
  Filtros: Filter,
  "Baterías": Battery,
  "Iluminación": Lightbulb,
  Juntas: Layers,
  Carburación: Fuel,
  Embrague: Disc3,
  Suspensión: Wrench,
  Rodamientos: CircleDot,
  Tornillería: Bolt,
};

function withColorCssVar(name: string, value: string) {
  return { [name]: value } as CSSProperties;
}

function Visual({
  product,
  variantColors,
}: {
  product: Product;
  variantColors?: ProductColorVariantInput[];
}) {
  const colorDotSwatchVar = "--color-dot-swatch" as const;
  const imageList = useMemo(() => {
    const urls = [
      ...(product.images ?? []),
      ...(product.imageUrl ? [product.imageUrl] : []),
    ]
      .map((item) => item.trim())
      .filter(Boolean);

    return Array.from(new Set(urls));
  }, [product.images, product.imageUrl]);

  const colorSummary = useMemo(() => {
    if (!variantColors?.length) return null;
    const summary = resolveProductColorSummary(variantColors, 3);
    return summary.totalColors > 1 ? summary : null;
  }, [variantColors]);

  const hasImage = imageList.length > 0;
  const canCycle = imageList.length > 1;
  const Icon = categoryIcon[product.category] ?? Wrench;
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (!hovering || !canCycle) return;

    const timer = window.setInterval(() => {
      setActiveImageIndex((prev) => (prev + 1) % imageList.length);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hovering, canCycle, imageList.length]);

  const activeImageUrl = hasImage
    ? imageList[activeImageIndex % imageList.length]
    : undefined;

  return (
    <div
      className={`${styles.visual} ${hasImage ? styles.visualWithImage : styles.visualPlaceholder}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => {
        setHovering(false);
        setActiveImageIndex(0);
      }}
    >
      {activeImageUrl ? (
        <AnimatePresence initial={false}>
          <motion.img
            key={`${product.id}:${activeImageUrl ?? "none"}`}
            src={activeImageUrl}
            alt={product.name}
            className={styles.image}
            loading="lazy"
            initial={canCycle ? { x: "100%" } : { x: "0%" }}
            animate={{ x: "0%" }}
            exit={canCycle ? { x: "-100%" } : { x: "0%" }}
            transition={
              canCycle
                ? { duration: 0.36, ease: [0.22, 1, 0.36, 1] }
                : { duration: 0 }
            }
          />
        </AnimatePresence>
      ) : null}

      {!hasImage ? (
        <div className={styles.iconWrap}>
          <Icon className={styles.icon} />
        </div>
      ) : null}

      {colorSummary ? (
        <div className={styles.colorDock} aria-label="Colores disponibles">
          <div className={styles.colorDots}>
            {colorSummary.visible.map((item) => (
              <span
                key={item.key}
                aria-hidden
                className={styles.colorDot}
                style={withColorCssVar(colorDotSwatchVar, item.swatch)}
                title={item.color}
              />
            ))}
          </div>
          {colorSummary.hiddenCount > 0 ? (
            <span className={styles.colorMore}>+{colorSummary.hiddenCount}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProductCard({
  product,
  variantColors,
  interactive = true,
}: {
  product: Product;
  variantColors?: ProductColorVariantInput[];
  interactive?: boolean;
}) {
  const router = useRouter();
  const { hydrated, addItem, getQty, setItemQty } = useCart();
  const qtyInCart = hydrated && interactive ? getQty(product.id) : 0;
  const hasStockData =
    product.stockAvailable !== undefined || product.inStock !== undefined;
  const stockAvailable = hasStockData
    ? Math.max(0, Math.trunc(product.stockAvailable ?? 0))
    : 999;
  const hasValidPrice = Number.isFinite(product.priceArs) && product.priceArs > 0;
  const inStock = hasStockData
    ? (product.inStock ?? stockAvailable > 0)
    : true;
  const [controlsOpen, setControlsOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const detailHref = buildProductPath(product.id, product.name);

  const emitAddToCartTelemetry = (quantity: number) => {
    const safeQty = Math.max(1, Math.min(99, Math.trunc(quantity)));
    void trackStoreTelemetry("add_to_cart", {
      source: "product_card",
      product_id: product.id,
      product_name: product.name,
      brand: product.brand,
      category: product.category,
      unit_price_ars: product.priceArs,
      quantity: safeQty,
    });
  };

  const openDetail = () => {
    if (!interactive) return;
    router.push(detailHref, { scroll: true });
  };

  const openDetailInNewTab = () => {
    if (!interactive) return;
    window.open(detailHref, "_blank", "noopener,noreferrer");
  };

  const isFromInteractiveChild = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        "button, a, input, textarea, select, label, [role='button']"
      )
    );
  };

  const clearAutoClose = () => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const scheduleAutoClose = () => {
    clearAutoClose();
    closeTimerRef.current = window.setTimeout(() => {
      setControlsOpen(false);
      closeTimerRef.current = null;
    }, 1500);
  };

  useEffect(() => {
    return () => clearAutoClose();
  }, []);

  const handleCardClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (!interactive) return;
    if (isFromInteractiveChild(event.target)) return;

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      openDetailInNewTab();
      return;
    }

    openDetail();
  };

  const handleCardMouseDown = (event: ReactMouseEvent<HTMLElement>) => {
    if (!interactive) return;
    if (event.button !== 1) return;
    if (isFromInteractiveChild(event.target)) return;

    // Prevent middle-click autoscroll.
    event.preventDefault();
  };

  const handleCardAuxClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (!interactive) return;
    if (event.button !== 1) return;
    if (isFromInteractiveChild(event.target)) return;
    event.preventDefault();
    openDetailInNewTab();
  };

  return (
    <article
      className={styles.card}
      role={interactive ? "link" : undefined}
      tabIndex={interactive ? 0 : -1}
      onClick={handleCardClick}
      onMouseDown={handleCardMouseDown}
      onAuxClick={handleCardAuxClick}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.target !== e.currentTarget) return;
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        openDetail();
      }}
      aria-label={interactive ? `Ver detalle de ${product.name}` : undefined}
    >
      <Visual product={product} variantColors={variantColors} />

      <div className={styles.content}>
        <div className={styles.meta}>
          <h3 className={styles.name}>{product.name}</h3>

          <div className={styles.subMeta}>
            <p className={styles.brandMeta}>{product.brand}</p>
          </div>

          <div className={styles.bottomRow}>
            <p className={styles.price}>
              {hasValidPrice ? (
                <MoneyAmount
                  value={product.priceArs}
                  currencyClassName={styles.priceCurrency}
                />
              ) : (
                "Sin precio"
              )}
            </p>

            <div className={styles.ctaSlot}>
              {!hasValidPrice ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={styles.addBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetail();
                  }}
                  aria-label="Ver detalle"
                >
                  <ArrowRight size={16} />
                  Ver detalle
                </Button>
              ) : !inStock ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={styles.addBtn}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Sin stock"
                  disabled
                >
                  Sin stock
                </Button>
              ) : qtyInCart === 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={styles.addBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!interactive) return;
                    addItem(product, 1);
                    emitAddToCartTelemetry(1);
                    setControlsOpen(true);
                    scheduleAutoClose();
                  }}
                  aria-label="Agregar al carrito"
                >
                  <ShoppingCart size={16} />
                  Agregar
                </Button>
              ) : controlsOpen ? (
                <div
                  className={styles.qtyEditor}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Editar cantidad"
                >
                  <QuantityControl
                    value={qtyInCart}
                    min={0}
                    max={
                      hasStockData
                        ? Math.min(99, Math.max(stockAvailable, qtyInCart, 1))
                        : 99
                    }
                    decrementStyle="trash"
                    variant="cta"
                    onDecrementClick={() => {
                      if (!interactive) return;
                      setItemQty(product.id, 0);
                      setControlsOpen(false);
                      clearAutoClose();
                    }}
                    onChange={(next) => {
                      if (!interactive) return;
                      if (next > qtyInCart) {
                        emitAddToCartTelemetry(next - qtyInCart);
                      }
                      setItemQty(product.id, next);
                      if (next <= 0) {
                        setControlsOpen(false);
                        clearAutoClose();
                        return;
                      }
                      scheduleAutoClose();
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.qtyCollapsed}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!interactive) return;
                    setControlsOpen(true);
                    scheduleAutoClose();
                  }}
                  aria-label={`Cantidad en carrito: ${qtyInCart}`}
                  title="Editar cantidad"
                >
                  <ShoppingCart size={14} />
                  <span>{qtyInCart}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

