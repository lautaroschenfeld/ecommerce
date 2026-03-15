import { ALL_CATEGORIES, type Category } from "@/lib/catalog";
import type { Product } from "@/lib/product";
import {
  normalizeStoreMediaUrlList,
  toStoreMediaProxyUrl,
} from "@/lib/store-media-url";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function toString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toTimestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}

export type ApiBrand = { id: string; name: string; slug: string };
export type ApiCategory = { id: string; name: string };

export type StoreProductDto = {
  id: string;
  name: string;
  brand?: ApiBrand | ApiBrand[];
  category?: ApiCategory;
  priceArs?: number;
  stockAvailable?: number;
  stockReserved?: number;
  stockThreshold?: number;
  inStock?: boolean;
  lowStock?: boolean;
  sku?: string;
  imageUrl?: string;
  images?: string[];
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export type AdminProductDto = StoreProductDto & {
  active?: boolean;
  costArs?: number;
  updatedAt?: string;
};

export type AdminProduct = Product & {
  active: boolean;
  archived: boolean;
  costArs?: number;
  sku?: string;
  updatedAt?: number;
  metadata?: Record<string, unknown>;
};

export type AdminProductDetail = {
  id: string;
  name: string;
  brand: string;
  category: Category;
  priceArs: number;
  costArs: number;
  condition: Product["condition"];
  color?: string;
  size?: string;
  gender?: Product["gender"];
  variantGroupId?: string;
  metadata?: Record<string, unknown>;
  stockAvailable: number;
  stockReserved: number;
  stockSold: number;
  stockThreshold: number;
  inStock: boolean;
  lowStock: boolean;
  description?: string;
  sku?: string;
  active: boolean;
  archived: boolean;
  images: string[];
  thumbnail?: string;
  createdAt: number;
  updatedAt?: number;
};

function pickBrandName(brand: unknown) {
  const rec = asRecord(brand);
  const name = rec ? toString(rec["name"]) : undefined;
  if (name) return name;

  if (Array.isArray(brand) && brand.length) {
    const first = asRecord(brand[0]);
    const firstName = first ? toString(first["name"]) : undefined;
    if (firstName) return firstName;
  }

  return undefined;
}

function parseCategoryName(category: unknown): Category | undefined {
  const rec = asRecord(category);
  const name = rec ? toString(rec["name"]) : undefined;
  if (!name) return undefined;
  return ALL_CATEGORIES.includes(name as Category) ? (name as Category) : undefined;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string")
    .map((s) => s.trim())
    .filter(Boolean) as string[];
}

function parseGender(rec: Record<string, unknown>, metadata: Record<string, unknown>) {
  const raw =
    toString(rec["gender"])?.trim().toLowerCase() ??
    toString(metadata["gender"])?.trim().toLowerCase();
  if (raw === "hombre" || raw === "mujer" || raw === "unisex") return raw;
  return undefined;
}

function parseArchived(
  rec: Record<string, unknown>,
  metadata: Record<string, unknown>
) {
  const direct = rec["archived"];
  if (typeof direct === "boolean") return direct;
  if (typeof direct === "number") return direct > 0;
  if (typeof direct === "string") {
    const normalized = direct.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  }

  const raw = metadata["archived"];
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw > 0;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }

  return false;
}

export function mapStoreDtoToProduct(dto: unknown): Product | null {
  const rec = asRecord(dto);
  if (!rec) return null;

  const id = toString(rec["id"])?.trim() || "";
  const name = toString(rec["name"])?.trim() || "";
  const brand = pickBrandName(rec["brand"])?.trim() || "";
  const category = parseCategoryName(rec["category"]);
  const priceArsRaw = toNumber(rec["priceArs"]);
  const priceArs = Number.isFinite(priceArsRaw) ? Math.round(priceArsRaw as number) : 0;
  const createdAt = toTimestamp(rec["createdAt"]) ?? Date.now();
  const images = normalizeStoreMediaUrlList([
    ...(toString(rec["imageUrl"]) ? [toString(rec["imageUrl"])!] : []),
    ...parseStringArray(rec["images"]),
  ]);
  const imageUrl = images[0] || undefined;
  const description = toString(rec["description"])?.trim() || undefined;
  const metadata = asRecord(rec["metadata"]) ?? {};
  const sku = toString(rec["sku"])?.trim() || undefined;
  const conditionRaw =
    toString(rec["condition"])?.toLowerCase() ??
    toString(metadata["condition"])?.toLowerCase();
  const condition: Product["condition"] =
    conditionRaw === "usado"
      ? "usado"
      : conditionRaw === "reacondicionado"
        ? "reacondicionado"
        : "nuevo";
  const color =
    toString(rec["color"])?.trim() || toString(metadata["color"])?.trim() || undefined;
  const size =
    toString(rec["size"])?.trim() || toString(metadata["size"])?.trim() || undefined;
  const gender = parseGender(rec, metadata);
  const variantGroupId =
    toString(rec["variantGroupId"])?.trim() ||
    toString(metadata["group_id"])?.trim() ||
    toString(metadata["variant_group_id"])?.trim() ||
    toString(metadata["family"])?.trim() ||
    undefined;
  const stockAvailable = toNumber(rec["stockAvailable"]) ?? 0;
  const stockReserved = toNumber(rec["stockReserved"]) ?? 0;
  const stockSoldRaw =
    toNumber(rec["stockSold"]) ??
    toNumber(rec["stock_sold"]) ??
    toNumber(metadata["stock_sold"]) ??
    toNumber(metadata["stockSold"]);
  const stockSold =
    stockSoldRaw !== undefined ? Math.max(0, Math.trunc(stockSoldRaw)) : undefined;
  const stockThreshold = toNumber(rec["stockThreshold"]) ?? 3;
  const inStock =
    typeof rec["inStock"] === "boolean"
      ? Boolean(rec["inStock"])
      : stockAvailable > 0;
  const lowStock =
    typeof rec["lowStock"] === "boolean"
      ? Boolean(rec["lowStock"])
      : stockAvailable <= stockThreshold;

  if (!id || !name || !brand || !category) return null;

  return {
    id,
    name,
    brand,
    category,
    priceArs: Math.max(0, priceArs),
    sku,
    imageUrl,
    images: images.length ? images : undefined,
    description,
    condition,
    color,
    size,
    gender,
    variantGroupId,
    stockAvailable: Math.max(0, Math.trunc(stockAvailable)),
    stockReserved: Math.max(0, Math.trunc(stockReserved)),
    stockSold,
    stockThreshold: Math.max(0, Math.trunc(stockThreshold)),
    inStock,
    lowStock,
    metadata,
    createdAt,
  };
}

export function mapAdminDtoToAdminProduct(dto: unknown): AdminProduct | null {
  const rec = asRecord(dto);
  if (!rec) return null;

  const base = mapStoreDtoToProduct(dto);
  if (!base) return null;

  const metadata = asRecord(rec["metadata"]) ?? {};
  const conditionRaw =
    toString(rec["condition"])?.toLowerCase() ??
    toString(metadata["condition"])?.toLowerCase();
  const condition: Product["condition"] =
    conditionRaw === "usado"
      ? "usado"
      : conditionRaw === "reacondicionado"
        ? "reacondicionado"
        : "nuevo";
  const color =
    toString(rec["color"])?.trim() || toString(metadata["color"])?.trim() || undefined;
  const size =
    toString(rec["size"])?.trim() || toString(metadata["size"])?.trim() || undefined;
  const gender = parseGender(rec, metadata);
  const variantGroupId =
    toString(rec["variantGroupId"])?.trim() ||
    toString(metadata["group_id"])?.trim() ||
    toString(metadata["variant_group_id"])?.trim() ||
    toString(metadata["family"])?.trim() ||
    undefined;

  const active = typeof rec["active"] === "boolean" ? (rec["active"] as boolean) : true;
  const archived = parseArchived(rec, metadata);
  const costArsRaw =
    toNumber(rec["costArs"]) ??
    toNumber(metadata["cost_ars"]) ??
    toNumber(metadata["costArs"]);
  const costArs =
    costArsRaw !== undefined ? Math.max(0, Math.round(costArsRaw)) : undefined;
  const sku = toString(rec["sku"])?.trim() || undefined;
  const updatedAt = toTimestamp(rec["updatedAt"]);

  return {
    ...base,
    condition,
    color,
    size,
    gender,
    variantGroupId,
    active,
    archived,
    costArs,
    sku,
    updatedAt,
    metadata,
  };
}

export function mapAdminDetailDtoToAdminProductDetail(
  dto: unknown
): AdminProductDetail | null {
  const rec = asRecord(dto);
  if (!rec) return null;

  const id = toString(rec["id"])?.trim() || "";
  const name = toString(rec["name"])?.trim() || "";
  const brand = pickBrandName(rec["brand"])?.trim() || "";
  const category = parseCategoryName(rec["category"]);
  const priceArsRaw = toNumber(rec["priceArs"]);
  const priceArs = Number.isFinite(priceArsRaw) ? Math.round(priceArsRaw as number) : 0;
  const metadata = asRecord(rec["metadata"]) ?? {};
  const costArsRaw =
    toNumber(rec["costArs"]) ??
    toNumber(metadata["cost_ars"]) ??
    toNumber(metadata["costArs"]);
  const costArs =
    costArsRaw !== undefined ? Math.max(0, Math.round(costArsRaw)) : 0;
  const active = typeof rec["active"] === "boolean" ? (rec["active"] as boolean) : true;
  const archived = parseArchived(rec, metadata);
  const sku = toString(rec["sku"])?.trim() || undefined;
  const description = toString(rec["description"]) ?? undefined;
  const conditionRaw =
    toString(rec["condition"])?.toLowerCase() ??
    toString(metadata["condition"])?.toLowerCase();
  const condition: Product["condition"] =
    conditionRaw === "usado"
      ? "usado"
      : conditionRaw === "reacondicionado"
        ? "reacondicionado"
        : "nuevo";
  const color =
    toString(rec["color"])?.trim() || toString(metadata["color"])?.trim() || undefined;
  const size =
    toString(rec["size"])?.trim() || toString(metadata["size"])?.trim() || undefined;
  const gender = parseGender(rec, metadata);
  const variantGroupId =
    toString(rec["variantGroupId"])?.trim() ||
    toString(metadata["group_id"])?.trim() ||
    toString(metadata["variant_group_id"])?.trim() ||
    toString(metadata["family"])?.trim() ||
    undefined;
  const images = normalizeStoreMediaUrlList(parseStringArray(rec["images"]));
  const thumbnail = toStoreMediaProxyUrl(toString(rec["thumbnail"])) || undefined;
  const stockAvailable = toNumber(rec["stockAvailable"]) ?? 0;
  const stockReserved = toNumber(rec["stockReserved"]) ?? 0;
  const stockSold = toNumber(rec["stockSold"]) ?? 0;
  const stockThreshold = toNumber(rec["stockThreshold"]) ?? 3;
  const inStock =
    typeof rec["inStock"] === "boolean"
      ? Boolean(rec["inStock"])
      : stockAvailable > 0;
  const lowStock =
    typeof rec["lowStock"] === "boolean"
      ? Boolean(rec["lowStock"])
      : stockAvailable <= stockThreshold;
  const createdAt = toTimestamp(rec["createdAt"]) ?? Date.now();
  const updatedAt = toTimestamp(rec["updatedAt"]);

  if (!id || !name || !brand || !category) return null;

  return {
    id,
    name,
    brand,
    category,
    priceArs: Math.max(0, priceArs),
    costArs,
    condition,
    color,
    size,
    gender,
    variantGroupId,
    metadata,
    stockAvailable: Math.max(0, Math.trunc(stockAvailable)),
    stockReserved: Math.max(0, Math.trunc(stockReserved)),
    stockSold: Math.max(0, Math.trunc(stockSold)),
    stockThreshold: Math.max(0, Math.trunc(stockThreshold)),
    inStock,
    lowStock,
    description,
    sku,
    active,
    archived,
    images,
    thumbnail,
    createdAt,
    updatedAt,
  };
}
