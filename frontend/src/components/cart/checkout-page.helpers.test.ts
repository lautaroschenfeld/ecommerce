import { describe, expect, it } from "vitest";

import { DEFAULT_DRAFT, sanitizeIntentItems } from "./checkout-page.helpers";

describe("checkout-page.helpers", () => {
  it("keeps addressNumber in the default checkout draft", () => {
    expect(DEFAULT_DRAFT.addressNumber).toBe("");
  });

  it("normalizes and deduplicates imageUrls in buy-now intent items", () => {
    const items = sanitizeIntentItems([
      {
        id: "prod-1",
        name: "Aceite 20W50",
        brand: "Motul",
        category: "Lubricantes",
        priceArs: 13800,
        qty: 1,
        imageUrls: ["/static/aceite-20w50.png", "/static/aceite-20w50.png"],
        imageUrl: "https://cdn.example.com/aceite-20w50.jpg",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.imageUrls).toEqual([
      "/store-media/static/aceite-20w50.png",
      "https://cdn.example.com/aceite-20w50.jpg",
    ]);
    expect(items[0]?.imageUrl).toBe("/store-media/static/aceite-20w50.png");
  });
});
