import { nanoId, prefixedNanoId } from "./id"
import { pgTransaction, type PgClient } from "./pg"
import { slugify } from "./slug"
import { setProductStockLevelTx } from "./stock"

const COMPACT_PRODUCT_ID_LENGTH = 12

function shortProductId() {
  return nanoId(COMPACT_PRODUCT_ID_LENGTH)
}

function toJsonb(value: unknown) {
  return JSON.stringify(value ?? {})
}

function rawAmount(amount: number) {
  const safe = Math.max(0, Math.trunc(Number(amount)))
  return JSON.stringify({ value: String(safe), precision: 20 })
}

function normalizeUrls(input: string[] | undefined) {
  return (input ?? [])
    .map((url) => String(url || "").trim())
    .filter(Boolean)
    .slice(0, 20)
}

function productGroupKeySql(productAlias: string, variantAlias: string) {
  return `coalesce(
    nullif(trim(${productAlias}."metadata"->>'group_id'), ''),
    nullif(trim(${productAlias}."metadata"->>'variant_group_id'), ''),
    nullif(trim(${productAlias}."metadata"->>'family'), ''),
    nullif(trim(${variantAlias}."metadata"->>'group_id'), ''),
    nullif(trim(${variantAlias}."metadata"->>'variant_group_id'), ''),
    nullif(trim(${variantAlias}."metadata"->>'family'), ''),
    ${productAlias}."id"
  )`
}

type CreateSimpleProductInput = {
  title: string
  handle: string
  description?: string | null
  status: "published" | "draft"
  thumbnail?: string | null
  images: string[]
  metadata?: Record<string, unknown>
  categoryId: string
  brandId: string
  variantSku?: string | null
  variantMetadata?: Record<string, unknown> | null
  currencyCode: string
  priceAmount: number
  costAmount?: number
}

type UpdateSimpleProductInput = {
  productId: string
  title?: string
  description?: string | null
  status?: "published" | "draft"
  thumbnail?: string | null
  images?: string[]
  metadata?: Record<string, unknown>
  categoryId?: string
  brandId?: string
  variantSku?: string | null
  variantMetadata?: Record<string, unknown> | null
  currencyCode?: string
  priceAmount?: number
  costAmount?: number
}

export type SyncSimpleProductGroupVariantInput = {
  id?: string
  title: string
  handle?: string
  description?: string | null
  status: "published" | "draft"
  images: string[]
  metadata?: Record<string, unknown>
  categoryId: string
  brandId: string
  variantSku?: string | null
  currencyCode: string
  priceAmount: number
  costAmount?: number
  stockAvailable: number
}

export class ProductGroupSyncConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProductGroupSyncConflictError"
  }
}

async function getFirstVariantIdTx(client: PgClient, productId: string) {
  const rows = await client.query(
    `select "id"
     from "product_variant"
     where "product_id" = $1 and "deleted_at" is null
     order by "variant_rank" asc nulls last, "created_at" asc, "id" asc
     limit 1;`,
    [productId]
  )
  const id = rows.rows?.[0]?.id
  return typeof id === "string" && id.trim() ? id.trim() : ""
}

async function upsertBasePriceTx(
  client: PgClient,
  input: {
    variantId: string
    currencyCode: string
    amount: number
  }
) {
  const currencyCode = String(input.currencyCode || "").trim().toLowerCase()
  if (!currencyCode) throw new Error("currencyCode is required.")

  const variantId = String(input.variantId || "").trim()
  if (!variantId) throw new Error("variantId is required.")

  const amount = Math.max(0, Math.trunc(Number(input.amount)))
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Price amount must be > 0.")
  }

  const pvpsRows = await client.query(
    `select "price_set_id"
     from "product_variant_price_set"
     where "variant_id" = $1 and "deleted_at" is null
     order by "created_at" desc, "id" desc
     limit 1;`,
    [variantId]
  )

  let priceSetId =
    typeof pvpsRows.rows?.[0]?.price_set_id === "string"
      ? pvpsRows.rows[0].price_set_id
      : ""
  if (!priceSetId) {
    priceSetId = prefixedNanoId("pset")
    await client.query(
      `insert into "price_set" ("id","created_at","updated_at","deleted_at")
       values ($1, now(), now(), null);`,
      [priceSetId]
    )

    await client.query(
      `insert into "product_variant_price_set"
        ("id","variant_id","price_set_id","created_at","updated_at","deleted_at")
       values
        ($1,$2,$3,now(),now(),null);`,
      [prefixedNanoId("pvps"), variantId, priceSetId]
    )
  }

  await client.query(
    `update "price"
       set "deleted_at" = now(), "updated_at" = now()
     where "price_set_id" = $1
       and "price_list_id" is null
       and "currency_code" = $2
       and "deleted_at" is null;`,
    [priceSetId, currencyCode]
  )

  await client.query(
    `insert into "price"
      ("id","title","price_set_id","currency_code","raw_amount","rules_count","created_at","updated_at","deleted_at","price_list_id","amount","min_quantity","max_quantity","raw_min_quantity","raw_max_quantity")
     values
      ($1,null,$2,$3,$4::jsonb,0,now(),now(),null,null,$5,null,null,null,null);`,
    [prefixedNanoId("price"), priceSetId, currencyCode, rawAmount(amount), amount]
  )

  return { priceSetId }
}

async function handleExistsTx(
  client: PgClient,
  handleRaw: string,
  options?: { excludeProductId?: string }
) {
  const handle = String(handleRaw || "").trim()
  if (!handle) return false

  const excludeProductId = String(options?.excludeProductId || "").trim()
  const rows = await client.query(
    `select "id"
     from "product"
     where "deleted_at" is null
       and "handle" = $1
       and ($2 = '' or "id" <> $2)
     limit 1;`,
    [handle, excludeProductId]
  )

  return Boolean(rows.rows?.[0]?.id)
}

async function resolveAvailableHandleTx(
  client: PgClient,
  input: {
    rawTitle: string
    requestedHandle?: string
    excludeProductId?: string
    reservedHandles?: Set<string>
  }
) {
  const baseSource =
    String(input.requestedHandle || "").trim() || String(input.rawTitle || "").trim()
  const base = slugify(baseSource) || `producto-${Date.now()}`
  const reservedHandles = input.reservedHandles ?? new Set<string>()

  let candidate = base
  let index = 2
  while (
    reservedHandles.has(candidate) ||
    (await handleExistsTx(client, candidate, {
      excludeProductId: input.excludeProductId,
    }))
  ) {
    candidate = `${base}-${index}`
    index += 1
  }

  reservedHandles.add(candidate)
  return candidate
}

async function createSimpleProductTx(client: PgClient, input: CreateSimpleProductInput) {
  const productId = shortProductId()
  const variantId = prefixedNanoId("variant")
  const normalizedCostAmount = Math.max(0, Math.trunc(Number(input.costAmount ?? 0)))
  const urls = normalizeUrls(input.images)

  await client.query(
    `insert into "product"
      ("id","title","handle","description","status","thumbnail","metadata","created_at","updated_at","deleted_at")
     values
      ($1,$2,$3,$4,$5,$6,$7::jsonb,now(),now(),null);`,
    [
      productId,
      input.title,
      input.handle,
      input.description ?? null,
      input.status,
      input.thumbnail ?? null,
      toJsonb(input.metadata ?? {}),
    ]
  )

  await client.query(
    `insert into "product_category_product" ("product_id","product_category_id")
     values ($1,$2);`,
    [productId, input.categoryId]
  )

  await client.query(
    `insert into "product_variant"
      ("id","title","sku","product_id","metadata","cost_ars","created_at","updated_at","deleted_at")
     values
      ($1,$2,$3,$4,$5::jsonb,$6,now(),now(),null);`,
    [
      variantId,
      "Unico",
      input.variantSku ?? null,
      productId,
      toJsonb(input.variantMetadata ?? input.metadata ?? {}),
      normalizedCostAmount,
    ]
  )

  await upsertBasePriceTx(client, {
    variantId,
    currencyCode: input.currencyCode,
    amount: input.priceAmount,
  })

  await client.query(
    `update "product_brand"
       set "deleted_at" = now(), "updated_at" = now()
     where "product_id" = $1 and "deleted_at" is null;`,
    [productId]
  )
  await client.query(
    `insert into "product_brand"
      ("product_id","brand_id","id","created_at","updated_at","deleted_at")
     values
      ($1,$2,$3,now(),now(),null);`,
    [productId, input.brandId, prefixedNanoId("pbr")]
  )

  for (let i = 0; i < urls.length; i++) {
    await client.query(
      `insert into "image"
        ("id","url","metadata","created_at","updated_at","deleted_at","rank","product_id")
       values
        ($1,$2,null,now(),now(),null,$3,$4);`,
      [prefixedNanoId("img"), urls[i], i, productId]
    )
  }

  return { productId, variantId }
}

async function updateSimpleProductTx(client: PgClient, input: UpdateSimpleProductInput) {
  const productId = String(input.productId || "").trim()
  if (!productId) throw new Error("productId is required.")

  const variantId = await getFirstVariantIdTx(client, productId)
  if (!variantId) {
    throw new Error("Product has no variants.")
  }

  const normalizedImages =
    input.images !== undefined ? normalizeUrls(input.images) : undefined
  const derivedThumbnail =
    input.thumbnail !== undefined
      ? input.thumbnail
      : normalizedImages !== undefined
        ? normalizedImages[0] ?? null
        : undefined

  {
    const sets: string[] = []
    const params: unknown[] = [productId]

    if (input.title !== undefined) {
      params.push(input.title)
      sets.push(`"title" = $${params.length}`)
    }
    if (input.description !== undefined) {
      params.push(input.description ?? null)
      sets.push(`"description" = $${params.length}`)
    }
    if (input.status !== undefined) {
      params.push(input.status)
      sets.push(`"status" = $${params.length}`)
    }
    if (derivedThumbnail !== undefined) {
      params.push(derivedThumbnail ?? null)
      sets.push(`"thumbnail" = $${params.length}`)
    }
    if (input.metadata !== undefined) {
      params.push(toJsonb(input.metadata))
      sets.push(`"metadata" = $${params.length}::jsonb`)
    }

    sets.push(`"updated_at" = now()`)

    await client.query(
      `update "product"
       set ${sets.join(", ")}
       where "id" = $1;`,
      params
    )
  }

  if (
    input.variantSku !== undefined ||
    input.variantMetadata !== undefined ||
    input.metadata !== undefined ||
    input.costAmount !== undefined
  ) {
    const sets: string[] = []
    const params: unknown[] = [variantId]

    if (input.variantSku !== undefined) {
      params.push(input.variantSku ?? null)
      sets.push(`"sku" = $${params.length}`)
    }

    const meta = input.variantMetadata ?? input.metadata
    if (meta !== undefined) {
      params.push(toJsonb(meta))
      sets.push(`"metadata" = $${params.length}::jsonb`)
    }

    if (input.costAmount !== undefined) {
      const normalizedCostAmount = Math.max(0, Math.trunc(Number(input.costAmount)))
      params.push(normalizedCostAmount)
      sets.push(`"cost_ars" = $${params.length}`)
    }

    sets.push(`"updated_at" = now()`)

    await client.query(
      `update "product_variant"
       set ${sets.join(", ")}
       where "id" = $1;`,
      params
    )
  }

  if (input.categoryId) {
    await client.query(`delete from "product_category_product" where "product_id" = $1;`, [
      productId,
    ])
    await client.query(
      `insert into "product_category_product" ("product_id","product_category_id")
       values ($1,$2);`,
      [productId, input.categoryId]
    )
  }

  if (input.brandId) {
    await client.query(
      `update "product_brand"
         set "deleted_at" = now(), "updated_at" = now()
       where "product_id" = $1 and "deleted_at" is null;`,
      [productId]
    )

    const revived = await client.query(
      `with target as (
        select "id"
        from "product_brand"
        where "product_id" = $1 and "brand_id" = $2
        order by ("deleted_at" is null) desc, "updated_at" desc, "created_at" desc, "id" desc
        limit 1
      )
      update "product_brand" pb
         set "deleted_at" = null, "updated_at" = now()
        from target
       where pb."id" = target."id"
       returning pb."id";`,
      [productId, input.brandId]
    )

    if (!revived.rows?.length) {
      try {
        await client.query(
          `insert into "product_brand"
            ("product_id","brand_id","id","created_at","updated_at","deleted_at")
           values
            ($1,$2,$3,now(),now(),null);`,
          [productId, input.brandId, prefixedNanoId("pbr")]
        )
      } catch (error) {
        const reused = await client.query(
          `with target as (
            select "id"
            from "product_brand"
            where "product_id" = $1
            order by ("deleted_at" is null) desc, "updated_at" desc, "created_at" desc, "id" desc
            limit 1
          )
          update "product_brand" pb
             set "brand_id" = $2, "deleted_at" = null, "updated_at" = now()
            from target
           where pb."id" = target."id"
           returning pb."id";`,
          [productId, input.brandId]
        )

        if (!reused.rows?.length) throw error
      }
    }
  }

  if (normalizedImages !== undefined) {
    await client.query(
      `update "image"
         set "deleted_at" = now(), "updated_at" = now()
       where "product_id" = $1 and "deleted_at" is null;`,
      [productId]
    )

    for (let i = 0; i < normalizedImages.length; i++) {
      await client.query(
        `insert into "image"
          ("id","url","metadata","created_at","updated_at","deleted_at","rank","product_id")
         values
          ($1,$2,null,now(),now(),null,$3,$4);`,
        [prefixedNanoId("img"), normalizedImages[i], i, productId]
      )
    }
  }

  if (input.priceAmount !== undefined) {
    await upsertBasePriceTx(client, {
      variantId,
      currencyCode: input.currencyCode || "ars",
      amount: input.priceAmount,
    })
  }
}

async function deleteSimpleProductTx(client: PgClient, productIdRaw: string) {
  const productId = String(productIdRaw || "").trim()
  if (!productId) throw new Error("productId is required.")

  await client.query(
    `update "product"
       set "deleted_at" = now(), "updated_at" = now()
     where "id" = $1 and "deleted_at" is null;`,
    [productId]
  )

  await client.query(
    `update "product_variant"
       set "deleted_at" = now(), "updated_at" = now()
     where "product_id" = $1 and "deleted_at" is null;`,
    [productId]
  )

  await client.query(
    `update "image"
       set "deleted_at" = now(), "updated_at" = now()
     where "product_id" = $1 and "deleted_at" is null;`,
    [productId]
  )

  await client.query(
    `update "product_brand"
       set "deleted_at" = now(), "updated_at" = now()
     where "product_id" = $1 and "deleted_at" is null;`,
    [productId]
  )

  const variantIdsRows = await client.query(
    `select "id" from "product_variant" where "product_id" = $1;`,
    [productId]
  )
  const variantIds = (variantIdsRows.rows ?? [])
    .map((row: any) => (typeof row?.id === "string" ? row.id.trim() : ""))
    .filter(Boolean)

  if (!variantIds.length) return

  const pvpsRows = await client.query(
    `select "price_set_id"
     from "product_variant_price_set"
     where "variant_id" = any($1::text[]);`,
    [variantIds]
  )
  const priceSetIds = (pvpsRows.rows ?? [])
    .map((row: any) =>
      typeof row?.price_set_id === "string" ? row.price_set_id.trim() : ""
    )
    .filter(Boolean)

  await client.query(
    `update "product_variant_price_set"
       set "deleted_at" = now(), "updated_at" = now()
     where "variant_id" = any($1::text[]) and "deleted_at" is null;`,
    [variantIds]
  )

  if (!priceSetIds.length) return

  await client.query(
    `update "price"
       set "deleted_at" = now(), "updated_at" = now()
     where "price_set_id" = any($1::text[]) and "deleted_at" is null;`,
    [priceSetIds]
  )
  await client.query(
    `update "price_set"
       set "deleted_at" = now(), "updated_at" = now()
     where "id" = any($1::text[]) and "deleted_at" is null;`,
    [priceSetIds]
  )
}

async function getEditableGroupInfoTx(client: PgClient, anchorProductIdRaw: string) {
  const anchorProductId = String(anchorProductIdRaw || "").trim()
  if (!anchorProductId) throw new Error("anchorProductId is required.")

  const anchorVariantSql = `select coalesce(v."metadata", '{}'::jsonb) as "metadata"
    from "product_variant" v
    where v."product_id" = p."id" and v."deleted_at" is null
    order by v."variant_rank" asc nulls last, v."created_at" asc, v."id" asc
    limit 1`
  const candidateVariantSql = `select coalesce(v."metadata", '{}'::jsonb) as "metadata"
    from "product_variant" v
    where v."product_id" = candidate."id" and v."deleted_at" is null
    order by v."variant_rank" asc nulls last, v."created_at" asc, v."id" asc
    limit 1`
  const anchorGroupKeySql = productGroupKeySql("p", "pv")
  const candidateGroupKeySql = productGroupKeySql("candidate", "cv")

  const rows = await client.query(
    `with anchor as (
      select
        p."id" as "anchor_product_id",
        ${anchorGroupKeySql} as "group_id"
      from "product" p
      left join lateral (${anchorVariantSql}) pv on true
      where p."id" = $1 and p."deleted_at" is null
      limit 1
    )
    select
      anchor."group_id",
      candidate."id" as "product_id"
    from anchor
    join "product" candidate
      on candidate."deleted_at" is null
    left join lateral (${candidateVariantSql}) cv on true
    where candidate."id" = anchor."anchor_product_id"
       or ${candidateGroupKeySql} = anchor."group_id"
    order by candidate."created_at" asc nulls last, candidate."id" asc
    for update of candidate;`,
    [anchorProductId]
  )

  if (!rows.rows?.length) {
    throw new ProductGroupSyncConflictError("El producto ya no existe o fue eliminado.")
  }

  const groupId = String(rows.rows[0]?.group_id || "").trim()
  const productIds = Array.from(
    new Set(
      (rows.rows ?? [])
        .map((row: any) => (typeof row?.product_id === "string" ? row.product_id.trim() : ""))
        .filter(Boolean)
    )
  )

  if (!groupId || !productIds.length) {
    throw new ProductGroupSyncConflictError(
      "No se pudo reconstruir el grupo de variantes."
    )
  }

  return { groupId, productIds }
}

export async function createSimpleProduct(input: CreateSimpleProductInput) {
  return await pgTransaction(async (client) => createSimpleProductTx(client, input))
}

export async function updateSimpleProduct(input: UpdateSimpleProductInput) {
  await pgTransaction(async (client) => {
    await updateSimpleProductTx(client, input)
  })
}

export async function syncSimpleProductGroup(input: {
  anchorProductId: string
  expectedExistingProductIds?: string[]
  variants: SyncSimpleProductGroupVariantInput[]
}) {
  const normalizedVariants = Array.isArray(input.variants) ? input.variants : []
  if (!normalizedVariants.length) {
    throw new Error("At least one variant is required.")
  }

  return await pgTransaction(async (client) => {
    const { groupId, productIds } = await getEditableGroupInfoTx(
      client,
      input.anchorProductId
    )
    const expectedExistingProductIds = Array.from(
      new Set(
        (Array.isArray(input.expectedExistingProductIds)
          ? input.expectedExistingProductIds
          : []
        )
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    )
    const knownExistingIds = expectedExistingProductIds.length
      ? expectedExistingProductIds
      : productIds
    const editableIds = new Set(productIds)

    const missingExpectedIds = knownExistingIds.filter((id) => !editableIds.has(id))
    if (missingExpectedIds.length) {
      throw new ProductGroupSyncConflictError(
        "El grupo cambió mientras lo editabas. Recargá antes de guardar."
      )
    }

    const seenExistingIds = new Set<string>()
    const keepIds = new Set<string>()
    const reservedHandles = new Set<string>()

    for (const variant of normalizedVariants) {
      const existingId = String(variant.id || "").trim()
      const metadata = {
        ...(variant.metadata ?? {}),
        group_id: groupId,
      }

      if (existingId) {
        if (!editableIds.has(existingId) || !knownExistingIds.includes(existingId)) {
          throw new ProductGroupSyncConflictError(
            "El grupo cambió mientras lo editabas. Recargá antes de guardar."
          )
        }
        if (seenExistingIds.has(existingId)) {
          throw new Error("Duplicate product id in sync payload.")
        }

        seenExistingIds.add(existingId)
        keepIds.add(existingId)
        await updateSimpleProductTx(client, {
          productId: existingId,
          title: variant.title,
          description: variant.description,
          status: variant.status,
          images: variant.images,
          metadata,
          categoryId: variant.categoryId,
          brandId: variant.brandId,
          variantSku: variant.variantSku,
          variantMetadata: metadata,
          currencyCode: variant.currencyCode,
          priceAmount: variant.priceAmount,
          costAmount: variant.costAmount,
        })
        await setProductStockLevelTx(client, {
          productId: existingId,
          availableQty: variant.stockAvailable,
        })
        continue
      }

      const handle = await resolveAvailableHandleTx(client, {
        rawTitle: variant.title,
        requestedHandle: variant.handle,
        reservedHandles,
      })
      const created = await createSimpleProductTx(client, {
        title: variant.title,
        handle,
        description: variant.description,
        status: variant.status,
        thumbnail: normalizeUrls(variant.images)[0] ?? null,
        images: variant.images,
        metadata,
        categoryId: variant.categoryId,
        brandId: variant.brandId,
        variantSku: variant.variantSku,
        variantMetadata: metadata,
        currencyCode: variant.currencyCode,
        priceAmount: variant.priceAmount,
        costAmount: variant.costAmount,
      })
      keepIds.add(created.productId)
      await setProductStockLevelTx(client, {
        productId: created.productId,
        availableQty: variant.stockAvailable,
      })
    }

    for (const productId of knownExistingIds) {
      if (keepIds.has(productId)) continue
      await deleteSimpleProductTx(client, productId)
    }

    return {
      groupId,
      productIds: Array.from(keepIds),
    }
  })
}

export async function deleteSimpleProduct(productIdRaw: string) {
  const productId = String(productIdRaw || "").trim()
  if (!productId) throw new Error("productId is required.")

  await pgTransaction(async (client) => {
    await deleteSimpleProductTx(client, productId)
  })
}
