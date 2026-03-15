"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Search, X } from "lucide-react";

import type { Category } from "@/lib/catalog";
import { PRIMARY_CATEGORIES } from "@/lib/catalog";
import type { ProductCondition, ProductSort } from "@/lib/product";
import { toNumberOrUndefined } from "@/lib/format";
import { trackStoreTelemetry } from "@/lib/store-telemetry";
import {
  useStoreBrands,
  useStoreProducts,
  useStoreProductSuggestions,
} from "@/lib/store-catalog";

import { ProductCard } from "@/components/products/product-card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandFilterSelector } from "@/components/shared/brand-filter-selector";
import { PaginationNav } from "@/components/shared/pagination-nav";
import styles from "./products-explorer.module.css";

const APPAREL_SIZE_SORT_ORDER = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "3XL",
  "34",
  "36",
  "38",
  "40",
  "42",
  "44",
  "46",
] as const;

const MOBILE_BREAKPOINT_PX = 640;
const DESKTOP_BREAKPOINT_PX = 1024;
const MOBILE_PRODUCTS_PER_PAGE = 20;
const TABLET_PRODUCTS_PER_PAGE = 24;
const DESKTOP_PRODUCTS_PER_PAGE = 36;
const SEARCH_SUGGESTIONS_LIMIT = 8;

function resolveProductsPerPage(viewportWidth: number) {
  if (!Number.isFinite(viewportWidth)) return TABLET_PRODUCTS_PER_PAGE;
  if (viewportWidth < MOBILE_BREAKPOINT_PX) return MOBILE_PRODUCTS_PER_PAGE;
  if (viewportWidth < DESKTOP_BREAKPOINT_PX) return TABLET_PRODUCTS_PER_PAGE;
  return DESKTOP_PRODUCTS_PER_PAGE;
}

const APPAREL_SIZE_POSITION = new Map<string, number>(
  APPAREL_SIZE_SORT_ORDER.map((size, idx) => [size, idx] as const)
);

function compareSizeOptions(a: string, b: string) {
  const aNorm = a.trim().toUpperCase();
  const bNorm = b.trim().toUpperCase();
  const posA = APPAREL_SIZE_POSITION.get(aNorm);
  const posB = APPAREL_SIZE_POSITION.get(bNorm);
  if (posA !== undefined || posB !== undefined) {
    if (posA === undefined) return 1;
    if (posB === undefined) return -1;
    return posA - posB;
  }

  const numA = Number(aNorm);
  const numB = Number(bNorm);
  const hasNumA = Number.isFinite(numA);
  const hasNumB = Number.isFinite(numB);
  if (hasNumA || hasNumB) {
    if (!hasNumA) return 1;
    if (!hasNumB) return -1;
    return numA - numB;
  }

  return aNorm.localeCompare(bNorm, "es");
}

function useDebouncedValue<T>(value: T, delayMs = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

function normalizeBrandList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function ProductsSkeleton({ count = 9 }: { count?: number }) {
  const items = Array.from({ length: count });

  return (
    <div className={styles.skeletonGrid}>
      {items.map((_, idx) => (
        <Card key={idx} className={styles.panelCard}>
          <CardContent className={`${styles.cardPad} ${styles.cardStack}`}>
            <Skeleton className={styles.skeletonThumb} />
            <div className={styles.cardStack}>
              <Skeleton className={`${styles.skLine} ${styles.skLineWide}`} />
              <Skeleton className={`${styles.skLine} ${styles.skLineMid}`} />
              <div className={styles.priceHeader}>
                <Skeleton className={styles.skPrice} />
                <Skeleton className={styles.skId} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FiltersPanelBody({
  category,
  onCategoryChange,
  brands,
  brandsLoading,
  selectedBrands,
  onToggleBrand,
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
  conditions,
  availableConditions,
  onToggleCondition,
  selectedGender,
  onGenderChange,
  selectedSize,
  availableSizes,
  onSizeChange,
}: {
  category?: Category;
  onCategoryChange: (value: Category | undefined) => void;
  brands: string[];
  brandsLoading: boolean;
  selectedBrands: string[];
  onToggleBrand: (brand: string) => void;
  minPrice: string;
  maxPrice: string;
  onMinPriceChange: (v: string) => void;
  onMaxPriceChange: (v: string) => void;
  conditions: ProductCondition[];
  availableConditions: ProductCondition[];
  onToggleCondition: (condition: ProductCondition) => void;
  selectedGender: "hombre" | "mujer" | undefined;
  onGenderChange: (value: "hombre" | "mujer" | undefined) => void;
  selectedSize: string;
  availableSizes: string[];
  onSizeChange: (value: string) => void;
}) {
  const isApparelCategory = category === "Indumentaria";

  return (
    <>
      <div className={styles.cardStack}>
        <Label>Categoria</Label>
        <Select
          value={category ?? ""}
          onChange={(e) => {
            const next = e.target.value.trim();
            onCategoryChange(next ? (next as Category) : undefined);
          }}
        >
          <option value="">Todas</option>
          {PRIMARY_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      </div>

      <Separator />

      <div className={styles.cardStack}>
        <Label>Precio</Label>
        <div className={styles.priceInputs}>
          <Input
            inputMode="numeric"
            placeholder="Mínimo"
            value={minPrice}
            onChange={(e) => onMinPriceChange(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <Input
            inputMode="numeric"
            placeholder="Máximo"
            value={maxPrice}
            onChange={(e) => onMaxPriceChange(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
      </div>

      <Separator />

      {availableConditions.length > 0 ? (
        <>
          <div className={styles.cardStack}>
            <Label>Estado</Label>
            <div className={styles.brandsList}>
              {availableConditions.map((state) => {
                const checked = conditions.includes(state);
                const id = `cond-${state}`;
                const label =
                  state === "reacondicionado"
                    ? "Reacondicionado"
                    : state === "usado"
                      ? "Usado"
                      : "Nuevo";
                return (
                  <div key={state} className={styles.brandRow}>
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={() => onToggleCondition(state)}
                    />
                    <Label htmlFor={id} className={styles.brandLabel}>
                      {label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
          <Separator />
        </>
      ) : null}

      {isApparelCategory ? (
        <>
          <div className={styles.cardStack}>
            <Label>Genero</Label>
            <Select
              value={selectedGender ?? ""}
              onChange={(e) => {
                const next = e.target.value.trim();
                onGenderChange(next === "hombre" || next === "mujer" ? next : undefined);
              }}
            >
              <option value="">Todos</option>
              <option value="hombre">Hombre</option>
              <option value="mujer">Mujer</option>
            </Select>
          </div>

          <Separator />

          <div className={styles.cardStack}>
            <Label>Talle</Label>
            <Select
              value={selectedSize}
              onChange={(e) => onSizeChange(e.target.value)}
            >
              <option value="">Todos</option>
              {availableSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </div>

          <Separator />
        </>
      ) : null}

      <BrandFilterSelector
        label="Marcas"
        brands={brands}
        loading={brandsLoading}
        selectedBrands={selectedBrands}
        onToggleBrand={onToggleBrand}
        emptyText="Todavía no hay marcas."
        modalTitle="Marca"
      />
    </>
  );
}

function FiltersPanel({
  category,
  onCategoryChange,
  brands,
  brandsLoading,
  selectedBrands,
  onToggleBrand,
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
  onClear,
  showClear,
  conditions,
  availableConditions,
  onToggleCondition,
  selectedGender,
  onGenderChange,
  selectedSize,
  availableSizes,
  onSizeChange,
}: {
  category?: Category;
  onCategoryChange: (value: Category | undefined) => void;
  brands: string[];
  brandsLoading: boolean;
  selectedBrands: string[];
  onToggleBrand: (brand: string) => void;
  minPrice: string;
  maxPrice: string;
  onMinPriceChange: (v: string) => void;
  onMaxPriceChange: (v: string) => void;
  onClear: () => void;
  showClear: boolean;
  conditions: ProductCondition[];
  availableConditions: ProductCondition[];
  onToggleCondition: (condition: ProductCondition) => void;
  selectedGender: "hombre" | "mujer" | undefined;
  onGenderChange: (value: "hombre" | "mujer" | undefined) => void;
  selectedSize: string;
  availableSizes: string[];
  onSizeChange: (value: string) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <Card className={styles.panelCard}>
      <CardHeader className={styles.panelHeaderRow}>
        <CardTitle className={styles.panelTitle}>Filtros</CardTitle>
        <AnimatePresence initial={false}>
          {showClear ? (
            <motion.div
              key="clear-filters"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={reduceMotion ? undefined : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Button
                variant="ghost"
                size="sm"
                className={styles.clearButton}
                onClick={onClear}
              >
                <X size={16} />
                Limpiar
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </CardHeader>
      <CardContent className={styles.panelBody}>
        <FiltersPanelBody
          category={category}
          onCategoryChange={onCategoryChange}
          brands={brands}
          brandsLoading={brandsLoading}
          selectedBrands={selectedBrands}
          onToggleBrand={onToggleBrand}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onMinPriceChange={onMinPriceChange}
          onMaxPriceChange={onMaxPriceChange}
          conditions={conditions}
          availableConditions={availableConditions}
          onToggleCondition={onToggleCondition}
          selectedGender={selectedGender}
          onGenderChange={onGenderChange}
          selectedSize={selectedSize}
          availableSizes={availableSizes}
          onSizeChange={onSizeChange}
        />
      </CardContent>
    </Card>
  );
}

export function ProductsExplorer({
  initialCategory,
  initialQuery,
  initialBrands,
}: {
  initialCategory?: Category;
  initialQuery?: string;
  initialBrands?: string[];
}) {
  const reduceMotion = useReducedMotion();
  const { brands, loading: brandsLoading } = useStoreBrands();

  const [q, setQ] = useState(initialQuery ?? "");
  const qDebounced = useDebouncedValue(q, 250);
  const qSuggestionsDebounced = useDebouncedValue(q, 180);
  const [sort, setSort] = useState<ProductSort>("relevancia");
  const [category, setCategory] = useState<Category | undefined>(
    initialCategory
  );
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selectedBrands, setSelectedBrands] = useState<string[]>(() =>
    normalizeBrandList(initialBrands)
  );
  const [selectedConditions, setSelectedConditions] = useState<ProductCondition[]>([]);
  const [selectedGender, setSelectedGender] = useState<"hombre" | "mujer" | undefined>(
    undefined
  );
  const [selectedSize, setSelectedSize] = useState("");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(() =>
    typeof window === "undefined"
      ? TABLET_PRODUCTS_PER_PAGE
      : resolveProductsPerPage(window.innerWidth)
  );
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const trackedCollectionRef = useRef("");
  const isApparelCategory = category === "Indumentaria";

  useEffect(() => {
    const syncLimit = () => {
      const nextLimit = resolveProductsPerPage(window.innerWidth);
      setLimit((prevLimit) => {
        if (prevLimit === nextLimit) return prevLimit;
        setOffset((prevOffset) => {
          if (prevOffset <= 0) return 0;
          return Math.floor(prevOffset / nextLimit) * nextLimit;
        });
        return nextLimit;
      });
    };

    window.addEventListener("resize", syncLimit);
    window.addEventListener("orientationchange", syncLimit);
    return () => {
      window.removeEventListener("resize", syncLimit);
      window.removeEventListener("orientationchange", syncLimit);
    };
  }, []);

  const min = useMemo(() => toNumberOrUndefined(minPrice), [minPrice]);
  const max = useMemo(() => toNumberOrUndefined(maxPrice), [maxPrice]);
  const suggestionsQuery = qSuggestionsDebounced.trim();
  const isLikelySkuSearch = /\d/.test(suggestionsQuery);
  const shouldFetchSuggestions =
    isSearchFocused && (suggestionsQuery.length >= 2 || isLikelySkuSearch);

  const {
    products: searchSuggestions,
    loading: searchSuggestionsLoading,
    error: searchSuggestionsError,
  } = useStoreProductSuggestions({
    q: suggestionsQuery,
    category,
    brands: selectedBrands,
    minPrice: min,
    maxPrice: max,
    limit: SEARCH_SUGGESTIONS_LIMIT,
    skip: !shouldFetchSuggestions,
  });

  const {
    products,
    availableSizes: serverAvailableSizes,
    count,
    limit: serverLimit,
    offset: serverOffset,
    loading,
    error,
    refetch,
  } = useStoreProducts({
    q: qDebounced,
    sort,
    category,
    minPrice: min,
    maxPrice: max,
    brands: selectedBrands,
    condition: selectedConditions,
    gender: isApparelCategory ? selectedGender : undefined,
    size: isApparelCategory ? selectedSize || undefined : undefined,
    limit,
    offset,
  });

  const page = Math.floor(serverOffset / serverLimit) + 1;
  const totalPages = count > 0 ? Math.ceil(count / serverLimit) : 1;

  const hasFilters =
    !!q.trim() ||
    !!category ||
    !!minPrice.trim() ||
    !!maxPrice.trim() ||
    selectedBrands.length > 0 ||
    selectedConditions.length > 0 ||
    !!selectedGender ||
    !!selectedSize;

  function clearFilters() {
    setQ("");
    setCategory(undefined);
    setMinPrice("");
    setMaxPrice("");
    setSelectedBrands([]);
    setSelectedConditions([]);
    setSelectedGender(undefined);
    setSelectedSize("");
    setOffset(0);
  }

  function handleCategoryChange(value: Category | undefined) {
    setCategory(value);
    if (value !== "Indumentaria") {
      setSelectedGender(undefined);
      setSelectedSize("");
    }
    setOffset(0);
  }

  function toggleBrand(brand: string) {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
    setOffset(0);
  }

  function toggleCondition(condition: ProductCondition) {
    setSelectedConditions((prev) =>
      prev.includes(condition)
        ? prev.filter((c) => c !== condition)
        : [...prev, condition]
    );
    setOffset(0);
  }

  const availableConditions = useMemo(() => {
    const set = new Set<ProductCondition>();
    for (const p of products) {
      set.add(p.condition);
    }
    const order: Record<ProductCondition, number> = {
      nuevo: 0,
      reacondicionado: 1,
      usado: 2,
    };
    return Array.from(set)
      .filter((c) => c === "usado" || c === "reacondicionado" || selectedConditions.includes(c))
      .sort((a, b) => order[a] - order[b]);
  }, [products, selectedConditions]);

  const availableSizes = useMemo(() => {
    const set = new Set<string>();
    for (const sizeRaw of serverAvailableSizes) {
      const size = sizeRaw.trim();
      if (!size) continue;
      set.add(size);
    }
    if (selectedSize.trim()) {
      set.add(selectedSize.trim());
    }
    return Array.from(set).sort(compareSizeOptions);
  }, [serverAvailableSizes, selectedSize]);

  const showInitialLoading = loading && !error && products.length === 0;
  const showInlineLoading = loading && !error && products.length > 0;
  const showUnavailableSkeleton = Boolean(error) && products.length === 0;
  const showEmpty =
    !loading && !error && products.length === 0 && (count === 0 || serverOffset > 0);
  const isOutOfRange = !loading && !error && products.length === 0 && count > 0 && serverOffset > 0;
  const isNoResults = !loading && !error && products.length === 0 && count === 0;
  const showSearchSuggestions =
    isSearchFocused &&
    (suggestionsQuery.length >= 2 || isLikelySkuSearch) &&
    (searchSuggestionsLoading ||
      searchSuggestions.length > 0 ||
      Boolean(searchSuggestionsError));
  const activeSuggestionId =
    highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < searchSuggestions.length
      ? `catalog-search-suggestion-${highlightedSuggestionIndex}`
      : undefined;

  function applySearchSuggestion(nextQuery: string) {
    setQ(nextQuery);
    setOffset(0);
    setIsSearchFocused(false);
    setHighlightedSuggestionIndex(-1);
  }

  useEffect(() => {
    if (loading || error) return;

    const signature = [
      category ?? "",
      qDebounced.trim(),
      sort,
      selectedBrands.join(","),
      selectedConditions.join(","),
      selectedGender ?? "",
      selectedSize.trim(),
      min ?? "",
      max ?? "",
      serverOffset,
      serverLimit,
      count,
    ].join("|");

    if (trackedCollectionRef.current === signature) return;
    trackedCollectionRef.current = signature;

    void trackStoreTelemetry("collection_view", {
      path: "/productos",
      category: category ?? null,
      query: qDebounced.trim() || null,
      sort,
      brands: selectedBrands,
      conditions: selectedConditions,
      gender: selectedGender ?? null,
      size: selectedSize.trim() || null,
      min_price: min ?? null,
      max_price: max ?? null,
      result_count: count,
      page,
      offset: serverOffset,
      limit: serverLimit,
      visible_count: products.length,
    });
  }, [
    category,
    count,
    error,
    max,
    min,
    page,
    products.length,
    qDebounced,
    selectedBrands,
    selectedConditions,
    selectedGender,
    selectedSize,
    serverLimit,
    serverOffset,
    sort,
    loading,
  ]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (searchWrapRef.current?.contains(target)) return;
      setIsSearchFocused(false);
      setHighlightedSuggestionIndex(-1);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Catálogo</h1>
        <p className={styles.subtitle}>
          {showInitialLoading || showUnavailableSkeleton
            ? "Cargando productos..."
            : showInlineLoading
              ? "Actualizando catálogo..."
              : count === 0
                  ? hasFilters
                    ? "No se encontraron resultados para tu búsqueda"
                    : ""
                   : `${count} resultado${count === 1 ? "" : "s"}`}
        </p>
      </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.filtersDesktop}>
          <FiltersPanel
            category={category}
            onCategoryChange={handleCategoryChange}
            brands={brands}
            brandsLoading={brandsLoading}
            selectedBrands={selectedBrands}
            onToggleBrand={toggleBrand}
            minPrice={minPrice}
            maxPrice={maxPrice}
            onMinPriceChange={(v) => {
              setMinPrice(v);
              setOffset(0);
            }}
           onMaxPriceChange={(v) => {
             setMaxPrice(v);
             setOffset(0);
           }}
           onClear={clearFilters}
           showClear={hasFilters}
           conditions={selectedConditions}
           availableConditions={availableConditions}
           onToggleCondition={toggleCondition}
           selectedGender={selectedGender}
           onGenderChange={(value) => {
             setSelectedGender(value);
            setOffset(0);
          }}
          selectedSize={selectedSize}
          availableSizes={availableSizes}
          onSizeChange={(value) => {
            setSelectedSize(value);
            setOffset(0);
          }}
        />
      </div>

        <div className={styles.results}>
          <div className={styles.controls}>
            <div ref={searchWrapRef} className={styles.searchWrap}>
              <Search size={16} className={styles.searchIcon} />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOffset(0);
                  setHighlightedSuggestionIndex(-1);
                }}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => {
                  requestAnimationFrame(() => {
                    const active = document.activeElement;
                    if (active && searchWrapRef.current?.contains(active)) return;
                    setIsSearchFocused(false);
                    setHighlightedSuggestionIndex(-1);
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setIsSearchFocused(false);
                    setHighlightedSuggestionIndex(-1);
                    return;
                  }

                  if (!showSearchSuggestions || !searchSuggestions.length) return;

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setHighlightedSuggestionIndex((prev) =>
                      prev >= searchSuggestions.length - 1 ? 0 : prev + 1
                    );
                    return;
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setHighlightedSuggestionIndex((prev) =>
                      prev <= 0 ? searchSuggestions.length - 1 : prev - 1
                    );
                    return;
                  }

                  if (event.key === "Enter" && highlightedSuggestionIndex >= 0) {
                    event.preventDefault();
                    const selected = searchSuggestions[highlightedSuggestionIndex];
                    if (!selected) return;
                    applySearchSuggestion(selected.name);
                  }
                }}
                placeholder="Buscar producto"
                className={styles.searchField}
                role="combobox"
                aria-expanded={showSearchSuggestions}
                aria-controls="catalog-search-suggestions"
                aria-activedescendant={activeSuggestionId}
                aria-autocomplete="list"
              />

              {showSearchSuggestions ? (
                <div
                  id="catalog-search-suggestions"
                  className={styles.searchSuggestions}
                  role="listbox"
                  aria-label="Sugerencias de búsqueda"
                >
                  {searchSuggestionsLoading && searchSuggestions.length === 0 ? (
                    <div className={styles.searchSuggestionsState}>Buscando sugerencias...</div>
                  ) : searchSuggestions.length > 0 ? (
                    searchSuggestions.map((suggestion, idx) => {
                      const meta = [suggestion.brand, suggestion.category]
                        .filter(Boolean)
                        .join(" - ");
                      const selected = idx === highlightedSuggestionIndex;

                      return (
                        <button
                          key={suggestion.id}
                          id={`catalog-search-suggestion-${idx}`}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`${styles.searchSuggestionItem} ${
                            selected ? styles.searchSuggestionItemActive : ""
                          }`}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setHighlightedSuggestionIndex(idx)}
                          onClick={() => applySearchSuggestion(suggestion.name)}
                        >
                          <span className={styles.searchSuggestionTitle}>{suggestion.name}</span>
                          {meta ? (
                            <span className={styles.searchSuggestionMeta}>{meta}</span>
                          ) : null}
                        </button>
                      );
                    })
                  ) : (
                    <div className={styles.searchSuggestionsState}>
                      Sin sugerencias para {suggestionsQuery}.
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <Select
              className={styles.sortWrap}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as ProductSort);
                setOffset(0);
              }}
            >
              <option value="relevancia">Ordenar por relevancia</option>
              <option value="precio_asc">Ordenar por precio: menor a mayor</option>
              <option value="precio_desc">Ordenar por precio: mayor a menor</option>
              <option value="nombre_asc">Ordenar por nombre: A-Z</option>
              <option value="nombre_desc">Ordenar por nombre: Z-A</option>
            </Select>
          </div>

           <div className={styles.filtersMobile}>
             <Card className={styles.panelCard}>
               <CardHeader className={styles.panelHeaderRow}>
                 <CardTitle className={styles.panelTitle}>Filtros</CardTitle>
                 <AnimatePresence initial={false}>
                   {hasFilters ? (
                     <motion.div
                       key="clear-filters-mobile"
                       initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
                       animate={{ opacity: 1, y: 0 }}
                       exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                       transition={reduceMotion ? undefined : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                     >
                       <Button
                         variant="ghost"
                         size="sm"
                         className={styles.clearButton}
                         onClick={clearFilters}
                       >
                         <X size={16} />
                         Limpiar
                       </Button>
                     </motion.div>
                   ) : null}
                 </AnimatePresence>
               </CardHeader>
               <CardContent className={styles.cardPad}>
                 <Accordion type="single" collapsible>
                   <AccordionItem value="filters">
                    <AccordionTrigger>Ver opciones</AccordionTrigger>
                    <AccordionContent>
                      <div className={styles.panelBody}>
                        <FiltersPanelBody
                          category={category}
                          onCategoryChange={handleCategoryChange}
                          brands={brands}
                          brandsLoading={brandsLoading}
                          selectedBrands={selectedBrands}
                          onToggleBrand={toggleBrand}
                          minPrice={minPrice}
                          maxPrice={maxPrice}
                          onMinPriceChange={(v) => {
                            setMinPrice(v);
                            setOffset(0);
                          }}
                        onMaxPriceChange={(v) => {
                          setMaxPrice(v);
                          setOffset(0);
                        }}
                        conditions={selectedConditions}
                        availableConditions={availableConditions}
                        onToggleCondition={toggleCondition}
                        selectedGender={selectedGender}
                        onGenderChange={(value) => {
                          setSelectedGender(value);
                          setOffset(0);
                        }}
                        selectedSize={selectedSize}
                        availableSizes={availableSizes}
                        onSizeChange={(value) => {
                          setSelectedSize(value);
                          setOffset(0);
                        }}
                      />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </div>

          {showInitialLoading || showUnavailableSkeleton ? (
            <ProductsSkeleton count={9} />
          ) : showEmpty ? (
            <Card className={styles.panelCard}>
              <CardContent className={styles.centerCard}>
                <p className={`${styles.centerText} ${styles.emptyStateText}`}>
                  {isOutOfRange
                    ? "No hay items en esta pagina."
                    : isNoResults && hasFilters
                    ? "No se encontraron resultados para tu búsqueda"
                      : "Todavía no hay productos publicados"}
                </p>
                <div className={styles.centerActions}>
                  {isOutOfRange ? (
                    <Button
                      variant="outline"
                      onClick={() => setOffset(0)}
                    >
                      Volver al inicio
                    </Button>
                  ) : null}
                  {isNoResults && hasFilters ? (
                    <Button onClick={clearFilters}>
                      Borrar filtros
                    </Button>
                  ) : null}
                  {isNoResults && !hasFilters ? (
                    <Button onClick={() => void refetch()}>
                      Refrescar
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className={styles.cardStack}>
              {showInlineLoading ? (
                <div className={styles.inlineLoadingRow}>
                  <div className={styles.inlineLoadingPill}>
                    <Loader2 size={16} className={styles.spin} />
                    Actualizando...
                  </div>
                </div>
              ) : null}

              <div className={styles.grid}>
                <AnimatePresence initial={false}>
                  {products.map((product, idx) => (
                    <motion.div
                      key={product.id}
                      initial={
                        reduceMotion
                          ? undefined
                          : { opacity: 0, y: 14, scale: 0.98 }
                      }
                      animate={
                        reduceMotion
                          ? undefined
                          : {
                              opacity: 1,
                              y: 0,
                              scale: 1,
                              transition: {
                                type: "spring",
                                stiffness: 420,
                                damping: 34,
                                delay: Math.min(0.08, idx * 0.02),
                              },
                            }
                      }
                      exit={
                        reduceMotion
                          ? undefined
                          : {
                              opacity: 0,
                              y: 10,
                              scale: 0.98,
                              transition: { duration: 0.15 },
                            }
                      }
                    >
                      <ProductCard product={product} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {count > serverLimit ? (
                <PaginationNav
                  page={page}
                  totalPages={totalPages}
                  disabled={loading}
                  onPageChange={(nextPage) => setOffset((nextPage - 1) * serverLimit)}
                  ariaLabel="Paginación de productos"
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

