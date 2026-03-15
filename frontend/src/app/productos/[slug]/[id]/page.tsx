import type { Metadata } from "next";

import { ProductDetailPage } from "@/components/products/product-detail-page";
import { formatMoney } from "@/lib/format";
import { buildProductPath as buildProductDetailPath } from "@/lib/product-path";
import {
  findCharacteristicByKey,
  readProductCharacteristicsFromMetadata,
  toSeoAdditionalProperties,
} from "@/lib/product-characteristics";
import { absoluteUrl, cleanMetaText, SITE_NAME } from "@/lib/seo";
import { findSeoProductById } from "@/lib/store-seo";
import { getStorefrontSettingsSafe } from "@/lib/storefront-settings";

type ProductoDetalleRouteProps = {
  params: Promise<{ id: string }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pickMetadataString(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const found = toCleanString(metadata[key]);
    if (found) return found;
  }
  return undefined;
}

function resolveGtinFields(gtinRaw: string | undefined) {
  const gtin = gtinRaw?.replace(/[^0-9]/g, "") ?? "";
  if (!gtin) return {} as Record<string, string>;
  if (gtin.length === 8) return { gtin8: gtin };
  if (gtin.length === 12) return { gtin12: gtin };
  if (gtin.length === 13) return { gtin13: gtin };
  if (gtin.length === 14) return { gtin14: gtin };
  return { gtin13: gtin };
}

export async function generateMetadata({
  params,
}: ProductoDetalleRouteProps): Promise<Metadata> {
  const { id } = await params;
  const product = await findSeoProductById(id);
  const storefront = await getStorefrontSettingsSafe();

  const canonical = buildProductDetailPath(product?.id ?? id, product?.name);

  if (!product) {
    const title = "Producto";
    const description = "Detalle de producto.";

    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        type: "website",
        url: canonical,
        title,
        description,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  }

  const title = `${product.name} | ${product.brand}`;
  const description = cleanMetaText(
    `${product.name} de ${product.brand}. ${formatMoney(product.priceArs, {
      currencyCode: storefront.currencyCode,
      locale: storefront.storeLocale,
    })} en ${SITE_NAME}.`
  );
  const imageUrl = absoluteUrl(product.imageUrl || "/product_placeholder.png");

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 900, alt: product.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function ProductoDetalleRoute({
  params,
}: ProductoDetalleRouteProps) {
  const { id } = await params;
  const product = await findSeoProductById(id);
  const storefront = await getStorefrontSettingsSafe();
  const canonical = buildProductDetailPath(product?.id ?? id, product?.name);

  const productJsonLd = product
    ? (() => {
        const metadata = asRecord(product.metadata) ?? {};
        const characteristics = readProductCharacteristicsFromMetadata(metadata, {
          category: product.category,
          hints: { brand: product.brand, model: product.name },
        });
        const additionalProperty = toSeoAdditionalProperties(characteristics);
        const modelFromCharacteristics = findCharacteristicByKey(
          characteristics,
          "model"
        );
        const model =
          toCleanString(modelFromCharacteristics?.value) ||
          pickMetadataString(metadata, ["model", "modelo"]);
        const mpn = pickMetadataString(metadata, ["mpn", "part_number", "partNumber"]);
        const gtinRaw = pickMetadataString(metadata, [
          "gtin14",
          "gtin13",
          "gtin12",
          "gtin8",
          "gtin",
          "ean",
          "ean13",
          "upc",
          "barcode",
        ]);
        const gtinFields = resolveGtinFields(gtinRaw);
        const sku = product.sku?.trim() || product.id;
        const description = toCleanString(product.description);

        return {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          brand: {
            "@type": "Brand",
            name: product.brand,
          },
          category: product.category,
          sku,
          ...(description ? { description } : {}),
          ...(model ? { model } : {}),
          ...(mpn ? { mpn } : {}),
          ...gtinFields,
          ...(additionalProperty.length ? { additionalProperty } : {}),
          image: [absoluteUrl(product.imageUrl || "/product_placeholder.png")],
          offers: {
            "@type": "Offer",
            url: absoluteUrl(canonical),
            priceCurrency: storefront.currencyCode,
            price: String(product.priceArs),
            availability:
              product.inStock === false
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
          },
        };
      })()
    : null;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: absoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Productos",
        item: absoluteUrl("/productos"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product?.name || "Producto",
        item: absoluteUrl(canonical),
      },
    ],
  };

  return (
    <>
      {productJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ProductDetailPage productId={id} />
    </>
  );
}
