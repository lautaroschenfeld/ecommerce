"use client";
/* eslint-disable @next/next/no-img-element */

import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, Plus, X } from "lucide-react";

import { PRIMARY_CATEGORIES } from "@/lib/catalog";
import { resolveVariantColorOptions, resolveVariantColorSwatch } from "@/lib/variant-colors";

import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { Button } from "@/components/ui/button";
import { ColorSwatchSelector } from "@/components/ui/color-swatch-selector";
import { FilePicker } from "@/components/ui/file-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  APPAREL_GENDER_OPTIONS,
  ApparelSizeStockGridField,
  ProductCardLivePreview,
  ProductCharacteristicsEditor,
  RequiredLabel,
  UploadingImagesFeedback,
  applyGenderToAllVariants,
  createEmptySizeStocks,
  dedupeImageUrls,
  normalizeApparelGender,
  resolveFormApparelGender,
  sanitizeStockInput,
  toAdminCategory,
  type FormState,
  type VariantForm,
  withCategorySelection,
} from "./products-admin-support";
import styles from "./products-admin.module.css";

type ProductsAdminCreateSectionProps = {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  busy: boolean;
  uploadingImage: boolean;
  uploadingVariantIndex: number | null;
  pendingVariantUploads: number;
  error: string | null;
  loadError: string | null;
  createCharacteristicsCollapsed: boolean;
  setCreateCharacteristicsCollapsed: Dispatch<SetStateAction<boolean>>;
  addProduct: () => Promise<void> | void;
  uploadVariantImages: (variantIndex: number, files: File[]) => Promise<void> | void;
  isApparel: boolean;
  requiresColor: boolean;
  baseVariant: FormState["variants"][number];
  apparelStockTotal: number;
  categorySpan: string;
};

export function ProductsAdminCreateSection({
  form,
  setForm,
  busy,
  uploadingImage,
  uploadingVariantIndex,
  pendingVariantUploads,
  error,
  loadError,
  createCharacteristicsCollapsed,
  setCreateCharacteristicsCollapsed,
  addProduct,
  uploadVariantImages,
  isApparel,
  requiresColor,
  baseVariant,
  apparelStockTotal,
  categorySpan,
}: ProductsAdminCreateSectionProps) {
  return (
    <section
      id="crear-producto"
      className={styles.createRow}
      aria-label="Crear producto"
    >
      <AdminPanelCard
        title="Crear nuevo producto"
        subtitle="Carga identidad, variantes e imágenes desde el mismo flujo del panel."
        className={styles.card}
        bodyClassName={styles.createCardBody}
      >
          <form
            className={styles.createFormGrid}
            onSubmit={(e) => {
              e.preventDefault();
              void addProduct();
            }}
           >
            <div className={`${styles.field} ${styles.createSpanHalf}`}>
              <RequiredLabel htmlFor="name">Nombre</RequiredLabel>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Aceite Street Race"
                disabled={busy}
              />
            </div>

            <div className={`${styles.field} ${styles.createSpanHalf}`}>
              <RequiredLabel htmlFor="brand">Marca</RequiredLabel>
              <Input
                id="brand"
                value={form.brand}
                onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))}
                placeholder="Liqui Moly"
                disabled={busy}
              />
            </div>

            <div className={`${styles.field} ${styles.createSpanThird}`}>
              <RequiredLabel htmlFor="price">Precio</RequiredLabel>
              <Input
                id="price"
                inputMode="numeric"
                value={baseVariant.price}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    variants: prev.variants.map((v, i) =>
                      i === 0 ? { ...v, price: e.target.value.replace(/[^0-9]/g, "") } : v
                    ),
                  }))
                }
                disabled={busy}
              />
            </div>

            <div className={`${styles.field} ${styles.createSpanThird}`}>
              <RequiredLabel htmlFor="cost">Costo</RequiredLabel>
              <Input
                id="cost"
                inputMode="numeric"
                value={baseVariant.cost}
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

            <div className={`${styles.field} ${styles.createSpanThird}`}>
              <RequiredLabel htmlFor="stock">Stock</RequiredLabel>
              <Input
                id="stock"
                inputMode="numeric"
                value={isApparel ? String(apparelStockTotal) : baseVariant.stock}
                onChange={
                  isApparel
                    ? undefined
                    : (e) =>
                        setForm((prev) => ({
                          ...prev,
                          variants: prev.variants.map((v, i) =>
                            i === 0
                              ? { ...v, stock: sanitizeStockInput(e.target.value) }
                              : v
                          ),
                        }))
                }
                disabled={busy || isApparel}
              />
            </div>

            <div className={`${styles.field} ${styles.createSpanThird}`}>
              <RequiredLabel htmlFor="condition">Condición</RequiredLabel>
              <Select
                id="condition"
                value={baseVariant.condition}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    variants: prev.variants.map((v, i) =>
                      i === 0
                        ? {
                            ...v,
                            condition: e.target.value as VariantForm["condition"],
                          }
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

            <div className={`${styles.field} ${categorySpan}`}>
              <RequiredLabel htmlFor="category">Categoría</RequiredLabel>
              <Select
                id="category"
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

            {isApparel ? (
              <div className={`${styles.field} ${styles.createSpanHalf}`}>
                <RequiredLabel htmlFor="gender">Género</RequiredLabel>
                <Select
                  id="gender"
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

            <div className={`${styles.field} ${styles.createSpanFull}`}>
              <RequiredLabel>Imágenes</RequiredLabel>
              <FilePicker
                accept="image/*"
                multiple
                disabled={busy || uploadingImage}
                placeholder="Subir imágenes"
                onFiles={(files) => {
                  if (!files.length) return;
                  void uploadVariantImages(0, files);
                }}
              />
              <div className={styles.imagesGrid}>
                {baseVariant.imageUrls.map((url, imageIdx) => (
                  <div key={`${url}-${imageIdx}`} className={styles.imageTile}>
                    <img
                      src={url}
                      alt={`Imagen ${imageIdx + 1}`}
                      loading="lazy"
                      decoding="async"
                    />
                    <div className={styles.imageOverlay}>
                      <span className={styles.imageTag}>
                        {imageIdx === 0 ? "Principal" : `Imagen ${imageIdx + 1}`}
                      </span>
                      <button
                        type="button"
                        className={styles.imageRemoveButton}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            variants: prev.variants.map((v, i) =>
                              i === 0
                                ? {
                                    ...v,
                                    imageUrls: v.imageUrls.filter((_, ii) => ii !== imageIdx),
                                  }
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
                {uploadingImage &&
                uploadingVariantIndex === 0 &&
                pendingVariantUploads > 0 ? (
                  <UploadingImagesFeedback pendingCount={pendingVariantUploads} />
                ) : null}
              </div>
            </div>

            <div className={`${styles.field} ${styles.createSpanFull}`}>
              <Label htmlFor="sku">SKU (opcional)</Label>
              <Input
                id="sku"
                value={baseVariant.sku}
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

            <div className={`${styles.field} ${styles.createSpanFull}`}>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className={styles.textareaTall}
                disabled={busy}
              />
            </div>

            <div className={`${styles.field} ${styles.createSpanFull}`}>
              <button
                type="button"
                className={styles.collapsibleToggle}
                onClick={() => setCreateCharacteristicsCollapsed((prev) => !prev)}
                aria-expanded={!createCharacteristicsCollapsed}
                aria-controls="create_characteristics_panel"
              >
                <span className={styles.collapsibleToggleTitle}>Caracteristicas</span>
                <ChevronDown
                  size={16}
                  className={`${styles.collapsibleToggleIcon} ${
                    !createCharacteristicsCollapsed ? styles.collapsibleToggleIconOpen : ""
                  }`}
                />
              </button>
              {!createCharacteristicsCollapsed ? (
                <div id="create_characteristics_panel" className={styles.collapsibleBody}>
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

            <div className={`${styles.field} ${styles.createSpanFull}`}>
              <Label>Variantes</Label>

              {requiresColor ? (
                <div className={styles.variantGrid}>
                  <div>
                    <RequiredLabel>Color</RequiredLabel>
                    <ColorSwatchSelector
                      ariaLabel="Selecciona color de producto"
                      size="md"
                      value={baseVariant.color}
                      options={resolveVariantColorOptions(baseVariant.color).map((item) => ({
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
                </div>
              ) : null}

              {isApparel ? (
                <ApparelSizeStockGridField
                  variant={baseVariant}
                  busy={busy}
                  required
                  onVariantChange={(nextVariant) =>
                    setForm((prev) => ({
                      ...prev,
                      variants: prev.variants.map((v, i) => (i === 0 ? nextVariant : v)),
                    }))
                  }
                />
              ) : null}

              {form.variants.length > 1 ? (
                <div className={styles.variantList}>
                  {form.variants.slice(1).map((variant, offset) => {
                    const idx = offset + 1;
                    return (
                      <div key={idx} className={styles.variantCard}>
                        <div className={styles.variantCardHeader}>
                          <p className={styles.variantDividerLabel}>Variante {idx + 1}</p>
                          <button
                            type="button"
                            className={styles.variantRemoveIcon}
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                variants: prev.variants.filter((_, i) => i !== idx),
                              }))
                            }
                            disabled={busy}
                            aria-label={`Eliminar variante ${idx + 1}`}
                            title="Eliminar variante"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <div className={styles.variantGrid}>
                          <div>
                            <RequiredLabel>Color</RequiredLabel>
                            <ColorSwatchSelector
                              ariaLabel={`Selecciona color de variante ${idx + 1}`}
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
                                    i === idx ? { ...v, color: nextColor } : v
                                  ),
                                }))
                              }
                              disabled={busy}
                            />
                          </div>

                          <div>
                            <RequiredLabel>Condición</RequiredLabel>
                            <Select
                              value={variant.condition}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  variants: prev.variants.map((v, i) =>
                                    i === idx
                                      ? {
                                          ...v,
                                          condition: e.target.value as VariantForm["condition"],
                                        }
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

                                  <div>
                                    <RequiredLabel>Precio</RequiredLabel>
                                    <Input
                                      inputMode="numeric"
                                      value={variant.price}
                                      onChange={(e) =>
                                        setForm((prev) => ({
                                          ...prev,
                                          variants: prev.variants.map((v, i) =>
                                            i === idx
                                              ? {
                                                  ...v,
                                                  price: e.target.value.replace(/[^0-9]/g, ""),
                                                }
                                              : v
                                          ),
                                        }))
                                      }
                                      disabled={busy}
                                    />
                                  </div>

                                  <div>
                                    <RequiredLabel>Costo</RequiredLabel>
                                    <Input
                                      inputMode="numeric"
                                      value={variant.cost}
                                      onChange={(e) =>
                                        setForm((prev) => ({
                                          ...prev,
                                          variants: prev.variants.map((v, i) =>
                                            i === idx
                                              ? {
                                                  ...v,
                                                  cost: e.target.value.replace(/[^0-9]/g, ""),
                                                }
                                              : v
                                          ),
                                        }))
                                      }
                                      disabled={busy}
                                    />
                                  </div>

                          {isApparel ? (
                            <ApparelSizeStockGridField
                              variant={variant}
                              busy={busy}
                              required
                              onVariantChange={(nextVariant) =>
                                setForm((prev) => ({
                                  ...prev,
                                  variants: prev.variants.map((v, i) =>
                                    i === idx ? nextVariant : v
                                  ),
                                }))
                              }
                            />
                          ) : (
                            <div>
                              <RequiredLabel>Stock</RequiredLabel>
                              <Input
                                inputMode="numeric"
                                value={variant.stock}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    variants: prev.variants.map((v, i) =>
                                      i === idx
                                        ? {
                                            ...v,
                                            stock: sanitizeStockInput(e.target.value),
                                          }
                                        : v
                                    ),
                                  }))
                                }
                                disabled={busy}
                              />
                            </div>
                          )}

                          <div>
                            <Label>SKU (opcional)</Label>
                            <Input
                              value={variant.sku}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  variants: prev.variants.map((v, i) =>
                                    i === idx ? { ...v, sku: e.target.value } : v
                                  ),
                                }))
                              }
                              disabled={busy}
                            />
                          </div>

                          <div className={styles.span2}>
                            <RequiredLabel>Imágenes</RequiredLabel>
                            <FilePicker
                              accept="image/*"
                              multiple
                              disabled={busy || uploadingImage}
                              placeholder="Subir imágenes"
                              onFiles={(files) => {
                                if (!files.length) return;
                                void uploadVariantImages(idx, files);
                              }}
                            />
                            <div className={styles.imagesGrid}>
                              {variant.imageUrls.map((url, imageIdx) => (
                                <div key={`${url}-${imageIdx}`} className={styles.imageTile}>
                                  <img
                                    src={url}
                                    alt={`Imagen ${imageIdx + 1}`}
                                    loading="lazy"
                                    decoding="async"
                                  />
                                  <div className={styles.imageOverlay}>
                                    <span className={styles.imageTag}>
                                      {imageIdx === 0 ? "Principal" : `Imagen ${imageIdx + 1}`}
                                    </span>
                                    <button
                                      type="button"
                                      className={styles.imageRemoveButton}
                                      onClick={() =>
                                        setForm((prev) => ({
                                          ...prev,
                                          variants: prev.variants.map((v, i) =>
                                            i === idx
                                              ? {
                                                  ...v,
                                                  imageUrls: v.imageUrls.filter((_, ii) => ii !== imageIdx),
                                                }
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
                              {uploadingImage &&
                              uploadingVariantIndex === idx &&
                              pendingVariantUploads > 0 ? (
                                <UploadingImagesFeedback pendingCount={pendingVariantUploads} />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setForm((prev) => {
                    const nextIsApparel = prev.category === "Indumentaria";
                    return {
                      ...prev,
                      variants: [
                        ...prev.variants,
                        {
                          color: "",
                          size: "",
                          gender: normalizeApparelGender(prev.variants[0]?.gender),
                          condition: prev.variants[0]?.condition ?? "nuevo",
                          price: prev.variants[0]?.price ?? "",
                          cost: prev.variants[0]?.cost ?? "",
                          stock: nextIsApparel ? "0" : prev.variants[0]?.stock || "1",
                          sizeStocks: createEmptySizeStocks(),
                          sku: "",
                          imageUrls: dedupeImageUrls(prev.variants[0]?.imageUrls ?? []),
                          active: true,
                        },
                      ],
                    };
                  })
                }
                disabled={busy}
              >
                <Plus size={16} />
                Agregar variante
              </Button>
            </div>

            {error ? (
              <div className={`${styles.createSpanFull} ${styles.dangerBox}`}>{error}</div>
            ) : null}
            {loadError ? (
              <div className={`${styles.createSpanFull} ${styles.dangerBox}`}>{loadError}</div>
            ) : null}

            <div className={`${styles.createSpanFull} ${styles.countRow}`}>
              <Button type="submit" disabled={busy || uploadingImage}>
                <Plus size={16} />
                {busy
                  ? "Guardando..."
                  : form.variants.length > 1
                    ? "Agregar productos"
                    : "Agregar producto"}
              </Button>
            </div>
          </form>
      </AdminPanelCard>

      <aside className={styles.createPreview}>
        <ProductCardLivePreview form={form} />
      </aside>
    </section>
  );
}
