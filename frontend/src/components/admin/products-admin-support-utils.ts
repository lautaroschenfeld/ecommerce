"use client";

import { nanoid } from "nanoid";

import { mapFriendlyError } from "@/lib/user-facing-errors";
import { PRIMARY_CATEGORIES } from "@/lib/catalog";
import { toNumberOrUndefined } from "@/lib/format";
import {
  syncProductCharacteristicsForCategory,
  type ProductCharacteristicItem,
} from "@/lib/product-characteristics";
import { type AdminProductsBulkAction } from "@/lib/store-admin-products";
import type { AdminProduct } from "@/lib/store-mappers";

type VariantForm = {
  id?: string;
  color: string;
  size: string;
  gender: "hombre" | "mujer" | "unisex";
  condition: "nuevo" | "reacondicionado" | "usado";
  price: string;
  cost: string;
  stock: string;
  sizeStocks: Record<string, string>;
  sku: string;
  imageUrls: string[];
  active: boolean;
};

const APPAREL_SIZE_ALPHA_OPTIONS = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "3XL",
] as const;

const APPAREL_SIZE_NUMERIC_OPTIONS = [
  "34",
  "36",
  "38",
  "40",
  "42",
  "44",
  "46",
] as const;

const APPAREL_SIZE_ROWS = [APPAREL_SIZE_ALPHA_OPTIONS, APPAREL_SIZE_NUMERIC_OPTIONS] as const;
const APPAREL_SIZE_OPTIONS = [
  ...APPAREL_SIZE_ALPHA_OPTIONS,
  ...APPAREL_SIZE_NUMERIC_OPTIONS,
] as const;

const APPAREL_GENDER_OPTIONS = [
  { value: "hombre", label: "Hombre" },
  { value: "mujer", label: "Mujer" },
  { value: "unisex", label: "Unisex" },
] as const;

function resolveProductGroupKey(product: Pick<AdminProduct, "id" | "variantGroupId">) {
  const groupId = product.variantGroupId?.trim();
  if (groupId) return `group:${groupId}`;
  return `single:${product.id}`;
}

function resolveDuplicateName(name: string) {
  const normalized = name.trim();
  if (!normalized) return "Producto (Copia)";
  if (/\(copia\)$/i.test(normalized)) return normalized;
  return `${normalized} (Copia)`;
}

const UNIQUE_METADATA_KEYS = new Set([
  "id",
  "product_id",
  "variant_id",
  "sku",
  "group_id",
  "variant_group_id",
  "family",
  "ean",
  "upc",
  "barcode",
  "mpn",
]);

function sanitizeMetadataForDuplicate(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return {};
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (UNIQUE_METADATA_KEYS.has(key.toLowerCase())) continue;
    next[key] = value;
  }
  return next;
}

function createEmptySizeStocks() {
  return Object.fromEntries(APPAREL_SIZE_OPTIONS.map((size) => [size, "0"])) as Record<
    string,
    string
  >;
}

type AdminCategory = (typeof PRIMARY_CATEGORIES)[number];
type ProductsSortBy = (typeof PRODUCTS_SORT_OPTIONS)[number];
type ProductsFilterStatus = (typeof PRODUCTS_FILTER_STATUS_OPTIONS)[number];

type FormState = {
  name: string;
  brand: string;
  category: AdminCategory | undefined;
  description: string;
  variants: VariantForm[];
  characteristics: ProductCharacteristicItem[];
};

type ProductsListSnapshot = {
  search: string;
  filterCategory: AdminCategory | "";
  filterBrand: string;
  filterStatus: ProductsFilterStatus;
  minPrice: string;
  maxPrice: string;
  sortBy: ProductsSortBy;
  page: number;
  pageSize: number;
  selectedGroups: Record<string, boolean>;
  expandedGroups: Record<string, boolean>;
  bulkAction: AdminProductsBulkAction | "";
  bulkCategory: AdminCategory | "";
  bulkStockDelta: string;
  scrollY: number;
};

type ProductGroupEntry = {
  key: string;
  groupId: string | null;
  primary: AdminProduct;
  variants: AdminProduct[];
  allVariants: AdminProduct[];
  visibleCount: number;
  totalCount: number;
};

const PRODUCTS_SORT_OPTIONS = [
  "created_desc",
  "created_asc",
  "price_desc",
  "price_asc",
  "name_asc",
  "name_desc",
  "stock_desc",
  "stock_asc",
] as const;

const PRODUCTS_FILTER_STATUS_OPTIONS = ["all", "live", "active"] as const;

const EMPTY_FORM: FormState = {
  name: "",
  brand: "",
  category: undefined,
  description: "",
  variants: [
    {
      color: "",
      size: "",
      gender: "unisex",
      condition: "nuevo",
      price: "",
      cost: "",
      stock: "1",
      sizeStocks: createEmptySizeStocks(),
      sku: "",
      imageUrls: [],
      active: true,
    },
  ],
  characteristics: syncProductCharacteristicsForCategory(undefined, undefined),
};

type ProductsAdminMode = "list" | "create";

type ProductsAdminProps = {
  mode?: ProductsAdminMode;
};

const PRODUCTS_LIST_SNAPSHOT_KEY = "admin:products:list-snapshot:v1";
const PRODUCTS_LIST_RESTORE_ONCE_KEY = "admin:products:list-restore-once:v1";
const PRODUCTS_PAGE_SIZE_OPTIONS = [24, 48, 96] as const;

function normalizeApparelGender(value: string | undefined): VariantForm["gender"] {
  if (value === "hombre" || value === "mujer" || value === "unisex") return value;
  return "unisex";
}

function resolveFormApparelGender(form: FormState): VariantForm["gender"] {
  return normalizeApparelGender(form.variants[0]?.gender);
}

function applyGenderToAllVariants(prev: FormState, gender: VariantForm["gender"]): FormState {
  return {
    ...prev,
    variants: prev.variants.map((variant) => ({ ...variant, gender })),
  };
}

function sanitizeStockInput(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function toSizeStocks(
  current: Record<string, string> | undefined,
  fallbackSize?: string,
  fallbackStock?: string | number
) {
  const next = createEmptySizeStocks();

  if (current) {
    for (const size of APPAREL_SIZE_OPTIONS) {
      const value = current[size];
      if (value !== undefined) {
        next[size] = sanitizeStockInput(value) || "0";
      }
    }
  }

  const normalizedSize = fallbackSize?.trim();
  if (
    normalizedSize &&
    APPAREL_SIZE_OPTIONS.includes(
      normalizedSize as (typeof APPAREL_SIZE_OPTIONS)[number]
    )
  ) {
    const parsed = toNumberOrUndefined(String(fallbackStock ?? "0"));
    next[normalizedSize] =
      parsed !== undefined && parsed > 0 ? String(Math.trunc(parsed)) : "0";
  }

  return next;
}

function readSizeStocksFromMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return undefined;

  const raw =
    typeof metadata.size_stocks === "object" &&
    metadata.size_stocks !== null &&
    !Array.isArray(metadata.size_stocks)
      ? (metadata.size_stocks as Record<string, unknown>)
      : typeof metadata.sizeStocks === "object" &&
          metadata.sizeStocks !== null &&
          !Array.isArray(metadata.sizeStocks)
        ? (metadata.sizeStocks as Record<string, unknown>)
        : undefined;

  if (!raw) return undefined;

  const extracted: Record<string, string> = {};
  for (const size of APPAREL_SIZE_OPTIONS) {
    const value = raw[size];
    if (value === undefined) continue;

    const parsed = toNumberOrUndefined(String(value));
    extracted[size] =
      parsed !== undefined && parsed > 0 ? String(Math.trunc(parsed)) : "0";
  }

  return Object.keys(extracted).length ? extracted : undefined;
}

function toMetadataSizeStocks(sizeStocks: Record<string, string>) {
  const normalized = toSizeStocks(sizeStocks);

  return Object.fromEntries(
    APPAREL_SIZE_OPTIONS.map((size) => {
      const parsed = toNumberOrUndefined(normalized[size] ?? "0");
      return [size, parsed !== undefined && parsed > 0 ? Math.trunc(parsed) : 0];
    })
  ) as Record<string, number>;
}

function getActiveSizeEntries(sizeStocks: Record<string, string>) {
  const entries: Array<{ size: string; stock: number }> = [];

  for (const size of APPAREL_SIZE_OPTIONS) {
    const parsed = toNumberOrUndefined(sizeStocks[size] ?? "0");
    if (parsed === undefined || parsed <= 0) continue;
    entries.push({ size, stock: Math.trunc(parsed) });
  }

  return entries;
}

function syncSizeAndStockFromMap(
  variant: VariantForm,
  nextSizeStocks: Record<string, string>
) {
  const activeEntries = getActiveSizeEntries(nextSizeStocks);
  const firstActive = activeEntries[0];

  return {
    ...variant,
    sizeStocks: nextSizeStocks,
    size: firstActive?.size ?? "",
    stock: firstActive ? String(firstActive.stock) : "0",
  };
}

function sanitizeSignedStockDeltaInput(value: string) {
  if (!value) return "";
  const raw = value.trim();
  const sign = raw.startsWith("-") ? "-" : "";
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return sign;
  return `${sign}${digits}`;
}

function buildCharacteristicHints(input: {
  brand?: string;
  name?: string;
  color?: string;
}) {
  const brand = input.brand?.trim();
  const model = input.name?.trim();
  const color = input.color?.trim();
  return {
    brand: brand || undefined,
    model: model || undefined,
    color: color || undefined,
  };
}

function applyCharacteristicHintsIfEmpty(
  items: ProductCharacteristicItem[],
  hints: ReturnType<typeof buildCharacteristicHints>
) {
  let changed = false;
  const next = items.map((item) => {
    if (item.key === "brand" && hints.brand) {
      if (typeof item.value === "string" && item.value.trim()) return item;
      changed = true;
      return { ...item, value: hints.brand };
    }
    if (item.key === "model" && hints.model) {
      if (typeof item.value === "string" && item.value.trim()) return item;
      changed = true;
      return { ...item, value: hints.model };
    }
    if (item.key === "color" && hints.color) {
      if (typeof item.value === "string" && item.value.trim()) return item;
      changed = true;
      return { ...item, value: hints.color };
    }
    return item;
  });

  return changed ? next : items;
}

function withCategorySelection(prev: FormState, nextCategory: AdminCategory | undefined): FormState {
  const nextCharacteristics = syncProductCharacteristicsForCategory(
    prev.characteristics,
    nextCategory,
    buildCharacteristicHints({
      brand: prev.brand,
      name: prev.name,
      color: prev.variants[0]?.color,
    })
  );

  if (nextCategory === "Indumentaria" && prev.category !== "Indumentaria") {
    return {
      ...prev,
      category: nextCategory,
      characteristics: nextCharacteristics,
      variants: prev.variants.map((variant) => ({
        ...variant,
        size: "",
        gender: "unisex",
        stock: "0",
        sizeStocks: createEmptySizeStocks(),
      })),
    };
  }

  return {
    ...prev,
    category: nextCategory,
    characteristics: nextCharacteristics,
  };
}

function mapPanelError(error: unknown, fallback: string) {
  return mapFriendlyError(error, fallback);
}

function bulkActionLabel(action: AdminProductsBulkAction) {
  if (action === "publish") return "publicar";
  if (action === "delete") return "eliminar";
  if (action === "change_category") return "cambiar categoría";
  return "ajustar stock";
}

function bulkActionSuccessTitle(action: AdminProductsBulkAction, count: number) {
  const plural = count !== 1;
  if (action === "publish") return plural ? "Productos publicados" : "Producto publicado";
  if (action === "delete") return plural ? "Productos eliminados" : "Producto eliminado";
  if (action === "change_category") return "Categoría actualizada";
  return "Stock actualizado";
}

function bulkActionSuccessMessage(action: AdminProductsBulkAction, count: number) {
  const target = count === 1 ? "un producto" : `${count} productos`;

  if (action === "publish") {
    return count === 1
      ? "Se ha publicado un producto."
      : `Se han publicado ${count} productos.`;
  }
  if (action === "delete") {
    return count === 1
      ? "Se ha eliminado un producto."
      : `Se han eliminado ${count} productos.`;
  }
  if (action === "change_category") {
    return `Se actualizó la categoría de ${target}.`;
  }
  return `Se actualizó el stock de ${target}.`;
}

function toAdminCategory(input: string | undefined): AdminCategory | undefined {
  if (!input) return undefined;
  return PRIMARY_CATEGORIES.includes(input as AdminCategory)
    ? (input as AdminCategory)
    : undefined;
}

function dedupeImageUrls(input: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function resolveVariantImageUrls(variants: VariantForm[], index: number) {
  const own = dedupeImageUrls(variants[index]?.imageUrls ?? []);
  if (own.length > 0) return own;
  if (index === 0) return own;
  return dedupeImageUrls(variants[0]?.imageUrls ?? []);
}

function generateGroupId() {
  return `grp-${nanoid(10)}`;
}

function slugifyHandlePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildVariantHandle(
  name: string,
  color: string,
  size: string,
  seed: string,
  index: number
) {
  const parts = [name, color, size]
    .map((part) => slugifyHandlePart(part.trim()))
    .filter(Boolean);

  const base = parts.join("-") || "producto";
  return `${base}-${seed}-${index + 1}`;
}

export type {
  VariantForm,
  AdminCategory,
  ProductsSortBy,
  ProductsFilterStatus,
  FormState,
  ProductsListSnapshot,
  ProductGroupEntry,
  ProductsAdminMode,
  ProductsAdminProps,
};

export {
  APPAREL_SIZE_ALPHA_OPTIONS,
  APPAREL_SIZE_NUMERIC_OPTIONS,
  APPAREL_SIZE_ROWS,
  APPAREL_SIZE_OPTIONS,
  APPAREL_GENDER_OPTIONS,
  resolveProductGroupKey,
  resolveDuplicateName,
  sanitizeMetadataForDuplicate,
  createEmptySizeStocks,
  EMPTY_FORM,
  PRODUCTS_LIST_SNAPSHOT_KEY,
  PRODUCTS_LIST_RESTORE_ONCE_KEY,
  PRODUCTS_PAGE_SIZE_OPTIONS,
  PRODUCTS_SORT_OPTIONS,
  PRODUCTS_FILTER_STATUS_OPTIONS,
  normalizeApparelGender,
  resolveFormApparelGender,
  applyGenderToAllVariants,
  toSizeStocks,
  readSizeStocksFromMetadata,
  toMetadataSizeStocks,
  getActiveSizeEntries,
  syncSizeAndStockFromMap,
  sanitizeStockInput,
  sanitizeSignedStockDeltaInput,
  buildCharacteristicHints,
  applyCharacteristicHintsIfEmpty,
  withCategorySelection,
  mapPanelError,
  bulkActionLabel,
  bulkActionSuccessTitle,
  bulkActionSuccessMessage,
  toAdminCategory,
  dedupeImageUrls,
  resolveVariantImageUrls,
  generateGroupId,
  slugifyHandlePart,
  buildVariantHandle,
};
