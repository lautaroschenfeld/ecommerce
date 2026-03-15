import {
  sanitizeExpressRequestInputs,
  sanitizeUnknownInput,
} from "../request-input-sanitizer"

describe("request input sanitizer", () => {
  test("removes control and bidi characters from strings", () => {
    const input = `A\u0000B\u0007C\u202ED`
    const out = sanitizeUnknownInput(input)
    expect(out).toBe("ABCD")
  })

  test("sanitizes nested arrays and objects", () => {
    const out = sanitizeUnknownInput({
      user: {
        email: "abc\u0000@example.com",
      },
      list: ["one\u0000", { deep: "\u202Evalue" }],
    })

    expect(out).toEqual({
      user: {
        email: "abc@example.com",
      },
      list: ["one", { deep: "value" }],
    })
  })

  test("drops prototype-polluting keys", () => {
    const payload = JSON.parse(
      '{"safe":"x","__proto__":{"injected":true},"constructor":"bad","prototype":"bad"}'
    ) as Record<string, unknown>

    const out = sanitizeUnknownInput(payload)

    expect(out).toEqual({
      safe: "x",
    })
    expect(Object.prototype).not.toHaveProperty("injected")
  })

  test("sanitizes express request containers", () => {
    const req = {
      query: { q: "abc\u0000def" },
      body: { input: "\u202Ehello" },
      params: { id: "123\u0000" },
    }

    sanitizeExpressRequestInputs(req)

    expect(req.query).toEqual({ q: "abcdef" })
    expect(req.body).toEqual({ input: "hello" })
    expect(req.params).toEqual({ id: "123" })
  })
})
