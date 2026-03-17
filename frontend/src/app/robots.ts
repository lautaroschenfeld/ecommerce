import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/*",
          "/cuenta",
          "/cuenta/*",
          "/ingresar",
          "/checkout",
          "/carrito",
        ],
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`],
  };
}

