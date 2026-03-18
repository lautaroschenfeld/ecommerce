"use client";

import Image from "next/image";
import { Check, ChevronDown } from "lucide-react";

import { formatMoney } from "@/lib/format";
import { resolveProductColorSummary } from "@/lib/product-color-summary";
import type { AdminProduct } from "@/lib/store-mappers";
import { resolveVariantColorSwatch } from "@/lib/variant-colors";

import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { Badge } from "@/components/ui/badge";
import { CssVarElement } from "@/components/ui/css-var-element";
import { EntityActionsMenu } from "./products-admin-entity-actions-menu";
import { EditProductDialog } from "./products-admin-edit-dialog";
import {
  ADMIN_PRODUCTS_EMPTY_STATE_MESSAGES,
  resolveAdminEmptyStateMessage,
} from "./admin-empty-state-utils";
import { type ProductGroupEntry } from "./products-admin-support-utils";
import styles from "./products-admin.module.css";

export function ProductGroupCards({
  groupedFiltered,
  expandedGroups,
  selectedGroups,
  openActionsGroupKey,
  openActionsVariantId,
  pendingAutoEditVariantId,
  duplicatingGroupKey,
  deletingGroupKey,
  deletingVariantId,
  addingVariantGroupKey,
  bulkBusy,
  bulkRunning,
  products,
  onToggleGroupSelection,
  onToggleGroupOpen,
  onAddVariantToGroup,
  onDuplicateGroup,
  onDeleteGroup,
  onDeleteVariantFromGroup,
  onOpenActionsGroupChange,
  onOpenActionsVariantChange,
  onPendingAutoEditVariantIdChange,
}: {
  groupedFiltered: ProductGroupEntry[];
  expandedGroups: Record<string, boolean>;
  selectedGroups: Record<string, boolean>;
  openActionsGroupKey: string | null;
  openActionsVariantId: string | null;
  pendingAutoEditVariantId: string | null;
  duplicatingGroupKey: string | null;
  deletingGroupKey: string | null;
  deletingVariantId: string | null;
  addingVariantGroupKey: string | null;
  bulkBusy: boolean;
  bulkRunning: boolean;
  products: AdminProduct[];
  onToggleGroupSelection: (groupKey: string, checked: boolean) => void;
  onToggleGroupOpen: (groupKey: string) => void;
  onAddVariantToGroup: (group: ProductGroupEntry) => Promise<void> | void;
  onDuplicateGroup: (group: ProductGroupEntry) => Promise<void> | void;
  onDeleteGroup: (group: ProductGroupEntry) => Promise<void> | void;
  onDeleteVariantFromGroup: (
    group: ProductGroupEntry,
    variant: AdminProduct
  ) => Promise<void> | void;
  onOpenActionsGroupChange: (groupKey: string | null) => void;
  onOpenActionsVariantChange: (variantId: string | null) => void;
  onPendingAutoEditVariantIdChange: (variantId: string | null) => void;
}) {
  return (
    <div className={styles.list}>
      {groupedFiltered.map((group) => {
        const primary = group.primary;
        const thumbnailUrl = primary.imageUrl?.trim() || primary.images?.[0]?.trim() || "";
        const orderedForColorSummary = [
          primary,
          ...group.allVariants.filter((variant) => variant.id !== primary.id),
        ];
        const colorSummary = resolveProductColorSummary(
          orderedForColorSummary.map((variant) => ({
            color: variant.color,
            soldQty: variant.stockSold ?? 0,
          })),
          3
        );
        const panelId = `grupo-variantes-${group.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        const hasVariants = group.totalCount > 1;
        const isOpen = hasVariants ? (expandedGroups[group.key] ?? false) : false;
        const isSelected = Boolean(selectedGroups[group.key]);
        const visibleVariants = group.variants.length > 0 ? group.variants : [primary];
        const colorBadgeWidthCh = Math.max(
          13,
          ...visibleVariants.map((variant) => {
            const currentColor = variant.color?.trim() ?? "";
            return currentColor ? `Color: ${currentColor}`.length : 0;
          })
        );
        const colorBadgeWidth = `${colorBadgeWidthCh + 2}ch`;
        const groupStock = visibleVariants.reduce(
          (acc, item) => acc + Math.max(0, Math.trunc(item.stockAvailable ?? 0)),
          0
        );
        const prices = visibleVariants.map((item) => item.priceArs);
        const minGroupPrice = Math.min(...prices);
        const maxGroupPrice = Math.max(...prices);
        const priceLabel =
          minGroupPrice === maxGroupPrice
            ? formatMoney(minGroupPrice)
            : `${formatMoney(minGroupPrice)} - ${formatMoney(maxGroupPrice)}`;
        const variantsBadge =
          group.visibleCount === group.totalCount
            ? `${group.totalCount} variante${group.totalCount === 1 ? "" : "s"}`
            : `${group.visibleCount}/${group.totalCount} variantes`;
        const autoOpenEditDialog =
          pendingAutoEditVariantId !== null &&
          group.allVariants.some((variant) => variant.id === pendingAutoEditVariantId);
        const editDialogProduct =
          (pendingAutoEditVariantId
            ? group.allVariants.find((variant) => variant.id === pendingAutoEditVariantId)
            : null) ?? primary;
        const primaryBrand = primary.brand.trim() || "Sin marca";
        const titleMeta = primaryBrand;
        const isArchived = Boolean(primary.archived);
        const isPublished = Boolean(primary.active) && !isArchived;
        const isAvailable = isPublished && groupStock > 0;
        const availabilityLabel = isArchived
          ? "Archivado"
          : isAvailable
            ? "Disponible"
            : primary.active
              ? "Sin stock"
              : "No publicado";
        const availabilityTone = isArchived
          ? "archived"
          : isAvailable
            ? "available"
            : groupStock > 0
              ? "inactive"
              : "out";
        const nextSelectedState = !isSelected;

        const variantRows = visibleVariants.map((variant) => {
          const variantColor = variant.color?.trim() || "";
          const variantColorSwatch = variantColor
            ? resolveVariantColorSwatch(variantColor)
            : undefined;
          const isPrimary = variant.id === primary.id;
          const variantStock = Math.max(0, Math.trunc(variant.stockAvailable ?? 0));
          const variantSku = variant.sku?.trim();
          const variantActionBusy = Boolean(
            deletingVariantId ||
              deletingGroupKey ||
              duplicatingGroupKey ||
              addingVariantGroupKey ||
              bulkBusy ||
              bulkRunning
          );

          return (
            <div key={variant.id} className={styles.groupVariantRow}>
              <div className={styles.groupVariantInfo}>
                <span aria-hidden className={styles.groupVariantBullet} />
                <div className={styles.groupVariantText}>
                  <div className={styles.groupVariantTop}>
                    <p className={styles.groupVariantName}>{variant.name}</p>
                    {isPrimary ? <Badge variant="secondary">Principal</Badge> : null}
                  </div>
                  <p className={styles.groupVariantMeta}>
                    {formatMoney(variant.priceArs)} - Stock: {variantStock}
                    {variantSku ? ` - SKU ${variantSku}` : ""}
                  </p>
                </div>
              </div>

              <div className={styles.groupVariantActions}>
                {variantColor ? (
                  <CssVarElement
                    as={Badge}
                    variant="outline"
                    className={styles.variantColorBadge}
                    vars={{
                      "--variant-color-badge-width": colorBadgeWidth,
                      "--variant-color-swatch": variantColorSwatch,
                    }}
                    title={`Color de variante: ${variantColor}`}
                  >
                    <span aria-hidden className={styles.variantColorDot} />
                    Color: {variantColor}
                  </CssVarElement>
                ) : null}
                <EntityActionsMenu
                  open={openActionsVariantId === variant.id}
                  onOpenChange={(nextOpen) => {
                    if (nextOpen) onOpenActionsGroupChange(null);
                    onOpenActionsVariantChange(nextOpen ? variant.id : null);
                  }}
                  busy={variantActionBusy}
                  onEdit={() => onPendingAutoEditVariantIdChange(variant.id)}
                  onDelete={() => void onDeleteVariantFromGroup(group, variant)}
                  showAddVariant={false}
                  showDuplicate={false}
                />
              </div>
            </div>
          );
        });

        return (
          <AdminPanelCard
            key={group.key}
            title={
              <div className={styles.groupCardTitleContent}>
                <button
                  type="button"
                  className={`${styles.miniVisual} ${styles.miniVisualButton} ${
                    isSelected ? styles.miniVisualSelected : ""
                  } ${styles.groupCardSelectButton}`}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    onToggleGroupSelection(group.key, nextSelectedState);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onToggleGroupSelection(group.key, nextSelectedState);
                  }}
                  disabled={bulkBusy || bulkRunning}
                  aria-pressed={isSelected}
                  aria-label={
                    isSelected
                      ? `Quitar seleccion de ${primary.name}`
                      : `Seleccionar ${primary.name}`
                  }
                >
                  {thumbnailUrl ? (
                    <Image
                      src={thumbnailUrl}
                      alt={`Miniatura de ${primary.name}`}
                      fill
                      loading="lazy"
                      className={styles.miniVisualImage}
                      sizes="3rem"
                    />
                  ) : (
                    <>
                      <span className={styles.miniText}>
                        {(primary.brand.trim() || primary.name).slice(0, 2).toUpperCase()}
                      </span>
                      <div aria-hidden className={styles.miniVisualRadial} />
                    </>
                  )}
                  {colorSummary.totalColors > 1 ? (
                    <div className={styles.miniColorsDock} aria-label="Colores disponibles">
                      <div className={styles.miniColorsDots}>
                        {colorSummary.visible.map((item) => (
                          <CssVarElement
                            as="span"
                            key={item.key}
                            aria-hidden
                            className={styles.miniColorsDot}
                            vars={{ "--mini-color-swatch": item.swatch }}
                            title={item.color}
                          />
                        ))}
                      </div>
                      {colorSummary.hiddenCount > 0 ? (
                        <span className={styles.miniColorsMore}>+{colorSummary.hiddenCount}</span>
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    className={`${styles.miniVisualSelectionOverlay} ${
                      isSelected ? styles.miniVisualSelectionOverlayVisible : ""
                    }`}
                    aria-hidden
                  >
                    <span className={styles.miniVisualSelectionMark}>
                      <Check size={14} />
                    </span>
                  </div>
                </button>
                <div className={styles.groupCardTitleCopy}>
                  <span className={styles.groupCardTitleText}>{primary.name}</span>
                  <span className={styles.groupCardTitleMeta}>{titleMeta}</span>
                </div>
              </div>
            }
            titleClassName={styles.groupCardTitle}
            className={`${styles.card} ${styles.groupCardShell} ${
              openActionsGroupKey === group.key ? styles.cardMenuOpen : ""
            }`}
            bodyClassName={styles.groupCardBody}
            headerRight={
              <div className={styles.groupCardHeaderActions}>
                <EntityActionsMenu
                  open={openActionsGroupKey === group.key}
                  onOpenChange={(nextOpen) => {
                    if (nextOpen) onOpenActionsVariantChange(null);
                    onOpenActionsGroupChange(nextOpen ? group.key : null);
                  }}
                  busy={Boolean(
                    duplicatingGroupKey ||
                      deletingGroupKey ||
                      deletingVariantId ||
                      addingVariantGroupKey ||
                      bulkBusy ||
                      bulkRunning
                  )}
                  onEdit={() => onPendingAutoEditVariantIdChange(primary.id)}
                  onAddVariant={() => void onAddVariantToGroup(group)}
                  onDuplicate={() => void onDuplicateGroup(group)}
                  onDelete={() => void onDeleteGroup(group)}
                />
                <EditProductDialog
                  product={editDialogProduct}
                  allProducts={products}
                  autoOpen={autoOpenEditDialog}
                  onDialogOpenChange={(nextOpen) => {
                    if (!nextOpen) onPendingAutoEditVariantIdChange(null);
                  }}
                  showTrigger={false}
                />
              </div>
            }
          >
            <div className={styles.groupMainInfo}>
              <div className={styles.groupPriceStockRow}>
                <p className={styles.groupPriceValue}>{priceLabel}</p>
                <div className={styles.groupStockState}>
                  <span className={styles.groupAvailabilityText} data-state={availabilityTone}>
                    {availabilityLabel}
                  </span>
                  <span aria-hidden className={styles.groupStockDot}>
                    ·
                  </span>
                  <span className={styles.groupStockValue}>{groupStock} en stock</span>
                </div>
              </div>
            </div>

            {hasVariants ? (
              <div className={styles.groupExpandDock}>
                <button
                  type="button"
                  className={styles.groupExpandBar}
                  onClick={() => onToggleGroupOpen(group.key)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  aria-label={`${
                    isOpen ? "Ocultar" : "Mostrar"
                  } variantes de ${group.primary.name}`}
                >
                  <span className={styles.groupExpandLabel}>
                    {isOpen ? "Ocultar variantes" : `Ver ${variantsBadge}`}
                  </span>
                  <span aria-hidden className={styles.groupExpandIconWrap}>
                    <ChevronDown
                      size={22}
                      strokeWidth={3.4}
                      className={`${styles.groupExpandIcon} ${isOpen ? styles.groupExpandIconOpen : ""}`}
                    />
                  </span>
                </button>

                <div
                  id={panelId}
                  className={`${styles.groupExpandPanelFrame} ${
                    isOpen ? styles.groupExpandPanelFrameOpen : ""
                  }`}
                  hidden={!isOpen}
                >
                  <div className={styles.groupExpandPanelInner}>
                    <div className={styles.groupVariantsPanel}>{variantRows}</div>
                  </div>
                </div>
              </div>
            ) : null}
          </AdminPanelCard>
        );
      })}
    </div>
  );
}

export function ProductsEmptyStateCard({
  loading,
  hasAnyProducts,
  hasActiveFilters,
}: {
  loading: boolean;
  hasAnyProducts: boolean | null;
  hasActiveFilters: boolean;
}) {
  return (
    <div className={styles.resultsEmptyState}>
      <p className={styles.muted}>
        {loading
          ? "Cargando productos..."
          : resolveAdminEmptyStateMessage({
              hasActiveFilters,
              hasAnyRecords: hasAnyProducts,
              ...ADMIN_PRODUCTS_EMPTY_STATE_MESSAGES,
            })}
      </p>
    </div>
  );
}
