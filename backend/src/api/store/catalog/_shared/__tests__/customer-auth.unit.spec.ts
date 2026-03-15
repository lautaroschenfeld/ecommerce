import {
  assertPasswordStrength,
  buildOrderNumber,
  buildTrackingCode,
  canAccessAdminPanelRole,
  hashPassword,
  mergeCartItemsWithSessionPriority,
  normalizeAddressInput,
  normalizeCustomerRole,
  passwordResetExpiryDate,
  sanitizeCartItems,
  verifyPassword,
} from "../customer-auth"

describe("customer auth shared utils", () => {
  test("hashes and verifies passwords", async () => {
    const hash = await hashPassword("StoreTest123")

    expect(hash.startsWith("scrypt$")).toBe(true)
    await expect(verifyPassword("StoreTest123", hash)).resolves.toBe(true)
    await expect(verifyPassword("WrongPassword123", hash)).resolves.toBe(false)
    await expect(verifyPassword("StoreTest123", "invalid")).resolves.toBe(false)
  })

  test("sanitizes cart items and drops invalid entries", () => {
    const items = sanitizeCartItems([
      {
        id: "sku-1",
        name: "Filtro premium",
        brand: "Honda",
        category: "Filtros",
        priceArs: 10500.8,
        qty: 120,
      },
      {
        id: "bad-no-price",
        name: "x",
        brand: "x",
        category: "x",
        qty: 1,
      },
    ])

    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      id: "sku-1",
      name: "Filtro premium",
      brand: "Honda",
      category: "Filtros",
      priceArs: 10500,
      qty: 99,
      imageUrl: undefined,
    })
  })

  test("merges carts keeping session items as source of truth", () => {
    const merged = mergeCartItemsWithSessionPriority(
      [
        {
          id: "same",
          name: "Pastilla Freno",
          brand: "Brembo",
          category: "Frenos",
          priceArs: 20000,
          qty: 1,
        },
      ],
      [
        {
          id: "same",
          name: "Pastilla Freno Invitado",
          brand: "Otra",
          category: "Frenos",
          priceArs: 19999,
          qty: 2,
        },
        {
          id: "new",
          name: "Cadena",
          brand: "RK",
          category: "Transmision",
          priceArs: 35000,
          qty: 1,
        },
      ]
    )

    expect(merged).toHaveLength(2)
    expect(merged[0].name).toBe("Pastilla Freno")
    expect(merged[1].id).toBe("new")
  })

  test("validates password strength", () => {
    expect(() => assertPasswordStrength("short1A")).toThrow("at least 8")
    expect(() => assertPasswordStrength("alllowercase1")).toThrow("uppercase")
    expect(() => assertPasswordStrength("ALLUPPERCASE1")).toThrow("lowercase")
    expect(() => assertPasswordStrength("NoDigitsHere")).toThrow("number")
    expect(() => assertPasswordStrength("StrongPass1")).not.toThrow()
  })

  test("normalizes address payload and requires key fields", () => {
    const address = normalizeAddressInput({
      line1: "  Av. Siempre Viva 123 ",
      city: " Buenos Aires ",
      province: " CABA ",
      postalCode: "C1000",
    })

    expect(address).toEqual({
      label: "Address",
      recipient: null,
      phone: null,
      line1: "Av. Siempre Viva 123",
      line2: null,
      city: "Buenos Aires",
      province: "CABA",
      postal_code: "C1000",
      is_default: false,
    })

    expect(() =>
      normalizeAddressInput({
        line1: "",
        city: "X",
        province: "Y",
      })
    ).toThrow("required")
  })

  test("builds order/tracking ids and reset expiry date", () => {
    const orderNumber = buildOrderNumber()
    const trackingCode = buildTrackingCode()
    const resetExpiry = passwordResetExpiryDate()

    expect(orderNumber).toMatch(/^MP-\d{6}-[A-F0-9]{6}$/)
    expect(trackingCode).toMatch(/^MPA-[A-F0-9]{6}$/)
    expect(resetExpiry.getTime()).toBeGreaterThan(Date.now())
  })

  test("normalizes customer roles and admin access checks", () => {
    expect(normalizeCustomerRole("administrator")).toBe("administrator")
    expect(normalizeCustomerRole("employee")).toBe("employee")
    expect(normalizeCustomerRole("user")).toBe("user")
    expect(normalizeCustomerRole("something-else")).toBe("user")

    expect(canAccessAdminPanelRole("administrator")).toBe(true)
    expect(canAccessAdminPanelRole("employee")).toBe(false)
    expect(canAccessAdminPanelRole("user")).toBe(false)
  })
})
