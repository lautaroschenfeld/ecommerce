import { describe, expect, it } from "vitest";

import {
  normalizeStoreMediaUrl,
  normalizeStoreMediaUrlList,
  toStoreMediaProxyUrl,
} from "./store-media-url";

describe("store-media-url", () => {
  it("keeps absolute urls and normalizes protocol-relative values", () => {
    expect(normalizeStoreMediaUrl("https://cdn.example.com/a.webp")).toBe(
      "https://cdn.example.com/a.webp"
    );
    expect(normalizeStoreMediaUrl("http://cdn.example.com/a.webp")).toBe(
      "http://cdn.example.com/a.webp"
    );
    expect(normalizeStoreMediaUrl("//cdn.example.com/a.webp")).toBe(
      "https://cdn.example.com/a.webp"
    );
  });

  it("normalizes static and uploads paths to backend base", () => {
    expect(normalizeStoreMediaUrl("/static/pic.webp")).toBe(
      "http://localhost:9000/static/pic.webp"
    );
    expect(normalizeStoreMediaUrl("uploads/pic.webp")).toBe(
      "http://localhost:9000/uploads/pic.webp"
    );
  });

  it("extracts embedded static path from local filesystem-style inputs", () => {
    expect(
      normalizeStoreMediaUrl("C:\\Users\\me\\Desktop\\Ecommerce\\backend\\static\\x.webp")
    ).toBe("http://localhost:9000/static/x.webp");
    expect(
      normalizeStoreMediaUrl("/Users/me/Desktop/Ecommerce/backend/uploads/x.webp")
    ).toBe("http://localhost:9000/uploads/x.webp");
  });

  it("rewrites internal absolute media urls to public backend base", () => {
    expect(normalizeStoreMediaUrl("http://backend:9000/static/x.webp")).toBe(
      "http://localhost:9000/static/x.webp"
    );
    expect(normalizeStoreMediaUrl("http://backend:9000/uploads/x.webp?q=1")).toBe(
      "http://localhost:9000/uploads/x.webp?q=1"
    );
  });

  it("handles hostnames and bare filenames", () => {
    expect(normalizeStoreMediaUrl("www.misitio.com/a.jpg")).toBe(
      "https://www.misitio.com/a.jpg"
    );
    expect(normalizeStoreMediaUrl("localhost:9000/static/a.jpg")).toBe(
      "http://localhost:9000/static/a.jpg"
    );
    expect(normalizeStoreMediaUrl("producto.webp")).toBe(
      "http://localhost:9000/static/producto.webp"
    );
  });

  it("deduplicates and removes empty values", () => {
    expect(
      normalizeStoreMediaUrlList([
        " ",
        "https://cdn.example.com/a.webp",
        "https://cdn.example.com/a.webp",
        "/static/a.webp",
        "null",
      ])
    ).toEqual([
      "https://cdn.example.com/a.webp",
      "/store-media/static/a.webp",
    ]);
  });

  it("maps static/uploads media to same-origin proxy paths", () => {
    expect(toStoreMediaProxyUrl("/static/pic.webp")).toBe(
      "/store-media/static/pic.webp"
    );
    expect(toStoreMediaProxyUrl("http://backend:9000/uploads/a.webp?q=1")).toBe(
      "/store-media/uploads/a.webp?q=1"
    );
  });

  it("keeps non-store urls unchanged in proxy helper", () => {
    expect(toStoreMediaProxyUrl("https://cdn.example.com/a.webp")).toBe(
      "https://cdn.example.com/a.webp"
    );
    expect(toStoreMediaProxyUrl("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc"
    );
  });
});
