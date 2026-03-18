import { describe, expect, it } from "vitest";

import { sanitizeCartItemsSnapshot } from "@/lib/store-cart";

describe("sanitizeCartItemsSnapshot", () => {
  it("normalizes and deduplicates imageUrls candidates", () => {
    const items = sanitizeCartItemsSnapshot([
      {
        id: "prod-1",
        name: "Aceite 10W40",
        brand: "Motul",
        category: "Lubricantes",
        priceArs: 12000,
        qty: 2,
        imageUrls: [
          "/static/aceite.png",
          "/static/aceite.png",
          "https://cdn.example.com/motul.jpg",
        ],
        imageUrl: "/static/portada.png",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.imageUrls).toEqual([
      "/store-media/static/aceite.png",
      "https://cdn.example.com/motul.jpg",
      "/store-media/static/portada.png",
    ]);
    expect(items[0]?.imageUrl).toBe("/store-media/static/aceite.png");
  });
});
