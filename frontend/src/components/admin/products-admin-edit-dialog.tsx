"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown, Pencil } from "lucide-react";

import { PRIMARY_CATEGORIES } from "@/lib/catalog";
import { toNumberOrUndefined } from "@/lib/format";
import {
  serializeProductCharacteristicsForMetadata,
} from "@/lib/product-characteristics";
import { adminProductsActions } from "@/lib/store-admin-products";
import type { AdminProduct } from "@/lib/store-mappers";
import {
  resolveVariantColorOptions,
  resolveVariantColorSwatch,
} from "@/lib/variant-colors";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ColorSwatchSelector } from "@/components/ui/color-swatch-selector";
import { FilePicker } from "@/components/ui/file-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  APPAREL_GENDER_OPTIONS,
  applyGenderToAllVariants,
  buildCharacteristicHints,
  buildVariantHandle,
  dedupeImageUrls,
  getActiveSizeEntries,
  mapPanelError,
  normalizeApparelGender,
  resolveFormApparelGender,
  resolveVariantImageUrls,
  sanitizeStockInput,
  toAdminCategory,
  toMetadataSizeStocks,
  toSizeStocks,
  withCategorySelection,
  type FormState,
  type VariantForm,
} from "./products-admin-support-utils";
import {
  ApparelSizeStockGridField,
  ProductCardLivePreview,
  ProductCharacteristicsEditor,
  UploadingImagesFeedback,
  applyCharacteristicHintsIfEmpty,
  mapProductToForm,
  uploadImagesSequentially,
  validateForm,
} from "./products-admin-support";
import { loadEditDialogState } from "./products-admin-edit-dialog-loader";
import styles from "./products-admin.module.css";
export function EditProductDialog({
  product,
  allProducts,
  autoOpen = false,
  onDialogOpenChange,
  showTrigger = true,
}: {
  product: AdminProduct;
  allProducts: AdminProduct[];
  autoOpen?: boolean;
  onDialogOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => mapProductToForm(product));
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingEditUploads, setPendingEditUploads] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [existingIds, setExistingIds] = useState<string[]>([]);
  const [variantGroupId, setVariantGroupId] = useState<string>("");
  const [characteristicsCollapsed, setCharacteristicsCollapsed] = useState(true);
  const primaryColor = form.variants[0]?.color;
  const closeLocked = saving || pendingEditUploads > 0;
  const saveButtonLabel = saving ? "Guardando..." : "Guardar cambios";

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean, options?: { force?: boolean }) => {
      if (!nextOpen && closeLocked && !options?.force) return;
      setOpen(nextOpen);
      onDialogOpenChange?.(nextOpen);
    },
    [closeLocked, onDialogOpenChange]
  );

  useEffect(() => {
    setForm((prev) => {
      const nextCharacteristics = applyCharacteristicHintsIfEmpty(
        prev.characteristics,
        buildCharacteristicHints({
          brand: prev.brand,
          name: prev.name,
          color: prev.variants[0]?.color,
        })
      );
      if (nextCharacteristics === prev.characteristics) return prev;
      return {
        ...prev,
        characteristics: nextCharacteristics,
      };
    });
  }, [form.brand, form.name, primaryColor]);

  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!open) return;

    setForm(mapProductToForm(product));
    setError(null);
    setPendingEditUploads(0);
    setCharacteristicsCollapsed(true);
    setBusy(true);

    let cancelled = false;

    const groupId = product.variantGroupId || product.id;
    setVariantGroupId(groupId);

    void loadEditDialogState(product, allProducts)
      .then((loaded) => {
        if (cancelled) return;
        setExistingIds(loaded.existingIds);
        setForm((prev) => loaded.buildNextForm(prev));
        setVariantGroupId(loaded.variantGroupId);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(mapPanelError(e, "No se pudo cargar el producto."));
      })
      .finally(() => {
        if (cancelled) return;
        setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [allProducts, open, product]);

  async function uploadImageFromInput(files: File[]) {
    if (!files.length) return;

    try {
      setBusy(true);
      setError(null);
      await uploadImagesSequentially(files, {
        onPendingChange: setPendingEditUploads,
        onUploaded: (urls) =>
          setForm((prev) => ({
            ...prev,
            variants: prev.variants.map((v, idx) =>
              idx === 0
                ? { ...v, imageUrls: dedupeImageUrls([...v.imageUrls, ...urls]) }
                : v
            ),
          })),
      });
    } catch (e) {
      setError(mapPanelError(e, "No se pudo subir la imagen."));
    } finally {
      setPendingEditUploads(0);
      setBusy(false);
    }
  }

  async function save() {
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setBusy(true);
      setSaving(true);
      setError(null);

      const groupId = variantGroupId || product.variantGroupId || product.id;
      if (groupId && !variantGroupId) setVariantGroupId(groupId);
      const handleSeed = Date.now().toString(36);
      let handleIndex = 0;
      const characteristicsPayload = serializeProductCharacteristicsForMetadata(
        form.characteristics
      );
      const variants = form.variants.map((variant, variantIndex) => {
        const variantImages = resolveVariantImageUrls(form.variants, variantIndex);
        const parsedPrice = toNumberOrUndefined(variant.price);
        const parsedCost = toNumberOrUndefined(variant.cost);
        if (parsedPrice === undefined) {
          throw new Error("Completa precio y stock en todas las variantes.");
        }
        if (parsedCost === undefined || parsedCost < 0) {
          throw new Error("Completa costo en todas las variantes.");
        }

        if (form.category === "Indumentaria") {
          const sizeStocks = toSizeStocks(
            variant.sizeStocks,
            variant.size,
            variant.stock
          );
          const activeSizes = getActiveSizeEntries(sizeStocks);
          if (activeSizes.length === 0) {
            throw new Error("Activa al menos un talle para guardar.");
          }

          const stockTotal = activeSizes.reduce((acc, item) => acc + item.stock, 0);
          const primarySize = activeSizes[0]?.size ?? "";
          return {
            ...(variant.id ? { id: variant.id } : {}),
            name: form.name.trim(),
            brand: form.brand.trim(),
            category: form.category!,
            priceArs: parsedPrice,
            costArs: Math.max(0, Math.round(parsedCost)),
            stockAvailable: stockTotal,
            ...(variant.id
              ? {}
              : {
                  handle: buildVariantHandle(
                    form.name,
                    variant.color,
                    primarySize || variant.condition,
                    handleSeed,
                    handleIndex++
                  ),
                }),
            sku: variant.sku.trim() || undefined,
            active: variant.active,
            description: form.description.trim() || undefined,
            images: variantImages,
            metadata: {
              condition: variant.condition,
              color: variant.color,
              size: primarySize,
              size_stocks: toMetadataSizeStocks(sizeStocks),
              gender: variant.gender,
              ...(groupId ? { group_id: groupId } : {}),
              characteristics: characteristicsPayload,
            },
          };
        }

        const parsedStock = toNumberOrUndefined(variant.stock);
        if (parsedStock === undefined) {
          throw new Error("Completa precio y stock en todas las variantes.");
        }

        return {
          ...(variant.id ? { id: variant.id } : {}),
          name: form.name.trim(),
          brand: form.brand.trim(),
          category: form.category!,
          priceArs: parsedPrice,
          costArs: Math.max(0, Math.round(parsedCost)),
          stockAvailable: Math.trunc(parsedStock),
          ...(variant.id
            ? {}
            : {
                handle: buildVariantHandle(
                  form.name,
                  variant.color,
                  variant.size,
                  handleSeed,
                  handleIndex++
                ),
              }),
          sku: variant.sku.trim() || undefined,
          active: variant.active,
          description: form.description.trim() || undefined,
          images: variantImages,
          metadata: {
            condition: variant.condition,
            color: variant.color,
            size: variant.size,
            ...(groupId ? { group_id: groupId } : {}),
            characteristics: characteristicsPayload,
          },
        };
      });

      const synced = await adminProductsActions.syncGroup({
        anchorProductId: product.id,
        expectedExistingProductIds: existingIds,
        variants,
      });
      if (synced.groupId) {
        setVariantGroupId(synced.groupId);
      }
      if (synced.productIds.length) {
        setExistingIds(synced.productIds);
      }

      handleDialogOpenChange(false, { force: true });
    } catch (e) {
      setError(mapPanelError(e, "No se pudo guardar el producto."));
    } finally {
      setSaving(false);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        handleDialogOpenChange(nextOpen);
      }}
    >
      {showTrigger ? (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil size={16} />
            Editar
          </Button>
        </DialogTrigger>
      ) : null}

      <DialogContent className={styles.dialogWide} dismissible={!closeLocked}>
        <DialogHeader>
          <DialogTitle>Editar producto</DialogTitle>
          <DialogDescription>
            Actualiza datos, imagen y estado de publicacion.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.formGrid}>
          <div className={styles.field}>
            <Label htmlFor={`edit_name_${product.id}`}>Nombre</Label>
            <Input
              id={`edit_name_${product.id}`}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              disabled={busy}
            />
          </div>

          <div className={styles.field}>
            <Label htmlFor={`edit_brand_${product.id}`}>Marca</Label>
            <Input
              id={`edit_brand_${product.id}`}
              value={form.brand}
              onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))}
              disabled={busy}
            />
          </div>

          <div className={styles.field}>
            <Label>Categoría</Label>
            <Select
              value={form.category ?? ""}
              onChange={(e) =>
                setForm((prev) => withCategorySelection(prev, toAdminCategory(e.target.value)))
              }
              disabled={busy}
            >
              <option value="" disabled>
                Elige una categoría
              </option>
              {PRIMARY_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>

          {form.category === "Indumentaria" ? (
            <div className={styles.field}>
              <Label htmlFor={`edit_gender_${product.id}`}>Genero</Label>
              <Select
                id={`edit_gender_${product.id}`}
                value={resolveFormApparelGender(form)}
                onChange={(e) =>
                  setForm((prev) =>
                    applyGenderToAllVariants(prev, normalizeApparelGender(e.target.value))
                  )
                }
                disabled={busy}
              >
                {APPAREL_GENDER_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {(() => {
            const variant = form.variants[0];
            const showColorVariant = form.category === "Indumentaria" || form.variants.length > 1;
            return (
              <>
                {showColorVariant ? (
                  <div className={styles.field}>
                    <Label>Color</Label>
                    <ColorSwatchSelector
                      ariaLabel="Selecciona color de variante"
                      size="md"
                      value={variant.color}
                      options={resolveVariantColorOptions(variant.color).map((item) => ({
                        ...item,
                        swatch: resolveVariantColorSwatch(item.value),
                      }))}
                      onChange={(nextColor) =>
                        setForm((prev) => ({
                          ...prev,
                          variants: prev.variants.map((v, i) =>
                            i === 0 ? { ...v, color: nextColor } : v
                          ),
                        }))
                      }
                      disabled={busy}
                    />
                  </div>
                ) : null}

                <div className={styles.field}>
                  <Label htmlFor={`edit_condition_${product.id}`}>Condición</Label>
                  <Select
                    id={`edit_condition_${product.id}`}
                    value={variant.condition}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        variants: prev.variants.map((v, i) =>
                          i === 0
                            ? { ...v, condition: e.target.value as VariantForm["condition"] }
                            : v
                        ),
                      }))
                    }
                    disabled={busy}
                  >
                    <option value="nuevo">Nuevo</option>
                    <option value="reacondicionado">Reacondicionado</option>
                    <option value="usado">Usado</option>
                  </Select>
                </div>

                <div className={styles.field}>
                  <Label htmlFor={`edit_price_${product.id}`}>Precio</Label>
                  <Input
                    id={`edit_price_${product.id}`}
                    inputMode="numeric"
                    value={variant.price}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        variants: prev.variants.map((v, i) =>
                          i === 0 ? { ...v, price: e.target.value } : v
                        ),
                      }))
                    }
                    disabled={busy}
                  />
                </div>

                <div className={styles.field}>
                  <Label htmlFor={`edit_cost_${product.id}`}>Costo</Label>
                  <Input
                    id={`edit_cost_${product.id}`}
                    inputMode="numeric"
                    value={variant.cost}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        variants: prev.variants.map((v, i) =>
                          i === 0 ? { ...v, cost: e.target.value.replace(/[^0-9]/g, "") } : v
                        ),
                      }))
                    }
                    disabled={busy}
                  />
                </div>

                {form.category === "Indumentaria" ? (
                  <ApparelSizeStockGridField
                    variant={variant}
                    busy={busy}
                    onVariantChange={(nextVariant) =>
                      setForm((prev) => ({
                        ...prev,
                        variants: prev.variants.map((v, i) =>
                          i === 0 ? nextVariant : v
                        ),
                      }))
                    }
                  />
                ) : (
                  <div className={styles.field}>
                    <Label htmlFor={`edit_stock_${product.id}`}>Stock disponible</Label>
                    <Input
                      id={`edit_stock_${product.id}`}
                      inputMode="numeric"
                      value={variant.stock}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          variants: prev.variants.map((v, i) =>
                            i === 0 ? { ...v, stock: sanitizeStockInput(e.target.value) } : v
                          ),
                        }))
                      }
                      disabled={busy}
                    />
                  </div>
                )}

                <div className={styles.field}>
                  <Label htmlFor={`edit_sku_${product.id}`}>SKU (opcional)</Label>
                  <Input
                    id={`edit_sku_${product.id}`}
                    value={variant.sku}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        variants: prev.variants.map((v, i) =>
                          i === 0 ? { ...v, sku: e.target.value } : v
                        ),
                      }))
                    }
                    disabled={busy}
                  />
                </div>

                <div className={styles.checkboxRow}>
                  <Checkbox
                    id={`edit_active_${product.id}`}
                    checked={variant.active}
                    onCheckedChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        variants: prev.variants.map((v, i) =>
                          i === 0 ? { ...v, active: value === true } : v
                        ),
                      }))
                    }
                    disabled={busy}
                  />
                  <Label htmlFor={`edit_active_${product.id}`}>Publicado</Label>
                </div>
              </>
            );
          })()}

          <div className={`${styles.field} ${styles.span2}`}>
            <Label htmlFor={`edit_desc_${product.id}`}>Descripción</Label>
            <Textarea
              id={`edit_desc_${product.id}`}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className={styles.textareaTall}
              disabled={busy}
            />
          </div>

          <div className={`${styles.field} ${styles.span2}`}>
            <button
              type="button"
              className={styles.collapsibleToggle}
              onClick={() => setCharacteristicsCollapsed((prev) => !prev)}
              aria-expanded={!characteristicsCollapsed}
              aria-controls={`edit_characteristics_panel_${product.id}`}
            >
              <span className={styles.collapsibleToggleTitle}>Caracteristicas</span>
              <ChevronDown
                size={16}
                className={`${styles.collapsibleToggleIcon} ${
                  !characteristicsCollapsed ? styles.collapsibleToggleIconOpen : ""
                }`}
              />
            </button>
            {!characteristicsCollapsed ? (
              <div
                id={`edit_characteristics_panel_${product.id}`}
                className={styles.collapsibleBody}
              >
                <ProductCharacteristicsEditor
                  items={form.characteristics}
                  busy={busy}
                  onChange={(next) =>
                    setForm((prev) => ({
                      ...prev,
                      characteristics: next,
                    }))
                  }
                />
              </div>
            ) : null}
          </div>

          <div className={`${styles.field} ${styles.span2}`}>
            <Label htmlFor={`edit_image_file_${product.id}`}>Imagenes</Label>
            <FilePicker
              id={`edit_image_file_${product.id}`}
              accept="image/*"
              multiple
              placeholder="Subir imágenes"
              onFiles={(files) => void uploadImageFromInput(files)}
              disabled={busy}
            />
          </div>

          {(() => {
            const variant = form.variants[0];
            return (
              <div className={`${styles.field} ${styles.span2}`}>
                {variant.imageUrls.length === 0 && pendingEditUploads === 0 ? (
                  <p className={styles.muted}>Aun no hay imagenes cargadas.</p>
                ) : (
                  <div className={styles.imagesGrid}>
                    {variant.imageUrls.map((url, idx) => (
                      <div key={`${url}-${idx}`} className={styles.imageTile}>
                        <Image
                          src={url}
                          alt={`Imagen ${idx + 1}`}
                          fill
                          loading="lazy"
                          sizes="(max-width: 900px) 44vw, 15rem"
                        />
                        <div className={styles.imageOverlay}>
                          <span className={styles.imageTag}>
                            {idx === 0 ? "Principal" : `Imagen ${idx + 1}`}
                          </span>
                          <button
                            type="button"
                            className={styles.imageRemoveButton}
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                variants: prev.variants.map((v, i) =>
                                  i === 0
                                    ? { ...v, imageUrls: v.imageUrls.filter((_, imageIdx) => imageIdx !== idx) }
                                    : v
                                ),
                              }))
                            }
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    ))}
                    {pendingEditUploads > 0 ? (
                      <UploadingImagesFeedback pendingCount={pendingEditUploads} />
                    ) : null}
                  </div>
                )}
              </div>
            );
          })()}

          <div className={`${styles.field} ${styles.span2}`}>
            <ProductCardLivePreview form={form} />
          </div>
        </div>

        {error ? <div className={styles.dangerBox}>{error}</div> : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleDialogOpenChange(false)}
            disabled={closeLocked}
          >
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {saveButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



