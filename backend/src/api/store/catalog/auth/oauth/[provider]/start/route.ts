import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"

import {
  buildOAuthAuthorizeUrl,
  createOAuthState,
  getOAuthProvider,
  setOAuthStateCookie,
} from "../../shared"

export async function GET(req: HttpRequest, res: HttpResponse) {
  const provider = getOAuthProvider(req.params.provider)
  const redirectPath =
    typeof req.query.redirect === "string" ? req.query.redirect : undefined

  const state = createOAuthState(provider, redirectPath)
  const authorizeUrl = buildOAuthAuthorizeUrl(state)
  setOAuthStateCookie(res, state)

  const wantsJson =
    (req.headers.accept || "").includes("application/json") ||
    req.query.mode === "json"

  if (wantsJson) {
    return res.status(200).json({
      provider,
      authorization_url: authorizeUrl,
    })
  }

  return res.redirect(authorizeUrl)
}
