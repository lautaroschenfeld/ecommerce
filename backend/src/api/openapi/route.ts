import type { HttpRequest, HttpResponse } from "../../lib/http"

import { buildOpenApiDocument } from "../_docs/openapi"
import { requireCustomerAdministrator } from "../store/catalog/_shared/customer-auth"

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdministrator(req, res)
  res.setHeader("Cache-Control", "private, no-store, max-age=0")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("X-Content-Type-Options", "nosniff")
  return res.status(200).json(buildOpenApiDocument(req))
}
