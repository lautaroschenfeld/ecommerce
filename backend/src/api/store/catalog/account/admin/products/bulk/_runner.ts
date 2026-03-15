import { STORE_CURRENCY_CODE } from "../../../../../../../lib/catalog"
import { getCatalogProductsByIds } from "../../../../../../../lib/catalog-pg"
import { invalidateStoreCatalogCache } from "../../../../../../../lib/catalog-cache"
import {
  deleteSimpleProduct,
  updateSimpleProduct,
} from "../../../../../../../lib/products-pg-service"
import {
  getStockSnapshotsByProductIds,
  setProductStockLevel,
} from "../../../../../../../lib/stock"

import {
  type AdminProductsBulkAction,
  type AdminProductsBulkJob,
  markJobCompleted,
  markJobFailed,
  persistBulkJob,
  pushJobError,
} from "./_state"

type BulkRunInput = {
  action: AdminProductsBulkAction
  productIds: string[]
  categoryId?: string
  stockDelta?: number
}

const PROGRESS_FLUSH_EVERY = 25
const ALLOWED_ACTIONS = new Set<AdminProductsBulkAction>([
  "publish",
  "delete",
  "change_category",
  "adjust_stock",
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown, max = 160) {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function toInteger(value: unknown) {
  const n =
    typeof value === "string" || typeof value === "number"
      ? Number(value)
      : Number.NaN
  if (!Number.isFinite(n)) return undefined
  return Math.trunc(n)
}

function parseProductIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  const out: string[] = []
  const seen = new Set<string>()

  for (const current of value) {
    const id = text(current, 160)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }

  return out
}

function pickConfiguredPrice(variant: any): number | undefined {
  const candidates: any[] = []
  const fromPriceSet = variant?.price_set?.prices
  if (Array.isArray(fromPriceSet)) candidates.push(...fromPriceSet)
  const fromVariant = variant?.prices
  if (Array.isArray(fromVariant)) candidates.push(...fromVariant)
  if (!candidates.length) return undefined

  const configured = candidates.find(
    (p: any) =>
      p?.currency_code === STORE_CURRENCY_CODE &&
      Number.isFinite(Number(p?.amount)) &&
      Number(p?.amount) > 0
  )
  const configuredAmount = Number(configured?.amount)
  if (Number.isFinite(configuredAmount) && configuredAmount > 0) {
    return configuredAmount
  }

  const fallback = candidates.find(
    (p: any) => Number.isFinite(Number(p?.amount)) && Number(p?.amount) > 0
  )
  const fallbackAmount = Number(fallback?.amount)
  return Number.isFinite(fallbackAmount) && fallbackAmount > 0
    ? fallbackAmount
    : undefined
}

function hasRenderableImage(product: any) {
  const thumb = text(product?.thumbnail, 1200)
  if (thumb) return true

  const images = Array.isArray(product?.images) ? product.images : []
  for (const image of images) {
    const url = text(image?.url, 1200)
    if (url) return true
  }
  return false
}

function resolvePublishValidationError(product: any, stockAvailable: number) {
  const title = text(product?.title, 180)
  if (!title) return "No tiene nombre."

  const brandName = text(product?.brand?.name, 140)
  if (!brandName) return "No tiene marca."

  const hasCategory =
    Array.isArray(product?.categories) &&
    product.categories.some((item: any) => text(item?.name, 140))
  if (!hasCategory) return "No tiene categoria."

  const firstVariant = Array.isArray(product?.variants) ? product.variants[0] : null
  const price = pickConfiguredPrice(firstVariant)
  if (!price || price <= 0) return "No tiene precio valido."

  if (stockAvailable < 0) return "Tiene stock invalido."
  if (!hasRenderableImage(product)) return "No tiene imagenes."

  return null
}

async function getProductsByIdsMap(productIds: string[]) {
  const out = new Map<string, any>()
  const chunkSize = 200

  for (let index = 0; index < productIds.length; index += chunkSize) {
    const chunk = productIds.slice(index, index + chunkSize)
    const rows = await getCatalogProductsByIds(chunk)
    for (const row of rows) {
      const id = text((row as any)?.id, 180)
      if (!id) continue
      out.set(id, row)
    }
  }

  return out
}

function resolveRunInputFromJob(job: AdminProductsBulkJob) {
  const parameters = asRecord(job.parameters) ?? {}
  const actionRaw = text(job.action, 80).toLowerCase()

  if (!ALLOWED_ACTIONS.has(actionRaw as AdminProductsBulkAction)) {
    return {
      ok: false as const,
      message: "La accion del job es invalida.",
    }
  }

  const productIds = parseProductIds(parameters.productIds ?? parameters.product_ids)
  if (!productIds.length) {
    return {
      ok: false as const,
      message: "El job no tiene productIds validos.",
    }
  }

  const categoryId = text(parameters.categoryId ?? parameters.category_id, 140)
  const stockDelta = toInteger(parameters.stockDelta ?? parameters.stock_delta)
  const action = actionRaw as AdminProductsBulkAction

  if (action === "change_category" && !categoryId) {
    return {
      ok: false as const,
      message: "El job de cambio de categoria no tiene categoryId.",
    }
  }

  if (action === "adjust_stock" && (!Number.isInteger(stockDelta) || stockDelta === 0)) {
    return {
      ok: false as const,
      message: "El job de stock no tiene stockDelta valido.",
    }
  }

  const input: BulkRunInput = {
    action,
    productIds,
    categoryId: categoryId || undefined,
    stockDelta: stockDelta ?? undefined,
  }

  return {
    ok: true as const,
    input,
  }
}

export async function runBulkJob(job: AdminProductsBulkJob) {
  const resolved = resolveRunInputFromJob(job)
  if (!resolved.ok) {
    markJobFailed(job, resolved.message)
    await persistBulkJob(job)
    return
  }

  const input = resolved.input

  try {
    const needsProductsById = input.action === "publish"
    const needsStockById =
      input.action === "publish" || input.action === "adjust_stock"

    const productsById = needsProductsById
      ? await getProductsByIdsMap(input.productIds)
      : new Map<string, any>()
    const stockById = needsStockById
      ? await getStockSnapshotsByProductIds(input.productIds)
      : new Map<string, any>()

    let pendingFlush = 0
    let catalogMutated = false

    for (const productId of input.productIds) {
      try {
        if (input.action === "publish") {
          const product = productsById.get(productId)
          if (!product) {
            throw new Error("No se encontro el producto o ya fue eliminado.")
          }
          const stock = stockById.get(productId)
          const validationError = resolvePublishValidationError(
            product,
            Math.max(0, Math.trunc(stock?.availableQty ?? 0))
          )
          if (validationError) {
            throw new Error(`No cumple requisitos de publicacion: ${validationError}`)
          }
          await updateSimpleProduct({
            productId,
            status: "published",
          })
          catalogMutated = true
        } else if (input.action === "change_category") {
          if (!input.categoryId) {
            throw new Error("No se recibio una categoria valida.")
          }
          await updateSimpleProduct({
            productId,
            categoryId: input.categoryId,
          })
          catalogMutated = true
        } else if (input.action === "adjust_stock") {
          const delta = Math.trunc(input.stockDelta ?? 0)
          const current = Math.max(
            0,
            Math.trunc(stockById.get(productId)?.availableQty ?? 0)
          )
          const nextStock = Math.max(0, current + delta)
          const updated = await setProductStockLevel({
            productId,
            availableQty: nextStock,
          })
          stockById.set(productId, updated)
          catalogMutated = true
        } else if (input.action === "delete") {
          await deleteSimpleProduct(productId)
          catalogMutated = true
        }

        job.succeeded += 1
      } catch (error) {
        job.failed += 1
        pushJobError(job, {
          productId,
          message:
            error instanceof Error
              ? error.message
              : "No se pudo procesar este producto.",
        })
      } finally {
        job.processed += 1
        pendingFlush += 1
        if (pendingFlush >= PROGRESS_FLUSH_EVERY) {
          await persistBulkJob(job)
          pendingFlush = 0
        }
      }
    }

    if (pendingFlush > 0) {
      await persistBulkJob(job)
    }

    if (catalogMutated) {
      await invalidateStoreCatalogCache()
    }

    markJobCompleted(job)
    await persistBulkJob(job)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo completar la operacion masiva."
    markJobFailed(job, message)
    await persistBulkJob(job)
  }
}

