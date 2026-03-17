"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ProductCard } from "@/components/products/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStoreProducts } from "@/lib/store-catalog";
import { cn } from "@/lib/utils";

import styles from "./home-best-sellers.module.css";

function range(count: number) {
  return Array.from({ length: Math.max(0, Math.trunc(count)) }, (_, idx) => idx);
}

export function HomeBestSellers() {
  const query = useMemo(() => ({ limit: 12, sort: "relevancia" as const }), []);
  const { products, loading, error } = useStoreProducts(query);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;

    const updateEdgeFade = () => {
      const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
      if (maxScrollLeft <= 1) {
        setCanScrollLeft(false);
        setCanScrollRight(false);
        return;
      }

      setCanScrollLeft(node.scrollLeft > 1);
      setCanScrollRight(node.scrollLeft < maxScrollLeft - 1);
    };

    updateEdgeFade();
    const rafId = window.requestAnimationFrame(updateEdgeFade);

    node.addEventListener("scroll", updateEdgeFade, { passive: true });
    window.addEventListener("resize", updateEdgeFade);

    return () => {
      window.cancelAnimationFrame(rafId);
      node.removeEventListener("scroll", updateEdgeFade);
      window.removeEventListener("resize", updateEdgeFade);
    };
  }, [loading, products.length]);

  if (!loading && products.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-label="Más vendidos">
      <div className={styles.header}>
        <h2 className={styles.title}>Más vendidos</h2>
      </div>

      {error && !loading ? <p className={styles.error}>{error}</p> : null}

      <div
        ref={scrollerRef}
        className={cn(
          styles.scroller,
          canScrollLeft ? styles.scrollerFadeLeft : "",
          canScrollRight ? styles.scrollerFadeRight : ""
        )}
        role="region"
        aria-label="Productos más vendidos"
      >
        {loading
          ? range(6).map((idx) => (
              <div key={`skeleton-${idx}`} className={styles.item}>
                <div className={styles.skeletonCard} aria-hidden>
                  <Skeleton className={styles.skeletonMedia} />
                  <div className={styles.skeletonBody}>
                    <Skeleton className={styles.skeletonLine} />
                    <Skeleton className={styles.skeletonLineShort} />
                  </div>
                </div>
              </div>
            ))
          : products.map((product) => (
              <div key={product.id} className={styles.item}>
                <ProductCard product={product} />
              </div>
            ))}
      </div>
    </section>
  );
}
