import fs from "fs/promises"
import path from "path"

import "../lib/env"

import { getBrandPgService } from "../lib/brand-pg-service"
import { STORE_CURRENCY_CODE } from "../lib/catalog"
import { pgQuery } from "../lib/pg"
import { createSimpleProduct } from "../lib/products-pg-service"
import { slugify } from "../lib/slug"
import { setProductStockLevel } from "../lib/stock"

type CsvRow = Record<string, string>

type ImportResult = {
  created: number
  skipped: number
  errors: number
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2)
  const flags = new Set<string>()
  const positionals: string[] = []

  for (const raw of args) {
    if (raw.startsWith("--")) {
      flags.add(raw)
    } else {
      positionals.push(raw)
    }
  }

  return { flags, positionals }
}

function stripBom(input: string) {
  if (input.charCodeAt(0) === 0xfeff) return input.slice(1)
  return input
}

function parseCsv(textRaw: string) {
  const text = stripBom(textRaw)
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === "\"") {
        const next = text[i + 1]
        if (next === "\"") {
          field += "\""
          i += 1
          continue
        }
        inQuotes = false
        continue
      }

      field += ch
      continue
    }

    if (ch === "\"") {
      inQuotes = true
      continue
    }

    if (ch === ",") {
      row.push(field)
      field = ""
      continue
    }

    if (ch === "\n" || ch === "\r") {
      row.push(field)
      field = ""
      rows.push(row)
      row = []

      if (ch === "\r" && text[i + 1] === "\n") {
        i += 1
      }
      continue
    }

    field += ch
  }

  // Flush last row if needed.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function toInt(value: string) {
  const n = Number(String(value || "").trim())
  if (!Number.isFinite(n)) return undefined
  return Math.trunc(n)
}

function normalizeText(value: string, max = 2000) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim()
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned
}

async function getCategoryIdByName(name: string) {
  const rows = await pgQuery<{ id: string }>(
    `select "id"
     from "product_category"
     where "deleted_at" is null and "name" = $1
     limit 1;`,
    [name]
  )
  const id = rows[0]?.id
  return typeof id === "string" ? id : ""
}

async function handleExists(handle: string) {
  const rows = await pgQuery<{ id: string }>(
    `select "id"
     from "product"
     where "deleted_at" is null and "handle" = $1
     limit 1;`,
    [handle]
  )
  return Boolean(rows[0]?.id)
}

async function resolveAvailableHandle(rawTitle: string) {
  const base = slugify(rawTitle) || `producto-${Date.now()}`
  let candidate = base
  let index = 2

  while (await handleExists(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }

  return candidate
}

async function findExistingBySku(sku: string) {
  const cleaned = String(sku || "").trim()
  if (!cleaned) return ""

  const rows = await pgQuery<{ product_id: string }>(
    `select "product_id"
     from "product_variant"
     where "deleted_at" is null and "sku" = $1
     limit 1;`,
    [cleaned]
  )
  const id = rows[0]?.product_id
  return typeof id === "string" ? id : ""
}

function normalizeCategoryInput(raw: string) {
  const trimmed = normalizeText(raw, 80)
  if (!trimmed) return ""

  const lower = trimmed.toLowerCase()
  if (lower === "accesorio") return "Accesorios"
  return trimmed
}

function rowsToObjects(rows: string[][]) {
  if (!rows.length) return []

  const header = rows[0].map((cell) => normalizeText(cell, 80))
  const out: CsvRow[] = []

  for (const rawRow of rows.slice(1)) {
    if (!rawRow.some((cell) => String(cell || "").trim())) continue
    const rec: CsvRow = {}
    for (let i = 0; i < header.length; i++) {
      const key = header[i]
      if (!key) continue
      rec[key] = rawRow[i] ?? ""
    }
    out.push(rec)
  }

  return out
}

async function importProductsFromCsv(filePath: string, { draft }: { draft: boolean }): Promise<ImportResult> {
  const brandService = getBrandPgService()

  const fileContent = await fs.readFile(filePath, "utf-8")
  const rows = parseCsv(fileContent)
  const records = rowsToObjects(rows)

  const failures: Array<{ index: number; reason: string }> = []
  let created = 0
  let skipped = 0

  for (let idx = 0; idx < records.length; idx++) {
    const row = records[idx]
    const rowNumber = idx + 2 // header is line 1

    try {
      const sku = normalizeText(row.sku ?? "", 120)
      const title = normalizeText(row.name ?? row.title ?? "", 120)
      const brandName = normalizeText(row.brand ?? row.marca ?? "", 120)
      const categoryName = normalizeCategoryInput(row.category ?? row.categoria ?? "")
      const price = toInt(String(row.price_ars ?? row.priceArs ?? row.precio ?? ""))
      const stockQty = toInt(String(row.stock_qty ?? row.stock ?? row.stockAvailable ?? "")) ?? 0
      const description = String(row.description ?? row.descripcion ?? "").trim() || null

      if (!title) throw new Error("name is required")
      if (!brandName) throw new Error("brand is required")
      if (!categoryName) throw new Error("category is required")
      if (price === undefined || price <= 0) throw new Error("price_ars must be > 0")
      if (stockQty < 0) throw new Error("stock_qty must be >= 0")

      const existingProductId = await findExistingBySku(sku)
      if (existingProductId) {
        skipped += 1
        continue
      }

      const categoryId = await getCategoryIdByName(categoryName)
      if (!categoryId) {
        throw new Error(`category is invalid ("${categoryName}")`)
      }

      const brandSlug = slugify(brandName)
      if (!brandSlug) throw new Error("brand slug is invalid")
      const existingBrand = await brandService.listBrands({ slug: brandSlug })
      const brand =
        existingBrand[0] ??
        (await brandService.createBrands({ name: brandName, slug: brandSlug }))

      const handle = await resolveAvailableHandle(title)
      const status = draft ? "draft" : "published"
      const metadata = { imported_from_csv: true }

      const createdProduct = await createSimpleProduct({
        title,
        handle,
        description,
        status,
        thumbnail: null,
        images: [],
        metadata,
        categoryId,
        brandId: brand.id,
        variantSku: sku || null,
        variantMetadata: metadata,
        currencyCode: STORE_CURRENCY_CODE,
        priceAmount: price,
      })

      await setProductStockLevel({
        productId: createdProduct.productId,
        availableQty: stockQty,
      })

      created += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push({ index: rowNumber, reason: message })
    }
  }

  if (failures.length) {
    console.error("")
    console.error("Errores al importar:")
    for (const fail of failures.slice(0, 25)) {
      console.error(`- Fila ${fail.index}: ${fail.reason}`)
    }
    if (failures.length > 25) {
      console.error(`... y ${failures.length - 25} más`)
    }
  }

  return { created, skipped, errors: failures.length }
}

async function main() {
  const { flags, positionals } = parseArgs(process.argv)
  const fileArg = positionals[0]

  if (!fileArg) {
    console.error(
      [
        "Uso:",
        "  npm run import:products:csv -- \"C:\\\\ruta\\\\productos.csv\"",
        "",
        "Flags:",
        "  --draft   Importa como borrador (no se muestra en storefront).",
      ].join("\n")
    )
    process.exit(1)
  }

  const abs = path.isAbsolute(fileArg)
    ? fileArg
    : path.resolve(process.cwd(), fileArg)

  const draft = flags.has("--draft")

  console.log(`Importando CSV: ${abs}`)
  const result = await importProductsFromCsv(abs, { draft })
  console.log("")
  console.log(
    `Import finalizado. Creados: ${result.created}. Omitidos: ${result.skipped}. Errores: ${result.errors}.`
  )
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

