"use client";

import type { ComponentType } from "react";
import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
  PlugZap,
  Shield,
  Shirt,
  Sparkles,
  Wrench,
} from "lucide-react";

import type { Product } from "@/lib/product";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./product-detail-page.module.css";

const categoryIcon: Partial<
  Record<Product["category"], ComponentType<{ className?: string }>>
> = {
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
  "Carburación": Fuel,
  Embrague: Disc3,
  "Suspensión": Wrench,
  Rodamientos: CircleDot,
  "Tornillería": Bolt,
};

export function ProductDetailSkeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-live="polite">
      <div className={styles.breadcrumbs}>
        <Skeleton className={styles.breadcrumbSkeleton} />
      </div>
      <div className={styles.layout}>
        <div className={styles.mediaSkeletonShell}>
          <div className={styles.thumbSkeletonRail} aria-hidden>
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} className={styles.thumbSkeleton} />
            ))}
          </div>
          <Skeleton className={styles.mediaSkeleton} />
        </div>

        <div className={styles.infoCol}>
          <div className={styles.deliveryEtaBanner} aria-hidden>
            <Skeleton className={styles.deliveryEtaSkeletonIcon} />
            <Skeleton className={styles.deliveryEtaSkeletonText} />
          </div>

          <div className={styles.infoCardWrap}>
            <Card className={`${styles.infoCard} ${styles.infoSkeletonCard}`}>
              <CardContent className={`${styles.cardPad} ${styles.infoCardPad}`}>
                <div className={styles.infoSkeleton}>
                  <Skeleton className={styles.badgeSkeleton} />
                  <Skeleton className={styles.titleSkeleton} />
                  <Skeleton className={styles.brandSkeleton} />
                  <Skeleton className={styles.priceSkeleton} />

                  <div className={styles.selectorSkeletonBlock}>
                    <Skeleton className={styles.selectorLabelSkeleton} />
                    <div className={styles.selectorPillsSkeleton}>
                      <Skeleton className={styles.selectorPillSkeleton} />
                      <Skeleton className={styles.selectorPillSkeleton} />
                      <Skeleton className={styles.selectorPillSkeleton} />
                    </div>
                  </div>

                  <div className={styles.selectorSkeletonBlock}>
                    <Skeleton className={styles.selectorLabelSkeleton} />
                    <div className={styles.selectorPillsSkeleton}>
                      <Skeleton className={styles.selectorPillSkeleton} />
                      <Skeleton className={styles.selectorPillSkeleton} />
                    </div>
                  </div>

                  <Skeleton className={styles.stockSkeleton} />
                  <Skeleton className={styles.qtySkeleton} />
                  <Skeleton className={styles.ctaSkeleton} />
                  <Skeleton className={styles.ctaSkeleton} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className={styles.descriptionSection}>
          <div className={styles.descriptionBlock}>
            <Skeleton className={styles.descriptionTitleSkeleton} />
            <div className={styles.characteristicsGrid}>
              {Array.from({ length: 4 }).map((_, sectionIdx) => (
                <section key={sectionIdx} className={styles.characteristicsSection}>
                  <Skeleton className={styles.characteristicsSectionTitleSkeleton} />
                  <div className={styles.characteristicsTable}>
                    {Array.from({ length: 3 }).map((__, rowIdx) => (
                      <div key={rowIdx} className={styles.characteristicsRowSkeleton}>
                        <Skeleton className={styles.characteristicsKeySkeleton} />
                        <Skeleton className={styles.characteristicsValueSkeleton} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <hr className={styles.descriptionDivider} aria-hidden />

          <div className={styles.descriptionBlock}>
            <Skeleton className={styles.descriptionTitleSkeleton} />
            <div className={styles.descriptionBodySkeleton}>
              <Skeleton className={styles.descriptionLineSkeleton} />
              <Skeleton className={styles.descriptionLineSkeleton} />
              <Skeleton className={styles.descriptionLineShortSkeleton} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProductMediaGallery({
  productName,
  productCategory,
  images,
  reduceMotion,
}: {
  productName: string;
  productCategory?: Product["category"];
  images: string[];
  reduceMotion: boolean;
}) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const failedSet = useMemo(() => new Set(failedUrls), [failedUrls]);
  const visibleImages = useMemo(
    () => images.filter((url) => !failedSet.has(url)),
    [failedSet, images]
  );
  const hasImages = visibleImages.length > 0;
  const hasMultipleImages = visibleImages.length > 1;
  const Icon = (productCategory ? categoryIcon[productCategory] : undefined) ?? Wrench;
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const markUrlAsFailed = useCallback((url: string) => {
    const normalized = url.trim();
    if (!normalized) return;
    setFailedUrls((current) =>
      current.includes(normalized) ? current : [...current, normalized]
    );
  }, []);

  const safeIndex =
    activeImageIndex >= 0 && activeImageIndex < visibleImages.length
      ? activeImageIndex
      : 0;
  const activeImageUrl = visibleImages[safeIndex] ?? visibleImages[0];

  return (
    <div
      className={`${styles.mediaGallery} ${!hasMultipleImages ? styles.mediaGallerySingle : ""}`}
    >
      {hasMultipleImages ? (
        <div className={styles.thumbRail} aria-label="Miniaturas del producto">
          {visibleImages.map((url, idx) => {
            const active = idx === safeIndex;

            return (
              <button
                key={`${url}-${idx}`}
                type="button"
                className={`${styles.thumbButton} ${active ? styles.thumbButtonActive : ""}`}
                onMouseEnter={() => setActiveImageIndex(idx)}
                onFocus={() => setActiveImageIndex(idx)}
                onClick={() => setActiveImageIndex(idx)}
                aria-label={`Ver imagen ${idx + 1}`}
                aria-pressed={active}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className={styles.thumbImage}
                  width={176}
                  height={176}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  onError={() => markUrlAsFailed(url)}
                />
              </button>
            );
          })}
        </div>
      ) : null}

      <div className={styles.mediaCard}>
        {hasImages && activeImageUrl ? (
          <>
            <motion.img
              key={activeImageUrl}
              src={activeImageUrl}
              alt={productName}
              className={`${styles.mediaImageMotion} ${styles.mediaImage}`}
              width={1200}
              height={1200}
              loading={safeIndex === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              onError={() => markUrlAsFailed(activeImageUrl)}
              initial={reduceMotion ? undefined : { x: 8 }}
              animate={reduceMotion ? undefined : { x: 0 }}
              transition={reduceMotion ? undefined : { duration: 0.22 }}
            />
            <div aria-hidden className={styles.mediaGlow} />
          </>
        ) : (
          <div className={styles.mediaPlaceholder}>
            <span className={styles.mediaPlaceholderIconWrap} aria-hidden>
              <Icon className={styles.mediaPlaceholderIcon} />
            </span>
            <p className={styles.mediaPlaceholderText}>
              Aún no hay imagen disponible para este producto.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
