"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Percent, ShieldCheck, Sparkles } from "lucide-react";

import { useCart } from "@/lib/store-cart";
import { trackStoreTelemetry } from "@/lib/store-telemetry";
import { ApiHttpError } from "@/lib/store-client";
import { mapFriendlyError } from "@/lib/user-facing-errors";
import {
  validateStoreCoupon,
  type ValidatedCoupon,
} from "@/lib/store-coupons";
import { useStoreProducts } from "@/lib/store-catalog";
import {
  computeStoreShippingArs,
  useStoreShippingSettings,
} from "@/lib/store-shipping";

import { CartLineItem } from "@/components/cart/cart-line-item";
import { ProductCard } from "@/components/products/product-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyAmount } from "@/components/ui/money-amount";
import { Separator } from "@/components/ui/separator";
import styles from "./cart-page.module.css";

function ShippingProgress({
  subtotalArs,
  freeShippingThresholdArs,
  standardShippingArs,
}: {
  subtotalArs: number;
  freeShippingThresholdArs: number;
  standardShippingArs: number;
}) {
  const remaining = Math.max(0, freeShippingThresholdArs - subtotalArs);
  const progress =
    freeShippingThresholdArs > 0
      ? Math.min(1, subtotalArs / freeShippingThresholdArs)
      : 0;

  return (
    <div className={styles.shippingBox}>
      <div className={styles.shippingTop}>
        <p className={styles.shippingTitle}>Envio estandar</p>
        <Badge variant="secondary">
          {subtotalArs >= freeShippingThresholdArs
            ? "Gratis"
            : <MoneyAmount value={standardShippingArs} />}
        </Badge>
      </div>

      <div className={styles.progressTrack} aria-hidden>
        <div
          className={styles.progressFill}
          style={
            {
              ["--progress"]: String(progress),
            } as CSSProperties
          }
        />
      </div>

      <p className={styles.shippingHint}>
        {subtotalArs >= freeShippingThresholdArs ? (
          <>
            <Sparkles size={16} className={styles.inlineIcon} /> Listo, tenés
            envío estándar gratis.
          </>
        ) : (
          <>
            Te faltan{" "}
            <strong>
              <MoneyAmount value={remaining} />
            </strong>{" "}
            para envío gratis (desde <MoneyAmount value={freeShippingThresholdArs} />).
          </>
        )}
      </p>
    </div>
  );
}

export function CartPage() {
  const reduceMotion = useReducedMotion();
  const trackedCartViewRef = useRef(false);
  const { hydrated, items, itemCount, subtotalArs, setItemQty, removeItem, clear } =
    useCart();
  const { settings: shippingSettings } = useStoreShippingSettings();

  const [promoInput, setPromoInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<ValidatedCoupon | null>(
    null
  );
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const couponDiscountArs = useMemo(() => {
    if (!appliedCoupon) return 0;
    return Math.max(0, Math.trunc((subtotalArs * appliedCoupon.percentageTenths) / 1000));
  }, [appliedCoupon, subtotalArs]);

  const shippingEstimate = computeStoreShippingArs({
    subtotalArs,
    deliveryMethod: "standard",
    settings: shippingSettings,
  });
  const total = Math.max(0, subtotalArs + shippingEstimate - couponDiscountArs);

  const idsInCart = useMemo(() => new Set(items.map((it) => it.id)), [items]);

  const {
    products: suggestedProducts,
    loading: suggestedLoading,
    error: suggestedError,
  } = useStoreProducts({
    limit: 12,
    offset: 0,
    sort: "relevancia",
  });

  const recommended = useMemo(() => {
    return suggestedProducts.filter((p) => !idsInCart.has(p.id)).slice(0, 4);
  }, [suggestedProducts, idsInCart]);

  useEffect(() => {
    if (trackedCartViewRef.current) return;
    if (!hydrated) return;
    trackedCartViewRef.current = true;

    void trackStoreTelemetry("cart_view", {
      item_count: itemCount,
      subtotal_ars: subtotalArs,
      item_ids: items.slice(0, 10).map((item) => item.id),
    });
  }, [hydrated, itemCount, items, subtotalArs]);

  async function applyCoupon() {
    const code = promoInput.trim();
    if (!code) return;

    setPromoError(null);
    try {
      setPromoLoading(true);
      const result = await validateStoreCoupon({
        code,
        subtotalArs,
        items,
      });
      setAppliedCoupon(result);
      setPromoInput(result.code);
    } catch (error) {
      setAppliedCoupon(null);
      if (error instanceof ApiHttpError && error.status === 404) {
        setPromoError("Cupon inválido o inactivo.");
      } else {
        setPromoError(
          mapFriendlyError(error, "No pudimos validar el cupon. Intenta nuevamente.")
        );
      }
    } finally {
      setPromoLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Carrito</h1>
          <p className={styles.subtitle}>
            {itemCount === 0
              ? "Tu carrito está vacío."
              : (
              <>
                {itemCount} item{itemCount === 1 ? "" : "s"} · Total estimado{" "}
                <MoneyAmount value={total} />
              </>
            )}
          </p>
        </div>

        <div className={styles.topActions}>
          <Button asChild variant="outline">
            <Link href="/productos">Seguir comprando</Link>
          </Button>

          {items.length ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Vaciar</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Vaciar carrito</DialogTitle>
                  <DialogDescription>
                    Esto elimina todos los productos del carrito en este navegador.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="destructive" onClick={clear}>
                    Vaciar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <Card className={styles.emptyCard}>
          <CardHeader>
            <CardTitle>Empezá por el catálogo</CardTitle>
          </CardHeader>
          <CardContent className={styles.emptyContent}>
            <p className={styles.emptyText}>
              Agrega productos desde <strong>/productos</strong> y volvé para ver
              el checkout completo.
            </p>
            <Button asChild>
              <Link href="/productos">
                Ir al catálogo <ArrowRight size={16} />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className={styles.layout}>
          <div className={styles.items}>
            <AnimatePresence mode="popLayout">
              {items.map((it, idx) => (
                <CartLineItem
                  key={it.id}
                  item={it}
                  index={idx}
                  variant="full"
                  onChangeQty={(qty) => setItemQty(it.id, qty)}
                  onRemove={() => removeItem(it.id)}
                />
              ))}
            </AnimatePresence>
          </div>

          <div className={styles.summaryCol}>
            <motion.div
              className={styles.summarySticky}
              initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={reduceMotion ? undefined : { duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Resumen</CardTitle>
                </CardHeader>
                <CardContent className={styles.summaryBody}>
                  <ShippingProgress
                    subtotalArs={subtotalArs}
                    freeShippingThresholdArs={shippingSettings.freeShippingThresholdArs}
                    standardShippingArs={shippingSettings.standardShippingArs}
                  />

                  <div className={styles.row}>
                    <span className={styles.muted}>Subtotal</span>
                    <strong>
                      <MoneyAmount value={subtotalArs} />
                    </strong>
                  </div>
                  <div className={styles.row}>
                    <span className={styles.muted}>Envio (estimado)</span>
                    <strong>
                      {shippingEstimate === 0 ? "Gratis" : <MoneyAmount value={shippingEstimate} />}
                    </strong>
                  </div>

                  {appliedCoupon ? (
                    <div className={styles.row}>
                      <span className={styles.muted}>
                        Cupon <span className={styles.code}>{appliedCoupon.code}</span>
                      </span>
                      <strong className={styles.discount}>
                        -<MoneyAmount value={couponDiscountArs} />
                      </strong>
                    </div>
                  ) : null}

                  <Separator />

                  <div className={styles.row}>
                    <span>Total</span>
                    <strong className={styles.total}>
                      <MoneyAmount value={total} />
                    </strong>
                  </div>

                  <div className={styles.promoBox}>
                    <div className={styles.promoTitle}>
                      <Percent size={16} /> Cupon
                    </div>

                    <div className={styles.promoRow}>
                      <Input
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value)}
                        placeholder="Código de cupón"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void applyCoupon()}
                        disabled={!promoInput.trim() || promoLoading}
                      >
                        {promoLoading ? "Validando..." : "Aplicar"}
                      </Button>
                      {appliedCoupon ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setPromoInput("");
                            setAppliedCoupon(null);
                            setPromoError(null);
                          }}
                        >
                          Quitar
                        </Button>
                      ) : null}
                    </div>

                    {appliedCoupon ? (
                      <p className={styles.promoOk}>
                        Cupón aplicado · {appliedCoupon.percentage}% OFF
                      </p>
                    ) : promoError ? (
                      <p className={styles.promoBad}>{promoError}</p>
                    ) : (
                      <p className={styles.promoHint}>
                        Ingresá un cupón válido para aplicar descuento.
                      </p>
                    )}
                  </div>

                  <div className={styles.trustRow}>
                    <ShieldCheck size={16} />
                    <span>Checkout UI listo (pago real se integra después).</span>
                  </div>

                  <Button asChild size="lg" className={styles.cta}>
                    <Link href="/checkout">
                      Ir a checkout <ArrowRight size={16} />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      )}

      <div className={styles.recoWrap}>
        <div className={styles.recoHeader}>
          <h2 className={styles.recoTitle}>También te puede interesar</h2>
          <Badge variant="secondary">Recomendados</Badge>
        </div>

        {suggestedLoading ? (
          <p className={styles.muted}>Cargando sugerencias...</p>
        ) : suggestedError ? (
          <p className={styles.muted}>Sugerencias no disponibles.</p>
        ) : recommended.length === 0 ? (
          <p className={styles.muted}>Sin recomendaciones por ahora.</p>
        ) : (
          <div className={styles.recoGrid}>
            {recommended.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

