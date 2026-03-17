import { normalizeForSearch, slugify } from "../slug"

describe("slug helpers", () => {
  test("normalizeForSearch lowercases, trims, removes diacritics", () => {
    expect(normalizeForSearch("  Transmisión  ")).toBe("transmision")
    expect(normalizeForSearch("Baterías")).toBe("baterias")
    expect(normalizeForSearch("Iluminación")).toBe("iluminacion")
  })

  test("slugify converts text to URL-safe slug", () => {
    expect(slugify("Frenos & Suspensión")).toBe("frenos-suspension")
    expect(slugify("  Tornillería   (M8)  ")).toBe("tornilleria-m8")
  })
})

