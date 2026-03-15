import type { HttpRequest, HttpResponse } from "../../../../../../../../lib/http"

import { requireCustomerAdmin } from "../../../../../_shared/customer-auth"
import { ensureBulkJobsDrain } from "../_drain"
import { getBulkJob } from "../_state"

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)
  ensureBulkJobsDrain()

  const jobId = String(req.params.jobId || "").trim()
  if (!jobId) return res.status(400).json({ message: "jobId is required" })

  const job = await getBulkJob(jobId)
  if (!job) return res.status(404).json({ message: "Not found" })

  return res.json({ job })
}
