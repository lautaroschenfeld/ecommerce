"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import styles from "./home-hero.module.css";

export function HomeHero() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const fadeUp = reduceMotion
    ? undefined
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { type: "spring" as const, stiffness: 260, damping: 28 },
      };

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    router.push(
      normalized
        ? `/productos?q=${encodeURIComponent(normalized)}`
        : "/productos"
    );
  }

  return (
    <section className={styles.hero}>
      <div aria-hidden className={styles.bg} />

      <div className={styles.inner}>
        <motion.div {...(fadeUp ?? {})} className={styles.top}>
          <h1 className={styles.title}>Repuestos de moto listos para vender online.</h1>

          <p className={styles.subtitle}>
            Catálogo, filtros por marca y precio, y una experiencia de compra
            enfocada en conversión.
          </p>
        </motion.div>

        <motion.div
          {...(reduceMotion
            ? {}
            : {
                initial: { opacity: 0, y: 10 },
                animate: { opacity: 1, y: 0 },
                transition: {
                  delay: 0.05,
                  type: "spring" as const,
                  stiffness: 260,
                  damping: 28,
                },
              })}
          className={styles.searchBlock}
        >
          <form className={styles.searchForm} onSubmit={submitSearch}>
            <Search size={18} className={styles.searchIcon} aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar producto"
              className={styles.searchInput}
              aria-label="Buscar productos"
            />
            <Button type="submit" size="lg" className={styles.searchButton}>
              Buscar
            </Button>
          </form>

          <div className={styles.quickRow}>
            <Link href="/productos" className={styles.catalogLink}>
              Ver todo el catálogo
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}



