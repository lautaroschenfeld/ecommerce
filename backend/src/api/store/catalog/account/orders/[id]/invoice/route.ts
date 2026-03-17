import { HttpError, type HttpRequest, type HttpResponse } from "../../../../../../../lib/http"
import {
  getCustomerAuthService,
  normalizeCustomerRole,
  normalizeText,
  requireCustomerAuth,
  writeAuditLog,
} from "../../../../_shared/customer-auth"
import { buildOrderInvoicePdf, orderInvoiceFileName } from "../../../../../../../lib/order-invoice-pdf"

async function getOrderById(req: HttpRequest, orderId: string) {
  const service = getCustomerAuthService(req)
  const found = await service.listCustomerOrders({ id: orderId }, { take: 1 })
  return found[0] ?? null
}

function canReadAnyOrderByRole(role: unknown) {
  const normalized = normalizeCustomerRole(role)
  return normalized === "administrator" || normalized === "employee"
}

export async function GET(req: HttpRequest, res: HttpResponse) {
  const { account } = await requireCustomerAuth(req, res)

  const orderId = normalizeText(req.params.id, 120)
  if (!orderId) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "order id is required.")
  }

  const order = await getOrderById(req, orderId)
  if (!order) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Order not found.")
  }

  const ownsOrder =
    typeof order.account_id === "string" && order.account_id === account.id
  const canReadAnyOrder = canReadAnyOrderByRole(account.role)

  if (!ownsOrder && !canReadAnyOrder) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Order access denied.")
  }

  const pdf = buildOrderInvoicePdf(order)
  const fileName = orderInvoiceFileName(order)

  await writeAuditLog(req, {
    accountId: account.id,
    event: "order.invoice.downloaded",
    success: true,
    metadata: {
      order_id: order.id,
      order_number: order.order_number || null,
      can_read_any_order: canReadAnyOrder,
    },
  }).catch(() => {
    // Best effort. The invoice download should not fail if audit logging fails.
  })

  res.setHeader("content-type", "application/pdf")
  res.setHeader("content-length", String(pdf.byteLength))
  res.setHeader("content-disposition", `attachment; filename="${fileName}"`)
  res.setHeader("cache-control", "private, no-store")
  res.setHeader("x-content-type-options", "nosniff")

  return res.status(200).send(pdf)
}
