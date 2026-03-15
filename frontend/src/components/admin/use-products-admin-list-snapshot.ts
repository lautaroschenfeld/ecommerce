"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";

import { PRIMARY_CATEGORIES } from "@/lib/catalog";

import {
  PRODUCTS_FILTER_STATUS_OPTIONS,
  PRODUCTS_LIST_RESTORE_ONCE_KEY,
  PRODUCTS_LIST_SNAPSHOT_KEY,
  PRODUCTS_PAGE_SIZE_OPTIONS,
  PRODUCTS_SORT_OPTIONS,
  type AdminCategory,
  type ProductsFilterStatus,
  type ProductsListSnapshot,
  type ProductsSortBy,
} from "./products-admin-support";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type UseProductsAdminListSnapshotInput = {
  isListMode: boolean;
  search: string;
  setSearch: StateSetter<string>;
  setSearchQuery: StateSetter<string>;
  filterCategory: AdminCategory | "";
  setFilterCategory: StateSetter<AdminCategory | "">;
  filterBrand: string;
  setFilterBrand: StateSetter<string>;
  filterStatus: ProductsFilterStatus;
  setFilterStatus: StateSetter<ProductsFilterStatus>;
  minPrice: string;
  setMinPrice: StateSetter<string>;
  maxPrice: string;
  setMaxPrice: StateSetter<string>;
  sortBy: ProductsSortBy;
  setSortBy: StateSetter<ProductsSortBy>;
  page: number;
  setPage: StateSetter<number>;
  pageSize: number;
  setPageSize: StateSetter<number>;
  selectedGroups: Record<string, boolean>;
  setSelectedGroups: StateSetter<Record<string, boolean>>;
  expandedGroups: Record<string, boolean>;
  setExpandedGroups: StateSetter<Record<string, boolean>>;
  bulkAction: "publish" | "change_category" | "adjust_stock" | "delete" | "";
  setBulkAction: StateSetter<"publish" | "change_category" | "adjust_stock" | "delete" | "">;
  bulkCategory: AdminCategory | "";
  setBulkCategory: StateSetter<AdminCategory | "">;
  bulkStockDelta: string;
  setBulkStockDelta: StateSetter<string>;
};

export function useProductsAdminListSnapshot(input: UseProductsAdminListSnapshotInput) {
  const {
    isListMode,
    search,
    setSearch,
    setSearchQuery,
    filterCategory,
    setFilterCategory,
    filterBrand,
    setFilterBrand,
    filterStatus,
    setFilterStatus,
    minPrice,
    setMinPrice,
    maxPrice,
    setMaxPrice,
    sortBy,
    setSortBy,
    page,
    setPage,
    pageSize,
    setPageSize,
    selectedGroups,
    setSelectedGroups,
    expandedGroups,
    setExpandedGroups,
    bulkAction,
    setBulkAction,
    bulkCategory,
    setBulkCategory,
    bulkStockDelta,
    setBulkStockDelta,
  } = input;

  useEffect(() => {
    if (!isListMode) return;
    if (typeof window === "undefined") return;

    const shouldRestore =
      window.sessionStorage.getItem(PRODUCTS_LIST_RESTORE_ONCE_KEY) === "1";
    if (!shouldRestore) return;

    window.sessionStorage.removeItem(PRODUCTS_LIST_RESTORE_ONCE_KEY);

    const raw = window.sessionStorage.getItem(PRODUCTS_LIST_SNAPSHOT_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<ProductsListSnapshot>;
      const nextSearch = typeof parsed.search === "string" ? parsed.search : "";

      setSearch(nextSearch);
      setSearchQuery(nextSearch);
      setFilterCategory(
        parsed.filterCategory && PRIMARY_CATEGORIES.includes(parsed.filterCategory)
          ? parsed.filterCategory
          : ""
      );
      setFilterBrand(typeof parsed.filterBrand === "string" ? parsed.filterBrand : "");
      setFilterStatus(
        PRODUCTS_FILTER_STATUS_OPTIONS.includes(
          parsed.filterStatus as ProductsFilterStatus
        )
          ? (parsed.filterStatus as ProductsFilterStatus)
          : "live"
      );
      setMinPrice(typeof parsed.minPrice === "string" ? parsed.minPrice : "");
      setMaxPrice(typeof parsed.maxPrice === "string" ? parsed.maxPrice : "");
      setSortBy(
        PRODUCTS_SORT_OPTIONS.includes(parsed.sortBy as ProductsSortBy)
          ? (parsed.sortBy as ProductsSortBy)
          : "created_desc"
      );
      setPage(
        typeof parsed.page === "number" && Number.isFinite(parsed.page)
          ? Math.max(1, Math.trunc(parsed.page))
          : 1
      );
      setPageSize(
        PRODUCTS_PAGE_SIZE_OPTIONS.includes(
          parsed.pageSize as (typeof PRODUCTS_PAGE_SIZE_OPTIONS)[number]
        )
          ? (parsed.pageSize as (typeof PRODUCTS_PAGE_SIZE_OPTIONS)[number])
          : PRODUCTS_PAGE_SIZE_OPTIONS[1]
      );
      setSelectedGroups(
        parsed.selectedGroups && typeof parsed.selectedGroups === "object"
          ? parsed.selectedGroups
          : {}
      );
      setExpandedGroups(
        parsed.expandedGroups && typeof parsed.expandedGroups === "object"
          ? parsed.expandedGroups
          : {}
      );
      setBulkAction(
        parsed.bulkAction &&
          [
            "publish",
            "change_category",
            "adjust_stock",
            "delete",
          ].includes(parsed.bulkAction)
          ? parsed.bulkAction
          : ""
      );
      setBulkCategory(
        parsed.bulkCategory && PRIMARY_CATEGORIES.includes(parsed.bulkCategory)
          ? parsed.bulkCategory
          : ""
      );
      setBulkStockDelta(
        typeof parsed.bulkStockDelta === "string" ? parsed.bulkStockDelta : ""
      );

      const nextScrollY =
        typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY)
          ? Math.max(0, parsed.scrollY)
          : 0;

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: nextScrollY, behavior: "auto" });
        });
      });
    } catch {
      // no-op
    }
  }, [
    isListMode,
    setBulkAction,
    setBulkCategory,
    setBulkStockDelta,
    setExpandedGroups,
    setFilterBrand,
    setFilterCategory,
    setFilterStatus,
    setMaxPrice,
    setMinPrice,
    setPage,
    setPageSize,
    setSearch,
    setSearchQuery,
    setSelectedGroups,
    setSortBy,
  ]);

  useEffect(() => {
    if (!isListMode) return;
    if (typeof window === "undefined") return;

    const snapshot: ProductsListSnapshot = {
      search,
      filterCategory,
      filterBrand,
      filterStatus,
      minPrice,
      maxPrice,
      sortBy,
      page,
      pageSize,
      selectedGroups,
      expandedGroups,
      bulkAction,
      bulkCategory,
      bulkStockDelta,
      scrollY: window.scrollY,
    };

    window.sessionStorage.setItem(
      PRODUCTS_LIST_SNAPSHOT_KEY,
      JSON.stringify(snapshot)
    );
  }, [
    isListMode,
    search,
    filterCategory,
    filterBrand,
    filterStatus,
    minPrice,
    maxPrice,
    sortBy,
    page,
    pageSize,
    selectedGroups,
    expandedGroups,
    bulkAction,
    bulkCategory,
    bulkStockDelta,
  ]);

  useEffect(() => {
    if (!isListMode) return;
    if (typeof window === "undefined") return;

    const persistScrollOnly = () => {
      try {
        const raw = window.sessionStorage.getItem(PRODUCTS_LIST_SNAPSHOT_KEY);
        const current = raw ? (JSON.parse(raw) as Partial<ProductsListSnapshot>) : {};
        current.scrollY = window.scrollY;
        window.sessionStorage.setItem(
          PRODUCTS_LIST_SNAPSHOT_KEY,
          JSON.stringify(current)
        );
      } catch {
        // no-op
      }
    };

    window.addEventListener("scroll", persistScrollOnly);
    return () => {
      persistScrollOnly();
      window.removeEventListener("scroll", persistScrollOnly);
    };
  }, [isListMode]);
}
