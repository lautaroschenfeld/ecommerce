"use client";

import Link from "next/link";
import { Heart, Loader2, RefreshCw } from "lucide-react";

import { useStoreFavorites } from "@/lib/store-favorites";

import { CustomerAccountLayout } from "@/components/shared/customer-account-layout";
import { ProductCard } from "@/components/products/product-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import styles from "./customer-account-favorites-page.module.css";

function FavoritesContent() {
  const {
    products,
    count,
    loading,
    savingProductId,
    error,
    refetch,
    removeFavorite,
  } = useStoreFavorites();

  const unavailableCount = Math.max(0, count - products.length);

  if (loading && !error) {
    return (
      <Card>
        <CardContent className={styles.stateCard}>
          <p className={styles.stateMessage}>Cargando tus favoritos...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className={styles.stateCard}>
          <p className={styles.stateMessage}>{error}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            <RefreshCw size={16} />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (count === 0) {
    return (
      <Card>
        <CardContent className={styles.stateCard}>
          <p className={styles.stateMessage}>
            Todavía no guardaste productos en favoritos.
          </p>
          <Button asChild>
            <Link href="/productos">Explorar productos</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={styles.stack}>
      <div className={styles.headerRow}>
        <p className={styles.countText}>
          {count} producto{count === 1 ? "" : "s"} guardado
          {count === 1 ? "" : "s"} en favoritos.
        </p>
        {unavailableCount > 0 ? (
          <p className={styles.unavailableText}>
            {unavailableCount} ya no esta disponible.
          </p>
        ) : null}
      </div>

      <div className={styles.grid}>
        {products.map((product) => {
          const removing = savingProductId === product.id;

          return (
            <article key={product.id} className={styles.item}>
              <ProductCard product={product} />
              <div className={styles.itemActions}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={styles.removeButton}
                  onClick={() => void removeFavorite(product.id)}
                  disabled={removing}
                >
                  {removing ? (
                    <Loader2 size={14} className={styles.spin} />
                  ) : (
                    <Heart size={14} />
                  )}
                  {removing ? "Quitando..." : "Quitar de favoritos"}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function CustomerAccountFavoritesPage() {
  return (
    <CustomerAccountLayout
      tab="favorites"
      title="Favoritos"
      subtitle="Tus productos guardados para comparar o comprar despues."
    >
      {() => <FavoritesContent />}
    </CustomerAccountLayout>
  );
}
