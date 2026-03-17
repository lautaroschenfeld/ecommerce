import type { HttpRequest, HttpResponse } from "../../../../../../lib/http"

import { HttpError } from "../../../../../../lib/http"
import { nanoId } from "../../../../../../lib/id"
import {
  appendPathToBaseUrl,
  getCanonicalBackendBaseUrl,
} from "../../../../../../lib/public-url"

import * as fs from "fs/promises"
import path from "path"

import { normalizeCatalogUploadImage } from "../../../../../../lib/catalog-image-normalize"
import { requireCustomerAdmin } from "../../../_shared/customer-auth"
import sharp from "sharp"

function toPositiveInt(raw: unknown, fallback: number) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.trunc(parsed)
}

const MAX_UPLOAD_FILE_SIZE_BYTES = toPositiveInt(
  process.env.ADMIN_UPLOAD_MAX_FILE_SIZE_BYTES,
  8 * 1024 * 1024
)
const MAX_UPLOAD_TOTAL_BYTES = toPositiveInt(
  process.env.ADMIN_UPLOAD_MAX_TOTAL_BYTES,
  24 * 1024 * 1024
)
const MAX_UPLOAD_FILES = toPositiveInt(process.env.ADMIN_UPLOAD_MAX_FILES, 8)
const AUTOCROP_PADDING_PX = toPositiveInt(
  process.env.ADMIN_UPLOAD_AUTOCROP_PADDING_PX,
  50
)
const OUTPUT_SIZE_PX = toPositiveInt(process.env.ADMIN_UPLOAD_OUTPUT_SIZE_PX, 1400)

const ALLOWED_UPLOAD_MIME = new Set(["image/jpeg", "image/png", "image/webp"])

const STATIC_DIR = path.resolve(process.cwd(), "static")

function randomSuffix(length = 8) {
  return nanoId(length)
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

function mimeMatchesContent(mime: string, buffer: Buffer) {
  if (mime === "image/png") return looksLikePng(buffer)
  if (mime === "image/jpeg") return looksLikeJpeg(buffer)
  if (mime === "image/webp") return looksLikeWebp(buffer)
  return false
}

function sanitizeFilename(input: string) {
  const raw = String(input || "").trim()
  const safe = raw.replace(/[^\w.\- ]+/g, "").slice(0, 180)
  return safe || "image"
}

function toWebpFilename(filename: string) {
  const clean = sanitizeFilename(filename)
  const base = clean.replace(/\.[^/.]+$/, "").trim()
  return `${base || "image"}.webp`
}

function toPngFilename(filename: string) {
  const clean = sanitizeFilename(filename)
  const base = clean.replace(/\.[^/.]+$/, "").trim()
  return `${base || "image"}.png`
}

function readQueryString(req: HttpRequest, key: string, max = 80) {
  const raw = (req.query as Record<string, unknown>)?.[key]
  if (typeof raw === "string") return raw.trim().slice(0, max)
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === "string")
    return typeof first === "string" ? first.trim().slice(0, max) : ""
  }
  return ""
}

export async function POST(req: HttpRequest, res: HttpResponse) {
  await requireCustomerAdmin(req, res)
  const uploadVariant = readQueryString(req, "variant", 40).toLowerCase()
  const faviconVariant = uploadVariant === "favicon"

  const input = (req as any).files as unknown as
    | Array<{
        originalname: string
        mimetype: string
        buffer: Buffer
      }>
    | undefined

  try {
    if (!input?.length) {
      throw new HttpError(HttpError.Types.INVALID_DATA, "No files were uploaded")
    }
    if (input.length > MAX_UPLOAD_FILES) {
      throw new HttpError(
        HttpError.Types.INVALID_DATA,
        `Too many files. Max allowed: ${MAX_UPLOAD_FILES}.`
      )
    }

    let totalBytes = 0
    for (const file of input) {
      const mime = String(file.mimetype || "").toLowerCase()
      if (!ALLOWED_UPLOAD_MIME.has(mime)) {
        throw new HttpError(
          HttpError.Types.INVALID_DATA,
          "Only JPG, PNG or WEBP images are allowed."
        )
      }

      const size = file.buffer?.length ?? 0
      if (!size || size > MAX_UPLOAD_FILE_SIZE_BYTES) {
        throw new HttpError(
          HttpError.Types.INVALID_DATA,
          `Each file must be <= ${MAX_UPLOAD_FILE_SIZE_BYTES} bytes.`
        )
      }
      if (!mimeMatchesContent(mime, file.buffer)) {
        throw new HttpError(
          HttpError.Types.INVALID_DATA,
          "File content does not match declared mime type."
        )
      }

      totalBytes += size
      if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) {
        throw new HttpError(
          HttpError.Types.INVALID_DATA,
          `Total upload size exceeded (${MAX_UPLOAD_TOTAL_BYTES} bytes max).`
        )
      }
    }

    await fs.mkdir(STATIC_DIR, { recursive: true })

    const uploaded: Array<{ id: string; url: string }> = []

    for (const file of input) {
      const transformed = await normalizeCatalogUploadImage(file.buffer, {
        paddingPx: AUTOCROP_PADDING_PX,
        outputSizePx: OUTPUT_SIZE_PX,
      })

      const outputBuffer = faviconVariant
        ? await sharp(transformed.buffer)
            .resize(256, 256)
            .png({ compressionLevel: 9 })
            .toBuffer()
        : transformed.buffer
      const filename = `${Date.now()}-${randomSuffix()}-${
        faviconVariant ? toPngFilename(file.originalname) : toWebpFilename(file.originalname)
      }`
      const target = path.join(STATIC_DIR, filename)
      await fs.writeFile(target, outputBuffer)

      uploaded.push({
        id: filename,
        url: appendPathToBaseUrl(
          getCanonicalBackendBaseUrl(),
          `/static/${encodeURIComponent(filename)}`
        ),
      })
    }

    res.status(200).json({ files: uploaded })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[store.catalog.admin.uploads] Upload failed", {
      files:
        input?.map((file) => file?.originalname).filter(Boolean).slice(0, 10) ??
        [],
      fileCount: input?.length ?? 0,
      message,
    })
    throw error
  }
}
