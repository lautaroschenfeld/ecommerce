"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Battery,
  Bike,
  Bolt,
  CircleDot,
  Disc3,
  Droplet,
  Filter,
  Fuel,
  Gauge,
  Layers,
  Lightbulb,
  Loader2,
  PlugZap,
  RefreshCw,
  Shield,
  Shirt,
  Sparkles,
  Wrench,
} from "lucide-react";

import type { Category } from "@/lib/catalog";
import type { Product } from "@/lib/product";
import { buildProductPath } from "@/lib/product-path";
import { useStoreFavorites } from "@/lib/store-favorites";

import { CustomerAccountLayout } from "@/components/shared/customer-account-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MoneyAmount } from "@/components/ui/money-amount";
import styles from "./customer-account-favorites-page.module.css";

function normalizeCategoryKey(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function renderCategoryIcon(category: Category) {
  const key = normalizeCategoryKey(String(category || ""));
  switch (key) {
    case "motor":
      return <Gauge size={24} />;
    case "transmision":
      return <Disc3 size={24} />;
    case "lubricantes":
      return <Droplet size={24} />;
    case "frenos":
      return <Shield size={24} />;
    case "electricidad":
      return <PlugZap size={24} />;
    case "ruedas":
      return <Bike size={24} />;
    case "accesorios":
      return <Sparkles size={24} />;
    case "indumentaria":
      return <Shirt size={24} />;
    case "filtros":
      return <Filter size={24} />;
    case "baterias":
      return <Battery size={24} />;
    case "iluminacion":
      return <Lightbulb size={24} />;
    case "juntas":
      return <Layers size={24} />;
    case "carburacion":
      return <Fuel size={24} />;
    case "embrague":
      return <Disc3 size={24} />;
    case "suspension":
      return <Wrench size={24} />;
    case "rodamientos":
      return <CircleDot size={24} />;
    case "tornilleria":
      return <Bolt size={24} />;
    default:
      return <Wrench size={24} />;
  }
}

function normalizeSearchText(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveProductImage(product: Product) {
  const fromGallery = (product.images ?? [])
    .map((entry) => entry.trim())
    .find(Boolean);
  if (fromGallery) return fromGallery;
  return product.imageUrl?.trim() || "";
}

function FavoriteProductRow({
  product,
  removing,
  onRemove,
}: {
  product: Product;
  removing: boolean;
  onRemove: () => void;
}) {
  const detailHref = buildProductPath(product.id, product.name);
  const imageUrl = resolveProductImage(product);
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);
  const hasPrice = Number.isFinite(product.priceArs) && product.priceArs > 0;
  const categoryIcon = renderCategoryIcon(product.category);
  const normalizedName = normalizeSearchText(product.name || "");
  const normalizedBrand = normalizeSearchText(product.brand || "");
  const showBrandLine = Boolean(
    normalizedBrand && (!normalizedName || !normalizedName.includes(normalizedBrand))
  );
  const showImage = Boolean(imageUrl && failedImageSrc !== imageUrl);

  return (
    <article className={styles.productRow}>
      <Link href={detailHref} className={styles.productRowMedia} aria-label={`Ver ${product.name}`}>
        {showImage ? (
          <Image
            src={imageUrl}
            alt={product.name}
            width={220}
            height={220}
            className={styles.productRowImage}
            onError={() => setFailedImageSrc(imageUrl)}
          />
        ) : (
          <span className={styles.productRowPlaceholder} aria-hidden>
            {categoryIcon}
          </span>
        )}
      </Link>

      <div className={styles.productRowInfo}>
        <Link href={detailHref} className={styles.productRowTitle}>
          {product.name}
        </Link>
        {showBrandLine ? <p className={styles.productRowMeta}>{product.brand}</p> : null}
        <p className={styles.productRowPrice}>
          {hasPrice ? <MoneyAmount value={product.priceArs} /> : "Sin precio"}
        </p>

        <div className={styles.productRowActions}>
          <Link href={detailHref} className={styles.productRowActionLink}>
            Agregar a lista
          </Link>

          <button
            type="button"
            className={styles.productRowActionButton}
            onClick={onRemove}
            disabled={removing}
          >
            {removing ? (
              <Loader2 size={14} className={styles.spin} />
            ) : null}
            {removing ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </article>
  );
}

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
            TodavÃ­a no guardaste productos en favoritos.
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
      <div className={styles.productList}>
        {products.map((product) => (
          <FavoriteProductRow
            key={product.id}
            product={product}
            removing={savingProductId === product.id}
            onRemove={() => void removeFavorite(product.id)}
          />
        ))}
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


