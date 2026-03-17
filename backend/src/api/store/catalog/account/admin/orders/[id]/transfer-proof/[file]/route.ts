import * as fs from "fs/promises"
import path from "path"

import type { HttpRequest, HttpResponse } from "../../../../../../../../../lib/http"
import { HttpError } from "../../../../../../../../../lib/http"

import {
  getCustomerAuthService,
  normalizeText,
  requireCustomerAdmin,
} from "../../../../../../_shared/customer-auth"

function asObject(input: unknown) {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null
}

function safeDirSegment(input: string) {
  const cleaned = String(input || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120)
  return cleaned || "order"
}

async function getOrderById(req: HttpRequest, orderId: string) {
  const service = getCustomerAuthService(req)
  const found = await service.listCustomerOrders({ id: orderId }, { take: 1 })
  return found[0] ?? null
}

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "transfer-proofs")

export async function GET(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)

  const orderId = normalizeText(req.params.id, 120)
  const fileId = normalizeText(req.params.file, 240)
  if (!orderId) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "order id is required.")
  }
  if (!fileId) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "file id is required.")
  }

  const order = await getOrderById(req, orderId)
  if (!order) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Order not found.")
  }

  const metadata = asObject(order.metadata) ?? {}
  const proof = asObject(metadata.transfer_proof) ?? {}
  const files = Array.isArray(proof.files) ? proof.files : []
  const entry = files.find((f: any) => String(f?.id || "") === fileId)
  if (!entry) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Transfer proof not found.")
  }

  const mime = typeof entry?.mime === "string" ? entry.mime : "application/octet-stream"
  const orderDir = safeDirSegment(orderId)
  const targetPath = path.join(UPLOAD_ROOT, orderDir, fileId)

  let buffer: Buffer
  try {
    buffer = await fs.readFile(targetPath)
  } catch {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Transfer proof file missing.")
  }

  res.setHeader("content-type", mime)
  res.setHeader("cache-control", "private, no-store")
  return res.status(200).send(buffer)
}
