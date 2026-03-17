import type { HttpRequest, HttpResponse } from "../../../../../lib/http"

import {
  getSessionFromAccessCookie,
  revokeCurrentSessionIfAny,
  writeAuditLog,
} from "../../_shared/customer-auth"

export async function POST(req: HttpRequest, res: HttpResponse) {
  const ctx = await getSessionFromAccessCookie(req)
  await revokeCurrentSessionIfAny(req, res)

  if (ctx?.account?.id) {
    await writeAuditLog(req, {
      accountId: ctx.account.id,
      event: "auth.logout",
      success: true,
    })
  }

  return res.status(200).json({ ok: true })
}
