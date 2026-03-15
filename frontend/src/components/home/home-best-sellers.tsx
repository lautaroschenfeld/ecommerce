"use client";

import { useMemo } from "react";

import { useStoreProducts } from "@/lib/store-catalog";
import { ProductCard } from "@/components/products/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./home-best-sellers.module.css";

function range(count: number) {
  return Array.from({ length: Math.max(0, Math.trunc(count)) }, (_, idx) => idx);
}

export function HomeBestSellers() {
  const query = useMemo(() => ({ limit: 12, sort: "relevancia" as const }), []);
  const { products, loading, error } = useStoreProducts(query);

  return (
    <section className={styles.section} aria-label="Más vendidos">
      <div className={styles.header}>
        <h2 className={styles.title}>Más vendidos</h2>
      </div>

      {error && !loading ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.scroller} role="region" aria-label="Productos más vendidos">
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

