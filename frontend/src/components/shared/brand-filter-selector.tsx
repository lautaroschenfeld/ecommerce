"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import styles from "./brand-filter-selector.module.css";

function resolveGroupLetter(brand: string) {
  const first = brand.trim().charAt(0).toUpperCase();
  if (/^[A-Z]$/i.test(first)) return first;
  return "#";
}

function normalizeBrandValues(input: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of input) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase("es");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  out.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  return out;
}

type BrandFilterSelectorProps = {
  label?: string;
  brands: string[];
  selectedBrands: string[];
  onToggleBrand: (brand: string) => void;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
  previewLimit?: number;
  modalTitle?: string;
  showMoreLabel?: string;
  searchPlaceholder?: string;
  className?: string;
};

export function BrandFilterSelector({
  label = "Marcas",
  brands,
  selectedBrands,
  onToggleBrand,
  loading = false,
  loadingText = "Cargando marcas...",
  emptyText = "Todavía no hay marcas.",
  previewLimit = 9,
  modalTitle = "Marca",
  showMoreLabel = "Mostrar más",
  searchPlaceholder = "Buscar marca...",
  className,
}: BrandFilterSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const normalizedBrands = useMemo(() => normalizeBrandValues(brands), [brands]);
  const previewBrands = useMemo(
    () => normalizedBrands.slice(0, Math.max(1, previewLimit)),
    [normalizedBrands, previewLimit]
  );

  const selectedSet = useMemo(
    () => new Set(selectedBrands.map((item) => item.trim().toLocaleLowerCase("es"))),
    [selectedBrands]
  );

  const filteredBrands = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    if (!term) return normalizedBrands;
    return normalizedBrands.filter((brand) =>
      brand.toLocaleLowerCase("es").includes(term)
    );
  }, [normalizedBrands, query]);

  const groupedBrands = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const brand of filteredBrands) {
      const letter = resolveGroupLetter(brand);
      const current = map.get(letter) ?? [];
      current.push(brand);
      map.set(letter, current);
    }

    const letters = Array.from(map.keys()).sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b, "es", { sensitivity: "base" });
    });

    return letters.map((letter) => ({
      letter,
      brands: map.get(letter) ?? [],
    }));
  }, [filteredBrands]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function isSelected(brand: string) {
    return selectedSet.has(brand.trim().toLocaleLowerCase("es"));
  }

  return (
    <div className={cn(styles.root, className)}>
      <Label>{label}</Label>

      {loading ? <p className={styles.softText}>{loadingText}</p> : null}

      {!loading && normalizedBrands.length === 0 ? (
        <p className={styles.softText}>{emptyText}</p>
      ) : null}

      {!loading && normalizedBrands.length > 0 ? (
        <>
          <div className={styles.previewList}>
            {previewBrands.map((brand) => (
              <button
                key={brand}
                type="button"
                className={cn(styles.linkAction, isSelected(brand) ? styles.linkActionSelected : "")}
                onClick={() => onToggleBrand(brand)}
                aria-pressed={isSelected(brand)}
              >
                {brand}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={styles.showMoreLink}
            onClick={() => setOpen(true)}
          >
            {showMoreLabel}
          </button>
        </>
      ) : null}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className={styles.modalContent}>
          <div className={styles.modalBody}>
            <h3 className={styles.sheetTitle}>{modalTitle}</h3>

            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className={styles.searchField}
            />

            <div className={styles.alphaList}>
              {groupedBrands.length === 0 ? (
                <p className={styles.softText}>No se encontraron marcas.</p>
              ) : (
                groupedBrands.map((group) => (
                  <section key={group.letter} className={styles.alphaGroup}>
                    <h4 className={styles.alphaLetter}>{group.letter}</h4>
                    <div className={styles.alphaGrid}>
                      {group.brands.map((brand) => (
                        <button
                          key={brand}
                          type="button"
                          className={cn(
                            styles.alphaItem,
                            isSelected(brand) ? styles.alphaItemSelected : ""
                          )}
                          onClick={() => onToggleBrand(brand)}
                          aria-pressed={isSelected(brand)}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
