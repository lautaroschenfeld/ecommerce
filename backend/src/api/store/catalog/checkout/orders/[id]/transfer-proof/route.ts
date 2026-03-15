import crypto from "crypto"
import * as fs from "fs/promises"
import path from "path"

import type { HttpRequest, HttpResponse } from "../../../../../../../lib/http"
import { HttpError } from "../../../../../../../lib/http"
import { nanoId } from "../../../../../../../lib/id"
import { publishAdminNotification } from "../../../../../../../lib/admin-notifications"

import {
  getCustomerAuthService,
  hashToken,
  normalizeText,
} from "../../../../_shared/customer-auth"

function asObject(input: unknown) {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null
}

function newEventId() {
  return nanoId(12)
}

function appendTimelineEvent(metadata: Record<string, any>, event: { type: string; message: string }) {
  const list = Array.isArray(metadata.timeline) ? metadata.timeline : []
  const next = [
    ...list,
    {
      id: newEventId(),
      at: new Date().toISOString(),
      type: normalizeText(event.type, 80) || "event",
      message: normalizeText(event.message, 240) || "",
    },
  ]

  metadata.timeline = next.slice(-200)
}

function isBankTransfer(paymentMethod: unknown) {
  return String(paymentMethod || "").toLowerCase().includes("transfer")
}

function safeEqualHex(a: string, b: string) {
  const aBuf = Buffer.from(String(a || ""), "hex")
  const bBuf = Buffer.from(String(b || ""), "hex")
  if (!aBuf.length || aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

function safeDirSegment(input: string) {
  const cleaned = String(input || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120)
  return cleaned || "order"
}

function fileExtFromMime(mime: string) {
  const safe = String(mime || "").toLowerCase()
  if (safe === "image/jpeg") return ".jpg"
  if (safe === "image/png") return ".png"
  if (safe === "image/webp") return ".webp"
  if (safe === "application/pdf") return ".pdf"
  return ""
}

function looksLikePng(buffer: Buffer) {
  if (buffer.length < 8) return false
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  return signature.every((byte, index) => buffer[index] === byte)
}

function looksLikeJpeg(buffer: Buffer) {
  if (buffer.length < 4) return false
  return (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  )
}

function looksLikeWebp(buffer: Buffer) {
  if (buffer.length < 12) return false
  return (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  )
}

function looksLikePdf(buffer: Buffer) {
  if (buffer.length < 5) return false
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-"
}

function mimeMatchesContent(mime: string, buffer: Buffer) {
  const safe = String(mime || "").toLowerCase()
  if (safe === "image/png") return looksLikePng(buffer)
  if (safe === "image/jpeg") return looksLikeJpeg(buffer)
  if (safe === "image/webp") return looksLikeWebp(buffer)
  if (safe === "application/pdf") return looksLikePdf(buffer)
  return false
}

async function getOrderById(req: HttpRequest, orderId: string) {
  const service = getCustomerAuthService(req)
  const found = await service.listCustomerOrders({ id: orderId }, { take: 1 })
  return found[0] ?? null
}

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "transfer-proofs")

export async function GET(req: HttpRequest, res: HttpResponse) {
  const orderId = normalizeText(req.params.id, 120)
  const token = normalizeText(req.query?.token, 500)

  if (!orderId) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "order id is required.")
  }
  if (!token) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "token is required.")
  }

  const order = await getOrderById(req, orderId)
  if (!order) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Order not found.")
  }

  if (!isBankTransfer(order.payment_method)) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Order is not a bank transfer payment.")
  }

  const metadata = asObject(order.metadata) ?? {}
  const proof = asObject(metadata.transfer_proof) ?? {}
  const expectedHash = normalizeText(proof.token_hash, 200)
  const expiresAtRaw = normalizeText(proof.expires_at, 120)
  if (!expectedHash) {
    throw new HttpError(HttpError.Types.UNEXPECTED_STATE, "Transfer proof upload is not configured.")
  }

  const actualHash = hashToken(token)
  if (!safeEqualHex(expectedHash, actualHash)) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Invalid token.")
  }

  const expiresAtMs = Date.parse(expiresAtRaw || "")
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Upload token expired.")
  }

  const files = Array.isArray(proof.files) ? proof.files : []

  return res.status(200).json({
    ok: true,
    uploaded: Boolean(proof.uploaded_at) || files.length > 0,
    uploaded_at: proof.uploaded_at ?? null,
    file_count: files.length,
  })
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  const orderId = normalizeText(req.params.id, 120)
  if (!orderId) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "order id is required.")
  }

  const tokenRaw = (req as any)?.body?.token
  const token = normalizeText(tokenRaw, 500)
  if (!token) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "token is required.")
  }

  const files = ((req as any).files ?? []) as Array<{
    originalname: string
    mimetype: string
    buffer: Buffer
    size?: number
  }>

  if (!Array.isArray(files) || !files.length) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "No files were uploaded.")
  }
  if (files.length > 1) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Only one file is allowed.")
  }

  const order = await getOrderById(req, orderId)
  if (!order) {
    throw new HttpError(HttpError.Types.NOT_FOUND, "Order not found.")
  }

  if (!isBankTransfer(order.payment_method)) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Order is not a bank transfer payment.")
  }

  const metadataCurrent = asObject(order.metadata) ?? {}
  const proofCurrent = asObject(metadataCurrent.transfer_proof) ?? {}

  const expectedHash = normalizeText(proofCurrent.token_hash, 200)
  const expiresAtRaw = normalizeText(proofCurrent.expires_at, 120)
  if (!expectedHash) {
    throw new HttpError(HttpError.Types.UNEXPECTED_STATE, "Transfer proof upload is not configured.")
  }

  const actualHash = hashToken(token)
  if (!safeEqualHex(expectedHash, actualHash)) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Invalid token.")
  }

  const expiresAtMs = Date.parse(expiresAtRaw || "")
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
    throw new HttpError(HttpError.Types.UNAUTHORIZED, "Upload token expired.")
  }

  const file = files[0]
  const mime = String(file?.mimetype || "").toLowerCase()
  const ext = fileExtFromMime(mime)
  if (!ext) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Unsupported file type.")
  }

  const sizeBytes = file?.buffer?.length ?? 0
  if (!sizeBytes) {
    throw new HttpError(HttpError.Types.INVALID_DATA, "Uploaded file is empty.")
  }
  if (!mimeMatchesContent(mime, file.buffer)) {
    throw new HttpError(
      HttpError.Types.INVALID_DATA,
      "File content does not match declared mime type."
    )
  }

  const orderDir = safeDirSegment(orderId)
  const targetDir = path.join(UPLOAD_ROOT, orderDir)
  await fs.mkdir(targetDir, { recursive: true })

  const storedId = `tp-${Date.now()}-${nanoId(16)}${ext}`
  const targetPath = path.join(targetDir, storedId)
  await fs.writeFile(targetPath, file.buffer)

  const nowIso = new Date().toISOString()
  const metadataNext: Record<string, any> = { ...metadataCurrent }
  const proofNext: Record<string, any> = {
    ...proofCurrent,
    uploaded_at: nowIso,
  }

  const fileList = Array.isArray(proofCurrent.files) ? proofCurrent.files : []
  const nextFiles = [
    ...fileList,
    {
      id: storedId,
      original_name: normalizeText(file.originalname, 180) || "comprobante",
      mime,
      size_bytes: sizeBytes,
      uploaded_at: nowIso,
    },
  ]

  proofNext.files = nextFiles.slice(-6)
  metadataNext.transfer_proof = proofNext

  appendTimelineEvent(metadataNext, {
    type: "order.transfer_proof.uploaded",
    message: "Comprobante de transferencia cargado.",
  })

  const service = getCustomerAuthService(req)
  await service.updateCustomerOrders({
    selector: { id: orderId },
    data: {
      metadata: metadataNext,
    },
  })

  publishAdminNotification({
    type: "order.transfer_proof.uploaded",
    payload: {
      id: order.id,
      orderNumber: order.order_number,
      uploadedAt: nowIso,
    },
  })

  return res.status(200).json({
    ok: true,
    uploaded_at: nowIso,
    file: {
      id: storedId,
      mime,
      size_bytes: sizeBytes,
    },
  })
}
