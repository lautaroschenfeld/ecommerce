import { HttpError } from "../../../../../../lib/http"
import {
  exchangeOAuthCodeForToken,
  verifyOAuthIdTokenPayload,
} from "../shared"

function toBase64UrlJson(input: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url")
}

function abortError() {
  const error = new Error("aborted")
  ;(error as Error & { name: string }).name = "AbortError"
  return error
}

describe("oauth shared timeouts", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client-id"
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-client-secret"
    process.env.OAUTH_TOKEN_HTTP_TIMEOUT_MS = "5"
    process.env.OAUTH_JWKS_HTTP_TIMEOUT_MS = "5"
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.OAUTH_TOKEN_HTTP_TIMEOUT_MS
    delete process.env.OAUTH_JWKS_HTTP_TIMEOUT_MS
  })

  function mockFetchWithAbortOnly() {
    global.fetch = jest.fn((_url: unknown, init?: RequestInit) => {
      return new Promise((_, reject) => {
        const signal = init?.signal
        if (!signal) {
          reject(new Error("missing abort signal"))
          return
        }

        if (signal.aborted) {
          reject(abortError())
          return
        }

        signal.addEventListener(
          "abort",
          () => {
            reject(abortError())
          },
          { once: true }
        )
      })
    }) as typeof fetch
  }

  test("times out oauth token exchange when provider does not respond", async () => {
    mockFetchWithAbortOnly()

    await expect(
      exchangeOAuthCodeForToken("google", "oauth-code", "code-verifier")
    ).rejects.toMatchObject({
      type: HttpError.Types.INVALID_DATA,
      message: expect.stringContaining("timed out"),
    })
  })

  test("times out jwks download when provider does not respond", async () => {
    mockFetchWithAbortOnly()

    const header = toBase64UrlJson({ alg: "RS256", kid: "kid-test-1" })
    const payload = toBase64UrlJson({
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      sub: "sub-1",
    })
    const signature = Buffer.from("sig", "utf8").toString("base64url")
    const idToken = `${header}.${payload}.${signature}`

    await expect(
      verifyOAuthIdTokenPayload("google", idToken, "nonce-1")
    ).rejects.toMatchObject({
      type: HttpError.Types.INVALID_DATA,
      message: expect.stringContaining("timed out"),
    })
  })
})
