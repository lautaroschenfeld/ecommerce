"use client";

import { Trash2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";

import type { CartItem } from "@/lib/store-cart";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyAmount } from "@/components/ui/money-amount";
import { QuantityControl } from "@/components/shared/quantity-control";
import styles from "./cart-line-item.module.css";

export function CartLineItem({
  item,
  index = 0,
  variant = "full",
  onChangeQty,
  onRemove,
}: {
  item: CartItem;
  index?: number;
  variant?: "compact" | "full";
  onChangeQty: (qty: number) => void;
  onRemove: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const total = item.qty * item.priceArs;
  const maxQty =
    typeof item.stockAvailable === "number" && Number.isFinite(item.stockAvailable)
      ? Math.min(99, Math.max(1, Math.trunc(item.stockAvailable)))
      : 99;

  return (
    <motion.div
      layout
      initial={reduceMotion ? undefined : { y: 10 }}
      animate={reduceMotion ? undefined : { y: 0 }}
      exit={reduceMotion ? undefined : { y: 10 }}
      transition={
        reduceMotion
          ? undefined
          : { type: "spring", stiffness: 420, damping: 36, delay: index * 0.02 }
      }
      className={styles.row}
      data-variant={variant}
    >
      <div className={styles.media}>
        <div className={styles.thumb}>
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              width={160}
              height={160}
              loading="lazy"
              sizes="(max-width: 640px) 5rem, 4.1rem"
            />
          ) : (
            <div className={styles.thumbFallback} aria-hidden />
          )}
        </div>

        <div className={styles.meta}>
          <p className={styles.name}>{item.name}</p>

          <div className={styles.pills}>
            <Badge variant="secondary">{item.brand}</Badge>
            <Badge variant="outline">{item.category}</Badge>
          </div>

          {variant === "full" ? (
            <p className={styles.unit}>
              <MoneyAmount value={item.priceArs} currencyClassName={styles.priceCurrency} />{" "}
              <span className={styles.muted}>c/u</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className={styles.actions}>
        <QuantityControl
          value={item.qty}
          max={maxQty}
          onChange={onChangeQty}
        />

        <div className={styles.totals}>
          <p className={styles.total}>
            <MoneyAmount value={total} currencyClassName={styles.priceCurrency} />
          </p>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={onRemove}
            className={styles.remove}
            aria-label="Eliminar del carrito"
            title="Eliminar"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
