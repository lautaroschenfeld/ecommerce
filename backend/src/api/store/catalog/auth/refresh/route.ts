import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../lib/http"

import {
  clearAuthCookies,
  mapPublicAccount,
  rotateSessionByRefreshToken,
  writeAuditLog,
} from "../../_shared/customer-auth"

export async function POST(req: HttpRequest, res: HttpResponse) {
  try {
    const { account } = await rotateSessionByRefreshToken(req, res)

    await writeAuditLog(req, {
      accountId: account.id,
      event: "auth.refresh.success",
      success: true,
    })

    return res.status(200).json({
      account: mapPublicAccount(account),
    })
  } catch (error) {
    clearAuthCookies(res)
    if (error instanceof HttpError) {
      return res.status(401).json({
        message: error.message,
        code: "AUTH_REFRESH_FAILED",
      })
    }
    throw error
  }
}
