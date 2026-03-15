import type { Dispatch, SetStateAction } from "react";

import { notify } from "@/lib/notifications";
import { toNumberOrUndefined } from "@/lib/format";
import { serializeProductCharacteristicsForMetadata } from "@/lib/product-characteristics";
import { invalidateStoreProducts } from "@/lib/store-catalog";
import {
  adminProductsActions,
  invalidateAdminProducts,
  type AdminProductsBulkAction,
} from "@/lib/store-admin-products";
import type { AdminProduct } from "@/lib/store-mappers";

import type { ProductGroupEntry, FormState } from "./products-admin-support";
import {
  EMPTY_FORM,
  mapPanelError,
  resolveDuplicateName,
  sanitizeMetadataForDuplicate,
  generateGroupId,
  dedupeImageUrls,
  buildVariantHandle,
  toSizeStocks,
  toMetadataSizeStocks,
  getActiveSizeEntries,
  resolveVariantImageUrls,
  uploadImagesSequentially,
  validateForm,
} from "./products-admin-support";

type ConfirmFn = (input: {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive";
}) => Promise<boolean>;

type StartBulkJobFn = (input: {
  action: AdminProductsBulkAction;
  productIds: string[];
  category?: string;
  stockDelta?: number;
}) => Promise<void>;

async function addVariantToGroupAction(params: {
  group: ProductGroupEntry;
  addingVariantGroupKey: string | null;
  duplicatingGroupKey: string | null;
  deletingGroupKey: string | null;
  setAddingVariantGroupKey: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setPage: Dispatch<SetStateAction<number>>;
  setExpandedGroups: Dispatch<SetStateAction<Record<string, boolean>>>;
  setPendingAutoEditVariantId: Dispatch<SetStateAction<string | null>>;
}) {
  const {
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
  } = params;

  if (addingVariantGroupKey || duplicatingGroupKey || deletingGroupKey) return;

  try {
    setAddingVariantGroupKey(group.key);
    setError(null);

    const sourceVariants = [...group.allVariants].sort((a, b) => a.createdAt - b.createdAt);
    const details = await Promise.all(
      sourceVariants.map((variant) => adminProductsActions.getById(variant.id))
    );
    if (!details.length) {
      throw new Error("No pudimos cargar la variante base.");
    }

    const template = details[0]!;
    const existingGroupId = group.groupId?.trim() || template.variantGroupId?.trim() || "";
    const targetGroupId = existingGroupId || generateGroupId();

    if (!existingGroupId) {
      for (const detail of details) {
        await adminProductsActions.update(
          detail.id,
          {
            metadata: {
              ...(detail.metadata ?? {}),
              group_id: targetGroupId,
            },
          },
          { toast: false, invalidate: false }
        );
      }
    }

    const metadataBase = sanitizeMetadataForDuplicate(template.metadata);
    const metadata: Record<string, unknown> = {
      ...metadataBase,
      condition: template.condition,
      color: template.color,
      size: template.size,
      gender: template.gender,
      group_id: targetGroupId,
    };
    const images = dedupeImageUrls([
      ...(template.images ?? []),
      ...(template.thumbnail ? [template.thumbnail] : []),
    ]);

    await adminProductsActions.create(
      {
        name: template.name,
        brand: template.brand,
        category: template.category,
        priceArs: template.priceArs,
        costArs: Math.max(0, Math.round(template.costArs ?? template.priceArs * 0.55)),
        stockAvailable: template.stockAvailable,
        sku: undefined,
        description: template.description,
        active: true,
        images,
        metadata,
        handle: buildVariantHandle(
          template.name,
          template.color ?? "",
          template.size ?? template.condition,
          Date.now().toString(36),
          sourceVariants.length
        ),
      },
      { toast: false, invalidate: false }
    );

    setSearch("");
    setPage(1);
    setExpandedGroups((prev) => ({
      ...prev,
      [group.key]: true,
      [`group:${targetGroupId}`]: true,
    }));
    setPendingAutoEditVariantId(group.primary.id);

    invalidateAdminProducts();
    invalidateStoreProducts();

    notify("Variante creada satisfactoriamente", undefined, "success");
  } catch (e) {
    const message = mapPanelError(e, "No se pudo agregar la variante.");
    setError(message);
    notify("Error al agregar la variante", message, "error");
  } finally {
    setAddingVariantGroupKey(null);
  }
}

async function duplicateGroupAction(params: {
  group: ProductGroupEntry;
  duplicatingGroupKey: string | null;
  deletingGroupKey: string | null;
  addingVariantGroupKey: string | null;
  setDuplicatingGroupKey: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setSearch: Dispatch<SetStateAction<string>>;
  setPage: Dispatch<SetStateAction<number>>;
  setExpandedGroups: Dispatch<SetStateAction<Record<string, boolean>>>;
  setPendingAutoEditVariantId: Dispatch<SetStateAction<string | null>>;
}) {
  const {
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
  } = params;

  if (duplicatingGroupKey || deletingGroupKey || addingVariantGroupKey) return;

  try {
    setDuplicatingGroupKey(group.key);
    setError(null);

    const sourceVariants = [...group.allVariants].sort((a, b) => a.createdAt - b.createdAt);
    const details = await Promise.all(
      sourceVariants.map((variant) => adminProductsActions.getById(variant.id))
    );
    if (!details.length) {
      throw new Error("No pudimos cargar variantes para duplicar.");
    }

    const copyName = resolveDuplicateName(details[0]?.name ?? group.primary.name);
    const newGroupId = generateGroupId();
    const handleSeed = Date.now().toString(36);
    const createdIds: string[] = [];

    for (const [index, detail] of details.entries()) {
      const metadataBase = sanitizeMetadataForDuplicate(detail.metadata);
      const metadata: Record<string, unknown> = {
        ...metadataBase,
        condition: detail.condition,
        color: detail.color,
        size: detail.size,
        gender: detail.gender,
        group_id: newGroupId,
      };

      const images = dedupeImageUrls([
        ...(detail.images ?? []),
        ...(detail.thumbnail ? [detail.thumbnail] : []),
      ]);

      const createdId = await adminProductsActions.create(
        {
          name: copyName,
          brand: detail.brand,
          category: detail.category,
          priceArs: detail.priceArs,
          costArs: Math.max(0, Math.round(detail.costArs ?? detail.priceArs * 0.55)),
          stockAvailable: detail.stockAvailable,
          sku: undefined,
          description: detail.description,
          active: true,
          images,
          metadata,
          handle: buildVariantHandle(
            copyName,
            detail.color ?? "",
            detail.size ?? detail.condition,
            handleSeed,
            index
          ),
        },
        { toast: false, invalidate: false }
      );

      if (createdId) createdIds.push(createdId);
    }

    setSearch("");
    setPage(1);
    setExpandedGroups((prev) => ({
      ...prev,
      [`group:${newGroupId}`]: true,
    }));

    if (createdIds[0]) {
      setPendingAutoEditVariantId(createdIds[0]);
    }

    invalidateAdminProducts();
    invalidateStoreProducts();

    notify(
      "Copia creada satisfactoriamente",
      createdIds.length > 1
        ? `Se creó la copia con ${createdIds.length} variantes.`
        : "Se creó la copia.",
      "success"
    );
  } catch (e) {
    const message = mapPanelError(e, "No se pudo duplicar el producto.");
    setError(message);
    notify("Error al duplicar el producto", message, "error");
  } finally {
    setDuplicatingGroupKey(null);
  }
}

async function deleteGroupAction(params: {
  group: ProductGroupEntry;
  duplicatingGroupKey: string | null;
  deletingGroupKey: string | null;
  addingVariantGroupKey: string | null;
  setDeletingGroupKey: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  confirm: ConfirmFn;
  startBulkJob: StartBulkJobFn;
}) {
  const {
    group,
    duplicatingGroupKey,
    deletingGroupKey,
    addingVariantGroupKey,
    setDeletingGroupKey,
    setError,
    confirm,
    startBulkJob,
  } = params;

  if (duplicatingGroupKey || deletingGroupKey || addingVariantGroupKey) return;

  const ids = group.allVariants.map((variant) => variant.id);
  if (!ids.length) return;

  const total = group.totalCount;
  const confirmed = await confirm({
    title: total > 1 ? "Eliminar variantes" : "Eliminar producto",
    description:
      total > 1
        ? `Vas a eliminar definitivamente ${total} variantes de "${group.primary.name}". Esta acción no se puede deshacer.`
        : `Vas a eliminar definitivamente "${group.primary.name}". Esta acción no se puede deshacer.`,
    confirmLabel: "Eliminar",
    cancelLabel: "Cancelar",
    confirmVariant: "destructive",
  });
  if (!confirmed) return;

  try {
    setDeletingGroupKey(group.key);
    setError(null);
    await startBulkJob({
      action: "delete",
      productIds: ids,
    });
  } catch (e) {
    const message = mapPanelError(e, "No se pudo eliminar el grupo.");
    setError(message);
    notify("Error al eliminar", message, "error");
  } finally {
    setDeletingGroupKey(null);
  }
}

async function deleteVariantFromGroupAction(params: {
  group: ProductGroupEntry;
  variant: AdminProduct;
  duplicatingGroupKey: string | null;
  deletingGroupKey: string | null;
  addingVariantGroupKey: string | null;
  deletingVariantId: string | null;
  bulkBusy: boolean;
  setDeletingVariantId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  confirm: ConfirmFn;
  startBulkJob: StartBulkJobFn;
}) {
  const {
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
  } = params;

  if (
    duplicatingGroupKey ||
    deletingGroupKey ||
    addingVariantGroupKey ||
    deletingVariantId ||
    bulkBusy
  ) {
    return;
  }

  if (group.totalCount <= 1) {
    notify(
      "No se puede eliminar la única variante",
      "El producto debe conservar al menos una variante.",
      "warning"
    );
    return;
  }

  try {
    setDeletingVariantId(variant.id);
    setError(null);

    const confirmed = await confirm({
      title: "Eliminar variante",
      description: `Vas a eliminar definitivamente la variante "${variant.name}". Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      confirmVariant: "destructive",
    });
    if (!confirmed) return;
    await startBulkJob({
      action: "delete",
      productIds: [variant.id],
    });
  } catch (e) {
    const message = mapPanelError(e, "No se pudo eliminar la variante.");
    setError(message);
    notify("Error al eliminar variante", message, "error");
  } finally {
    setDeletingVariantId(null);
  }
}

async function uploadVariantImagesAction(params: {
  variantIndex: number;
  files: File[];
  setUploadingVariantIndex: Dispatch<SetStateAction<number | null>>;
  setUploadingImage: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setPendingVariantUploads: Dispatch<SetStateAction<number>>;
  setForm: Dispatch<SetStateAction<FormState>>;
}) {
  const {
    variantIndex,
    files,
    setUploadingVariantIndex,
    setUploadingImage,
    setError,
    setPendingVariantUploads,
    setForm,
  } = params;

  if (!files.length) return;

  try {
    setUploadingVariantIndex(variantIndex);
    setUploadingImage(true);
    setError(null);
    await uploadImagesSequentially(files, {
      onPendingChange: setPendingVariantUploads,
      onUploaded: (urls) =>
        setForm((prev) => ({
          ...prev,
          variants: prev.variants.map((v, i) =>
            i === variantIndex
              ? { ...v, imageUrls: dedupeImageUrls([...v.imageUrls, ...urls]) }
              : v
          ),
        })),
    });
  } catch (e) {
    setError(mapPanelError(e, "No se pudo subir la imagen."));
  } finally {
    setUploadingImage(false);
    setUploadingVariantIndex(null);
    setPendingVariantUploads(0);
  }
}

async function addProductAction(params: {
  form: FormState;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setForm: Dispatch<SetStateAction<FormState>>;
  isCreateMode: boolean;
  onCreateRedirect: () => void;
}) {
  const { form, setBusy, setError, setForm, isCreateMode, onCreateRedirect } = params;

  const validationError = validateForm(form);
  if (validationError) {
    setError(validationError);
    return;
  }

  const totalVariants = form.variants.length;
  const createOptions = { toast: false, invalidate: false } as const;
  let createdCount = 0;

  try {
    setBusy(true);
    setError(null);

    const groupId = generateGroupId();
    const handleSeed = Date.now().toString(36);
    let handleIndex = 0;
    const characteristicsPayload = serializeProductCharacteristicsForMetadata(
      form.characteristics
    );

    for (const [variantIndex, variant] of form.variants.entries()) {
      const variantImages = resolveVariantImageUrls(form.variants, variantIndex);
      const parsedPrice = toNumberOrUndefined(variant.price)!;
      const parsedCost = toNumberOrUndefined(variant.cost)!;
      if (form.category === "Indumentaria") {
        const sizeStocks = toSizeStocks(
          variant.sizeStocks,
          variant.size,
          variant.stock
        );
        const activeSizes = getActiveSizeEntries(sizeStocks);
        if (!activeSizes.length) {
          throw new Error("Activa al menos un talle para guardar.");
        }
        const stockTotal = activeSizes.reduce((acc, item) => acc + item.stock, 0);
        const primarySize = activeSizes[0]?.size ?? "";

        await adminProductsActions.create(
          {
            name: form.name.trim(),
            brand: form.brand.trim(),
            category: form.category!,
            priceArs: parsedPrice,
            costArs: Math.max(0, Math.round(parsedCost)),
            handle: buildVariantHandle(
              form.name,
              variant.color,
              primarySize || variant.condition,
              handleSeed,
              handleIndex++
            ),
            stockAvailable: stockTotal,
            sku: variant.sku.trim() || undefined,
            description: form.description.trim() || undefined,
            images: variantImages,
            metadata: {
              condition: variant.condition,
              color: variant.color,
              size: primarySize,
              size_stocks: toMetadataSizeStocks(sizeStocks),
              gender: variant.gender,
              group_id: groupId,
              characteristics: characteristicsPayload,
            },
            active: true,
          },
          createOptions
        );
        createdCount += 1;

        continue;
      }

      const parsedStock = toNumberOrUndefined(variant.stock)!;
      await adminProductsActions.create(
        {
          name: form.name.trim(),
          brand: form.brand.trim(),
          category: form.category!,
          priceArs: parsedPrice,
          costArs: Math.max(0, Math.round(parsedCost)),
          handle: buildVariantHandle(
            form.name,
            variant.color,
            variant.size,
            handleSeed,
            handleIndex++
          ),
          stockAvailable: Math.trunc(parsedStock),
          sku: variant.sku.trim() || undefined,
          description: form.description.trim() || undefined,
          images: variantImages,
          metadata: {
            condition: variant.condition,
            color: variant.color,
            size: variant.size,
            gender: undefined,
            group_id: groupId,
            characteristics: characteristicsPayload,
          },
          active: true,
        },
        createOptions
      );
      createdCount += 1;
    }

    const isPlural = totalVariants > 1;
    const name = form.name.trim();
    const successTitle = isPlural
      ? "Productos creados satisfactoriamente"
      : "Producto creado satisfactoriamente";
    const successMessage = name
      ? `Se crearon ${totalVariants} producto${totalVariants === 1 ? "" : "s"} de "${name}".`
      : `Se crearon ${totalVariants} producto${totalVariants === 1 ? "" : "s"}.`;

    notify(successTitle, successMessage, "success");
    invalidateAdminProducts();
    invalidateStoreProducts();

    if (isCreateMode) {
      onCreateRedirect();
      return;
    }

    setForm(EMPTY_FORM);
  } catch (e) {
    const message = mapPanelError(e, "No se pudo crear el producto.");
    setError(message);
    notify(
      totalVariants > 1
        ? "Error al crear productos"
        : "Error al crear el producto",
      createdCount > 0
        ? `Se crearon ${createdCount} de ${totalVariants}. ${message}`
        : message,
      "error"
    );
    if (createdCount > 0) {
      invalidateAdminProducts();
      invalidateStoreProducts();
    }
  } finally {
    setBusy(false);
  }
}

export {
  addVariantToGroupAction,
  duplicateGroupAction,
  deleteGroupAction,
  deleteVariantFromGroupAction,
  uploadVariantImagesAction,
  addProductAction,
};
