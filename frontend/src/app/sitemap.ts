import type { MetadataRoute } from "next";

import { buildProductPath } from "@/lib/product-path";
import { absoluteUrl } from "@/lib/seo";
import { listSeoProductsForSitemap } from "@/lib/store-seo";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/productos"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/nosotros"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: absoluteUrl("/contacto"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: absoluteUrl("/terminos-y-condiciones"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/politica-de-privacidad"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/cambios-y-devoluciones"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/politica-de-envios"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/boton-de-arrepentimiento"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  const products = await listSeoProductsForSitemap();
  const dynamicRoutes: MetadataRoute.Sitemap = products.map((product) => {
    const dateRaw = product.updatedAt || product.createdAt;
    const lastModified = dateRaw ? new Date(dateRaw) : now;

    return {
      url: absoluteUrl(buildProductPath(product.id, product.name)),
      lastModified: Number.isFinite(lastModified.getTime()) ? lastModified : now,
      changeFrequency: "daily",
      priority: 0.8,
    };
  });

  return [...staticRoutes, ...dynamicRoutes];
}
