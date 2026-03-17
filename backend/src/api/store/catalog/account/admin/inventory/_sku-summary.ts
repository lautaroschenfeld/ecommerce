import { pgQuery } from "../../../../../../lib/pg"

type ProductSkuRow = {
  product_id: string | null
  sku: string | null
}

export type ProductSkuPresentation = {
  sku: string
  skuList: string[]
}

function normalizeSku(input: unknown, max = 120) {
  if (typeof input !== "string") return ""
  return input.trim().slice(0, max)
}

function buildSkuPresentation(rawSkus: string[], searchRaw = ""): ProductSkuPresentation {
  const unique: string[] = []
  const seen = new Set<string>()

  for (const rawSku of rawSkus) {
    const sku = normalizeSku(rawSku)
    if (!sku) continue
    const key = sku.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(sku)
  }

  const search = normalizeSku(searchRaw, 180).toLowerCase()
  const ordered =
    search.length > 0
      ? [
          ...unique.filter((sku) => sku.toLowerCase().includes(search)),
          ...unique.filter((sku) => !sku.toLowerCase().includes(search)),
        ]
      : unique

  if (!ordered.length) {
    return {
      sku: "-",
      skuList: [],
    }
  }

  const visible = ordered.slice(0, 2)
  const hiddenCount = Math.max(0, ordered.length - visible.length)

  return {
    sku: hiddenCount > 0 ? `${visible.join(", ")} +${hiddenCount}` : visible.join(", "),
    skuList: ordered,
  }
}

export async function listProductSkuPresentation(
  productIdsRaw: string[],
  searchRaw = ""
): Promise<Map<string, ProductSkuPresentation>> {
  const productIds = Array.from(
    new Set(productIdsRaw.map((productId) => normalizeSku(productId, 140)).filter(Boolean))
  )

  if (!productIds.length) return new Map()

  const rows = await pgQuery<ProductSkuRow>(
    `select
       pv."product_id",
       nullif(trim(pv."sku"), '') as "sku"
     from "product_variant" pv
     where pv."deleted_at" is null
       and pv."product_id" = any($1::text[])
     order by
       pv."product_id" asc,
       pv."variant_rank" asc nulls last,
       pv."created_at" asc,
       pv."id" asc;`,
    [productIds]
  )

  const byProductId = new Map<string, string[]>()
  for (const row of rows) {
    const productId = normalizeSku(row.product_id, 140)
    const sku = normalizeSku(row.sku)
    if (!productId || !sku) continue
    const bucket = byProductId.get(productId) ?? []
    bucket.push(sku)
    byProductId.set(productId, bucket)
  }

  const out = new Map<string, ProductSkuPresentation>()
  for (const productId of productIds) {
    out.set(productId, buildSkuPresentation(byProductId.get(productId) ?? [], searchRaw))
  }
  return out
}
