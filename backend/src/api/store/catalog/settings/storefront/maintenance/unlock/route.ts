import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"

import {
  getStorefrontMaintenanceState,
  verifyStorefrontMaintenancePassword,
} from "../../../../_shared/storefront-settings"

export async function POST(req: HttpRequest, res: HttpResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const password = typeof body.password === "string" ? body.password : ""

  const maintenance = await getStorefrontMaintenanceState(req)
  if (!maintenance.enabled) {
    return res.json({ ok: true, maintenance_mode: false })
  }

  if (!maintenance.passwordHash) {
    return res.status(503).json({
      message: "Modo mantenimiento activo sin clave configurada.",
      code: "MAINTENANCE_PASSWORD_NOT_CONFIGURED",
    })
  }

  const valid = verifyStorefrontMaintenancePassword(password, maintenance.passwordHash)
  if (!valid) {
    return res.status(401).json({
      message: "Clave de mantenimiento incorrecta.",
      code: "MAINTENANCE_INVALID_PASSWORD",
    })
  }

  return res.json({ ok: true, maintenance_mode: true })
}
