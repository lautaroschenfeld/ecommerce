import { normalizeColorKey, resolveVariantColorSwatch } from "@/lib/variant-colors";

export type ProductColorVariantInput = {
  color?: string | null;
  soldQty?: number | null;
};

export type ProductColorSwatch = {
  key: string;
  color: string;
  swatch: string;
  soldQty: number;
};

export type ProductColorSummary = {
  visible: ProductColorSwatch[];
  hiddenCount: number;
  totalColors: number;
};

function toSoldQty(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function resolveProductColorSummary(
  variants: ProductColorVariantInput[],
  maxVisible = 3
): ProductColorSummary {
  const normalizedLimit = Number.isFinite(maxVisible)
    ? Math.max(1, Math.trunc(maxVisible))
    : 3;

  const byColor = new Map<
    string,
    {
      key: string;
      color: string;
      soldQty: number;
      firstIndex: number;
    }
  >();

  variants.forEach((variant, index) => {
    const rawColor = (variant.color ?? "").trim();
    if (!rawColor) return;

    const key = normalizeColorKey(rawColor) || rawColor.toLowerCase();
    if (!key) return;

    const soldQty = toSoldQty(variant.soldQty);
    const current = byColor.get(key);
    if (!current) {
      byColor.set(key, {
        key,
        color: rawColor,
        soldQty,
        firstIndex: index,
      });
      return;
    }

    current.soldQty += soldQty;
  });

  const all = Array.from(byColor.values());
  if (!all.length) {
    return {
      visible: [],
      hiddenCount: 0,
      totalColors: 0,
    };
  }

  const hasSales = all.some((item) => item.soldQty > 0);
  all.sort((a, b) => {
    if (hasSales) {
      if (b.soldQty !== a.soldQty) return b.soldQty - a.soldQty;
    }
    return a.firstIndex - b.firstIndex;
  });

  const visible = all.slice(0, normalizedLimit).map((item) => ({
    key: item.key,
    color: item.color,
    soldQty: item.soldQty,
    swatch: resolveVariantColorSwatch(item.color) || "#6b7280",
  }));

  return {
    visible,
    hiddenCount: Math.max(0, all.length - visible.length),
    totalColors: all.length,
  };
}
