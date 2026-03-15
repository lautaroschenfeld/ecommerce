"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";

import { ADMIN_SEARCH_DEBOUNCE_MS } from "@/lib/admin-search";
import { toNumberOrUndefined } from "@/lib/format";
import { notify } from "@/lib/notifications";
import { invalidateStoreProducts, useStoreBrands } from "@/lib/store-catalog";
import {
  adminProductsActions,
  type AdminProductsBulkAction,
  type AdminProductsBulkJob,
  invalidateAdminProducts,
  useAdminProducts,
} from "@/lib/store-admin-products";
import type { AdminProduct } from "@/lib/store-mappers";

import { useConfirmModal } from "@/components/ui/confirm-modal";
import {
  EMPTY_FORM,
  PRODUCTS_LIST_RESTORE_ONCE_KEY,
  PRODUCTS_PAGE_SIZE_OPTIONS,
  type AdminCategory,
  type FormState,
  type ProductGroupEntry,
  type ProductsAdminProps,
  type ProductsFilterStatus,
  type ProductsSortBy,
  applyCharacteristicHintsIfEmpty,
  buildCharacteristicHints,
  bulkActionSuccessMessage,
  bulkActionSuccessTitle,
  getActiveSizeEntries,
  mapPanelError,
  resolveProductGroupKey,
  toSizeStocks,
} from "./products-admin-support";
import {
  addProductAction,
  addVariantToGroupAction,
  deleteGroupAction,
  deleteVariantFromGroupAction,
  duplicateGroupAction,
  uploadVariantImagesAction,
} from "./products-admin-actions";
import { useProductsAdminListSnapshot } from "./use-products-admin-list-snapshot";

type BulkActionSelection = AdminProductsBulkAction | "";

type BulkActionConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant: "default" | "destructive";
};

function bulkActionButtonLabel(action: BulkActionSelection) {
  if (!action) return "Seleccionar accion";
  if (action === "publish") return "Publicar seleccion";
  if (action === "change_category") return "Cambiar categoria";
  if (action === "adjust_stock") return "Ajustar stock";
  return "Eliminar seleccion";
}

function bulkActionPendingLabel(action: BulkActionSelection) {
  if (!action) return "Aplicando...";
  if (action === "publish") return "Publicando...";
  if (action === "change_category") return "Actualizando categoria...";
  if (action === "adjust_stock") return "Ajustando stock...";
  return "Eliminando...";
}

function buildBulkActionConfirmation(input: {
  action: AdminProductsBulkAction;
  count: number;
  category?: string;
  stockDelta?: number;
}): BulkActionConfirmation {
  const { action, count, category, stockDelta } = input;
  const targetLabel =
    count === 1 ? "1 producto seleccionado" : `${count} productos seleccionados`;

  if (action === "publish") {
    return {
      title: count === 1 ? "Publicar producto" : "Publicar productos",
      description: `Se publicara ${targetLabel} en la tienda.`,
      confirmLabel: "Publicar",
      confirmVariant: "default",
    };
  }

  if (action === "change_category") {
    return {
      title: "Cambiar categoria de productos",
      description: `Se movera ${targetLabel} a la categoria ${category || "-"}.`,
      confirmLabel: "Cambiar categoria",
      confirmVariant: "default",
    };
  }

  if (action === "adjust_stock") {
    const deltaLabel = `${stockDelta && stockDelta > 0 ? "+" : ""}${stockDelta ?? 0}`;
    return {
      title: "Ajustar stock de productos",
      description: `Se aplicara un ajuste de ${deltaLabel} unidades sobre ${targetLabel}.`,
      confirmLabel: "Ajustar stock",
      confirmVariant: "default",
    };
  }

  return {
    title: count === 1 ? "Eliminar producto" : "Eliminar productos",
    description: `Vas a eliminar definitivamente ${targetLabel}. Esta accion no se puede deshacer.`,
    confirmLabel: "Eliminar",
    confirmVariant: "destructive",
  };
}

export function useProductsAdminController(mode: ProductsAdminProps["mode"] = "list") {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const isCreateMode = mode === "create";
  const isListMode = mode === "list";
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVariantIndex, setUploadingVariantIndex] = useState<number | null>(null);
  const [pendingVariantUploads, setPendingVariantUploads] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createCharacteristicsCollapsed, setCreateCharacteristicsCollapsed] =
    useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {}
  );
  const [duplicatingGroupKey, setDuplicatingGroupKey] = useState<string | null>(
    null
  );
  const [addingVariantGroupKey, setAddingVariantGroupKey] = useState<
    string | null
  >(null);
  const [deletingGroupKey, setDeletingGroupKey] = useState<string | null>(null);
  const [deletingVariantId, setDeletingVariantId] = useState<string | null>(null);
  const [pendingAutoEditVariantId, setPendingAutoEditVariantId] = useState<
    string | null
  >(null);
  const [openActionsGroupKey, setOpenActionsGroupKey] = useState<string | null>(
    null
  );
  const [openActionsVariantId, setOpenActionsVariantId] = useState<string | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<AdminCategory | "">("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterStatus, setFilterStatus] = useState<ProductsFilterStatus>("live");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortBy, setSortBy] = useState<ProductsSortBy>("created_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PRODUCTS_PAGE_SIZE_OPTIONS[1]);
  const [selectedGroups, setSelectedGroups] = useState<Record<string, boolean>>(
    {}
  );
  const [bulkAction, setBulkAction] = useState<BulkActionSelection>("");
  const [bulkCategory, setBulkCategory] = useState<AdminCategory | "">("");
  const [bulkStockDelta, setBulkStockDelta] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkJob, setBulkJob] = useState<AdminProductsBulkJob | null>(null);
  const { confirm, confirmModal } = useConfirmModal();
  const bulkNotifiedJobRef = useRef<string | null>(null);
  const { brands, loading: brandsLoading } = useStoreBrands();
  const firstColorHint = form.variants[0]?.color;

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
  }, [form.brand, form.name, firstColorHint]);

  const minPriceNumber = toNumberOrUndefined(minPrice);
  const maxPriceNumber = toNumberOrUndefined(maxPrice);

  useEffect(() => {
    if (!isListMode) return;
    if (search === searchQuery) return;

    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        setPage(1);
        setSearchQuery(search);
      });
    }, ADMIN_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isListMode, search, searchQuery]);

  const adminProductsQuery = useMemo(
    () => ({
      q: searchQuery,
      category: filterCategory || undefined,
      brand: filterBrand || undefined,
      status: filterStatus,
      minPrice: minPriceNumber,
      maxPrice: maxPriceNumber,
      sort: sortBy,
      limit: pageSize,
      offset: Math.max(0, (page - 1) * pageSize),
      skip: !isListMode,
    }),
    [
      searchQuery,
      filterCategory,
      filterBrand,
      filterStatus,
      minPriceNumber,
      maxPriceNumber,
      sortBy,
      pageSize,
      page,
      isListMode,
    ]
  );
  const {
    products,
    count,
    productCount,
    limit,
    offset,
    loading,
    error: loadError,
  } = useAdminProducts(adminProductsQuery);

  useProductsAdminListSnapshot({
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
  });

  const filtered = products;

  const groupedFiltered = useMemo<ProductGroupEntry[]>(() => {
    const allByGroup = new Map<string, AdminProduct[]>();
    for (const item of products) {
      const key = resolveProductGroupKey(item);
      const bucket = allByGroup.get(key) ?? [];
      bucket.push(item);
      allByGroup.set(key, bucket);
    }
    for (const bucket of allByGroup.values()) {
      bucket.sort((a, b) => a.createdAt - b.createdAt);
    }

    const visibleByGroup = new Map<string, AdminProduct[]>();
    const order: string[] = [];
    for (const item of filtered) {
      const key = resolveProductGroupKey(item);
      if (!visibleByGroup.has(key)) order.push(key);
      const bucket = visibleByGroup.get(key) ?? [];
      bucket.push(item);
      visibleByGroup.set(key, bucket);
    }

    return order
      .map((key) => {
        const visibleVariants = visibleByGroup.get(key) ?? [];
        const allVariants = allByGroup.get(key) ?? visibleVariants;
        const primaryFromAll = allVariants[0] ?? visibleVariants[0];
        const primary =
          visibleVariants.find((item) => item.id === primaryFromAll?.id) ??
          visibleVariants[0] ??
          primaryFromAll;

        if (!primary) return null;

        const variants = [...visibleVariants].sort((a, b) => {
          if (a.id === primary.id) return -1;
          if (b.id === primary.id) return 1;
          return a.createdAt - b.createdAt;
        });

        const groupId = primary.variantGroupId?.trim() || null;
        return {
          key,
          groupId,
          primary,
          variants,
          allVariants,
          visibleCount: visibleVariants.length,
          totalCount: allVariants.length,
        };
      })
      .filter((item): item is ProductGroupEntry => item !== null);
  }, [filtered, products]);

  useEffect(() => {
    if (!openActionsGroupKey) return;
    const exists = groupedFiltered.some((group) => group.key === openActionsGroupKey);
    if (!exists) setOpenActionsGroupKey(null);
  }, [groupedFiltered, openActionsGroupKey]);

  useEffect(() => {
    if (!openActionsVariantId) return;
    const exists = groupedFiltered.some((group) =>
      group.variants.some((variant) => variant.id === openActionsVariantId)
    );
    if (!exists) setOpenActionsVariantId(null);
  }, [groupedFiltered, openActionsVariantId]);

  useEffect(() => {
    const available = new Set(groupedFiltered.map((group) => group.key));
    setSelectedGroups((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [key, checked] of Object.entries(prev)) {
        if (!checked) continue;
        if (!available.has(key)) {
          changed = true;
          continue;
        }
        next[key] = true;
      }
      if (!changed && Object.keys(next).length === Object.keys(prev).length) {
        return prev;
      }
      return next;
    });
  }, [groupedFiltered]);

  const selectedGroupEntries = useMemo(
    () => groupedFiltered.filter((group) => selectedGroups[group.key]),
    [groupedFiltered, selectedGroups]
  );
  const selectedVisibleCount = selectedGroupEntries.length;
  const selectedProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of selectedGroupEntries) {
      for (const variant of group.allVariants) ids.add(variant.id);
    }
    return Array.from(ids);
  }, [selectedGroupEntries]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    filterCategory !== "" ||
    filterBrand !== "" ||
    filterStatus !== "live" ||
    minPrice.trim().length > 0 ||
    maxPrice.trim().length > 0;
  const effectiveLimit = Math.max(1, limit || pageSize);
  const totalPages = Math.max(1, Math.ceil(count / effectiveLimit));
  const visibleGroupCount = groupedFiltered.length;
  const pageFrom = visibleGroupCount > 0 ? offset + 1 : 0;
  const pageTo = visibleGroupCount > 0 ? Math.min(count, offset + visibleGroupCount) : 0;

  useEffect(() => {
    if (!isListMode) return;
    if (page <= totalPages) return;
    setPage(totalPages);
  }, [isListMode, page, totalPages]);

  function clearListFilters() {
    setSearch("");
    setSearchQuery("");
    setFilterCategory("");
    setFilterBrand("");
    setFilterStatus("live");
    setMinPrice("");
    setMaxPrice("");
    setSortBy("created_desc");
    setPage(1);
    setSelectedGroups({});
  }

  function toggleGroupSelection(groupKey: string, checked: boolean) {
    setSelectedGroups((prev) => {
      if (!checked) {
        if (!prev[groupKey]) return prev;
        const next = { ...prev };
        delete next[groupKey];
        return next;
      }
      if (prev[groupKey]) return prev;
      return { ...prev, [groupKey]: true };
    });
  }

  const bulkJobId = bulkJob?.id ?? null;
  const bulkJobStatus = bulkJob?.status ?? null;

  useEffect(() => {
    if (!bulkJobId) return;
    if (bulkJobStatus !== "queued" && bulkJobStatus !== "running") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const next = await adminProductsActions.getBulkJob(bulkJobId);
        if (cancelled) return;
        setBulkJob(next);
      } catch (error) {
        if (cancelled) return;
        const message = mapPanelError(error, "No se pudo consultar el avance del proceso.");
        setBulkError(message);
        setBulkJob((current) => {
          if (!current || current.id !== bulkJobId) return current;
          if (current.status !== "queued" && current.status !== "running") return current;
          return {
            ...current,
            status: "failed",
            error: message,
          };
        });
      }
    };

    void poll();
    const timer = globalThis.setInterval(() => {
      void poll();
    }, 450);

    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [bulkJobId, bulkJobStatus]);

  useEffect(() => {
    if (!bulkJob) return;
    if (bulkJob.status !== "completed" && bulkJob.status !== "failed") return;
    if (bulkNotifiedJobRef.current === bulkJob.id) return;
    bulkNotifiedJobRef.current = bulkJob.id;

    invalidateAdminProducts();
    invalidateStoreProducts();

    if (bulkJob.status === "failed") {
      notify(
        "No se pudo completar la acción",
        bulkJob.error || "No se pudo completar la operación masiva.",
        "error"
      );
      return;
    }

    const successTitle = bulkActionSuccessTitle(bulkJob.action, bulkJob.succeeded);
    const successMessage =
      bulkJob.succeeded > 0
        ? bulkActionSuccessMessage(bulkJob.action, bulkJob.succeeded)
        : "No se pudo aplicar la acción a ningún producto.";

    if (bulkJob.failed > 0) {
      const failuresMessage =
        bulkJob.failed === 1
          ? "Un producto no pudo procesarse."
          : `${bulkJob.failed} productos no pudieron procesarse.`;
      const firstError = bulkJob.errors[0];
      const firstErrorMessage = firstError
        ? ` Primer error (${firstError.productId}): ${firstError.message}`
        : "";
      notify(
        "Acción completada con observaciones",
        `${successMessage} ${failuresMessage}${firstErrorMessage}`,
        "warning"
      );
      return;
    }

    notify(successTitle, successMessage, "success");
  }, [bulkJob]);

  async function startBulkJob(input: {
    action: AdminProductsBulkAction;
    productIds: string[];
    category?: string;
    stockDelta?: number;
  }) {
    try {
      setBulkBusy(true);
      setBulkError(null);
      const job = await adminProductsActions.startBulkJob(input, { toast: false });
      setBulkJob(job);
      bulkNotifiedJobRef.current = null;
      setSelectedGroups({});
    } catch (error) {
      const message = mapPanelError(error, "No se pudo iniciar el proceso masivo.");
      setBulkError(message);
      notify("Error en acción masiva", message, "error");
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkActionFromSelection() {
    if (!selectedProductIds.length) {
      setBulkError("Selecciona al menos un producto para ejecutar acciones masivas.");
      return;
    }

    let running = bulkJob?.status === "queued" || bulkJob?.status === "running";
    if (running && bulkJob?.id) {
      try {
        const refreshedJob = await adminProductsActions.getBulkJob(bulkJob.id);
        setBulkJob(refreshedJob);
        running = refreshedJob.status === "queued" || refreshedJob.status === "running";
      } catch (error) {
        const message = mapPanelError(error, "No se pudo consultar el avance del proceso.");
        setBulkError(message);
        setBulkJob((current) => {
          if (!current || current.id !== bulkJob.id) return current;
          if (current.status !== "queued" && current.status !== "running") return current;
          return {
            ...current,
            status: "failed",
            error: message,
          };
        });
        running = false;
      }
    }

    if (running) {
      setBulkError("Ya hay un proceso masivo en ejecución. Espera a que finalice.");
      return;
    }

    if (!bulkAction) {
      setBulkError("Selecciona una accion masiva antes de continuar.");
      return;
    }

    if (bulkAction === "change_category" && !bulkCategory) {
      setBulkError("Selecciona la categoría destino para aplicar el cambio masivo.");
      return;
    }

    if (bulkAction === "adjust_stock") {
      const delta = Number.parseInt(bulkStockDelta, 10);
      if (!Number.isFinite(delta) || delta === 0) {
        setBulkError(
          "Ingresa un ajuste de stock válido. Usa negativo para restar (ej: -10)."
        );
        return;
      }
    }

    const confirmation = buildBulkActionConfirmation({
      action: bulkAction,
      count: selectedProductIds.length,
      category: bulkAction === "change_category" ? bulkCategory : undefined,
      stockDelta:
        bulkAction === "adjust_stock"
          ? Number.parseInt(bulkStockDelta, 10)
          : undefined,
    });
    const ok = await confirm({
      title: confirmation.title,
      description: confirmation.description,
      confirmLabel: confirmation.confirmLabel,
      cancelLabel: "Cancelar",
      confirmVariant: confirmation.confirmVariant,
    });
    if (!ok) return;

    await startBulkJob({
      action: bulkAction,
      productIds: selectedProductIds,
      category: bulkAction === "change_category" ? bulkCategory : undefined,
      stockDelta:
        bulkAction === "adjust_stock"
          ? Number.parseInt(bulkStockDelta, 10)
          : undefined,
    });
  }

  function toggleGroupOpen(groupKey: string) {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  }

  async function addVariantToGroup(group: ProductGroupEntry) {
    await addVariantToGroupAction({
      group,
      addingVariantGroupKey,
      duplicatingGroupKey,
      deletingGroupKey,
      setAddingVariantGroupKey,
      setError,
      setSearch,
      setPage,
      setExpandedGroups,
      setPendingAutoEditVariantId,
    });
  }
  async function duplicateGroup(group: ProductGroupEntry) {
    await duplicateGroupAction({
      group,
      duplicatingGroupKey,
      deletingGroupKey,
      addingVariantGroupKey,
      setDuplicatingGroupKey,
      setError,
      setSearch,
      setPage,
      setExpandedGroups,
      setPendingAutoEditVariantId,
    });
  }
  async function deleteGroup(group: ProductGroupEntry) {
    await deleteGroupAction({
      group,
      duplicatingGroupKey,
      deletingGroupKey,
      addingVariantGroupKey,
      setDeletingGroupKey,
      setError,
      confirm,
      startBulkJob,
    });
  }
  async function deleteVariantFromGroup(group: ProductGroupEntry, variant: AdminProduct) {
    await deleteVariantFromGroupAction({
      group,
      variant,
      duplicatingGroupKey,
      deletingGroupKey,
      addingVariantGroupKey,
      deletingVariantId,
      bulkBusy,
      setDeletingVariantId,
      setError,
      confirm,
      startBulkJob,
    });
  }
  async function uploadVariantImages(variantIndex: number, files: File[]) {
    await uploadVariantImagesAction({
      variantIndex,
      files,
      setUploadingVariantIndex,
      setUploadingImage,
      setError,
      setPendingVariantUploads,
      setForm,
    });
  }
  async function addProduct() {
    await addProductAction({
      form,
      setBusy,
      setError,
      setForm,
      isCreateMode,
      onCreateRedirect: () => {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(PRODUCTS_LIST_RESTORE_ONCE_KEY, "1");
        }
        router.replace("/cuenta/administracion/productos");
      },
    });
  }
  const isApparel = form.category === "Indumentaria";
  const requiresColor = isApparel || form.variants.length > 1;
  const baseVariant = form.variants[0];
  const apparelStockTotal = isApparel
    ? getActiveSizeEntries(
        toSizeStocks(baseVariant.sizeStocks, baseVariant.size, baseVariant.stock)
      ).reduce((acc, entry) => acc + entry.stock, 0)
    : 0;
  const bulkRunning = bulkJob?.status === "queued" || bulkJob?.status === "running";
  const bulkProgress =
    bulkJob && bulkJob.total > 0
      ? Math.min(100, Math.round((bulkJob.processed / bulkJob.total) * 100))
      : 0;

  return {
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
    setError,
    createCharacteristicsCollapsed,
    setCreateCharacteristicsCollapsed,
    expandedGroups,
    setExpandedGroups,
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
    bulkActionButtonLabel: bulkActionButtonLabel(bulkAction),
    bulkActionPendingLabel: bulkActionPendingLabel(bulkAction),
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
    filtered,
    count,
    productCount,
    loading,
    loadError,
    groupedFiltered,
    selectedVisibleCount,
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
  };
}
