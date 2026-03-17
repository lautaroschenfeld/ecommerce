"use client";

import { toNumberOrUndefined } from "@/lib/format";
import {
  MAX_EXTRA_CHARACTERISTICS,
  readProductCharacteristicsFromMetadata,
} from "@/lib/product-characteristics";
import { adminProductsActions } from "@/lib/store-admin-products";
import type { AdminProduct } from "@/lib/store-mappers";

import {
  buildCharacteristicHints,
  dedupeImageUrls,
  getActiveSizeEntries,
  mapPanelError,
  normalizeApparelGender,
  readSizeStocksFromMetadata,
  resolveVariantImageUrls,
  toAdminCategory,
  toSizeStocks,
  type FormState,
} from "./products-admin-support-utils";

export function mapProductToForm(product: AdminProduct): FormState {
  const category = toAdminCategory(product.category);
  const initialImages = dedupeImageUrls([
    ...(product.images ?? []),
    ...(product.imageUrl ? [product.imageUrl] : []),
  ]);
  const sizeStocks = toSizeStocks(
    readSizeStocksFromMetadata(product.metadata),
    product.size ?? "",
    String(product.stockAvailable ?? 0)
  );
  const firstActiveSize = getActiveSizeEntries(sizeStocks)[0];

  return {
    name: product.name,
    brand: product.brand,
    category,
    description: product.description ?? "",
    variants: [
      {
        id: product.id,
        color: product.color ?? "",
        size: firstActiveSize?.size ?? product.size ?? "",
        gender: normalizeApparelGender(product.gender),
        condition: product.condition ?? "nuevo",
        price: String(product.priceArs),
        cost: String(Math.max(0, Math.round(product.costArs ?? product.priceArs * 0.55))),
        stock: firstActiveSize ? String(firstActiveSize.stock) : String(product.stockAvailable ?? 0),
        sizeStocks,
        sku: product.sku ?? "",
        imageUrls: initialImages,
        active: product.active,
      },
    ],
    characteristics: readProductCharacteristicsFromMetadata(product.metadata, {
      category,
      hints: buildCharacteristicHints({
        brand: product.brand,
        name: product.name,
        color: product.color,
      }),
    }),
  };
}

export function validateForm(form: FormState) {
  if (!form.name.trim()) return "Falta el nombre del producto.";
  if (!form.brand.trim()) return "Falta la marca.";
  if (!form.category) return "Elige una categoría.";

  if (!form.variants.length) return "Agrega al menos una variante.";

  const extras = form.characteristics.filter((item) => item.isExtra);
  if (extras.length > MAX_EXTRA_CHARACTERISTICS) {
    return `Solo se permiten ${MAX_EXTRA_CHARACTERISTICS} atributos extra.`;
  }
  for (const item of extras) {
    if (!item.label.trim()) {
      return "Completa el nombre de cada atributo extra.";
    }
  }

  const requiresColor = form.category === "Indumentaria" || form.variants.length > 1;
  const seenSkus = new Set<string>();

  for (const [idx, v] of form.variants.entries()) {
    const parsedPrice = toNumberOrUndefined(v.price);
    if (parsedPrice === undefined || parsedPrice <= 0) {
      return "Ingresa un precio válido en cada variante.";
    }
    const parsedCost = toNumberOrUndefined(v.cost);
    if (parsedCost === undefined || parsedCost < 0) {
      return "Ingresa un costo válido en cada variante.";
    }
    if (form.category === "Indumentaria") {
      const activeSizes = getActiveSizeEntries(toSizeStocks(v.sizeStocks, v.size, v.stock));
      if (activeSizes.length === 0) {
        return "Activa al menos un talle por variante en Indumentaria.";
      }
      if (v.gender !== "hombre" && v.gender !== "mujer" && v.gender !== "unisex") {
        return "Selecciona un género válido en cada variante de Indumentaria.";
      }
    } else {
      const parsedStock = toNumberOrUndefined(v.stock);
      if (parsedStock === undefined || parsedStock < 0) {
        return "Stock inválido en una variante.";
      }
    }
    const variantImages = resolveVariantImageUrls(form.variants, idx);
    if (variantImages.length === 0) {
      return "Cada variante necesita al menos una imagen.";
    }
    if (variantImages.length > 10) {
      return "Máximo 10 imágenes por variante.";
    }
    if (requiresColor && !v.color.trim()) {
      return "Completa el color en cada variante.";
    }
    const skuNormalized = v.sku.trim().toLowerCase();
    if (skuNormalized) {
      if (seenSkus.has(skuNormalized)) {
        return "Cada variante debe tener un SKU único.";
      }
      seenSkus.add(skuNormalized);
    }
  }

  return null;
}

async function uploadImages(files: File[]) {
  const uploaded = await adminProductsActions.upload(files);
  const urls = uploaded.map((item) => item.url?.trim()).filter(Boolean) as string[];

  if (!urls.length) {
    throw new Error("La subida no devolvió URLs.");
  }

  return dedupeImageUrls(urls);
}

export async function uploadImagesSequentially(
  files: File[],
  {
    onUploaded,
    onPendingChange,
  }: {
    onUploaded: (urls: string[]) => void;
    onPendingChange?: (pending: number) => void;
  }
) {
  let pending = files.length;
  onPendingChange?.(pending);
  const failures: string[] = [];

  for (const file of files) {
    try {
      const urls = await uploadImages([file]);
      if (urls.length) {
        onUploaded(urls);
      } else {
        failures.push(`${file.name}: La subida no devolvió URLs.`);
      }
    } catch (error) {
      const reason = mapPanelError(error, "No se pudo subir la imagen.");
      failures.push(`${file.name}: ${reason}`);
    } finally {
      pending = Math.max(0, pending - 1);
      onPendingChange?.(pending);
    }
  }

  if (failures.length) {
    throw new Error(failures[0]);
  }
}

