import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";

import { PRIMARY_CATEGORIES, type Category } from "@/lib/catalog";

import { Badge } from "@/components/ui/badge";
import styles from "./primary-categories.module.css";

const CATEGORY_BG_IMAGE_URL = "/assets/categories/category-bg-example.png";

// Home grid: 2 rows of 4.
const HOME_CATEGORIES: Category[] = [...PRIMARY_CATEGORIES];

function categoryToQuery(category: Category) {
  const params = new URLSearchParams();
  params.set("categoria", category);
  return `/productos?${params.toString()}`;
}

export function PrimaryCategories() {
  return (
    <section className={styles.section} aria-label="Categorías">
      <div className={styles.header}>
        <h2 className={styles.title}>Categorías</h2>
      </div>
      <div className={styles.grid}>
        {HOME_CATEGORIES.map((category) => {
          return (
            <Link
              key={category}
              href={categoryToQuery(category)}
              className={styles.item}
              style={
                {
                  ["--category-bg-image"]: `url("${CATEGORY_BG_IMAGE_URL}")`,
                } as CSSProperties
              }
            >
              <div aria-hidden className={styles.bgImage} />

              <div className={styles.row}>
                <div className={styles.left}>
                  <Badge variant="secondary" className={styles.pill}>
                    {category}
                  </Badge>
                </div>
              </div>

              <div className={styles.footer}>
                <span className={styles.footerCta}>
                  <span className={styles.footerLabel}>Explorar</span>
                  <ArrowRight className={styles.arrow} size={16} aria-hidden />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
