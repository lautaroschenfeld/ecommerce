"use client";

import { useMemo } from "react";

import { toNumberOrUndefined } from "@/lib/format";
import { type ProductColorVariantInput } from "@/lib/product-color-summary";
import type { Product } from "@/lib/product";

import { ProductCard } from "@/components/products/product-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ProductCharacteristicsEditor } from "./products-admin-characteristics-editor";
import {
  mapProductToForm,
  uploadImagesSequentially,
  validateForm,
} from "./products-admin-form-utils";
import {
  APPAREL_GENDER_OPTIONS,
  APPAREL_SIZE_ALPHA_OPTIONS,
  APPAREL_SIZE_NUMERIC_OPTIONS,
  APPAREL_SIZE_OPTIONS,
  APPAREL_SIZE_ROWS,
  EMPTY_FORM,
  PRODUCTS_FILTER_STATUS_OPTIONS,
  PRODUCTS_LIST_RESTORE_ONCE_KEY,
  PRODUCTS_LIST_SNAPSHOT_KEY,
  PRODUCTS_PAGE_SIZE_OPTIONS,
  PRODUCTS_SORT_OPTIONS,
  applyCharacteristicHintsIfEmpty,
  applyGenderToAllVariants,
  buildCharacteristicHints,
  buildVariantHandle,
  bulkActionLabel,
  bulkActionSuccessMessage,
  bulkActionSuccessTitle,
  createEmptySizeStocks,
  dedupeImageUrls,
  generateGroupId,
  getActiveSizeEntries,
  mapPanelError,
  normalizeApparelGender,
  readSizeStocksFromMetadata,
  resolveDuplicateName,
  resolveFormApparelGender,
  resolveProductGroupKey,
  resolveVariantImageUrls,
  sanitizeMetadataForDuplicate,
  sanitizeSignedStockDeltaInput,
  sanitizeStockInput,
  slugifyHandlePart,
  syncSizeAndStockFromMap,
  toAdminCategory,
  toMetadataSizeStocks,
  toSizeStocks,
  withCategorySelection,
  type AdminCategory,
  type FormState,
  type ProductGroupEntry,
  type ProductsAdminMode,
  type ProductsAdminProps,
  type ProductsFilterStatus,
  type ProductsListSnapshot,
  type ProductsSortBy,
  type VariantForm,
} from "./products-admin-support-utils";
import styles from "./products-admin.module.css";

const requiredClass = styles.required;

function RequiredLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <Label htmlFor={htmlFor} className={requiredClass}>
      {children}
    </Label>
  );
}

function ProductCardLivePreview({ form }: { form: FormState }) {
  const previewVariantColors = useMemo<ProductColorVariantInput[]>(
    () =>
      form.variants.map((variant) => ({
        color: variant.color,
        soldQty: 0,
      })),
    [form.variants]
  );

  const previewProduct = useMemo<Product>(() => {
    const firstVariant = form.variants[0];
    const parsedPrice = toNumberOrUndefined(firstVariant?.price ?? "");
    const parsedStock = toNumberOrUndefined(firstVariant?.stock ?? "");
    const images = resolveVariantImageUrls(form.variants, 0);

    return {
      id: "preview",
      name: form.name.trim() || "Titulo del producto",
      brand: form.brand.trim() || "Marca",
      category: (form.category ?? "Motor") as Product["category"],
      priceArs: parsedPrice !== undefined && parsedPrice > 0 ? Math.round(parsedPrice) : 0,
      imageUrl: images[0],
      images,
      description: form.description.trim() || undefined,
      condition: firstVariant?.condition ?? "nuevo",
      color: firstVariant?.color?.trim() || undefined,
      size: firstVariant?.size?.trim() || undefined,
      gender: firstVariant?.gender ?? undefined,
      stockAvailable:
        parsedStock !== undefined && parsedStock >= 0 ? Math.trunc(parsedStock) : undefined,
      createdAt: 0,
    };
  }, [form]);

  return (
    <section className={styles.productCardPreview} aria-label="Vista previa del producto">
      <p className={styles.previewHeading}>Vista previa</p>
      <div className={styles.productCardPreviewCard}>
        <ProductCard
          product={previewProduct}
          variantColors={previewVariantColors}
          interactive={false}
        />
      </div>
    </section>
  );
}

function UploadingImagesFeedback({ pendingCount }: { pendingCount: number }) {
  if (pendingCount <= 0) return null;

  return (
    <>
      {Array.from({ length: pendingCount }).map((_, idx) => (
        <div
          key={`uploading-image-${idx}`}
          className={`${styles.imageTile} ${styles.imageTileUploading}`}
          aria-hidden="true"
        >
          <div className={styles.imageTileShimmer} />
        </div>
      ))}
    </>
  );
}

function ApparelSizeStockGridField({
  variant,
  busy,
  required = false,
  onVariantChange,
}: {
  variant: VariantForm;
  busy: boolean;
  required?: boolean;
  onVariantChange: (nextVariant: VariantForm) => void;
}) {
  const sizeStocks = toSizeStocks(variant.sizeStocks, variant.size, variant.stock);

  const updateSizeStock = (size: string, stockValue: string) => {
    const nextSizeStocks = {
      ...sizeStocks,
      [size]: stockValue,
    };

    onVariantChange(syncSizeAndStockFromMap(variant, nextSizeStocks));
  };

  return (
    <div className={`${styles.field} ${styles.span2}`}>
      {required ? <RequiredLabel>Talles y stock</RequiredLabel> : <Label>Talles y stock</Label>}

      <div className={styles.sizeStocksRows}>
        {APPAREL_SIZE_ROWS.map((row, rowIdx) => (
          <div
            key={`size-stock-row-${rowIdx}`}
            className={styles.sizeStocksRow}
            aria-label={rowIdx === 0 ? "Talles de letras" : "Talles numericos"}
          >
            {row.map((size) => {
              const parsed = toNumberOrUndefined(sizeStocks[size] ?? "0");
              const isActive = parsed !== undefined && parsed > 0;
              const stockValue = isActive ? String(Math.trunc(parsed)) : "0";

              return (
                <div key={size} className={styles.sizeStockItem}>
                  <button
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => updateSizeStock(size, isActive ? "0" : "1")}
                    disabled={busy}
                    className={`${styles.sizeBadgeButton} ${
                      isActive ? styles.sizeBadgeButtonActive : ""
                    }`}
                  >
                    {size}
                  </button>

                  <Input
                    inputMode="numeric"
                    value={stockValue}
                    onChange={(e) => {
                      const raw = sanitizeStockInput(e.target.value);
                      updateSizeStock(size, raw ? String(Math.max(1, Math.trunc(Number(raw)))) : "1");
                    }}
                    disabled={busy || !isActive}
                    className={!isActive ? styles.sizeStockInputDisabled : undefined}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className={styles.sizeStockHint}>
        Activa cada talle para habilitar su stock. Al activarlo, pasa de 0 a 1.
      </p>
    </div>
  );
}

export type {
  AdminCategory,
  FormState,
  ProductGroupEntry,
  ProductsAdminMode,
  ProductsAdminProps,
  ProductsFilterStatus,
  ProductsListSnapshot,
  ProductsSortBy,
  VariantForm,
};

export {
  APPAREL_GENDER_OPTIONS,
  APPAREL_SIZE_ALPHA_OPTIONS,
  APPAREL_SIZE_NUMERIC_OPTIONS,
  APPAREL_SIZE_OPTIONS,
  APPAREL_SIZE_ROWS,
  EMPTY_FORM,
  PRODUCTS_FILTER_STATUS_OPTIONS,
  PRODUCTS_LIST_RESTORE_ONCE_KEY,
  PRODUCTS_LIST_SNAPSHOT_KEY,
  PRODUCTS_PAGE_SIZE_OPTIONS,
  PRODUCTS_SORT_OPTIONS,
  ApparelSizeStockGridField,
  ProductCardLivePreview,
  ProductCharacteristicsEditor,
  RequiredLabel,
  UploadingImagesFeedback,
  applyCharacteristicHintsIfEmpty,
  applyGenderToAllVariants,
  buildCharacteristicHints,
  buildVariantHandle,
  bulkActionLabel,
  bulkActionSuccessMessage,
  bulkActionSuccessTitle,
  createEmptySizeStocks,
  dedupeImageUrls,
  generateGroupId,
  getActiveSizeEntries,
  mapPanelError,
  mapProductToForm,
  normalizeApparelGender,
  readSizeStocksFromMetadata,
  resolveDuplicateName,
  resolveFormApparelGender,
  resolveProductGroupKey,
  resolveVariantImageUrls,
  sanitizeMetadataForDuplicate,
  sanitizeSignedStockDeltaInput,
  sanitizeStockInput,
  slugifyHandlePart,
  toAdminCategory,
  toMetadataSizeStocks,
  toSizeStocks,
  uploadImagesSequentially,
  validateForm,
  withCategorySelection,
};

