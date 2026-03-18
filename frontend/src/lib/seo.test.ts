import { describe, expect, it } from "vitest";

import {
  buildSocialMetadata,
  SITE_DESCRIPTION,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
} from "./seo";

describe("buildSocialMetadata", () => {
  it("omits open graph siteName while keeping social metadata fields", () => {
    const metadata = buildSocialMetadata({
      title: "FR Motos",
      description: "Repuestos para motos",
      canonical: "/",
      storefront: {
        storeName: "FR Motos",
        storeLocale: "es-AR",
      },
      imageUrl: "https://cdn.example.com/social.png",
      imageAlt: "FR Motos preview",
    });

    expect(metadata.alternates?.canonical).toBe("/");
    expect(metadata.openGraph?.title).toBe("FR Motos");
    expect(metadata.openGraph?.description).toBe("Repuestos para motos");
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "https://cdn.example.com/social.png",
        width: SOCIAL_IMAGE_WIDTH,
        height: SOCIAL_IMAGE_HEIGHT,
        alt: "FR Motos preview",
      },
    ]);
    expect(Object.prototype.hasOwnProperty.call(metadata.openGraph ?? {}, "siteName")).toBe(
      false
    );
    expect(metadata.twitter).toEqual({
      card: "summary",
      title: "FR Motos",
      description: "Repuestos para motos",
      images: ["https://cdn.example.com/social.png"],
    });
  });

  it("does not keep the legacy 'en FR Motos' suffix in site description", () => {
    expect(SITE_DESCRIPTION.toLowerCase()).not.toContain("compra online segura en fr motos");
  });
});
