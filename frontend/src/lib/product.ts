import type { Category } from "@/lib/catalog";

export type ProductCondition = "nuevo" | "reacondicionado" | "usado";
export type ProductGender = "hombre" | "mujer" | "unisex";

export type Product = {
  id: string;
  name: string;
  brand: string;
  category: Category;
  priceArs: number;
  sku?: string;
  imageUrl?: string;
  images?: string[];
  description?: string;
  condition: ProductCondition;
  color?: string;
  size?: string;
  gender?: ProductGender;
  variantGroupId?: string;
  stockAvailable?: number;
  stockReserved?: number;
  stockSold?: number;
  stockThreshold?: number;
  inStock?: boolean;
  lowStock?: boolean;
  metadata?: Record<string, unknown>;
  createdAt: number;
};

export type ProductSort =
  | "relevancia"
  | "precio_asc"
  | "precio_desc"
  | "nombre_asc"
  | "nombre_desc";
