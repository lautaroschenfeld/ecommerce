export function slugifyProductName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function buildProductPath(
  productIdRaw: string,
  productNameRaw?: string | null
) {
  const productId = String(productIdRaw || "").trim();
  if (!productId) return "/productos";

  const slug = slugifyProductName(String(productNameRaw || "").trim()) || "producto";
  return `/productos/${encodeURIComponent(slug)}/${encodeURIComponent(productId)}`;
}
