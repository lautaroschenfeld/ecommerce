import {
  readProductCharacteristicsFromMetadata,
} from "@/lib/product-characteristics";
import { adminProductsActions } from "@/lib/store-admin-products";
import type { AdminProduct } from "@/lib/store-mappers";

import {
  buildCharacteristicHints,
  dedupeImageUrls,
  getActiveSizeEntries,
  normalizeApparelGender,
  readSizeStocksFromMetadata,
  toAdminCategory,
  toSizeStocks,
  type FormState,
} from "./products-admin-support-utils";

type LoadedEditDialogState = {
  existingIds: string[];
  variantGroupId: string;
  buildNextForm: (prev: FormState) => FormState;
};

export async function loadEditDialogState(
  product: AdminProduct,
  allProducts: AdminProduct[]
): Promise<LoadedEditDialogState> {
  const groupId = product.variantGroupId || product.id;
  const related = allProducts
    .filter((entry) => (entry.variantGroupId && entry.variantGroupId === groupId) || entry.id === product.id)
    .sort((a, b) => {
      if (a.id === product.id) return -1;
      if (b.id === product.id) return 1;
      return a.createdAt - b.createdAt;
    });

  const idsToFetch = related.map((entry) => entry.id);
  const details = await Promise.all(idsToFetch.map((id) => adminProductsActions.getById(id)));

  const variants = details.map((detail) => {
    const sizeStocks = toSizeStocks(
      readSizeStocksFromMetadata(detail.metadata),
      detail.size ?? "",
      String(detail.stockAvailable ?? 0)
    );
    const firstActiveSize = getActiveSizeEntries(sizeStocks)[0];

    return {
      id: detail.id,
      color: detail.color ?? "",
      size: firstActiveSize?.size ?? detail.size ?? "",
      gender: normalizeApparelGender(detail.gender),
      condition: detail.condition ?? "nuevo",
      price: detail.priceArs ? String(detail.priceArs) : "",
      cost: String(Math.max(0, Math.round(detail.costArs ?? detail.priceArs * 0.55))),
      stock: firstActiveSize
        ? String(firstActiveSize.stock)
        : String(detail.stockAvailable ?? 0),
      sizeStocks,
      sku: detail.sku ?? "",
      imageUrls: dedupeImageUrls([
        ...(detail.images ?? []),
        ...(detail.thumbnail ? [detail.thumbnail] : []),
      ]),
      active: detail.active,
    };
  });

  const firstDetail = details[0];
  const nextVariantGroupId = firstDetail?.variantGroupId || groupId;

  return {
    existingIds: idsToFetch,
    variantGroupId: nextVariantGroupId,
    buildNextForm: (prev) => {
      const nextCategory = toAdminCategory(firstDetail?.category) ?? prev.category;
      const groupGender = normalizeApparelGender(firstDetail?.gender);
      const primaryColor = variants[0]?.color ?? firstDetail?.color ?? "";
      const characteristics = readProductCharacteristicsFromMetadata(
        firstDetail?.metadata,
        {
          category: nextCategory,
          hints: buildCharacteristicHints({
            brand: firstDetail?.brand ?? prev.brand,
            name: firstDetail?.name ?? prev.name,
            color: primaryColor,
          }),
        }
      );

      return {
        ...prev,
        name: firstDetail?.name ?? prev.name,
        brand: firstDetail?.brand ?? prev.brand,
        category: nextCategory,
        description: firstDetail?.description ?? "",
        characteristics,
        variants:
          nextCategory === "Indumentaria"
            ? variants.map((variant) => ({ ...variant, gender: groupGender }))
            : variants,
      };
    },
  };
}

