import path from "path"

import {
  startBackendForIntegrationTests,
  type StartedBackend,
} from "./test-server"

jest.setTimeout(3 * 60 * 1000)

describe("Backend smoke (real DB)", () => {
  const backendRoot = path.resolve(__dirname, "../..")
  let backend: StartedBackend | null = null

  beforeAll(async () => {
    backend = await startBackendForIntegrationTests({ backendRoot })
  })

  afterAll(async () => {
    if (backend) {
      await backend.stop().catch(() => {})
      backend = null
    }
  })

  test("health endpoint responds 200", async () => {
    const res = await fetch(`${backend?.baseUrl}/health`)
    expect(res.status).toBe(200)
    expect(res.headers.get("x-response-time-ms")).toBeTruthy()
    expect(res.headers.get("x-request-id")).toBeTruthy()
  })

  test("health endpoint echoes x-request-id when provided", async () => {
    const clientRequestId = "it-health-request-id-123"
    const res = await fetch(`${backend?.baseUrl}/health`, {
      headers: {
        "x-request-id": clientRequestId,
      },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("x-request-id")).toBe(clientRequestId)
  })

  test("readiness endpoint responds 200 when DB is reachable", async () => {
    const res = await fetch(`${backend?.baseUrl}/health/ready`)
    expect(res.status).toBe(200)
    expect(res.headers.get("x-response-time-ms")).toBeTruthy()
    expect(res.headers.get("x-request-id")).toBeTruthy()

    const payload = (await res.json()) as {
      ok?: boolean
      checks?: { database?: string }
    }
    expect(payload.ok).toBe(true)
    expect(payload.checks?.database).toBe("ok")
  })

  test("store endpoints require publishable API key", async () => {
    const res = await fetch(`${backend?.baseUrl}/store/catalog/products?limit=1&offset=0`)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  test("store product list returns paginated response with publishable API key", async () => {
    const res = await fetch(`${backend?.baseUrl}/store/catalog/products?limit=2&offset=0`, {
      headers: {
        "x-publishable-api-key": backend?.publishableApiKey || "",
      },
    })

    expect(res.status).toBe(200)
    const json = await res.json()

    expect(Array.isArray(json.products)).toBe(true)
    expect(typeof json.count).toBe("number")
    expect(json.limit).toBe(2)
    expect(json.offset).toBe(0)
  })

  test("store related products endpoint responds with publishable API key", async () => {
    const listRes = await fetch(`${backend?.baseUrl}/store/catalog/products?limit=1&offset=0`, {
      headers: {
        "x-publishable-api-key": backend?.publishableApiKey || "",
      },
    })
    expect(listRes.status).toBe(200)
    const listJson = (await listRes.json()) as { products?: Array<{ id?: string }> }
    const firstProductId = String(listJson.products?.[0]?.id || "")
    expect(firstProductId).toBeTruthy()

    const relatedRes = await fetch(
      `${backend?.baseUrl}/store/catalog/products/${encodeURIComponent(firstProductId)}/related?limit=4`,
      {
        headers: {
          "x-publishable-api-key": backend?.publishableApiKey || "",
        },
      }
    )
    expect(relatedRes.status).toBe(200)
    const relatedJson = await relatedRes.json()
    expect(Array.isArray(relatedJson.products)).toBe(true)
    expect(typeof relatedJson.count).toBe("number")
  })

  test("store categories and brands return lists with publishable API key", async () => {
    const [categoriesRes, brandsRes] = await Promise.all([
      fetch(`${backend?.baseUrl}/store/catalog/categories`, {
        headers: { "x-publishable-api-key": backend?.publishableApiKey || "" },
      }),
      fetch(`${backend?.baseUrl}/store/catalog/brands`, {
        headers: { "x-publishable-api-key": backend?.publishableApiKey || "" },
      }),
    ])

    expect(categoriesRes.status).toBe(200)
    const categoriesJson = await categoriesRes.json()
    expect(Array.isArray(categoriesJson.categories)).toBe(true)

    expect(brandsRes.status).toBe(200)
    const brandsJson = await brandsRes.json()
    expect(Array.isArray(brandsJson.brands)).toBe(true)
  })

  test("openapi and docs endpoints require administrator session", async () => {
    const openapiRes = await fetch(`${backend?.baseUrl}/openapi`)
    expect(openapiRes.status).toBe(401)
    expect(openapiRes.headers.get("x-response-time-ms")).toBeTruthy()
    const openapiJson = await openapiRes.json()
    expect(String(openapiJson.message || "")).toContain("Not authenticated")

    const docsRes = await fetch(`${backend?.baseUrl}/docs`)
    expect(docsRes.status).toBe(401)
    const docsJson = await docsRes.json()
    expect(String(docsJson.message || "")).toContain("Not authenticated")
  })
})
