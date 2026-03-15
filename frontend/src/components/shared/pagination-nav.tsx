"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import styles from "./pagination-nav.module.css";

type PaginationNavProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  ariaLabel?: string;
  maxVisiblePages?: number;
  className?: string;
};

function normalizePage(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

export function PaginationNav({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  ariaLabel = "Paginacion",
  maxVisiblePages = 10,
  className,
}: PaginationNavProps) {
  const safeTotalPages = normalizePage(totalPages, 1);
  const safePage = Math.min(normalizePage(page, 1), safeTotalPages);

  const visiblePages = useMemo(() => {
    if (safeTotalPages <= 1) return [1];
    const windowSize = Math.min(normalizePage(maxVisiblePages, 10), safeTotalPages);
    const maxStart = Math.max(1, safeTotalPages - windowSize + 1);
    const start = Math.max(1, Math.min(safePage - Math.floor(windowSize / 2), maxStart));
    return Array.from({ length: windowSize }, (_, idx) => start + idx);
  }, [maxVisiblePages, safePage, safeTotalPages]);

  const canPrev = safePage > 1;
  const canNext = safePage < safeTotalPages;
  if (safeTotalPages <= 1) return null;

  return (
    <nav
      className={[styles.paginationNav, className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
    >
      {canPrev ? (
        <Button
          type="button"
          variant="ghost"
          className={styles.paginationControl}
          disabled={disabled}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
        >
          Anterior
        </Button>
      ) : null}

      <div className={styles.paginationPages}>
        {visiblePages.map((pageNumber) => {
          const isActivePage = pageNumber === safePage;
          return (
            <Button
              key={pageNumber}
              type="button"
              variant={isActivePage ? "secondary" : "ghost"}
              className={`${styles.paginationPage} ${isActivePage ? styles.paginationPageActive : ""}`}
              disabled={disabled}
              onClick={() => {
                if (isActivePage) return;
                onPageChange(pageNumber);
              }}
              aria-current={isActivePage ? "page" : undefined}
              aria-label={`Ir a pagina ${pageNumber}`}
            >
              {pageNumber}
            </Button>
          );
        })}
      </div>

      {canNext ? (
        <Button
          type="button"
          variant="ghost"
          className={styles.paginationControl}
          disabled={disabled}
          onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
        >
          Siguiente
        </Button>
      ) : null}
    </nav>
  );
}
