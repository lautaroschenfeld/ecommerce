"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";

import { PRIMARY_CATEGORIES } from "@/lib/catalog";
import { type AdminProductsBulkAction } from "@/lib/store-admin-products";

import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { Button } from "@/components/ui/button";
import { CssVarElement } from "@/components/ui/css-var-element";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { BrandFilterSelector } from "@/components/shared/brand-filter-selector";
import { PaginationNav } from "@/components/shared/pagination-nav";
import {
  bulkActionLabel,
  sanitizeSignedStockDeltaInput,
  toAdminCategory,
  type ProductsAdminProps,
} from "./products-admin-support";
import { PRODUCTS_PAGE_SIZE_OPTIONS } from "./products-admin-support-utils";
import {
  ProductGroupCards,
  ProductsEmptyStateCard,
} from "./products-admin-group-cards";
import { ProductsAdminCreateSection } from "./products-admin-create-section";
import styles from "./products-admin.module.css";
import { useProductsAdminController } from "./use-products-admin-controller";

export function ProductsAdmin({ mode = "list" }: ProductsAdminProps) {
  const {
    reduceMotion,
    confirmModal,
    isCreateMode,
    isListMode,
    form,
    setForm,
    uploadingImage,
    uploadingVariantIndex,
    pendingVariantUploads,
    busy,
    error,
    createCharacteristicsCollapsed,
    setCreateCharacteristicsCollapsed,
    expandedGroups,
    duplicatingGroupKey,
    addingVariantGroupKey,
    deletingGroupKey,
    deletingVariantId,
    pendingAutoEditVariantId,
    openActionsGroupKey,
    openActionsVariantId,
    setOpenActionsGroupKey,
    setOpenActionsVariantId,
    setPendingAutoEditVariantId,
    search,
    setSearch,
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
    bulkAction,
    bulkActionButtonLabel,
    bulkActionPendingLabel,
    setBulkAction,
    bulkCategory,
    setBulkCategory,
    bulkStockDelta,
    setBulkStockDelta,
    bulkBusy,
    bulkError,
    bulkJob,
    brands,
    brandsLoading,
    products,
    count,
    loading,
    loadError,
    groupedFiltered,
    selectedVisibleCount,
    hasAnyProducts,
    hasActiveFilters,
    totalPages,
    pageFrom,
    pageTo,
    clearListFilters,
    toggleGroupSelection,
    runBulkActionFromSelection,
    toggleGroupOpen,
    addVariantToGroup,
    duplicateGroup,
    deleteGroup,
    deleteVariantFromGroup,
    uploadVariantImages,
    addProduct,
    isApparel,
    requiresColor,
    baseVariant,
    apparelStockTotal,
    bulkRunning,
    bulkProgress,
  } = useProductsAdminController(mode);

  const categorySpan = isApparel ? styles.createSpanHalf : styles.createSpanFull;
  return (
    <div className={styles.page}>
      {isCreateMode ? (
        <ProductsAdminCreateSection
          form={form}
          setForm={setForm}
          busy={busy}
          uploadingImage={uploadingImage}
          uploadingVariantIndex={uploadingVariantIndex}
          pendingVariantUploads={pendingVariantUploads}
          error={error}
          loadError={loadError}
          createCharacteristicsCollapsed={createCharacteristicsCollapsed}
          setCreateCharacteristicsCollapsed={setCreateCharacteristicsCollapsed}
          addProduct={addProduct}
          uploadVariantImages={uploadVariantImages}
          isApparel={isApparel}
          requiresColor={requiresColor}
          baseVariant={baseVariant}
          apparelStockTotal={apparelStockTotal}
          categorySpan={categorySpan}
        />
      ) : null}

      {isListMode ? (
        <div className={styles.stack}>
          <div id="productos-cargados-lista" className={styles.listLayout}>
            <div className={styles.listSidebar}>
              <AdminPanelCard
                title="Filtros"
                className={`${styles.card} ${styles.listFiltersCard}`}
                bodyClassName={styles.listTools}
                headerRight={
                  hasActiveFilters ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={styles.listFiltersClearButton}
                      onClick={clearListFilters}
                    >
                      <X size={16} />
                      Limpiar
                    </Button>
                  ) : null
                }
              >
                <div className={styles.listFilterSection}>
                  <Label>Busqueda</Label>
                  <div className={styles.searchWrap}>
                    <Search size={16} className={styles.searchIcon} />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar producto"
                      className={styles.searchInput}
                    />
                  </div>
                </div>

                <Separator className={styles.listFilterSeparator} />

                <div className={styles.listFilterSection}>
                  <Label>Orden</Label>
                  <Select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as typeof sortBy);
                      setPage(1);
                    }}
                  >
                    <option value="created_desc">Mas recientes</option>
                    <option value="created_asc">Mas antiguos</option>
                    <option value="price_desc">Precio: mayor a menor</option>
                    <option value="price_asc">Precio: menor a mayor</option>
                    <option value="name_asc">Nombre: A-Z</option>
                    <option value="name_desc">Nombre: Z-A</option>
                    <option value="stock_desc">Stock: mayor a menor</option>
                    <option value="stock_asc">Stock: menor a mayor</option>
                  </Select>
                </div>

                <Separator className={styles.listFilterSeparator} />

                <div className={styles.listFilterSection}>
                  <Label>Categoria</Label>
                  <Select
                    value={filterCategory}
                    onChange={(e) => {
                      setFilterCategory(toAdminCategory(e.target.value) ?? "");
                      setPage(1);
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

                <Separator className={styles.listFilterSeparator} />

                <div className={styles.listFilterSection}>
                  <BrandFilterSelector
                    label="Marcas"
                    brands={brands}
                    loading={brandsLoading}
                    selectedBrands={filterBrand ? [filterBrand] : []}
                    onToggleBrand={(brand) => {
                      setFilterBrand((prev) => (prev === brand ? "" : brand));
                      setPage(1);
                    }}
                    emptyText="No hay marcas disponibles."
                    modalTitle="Marca"
                  />
                </div>

                <Separator className={styles.listFilterSeparator} />

                <div className={styles.listFilterSection}>
                  <Label>Estado</Label>
                  <Select
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value as typeof filterStatus);
                      setPage(1);
                    }}
                  >
                    <option value="all">Todos</option>
                    <option value="live">No archivados</option>
                    <option value="active">Publicados</option>
                  </Select>
                </div>

                <Separator className={styles.listFilterSeparator} />

                <div className={styles.listFilterSection}>
                  <Label>Precio</Label>
                  <div className={styles.priceInputs}>
                    <Input
                      inputMode="numeric"
                      value={minPrice}
                      onChange={(e) => {
                        setMinPrice(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Minimo"
                    />
                    <Input
                      inputMode="numeric"
                      value={maxPrice}
                      onChange={(e) => {
                        setMaxPrice(e.target.value);
                        setPage(1);
                      }}
                      placeholder="Maximo"
                    />
                  </div>
                </div>
              </AdminPanelCard>

              <AnimatePresence initial={false}>
                {selectedVisibleCount > 0 ? (
                  <motion.div
                    className={styles.bulkCardMotion}
                    initial={reduceMotion ? undefined : { y: -8, height: 0 }}
                    animate={reduceMotion ? undefined : { y: 0, height: "auto" }}
                    exit={reduceMotion ? undefined : { y: -8, height: 0 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
                    }
                  >
                    <AdminPanelCard
                      title="Accion masiva"
                      subtitle={`${selectedVisibleCount} seleccionado${selectedVisibleCount === 1 ? "" : "s"} en la vista actual.`}
                      className={styles.card}
                      bodyClassName={styles.bulkPanelBody}
                      headerRight={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedGroups({})}
                          disabled={bulkBusy || bulkRunning}
                        >
                          Limpiar seleccion
                        </Button>
                      }
                    >
                      <div className={styles.bulkControls}>
                        <div className={styles.bulkControlField}>
                          <Label htmlFor="products_bulk_action">Accion</Label>
                          <Select
                            id="products_bulk_action"
                            value={bulkAction}
                            onChange={(event) =>
                              setBulkAction(
                                event.target.value
                                  ? (event.target.value as AdminProductsBulkAction)
                                  : ""
                              )
                            }
                            disabled={bulkBusy || bulkRunning}
                          >
                            <option value="">Seleccionar accion</option>
                            {(
                              [
                                "publish",
                                "change_category",
                                "adjust_stock",
                                "delete",
                              ] as const
                            ).map((action) => (
                              <option key={action} value={action}>
                                {bulkActionLabel(action)}
                              </option>
                            ))}
                          </Select>
                        </div>

                        {bulkAction === "change_category" ? (
                          <div className={styles.bulkControlField}>
                            <Label htmlFor="products_bulk_category">Categoria</Label>
                            <Select
                              id="products_bulk_category"
                              value={bulkCategory}
                              onChange={(event) =>
                                setBulkCategory(toAdminCategory(event.target.value) ?? "")
                              }
                              disabled={bulkBusy || bulkRunning}
                            >
                              <option value="">Seleccionar categoria</option>
                              {PRIMARY_CATEGORIES.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ) : null}

                        {bulkAction === "adjust_stock" ? (
                          <div className={styles.bulkControlField}>
                            <Label htmlFor="products_bulk_stock_delta">Ajuste stock (+/-)</Label>
                            <Input
                              id="products_bulk_stock_delta"
                              value={bulkStockDelta}
                              onChange={(event) =>
                                setBulkStockDelta(
                                  sanitizeSignedStockDeltaInput(event.target.value)
                                )
                              }
                              inputMode="numeric"
                              placeholder="Ej: +5 o -3"
                              disabled={bulkBusy || bulkRunning}
                            />
                          </div>
                        ) : null}

                        <Button
                          type="button"
                          className={styles.bulkRunButton}
                          onClick={() => void runBulkActionFromSelection()}
                          disabled={
                            bulkBusy ||
                            bulkRunning ||
                            selectedVisibleCount === 0 ||
                            !bulkAction
                          }
                        >
                          {bulkBusy ? bulkActionPendingLabel : bulkActionButtonLabel}
                        </Button>
                      </div>

                      {bulkError ? <div className={styles.dangerBox}>{bulkError}</div> : null}

                      {bulkRunning && bulkJob ? (
                        <div className={styles.bulkProgress}>
                          <p className={styles.bulkProgressLabel}>
                            Progreso: {bulkJob.processed}/{bulkJob.total}
                          </p>
                          <div className={styles.bulkProgressTrack}>
                            <CssVarElement
                              className={styles.bulkProgressFill}
                              vars={{ "--bulk-progress-width": `${bulkProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </AdminPanelCard>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className={styles.listResults}>
              <AdminPanelCard
                title="Productos cargados"
                subtitle={
                  loading
                    ? "Cargando productos..."
                    : count > 0
                      ? `Mostrando del ${pageFrom} al ${pageTo} de ${count} grupo${count === 1 ? "" : "s"}.`
                      : undefined
                }
                className={styles.card}
                bodyClassName={styles.listResultsBody}
                headerRight={
                  <div className={styles.pageSizeControl}>
                    <Label>Por pagina</Label>
                    <Select
                      value={String(pageSize)}
                      onChange={(event) => {
                        const next = Number.parseInt(event.target.value, 10);
                        if (
                          !PRODUCTS_PAGE_SIZE_OPTIONS.includes(
                            next as (typeof PRODUCTS_PAGE_SIZE_OPTIONS)[number]
                          )
                        ) {
                          return;
                        }
                        setPageSize(next);
                        setPage(1);
                        setSelectedGroups({});
                      }}
                      disabled={loading}
                    >
                      {PRODUCTS_PAGE_SIZE_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </Select>
                  </div>
                }
              >
                {groupedFiltered.length === 0 ? (
                  <ProductsEmptyStateCard
                    loading={loading}
                    hasAnyProducts={hasAnyProducts}
                    hasActiveFilters={hasActiveFilters}
                  />
                ) : (
                  <ProductGroupCards
                    groupedFiltered={groupedFiltered}
                    expandedGroups={expandedGroups}
                    selectedGroups={selectedGroups}
                    openActionsGroupKey={openActionsGroupKey}
                    openActionsVariantId={openActionsVariantId}
                    pendingAutoEditVariantId={pendingAutoEditVariantId}
                    duplicatingGroupKey={duplicatingGroupKey}
                    deletingGroupKey={deletingGroupKey}
                    deletingVariantId={deletingVariantId}
                    addingVariantGroupKey={addingVariantGroupKey}
                    bulkBusy={bulkBusy}
                    bulkRunning={bulkRunning}
                    products={products}
                    onToggleGroupSelection={toggleGroupSelection}
                    onToggleGroupOpen={toggleGroupOpen}
                    onAddVariantToGroup={addVariantToGroup}
                    onDuplicateGroup={duplicateGroup}
                    onDeleteGroup={deleteGroup}
                    onDeleteVariantFromGroup={deleteVariantFromGroup}
                    onOpenActionsGroupChange={setOpenActionsGroupKey}
                    onOpenActionsVariantChange={setOpenActionsVariantId}
                    onPendingAutoEditVariantIdChange={setPendingAutoEditVariantId}
                  />
                )}

                <div className={styles.paginationFooter}>
                  <PaginationNav
                    page={page}
                    totalPages={totalPages}
                    disabled={loading}
                    onPageChange={(nextPage) => {
                      setPage(nextPage);
                      setSelectedGroups({});
                    }}
                    ariaLabel="Paginacion de productos admin"
                  />
                </div>
              </AdminPanelCard>
            </div>
          </div>
        </div>
      ) : null}
      {confirmModal}
    </div>
  );
}
