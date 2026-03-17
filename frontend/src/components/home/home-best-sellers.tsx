"use client";

import { useMemo } from "react";

import { ProductCard } from "@/components/products/product-card";
import { HorizontalProductsRail } from "@/components/shared/horizontal-products-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { useStoreProducts } from "@/lib/store-catalog";

import styles from "./home-best-sellers.module.css";

function range(count: number) {
  return Array.from({ length: Math.max(0, Math.trunc(count)) }, (_, idx) => idx);
}

export function HomeBestSellers() {
  const query = useMemo(() => ({ limit: 12, sort: "relevancia" as const }), []);
  const { products, loading, error } = useStoreProducts(query);

  if (!loading && products.length === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-label="Más vendidos">
      <div className={styles.header}>
        <h2 className={styles.title}>Más vendidos</h2>
      </div>

      {error && !loading ? <p className={styles.error}>{error}</p> : null}

      <HorizontalProductsRail ariaLabel="Productos más vendidos">
        {loading
          ? range(6).map((idx) => (
              <div key={`skeleton-${idx}`} className={styles.skeletonCard} aria-hidden>
                <Skeleton className={styles.skeletonMedia} />
                <div className={styles.skeletonBody}>
                  <Skeleton className={styles.skeletonLine} />
                  <Skeleton className={styles.skeletonLineShort} />
                </div>
              </div>
            ))
          : products.map((product) => <ProductCard key={product.id} product={product} />)}
      </HorizontalProductsRail>
    </section>
  );
}
