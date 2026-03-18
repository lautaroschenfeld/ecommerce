"use client";

import { Trash2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";

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
  const imageCandidates = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (value: unknown) => {
      if (typeof value !== "string") return;
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      out.push(normalized);
    };

    if (Array.isArray(item.imageUrls)) {
      for (const value of item.imageUrls) {
        push(value);
      }
    }
    push(item.imageUrl);
    return out;
  }, [item.imageUrl, item.imageUrls]);
  const imageCandidatesKey = imageCandidates.join("|");
  const [failedState, setFailedState] = useState<{ key: string; urls: string[] }>({
    key: imageCandidatesKey,
    urls: [],
  });
  const failedImageSet = useMemo(() => {
    const urls =
      failedState.key === imageCandidatesKey ? failedState.urls : [];
    return new Set(urls);
  }, [failedState, imageCandidatesKey]);
  const imageUrl = useMemo(() => {
    return imageCandidates.find((candidate) => !failedImageSet.has(candidate)) || "";
  }, [failedImageSet, imageCandidates]);
  const total = item.qty * item.priceArs;
  const maxQty =
    typeof item.stockAvailable === "number" && Number.isFinite(item.stockAvailable)
      ? Math.min(99, Math.max(1, Math.trunc(item.stockAvailable)))
      : 99;
  const canRenderImage = Boolean(imageUrl);

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
          {canRenderImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={item.name}
              width={160}
              height={160}
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => {
                if (!imageUrl) return;
                setFailedState((current) => {
                  const base = current.key === imageCandidatesKey ? current.urls : [];
                  if (base.includes(imageUrl)) {
                    return current.key === imageCandidatesKey
                      ? current
                      : { key: imageCandidatesKey, urls: base };
                  }
                  return {
                    key: imageCandidatesKey,
                    urls: [...base, imageUrl],
                  };
                });
              }}
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
