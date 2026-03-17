import type { Metadata } from "next";

import { ProductsExplorer } from "@/components/products/products-explorer";
import { ALL_CATEGORIES, type Category } from "@/lib/catalog";
import {
  buildSocialMetadata,
  cleanMetaText,
  resolveSiteName,
} from "@/lib/seo";
import { getStorefrontSettingsSafe } from "@/lib/storefront-settings";

type SearchParams = { [key: string]: string | string[] | undefined };

type ProductosPageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function resolveCategory(searchParams?: SearchParams) {
  const raw = searchParams?.categoria;
  return typeof raw === "string" && ALL_CATEGORIES.includes(raw as Category)
    ? (raw as Category)
    : undefined;
}

function resolveQuery(searchParams?: SearchParams) {
  const raw = searchParams?.q;
  if (typeof raw === "string") {
    const normalized = raw.trim();
    return normalized || undefined;
  }
  if (Array.isArray(raw) && raw.length) {
    const normalized = String(raw[0] ?? "").trim();
    return normalized || undefined;
  }
  return undefined;
}

function resolveBrands(searchParams?: SearchParams) {
  const raw = searchParams?.marca ?? searchParams?.brand;
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of values) {
    if (typeof entry !== "string") continue;
    const parts = entry.split(",");
    for (const part of parts) {
      const normalized = part.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalized);
    }
  }

  return out;
}

export async function generateMetadata({
  searchParams,
}: ProductosPageProps): Promise<Metadata> {
  const resolved = (await Promise.resolve(searchParams)) ?? {};
  const storefront = await getStorefrontSettingsSafe();
  const siteName = resolveSiteName(storefront.storeName);
  const category = resolveCategory(resolved);
  const query = resolveQuery(resolved);
  const brands = resolveBrands(resolved);

  const title = query
    ? category
      ? `${query} en ${category}`
      : `${query} para motos`
    : category
      ? `${category} para motos`
      : "Catalogo de repuestos para motos";
  const description = cleanMetaText(
    query
      ? `Encuentra ${query} en ${siteName}. Filtra por categoria y marca, compara opciones y compra repuestos para motos con stock actualizado.`
      : category
        ? `Compra ${category.toLowerCase()} para motos en ${siteName}. Filtra por marca y precio, y recibe tu pedido con envio rapido.`
        : `Explora repuestos, accesorios e indumentaria para motos en ${siteName}. Busca por marca, categoria y precio con stock actualizado.`
  );

  const canonicalParams = new URLSearchParams();
  if (category) canonicalParams.set("categoria", category);
  if (query) canonicalParams.set("q", query);
  for (const brand of brands) canonicalParams.append("marca", brand);
  const canonicalQs = canonicalParams.toString();
  const canonical = canonicalQs ? `/productos?${canonicalQs}` : "/productos";

  return {
    title,
    description,
    ...buildSocialMetadata({
      title: `${title} | ${siteName}`,
      description,
      canonical,
      storefront,
      imageAlt: `${siteName} productos`,
    }),
  };
}

export default async function ProductosPage({ searchParams }: ProductosPageProps) {
  const resolved = (await Promise.resolve(searchParams)) ?? {};
  const categoria = resolveCategory(resolved);
  const query = resolveQuery(resolved);
  const brands = resolveBrands(resolved);
  const explorerKey = `${categoria ?? "all"}::${query ?? ""}::${brands.join("|")}`;

  return (
    <ProductsExplorer
      key={explorerKey}
      initialCategory={categoria}
      initialQuery={query}
      initialBrands={brands}
    />
  );
}
