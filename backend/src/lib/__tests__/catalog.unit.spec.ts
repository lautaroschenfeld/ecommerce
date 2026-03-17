import {
  ALL_CATEGORIES,
  STORE_CURRENCY_CODE,
  PRIMARY_CATEGORIES,
  STORE_REGION_COUNTRY_CODE,
  STORE_REGION_NAME,
} from "../catalog"

describe("catalog constants", () => {
  test("primary categories match expected list", () => {
    expect(PRIMARY_CATEGORIES).toEqual([
      "Motor",
      "Transmisión",
      "Frenos",
      "Electricidad",
      "Ruedas",
      "Accesorios",
    ])
  })

  test("all categories contains primary categories and has stable size", () => {
    expect(ALL_CATEGORIES).toEqual(
      expect.arrayContaining(Array.from(PRIMARY_CATEGORIES))
    )
    expect(ALL_CATEGORIES.length).toBe(16)
    expect(ALL_CATEGORIES).toContain("Tornillería")
  })

  test("currency and region defaults are normalized", () => {
    expect(STORE_CURRENCY_CODE).toMatch(/^[a-z]{3}$/)
    expect(STORE_REGION_COUNTRY_CODE).toMatch(/^[a-z]{2}$/)
    expect(String(STORE_REGION_NAME).trim().length).toBeGreaterThan(0)
  })
})
