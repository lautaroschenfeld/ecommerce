import { STORE_CURRENCY_CODE } from "./catalog"
import { pgQuery } from "./pg"

export type CatalogBrand = {
  id: string
  name: string
  slug: string
}

export type CatalogCategory = {
  id: string
  name: string
}

export type CatalogImage = {
  id: string
  url: string
}

export type CatalogPrice = {
  amount: number
  currency_code: string
}

export type CatalogVariant = {
  id: string
  sku: string | null
  cost_ars: number | null
  metadata: Record<string, unknown> | null
  prices: CatalogPrice[]
}

export type CatalogProduct = {
  id: string
  title: string
  handle: string
  status: string
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  thumbnail: string | null
  images: CatalogImage[]
  categories: CatalogCategory[]
  variants: CatalogVariant[]
  brand: CatalogBrand | null
}

type BaseProductRow = {
  id: string
  title: string
  handle: string
  status: string
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
  thumbnail: string | null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim())
}

function uniqStrings(values: string[]) {
  return Array.from(new Set(values))
}

function normalizeIds(ids: unknown) {
  if (!Array.isArray(ids)) return []
  return uniqStrings(ids.filter(isNonEmptyString).map((id) => id.trim()))
}

function resolvedPriceLateralSql(productAlias: string) {
  return `left join lateral (
      select pr."amount" as "resolved_price"
      from (
        select v."id"
        from "product_variant" v
        where v."deleted_at" is null
          and v."product_id" = ${productAlias}."id"
        order by v."variant_rank" asc nulls last, v."created_at" asc, v."id" asc
        limit 1
      ) fv
      join "product_variant_price_set" pvps
        on pvps."variant_id" = fv."id"
        and pvps."deleted_at" is null
      join "price" pr
        on pr."price_set_id" = pvps."price_set_id"
        and pr."price_list_id" is null
        and pr."deleted_at" is null
        and pr."amount" > 0
      order by
        (pr."currency_code" = $1) desc,
        pr."updated_at" desc nulls last,
        pr."created_at" desc nulls last,
        pr."id" asc
      limit 1
    ) rp on true`
}

function compatibilitySearchTextSql(productAlias: string) {
  return `coalesce(
      nullif(trim(concat_ws(
        ' ',
        nullif(${productAlias}."metadata"->>'compatibility', ''),
        nullif(${productAlias}."metadata"->>'compatible_with', ''),
        nullif(${productAlias}."metadata"->>'compatibleWith', ''),
        nullif(${productAlias}."metadata"->'characteristics'->>'compatibility', ''),
        nullif(${productAlias}."metadata"->'characteristics'->>'compatible_with', ''),
        nullif(${productAlias}."metadata"->'characteristics'->>'compatibleWith', ''),
        (
          select string_agg(ci."value", ' ')
          from (
            select nullif(trim(coalesce(ch."item"->>'value', '')), '') as "value"
            from jsonb_array_elements(
              case
                when jsonb_typeof(${productAlias}."metadata"->'characteristics'->'items') = 'array'
                  then ${productAlias}."metadata"->'characteristics'->'items'
                else '[]'::jsonb
              end
            ) as ch("item")
            where lower(coalesce(ch."item"->>'section', '')) = 'compatibility'
              or lower(coalesce(ch."item"->>'key', '')) in (
                'compatibility',
                'compatible_with',
                'compatiblewith',
                'compatible_years',
                'oem_code'
              )
          ) ci
          where ci."value" is not null
        )
      )), ''),
      ''
    )`
}

async function attachRelations(base: BaseProductRow[]): Promise<CatalogProduct[]> {
  const ids = normalizeIds(base.map((row) => row.id))
  if (!ids.length) return []

  const [brandRows, categoryRows, imageRows, variantRows] = await Promise.all([
    pgQuery<{
      product_id: string
      brand_id: string
      brand_name: string
      brand_slug: string
    }>(
      `select
        pb."product_id" as "product_id",
        b."id" as "brand_id",
        b."name" as "brand_name",
        b."slug" as "brand_slug"
      from "product_brand" pb
      join "brand" b on b."id" = pb."brand_id" and b."deleted_at" is null
      where pb."deleted_at" is null
        and pb."product_id" = any($1::text[]);`,
      [ids]
    ),
    pgQuery<{
      product_id: string
      category_id: string
      category_name: string
    }>(
      `select
        pcp."product_id" as "product_id",
        c."id" as "category_id",
        c."name" as "category_name"
      from "product_category_product" pcp
      join "product_category" c on c."id" = pcp."product_category_id" and c."deleted_at" is null
      where pcp."product_id" = any($1::text[]);`,
      [ids]
    ),
    pgQuery<{
      product_id: string
      image_id: string
      image_url: string
    }>(
      `select
        i."product_id" as "product_id",
        i."id" as "image_id",
        i."url" as "image_url"
      from "image" i
      where i."deleted_at" is null
        and i."product_id" = any($1::text[])
      order by i."rank" asc nulls last, i."created_at" asc;`,
      [ids]
    ),
    pgQuery<{
      product_id: string
      variant_id: string
      variant_sku: string | null
      variant_cost_ars: number | null
      variant_metadata: Record<string, unknown> | null
      variant_rank: number | null
      variant_created_at: Date
      pvps_deleted_at: Date | null
      price_amount: number | null
      price_currency_code: string | null
      price_deleted_at: Date | null
      price_updated_at: Date | null
    }>(
      `select
        v."product_id" as "product_id",
        v."id" as "variant_id",
        v."sku" as "variant_sku",
        v."cost_ars" as "variant_cost_ars",
        v."metadata" as "variant_metadata",
        v."variant_rank" as "variant_rank",
        v."created_at" as "variant_created_at",
        pvps."deleted_at" as "pvps_deleted_at",
        pr."amount" as "price_amount",
        pr."currency_code" as "price_currency_code",
        pr."deleted_at" as "price_deleted_at",
        pr."updated_at" as "price_updated_at"
      from "product_variant" v
      left join "product_variant_price_set" pvps
        on pvps."variant_id" = v."id"
      left join "price" pr
        on pr."price_set_id" = pvps."price_set_id"
        and pr."price_list_id" is null
      where v."deleted_at" is null
        and v."product_id" = any($1::text[])
      order by
        v."product_id" asc,
        v."variant_rank" asc nulls last,
        v."created_at" asc,
        v."id" asc,
        (pvps."deleted_at" is null) desc,
        (pr."deleted_at" is null) desc,
        pr."updated_at" desc nulls last,
        pr."created_at" desc nulls last,
        pr."id" asc;`,
      [ids]
    ),
  ])

  const brandByProductId = new Map<string, CatalogBrand>()
  for (const row of brandRows) {
    const productId = String(row.product_id || "")
    if (!productId) continue
    if (brandByProductId.has(productId)) continue
    if (!isNonEmptyString(row.brand_id) || !isNonEmptyString(row.brand_name) || !isNonEmptyString(row.brand_slug)) {
      continue
    }
    brandByProductId.set(productId, {
      id: row.brand_id.trim(),
      name: row.brand_name.trim(),
      slug: row.brand_slug.trim(),
    })
  }

  const categoriesByProductId = new Map<string, CatalogCategory[]>()
  for (const row of categoryRows) {
    const productId = String(row.product_id || "")
    if (!productId) continue
    if (!isNonEmptyString(row.category_id) || !isNonEmptyString(row.category_name)) continue
    const list = categoriesByProductId.get(productId) ?? []
    list.push({ id: row.category_id.trim(), name: row.category_name.trim() })
    categoriesByProductId.set(productId, list)
  }

  const imagesByProductId = new Map<string, CatalogImage[]>()
  for (const row of imageRows) {
    const productId = String(row.product_id || "")
    if (!productId) continue
    if (!isNonEmptyString(row.image_id) || !isNonEmptyString(row.image_url)) continue
    const list = imagesByProductId.get(productId) ?? []
    list.push({ id: row.image_id.trim(), url: row.image_url.trim() })
    imagesByProductId.set(productId, list)
  }

  const variantsByProductId = new Map<string, CatalogVariant[]>()
  const variantIndexById = new Map<string, CatalogVariant>()
  for (const row of variantRows) {
    const productId = String(row.product_id || "")
    const variantId = String(row.variant_id || "")
    if (!productId || !variantId) continue

    let variant = variantIndexById.get(variantId)
    if (!variant) {
      variant = {
        id: variantId,
        sku: isNonEmptyString(row.variant_sku) ? row.variant_sku.trim() : null,
        cost_ars:
          Number.isFinite(Number(row.variant_cost_ars)) && Number(row.variant_cost_ars) >= 0
            ? Math.trunc(Number(row.variant_cost_ars))
            : null,
        metadata:
          row.variant_metadata && typeof row.variant_metadata === "object"
            ? row.variant_metadata
            : null,
        prices: [],
      }
      variantIndexById.set(variantId, variant)

      const list = variantsByProductId.get(productId) ?? []
      list.push(variant)
      variantsByProductId.set(productId, list)
    }

    const currency = isNonEmptyString(row.price_currency_code)
      ? row.price_currency_code.trim()
      : ""
    const amount = Number(row.price_amount)
    if (!currency) continue
    if (!Number.isFinite(amount) || amount <= 0) continue

    // Avoid duplicates per currency (common when joining across multiple rows).
    if (variant.prices.some((p) => p.currency_code === currency)) continue

    variant.prices.push({ currency_code: currency, amount: Math.trunc(amount) })
  }

  return base.map((row) => {
    const brand = brandByProductId.get(row.id) ?? null
    const categories = categoriesByProductId.get(row.id) ?? []
    const images = imagesByProductId.get(row.id) ?? []
    const variants = variantsByProductId.get(row.id) ?? []

    return {
      id: row.id,
      title: row.title,
      handle: row.handle,
      status: row.status,
      description: row.description ?? null,
      metadata: row.metadata ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      thumbnail: row.thumbnail ?? null,
      images,
      categories,
      variants,
      brand,
    }
  })
}

export async function listCatalogProducts(input: {
  q?: string
  status?: string | null
  categoryId?: string
  productIds?: string[] | null
}) {
  const q = isNonEmptyString(input.q) ? input.q.trim() : ""
  const status = isNonEmptyString(input.status) ? input.status.trim() : ""
  const categoryId = isNonEmptyString(input.categoryId) ? input.categoryId.trim() : ""
  const productIds = normalizeIds(input.productIds ?? [])

  const params: unknown[] = []
  const where: string[] = ['p."deleted_at" is null']

  if (status) {
    params.push(status)
    where.push(`p."status" = $${params.length}`)
  }

  if (q) {
    params.push(q)
    params.push(`%${q}%`)
    const exactIdx = params.length - 1
    const likeIdx = params.length
    where.push(
      `(p."id" = $${exactIdx} or p."title" ilike $${likeIdx} or p."handle" ilike $${likeIdx} or p."description" ilike $${likeIdx})`
    )
  }

  if (categoryId) {
    params.push(categoryId)
    const idx = params.length
    where.push(
      `exists (
        select 1
        from "product_category_product" pcp
        join "product_category" c on c."id" = pcp."product_category_id" and c."deleted_at" is null
        where pcp."product_id" = p."id"
          and pcp."product_category_id" = $${idx}
      )`
    )
  }

  if (productIds.length) {
    params.push(productIds)
    const idx = params.length
    where.push(`p."id" = any($${idx}::text[])`)
  }

  const whereSql = where.length ? ` where ${where.join(" and ")}` : ""

  const pageSize = 500
  const baseParams = [...params]
  const limitIdx = baseParams.length + 1
  const offsetIdx = baseParams.length + 2

  const sql = `select
      p."id",
      p."title",
      p."handle",
      p."status",
      p."description",
      p."metadata",
      p."created_at",
      p."updated_at",
      p."thumbnail"
    from "product" p${whereSql}
    order by p."created_at" desc nulls last, p."id" asc
    limit $${limitIdx} offset $${offsetIdx};`

  const out: BaseProductRow[] = []
  let offset = 0

  while (true) {
    const rows = await pgQuery<BaseProductRow>(sql, [...baseParams, pageSize, offset])
    out.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
  }

  return await attachRelations(out)
}

export type CatalogProductsPageSort =
  | "relevancia"
  | "precio_asc"
  | "precio_desc"
  | "nombre_asc"
  | "nombre_desc"

export type AdminCatalogProductsStatusFilter =
  | "all"
  | "live"
  | "active"
  | "draft"
  | "archived"

export type AdminCatalogProductsSort =
  | "created_desc"
  | "created_asc"
  | "price_desc"
  | "price_asc"
  | "name_asc"
  | "name_desc"
  | "stock_desc"
  | "stock_asc"

function adminProductGroupKeySql(productAlias: string) {
  return `coalesce(
    nullif(trim(${productAlias}."metadata"->>'group_id'), ''),
    nullif(trim(${productAlias}."metadata"->>'variant_group_id'), ''),
    nullif(trim(${productAlias}."metadata"->>'family'), ''),
    concat('__single__:', ${productAlias}."id")
  )`
}

function adminProductsSortOrderSql(sort: AdminCatalogProductsSort, alias: string) {
  if (sort === "created_asc") {
    return `order by ${alias}."created_at" asc nulls last, ${alias}."id" asc`
  }
  if (sort === "price_desc") {
    return `order by (${alias}."resolved_price" is null) asc, ${alias}."resolved_price" desc, ${alias}."created_at" desc nulls last, ${alias}."id" asc`
  }
  if (sort === "price_asc") {
    return `order by (${alias}."resolved_price" is null) asc, ${alias}."resolved_price" asc, ${alias}."created_at" desc nulls last, ${alias}."id" asc`
  }
  if (sort === "name_asc") {
    return `order by lower(${alias}."title") asc, ${alias}."title" asc, ${alias}."id" asc`
  }
  if (sort === "name_desc") {
    return `order by lower(${alias}."title") desc, ${alias}."title" desc, ${alias}."id" asc`
  }
  if (sort === "stock_desc") {
    return `order by ${alias}."available_qty" desc, ${alias}."created_at" desc nulls last, ${alias}."id" asc`
  }
  if (sort === "stock_asc") {
    return `order by ${alias}."available_qty" asc, ${alias}."created_at" desc nulls last, ${alias}."id" asc`
  }
  return `order by ${alias}."created_at" desc nulls last, ${alias}."id" asc`
}

export async function listCatalogProductsPage(input: {
  q?: string
  status?: string | null
  categoryId?: string
  productIds?: string[] | null
  brandSlugs?: string[] | null
  minPrice?: number
  maxPrice?: number
  sort?: CatalogProductsPageSort
  conditions?: string[] | null
  gender?: "hombre" | "mujer" | "unisex"
  size?: string
  groupId?: string
  limit?: number
  offset?: number
}) {
  const q = isNonEmptyString(input.q) ? input.q.trim() : ""
  const status = input.status === null ? "" : isNonEmptyString(input.status) ? input.status.trim() : ""
  const categoryId = isNonEmptyString(input.categoryId) ? input.categoryId.trim() : ""
  const productIds = normalizeIds(input.productIds ?? [])
  const brandSlugs = uniqStrings(
    (Array.isArray(input.brandSlugs) ? input.brandSlugs : [])
      .filter(isNonEmptyString)
      .map((slug) => slug.trim())
      .filter(Boolean)
  )
  const conditions = uniqStrings(
    (Array.isArray(input.conditions) ? input.conditions : [])
      .map((v) => (typeof v === "string" ? v.trim().toLowerCase() : ""))
      .filter(Boolean)
  )
  const gender =
    input.gender === "hombre" || input.gender === "mujer" || input.gender === "unisex"
      ? input.gender
      : undefined
  const size = isNonEmptyString(input.size) ? input.size.trim().toLowerCase() : ""
  const groupId = isNonEmptyString(input.groupId) ? input.groupId.trim() : ""
  const minPrice = Number.isFinite(Number(input.minPrice)) ? Number(input.minPrice) : undefined
  const maxPrice = Number.isFinite(Number(input.maxPrice)) ? Number(input.maxPrice) : undefined
  const sort: CatalogProductsPageSort =
    input.sort === "precio_asc" ||
    input.sort === "precio_desc" ||
    input.sort === "nombre_asc" ||
    input.sort === "nombre_desc" ||
    input.sort === "relevancia"
      ? input.sort
      : "relevancia"
  const isPriceSort = sort === "precio_asc" || sort === "precio_desc"
  const hasPriceFilter = minPrice !== undefined || maxPrice !== undefined
  const includePriceForIds = hasPriceFilter || isPriceSort
  const includePriceForAggregates = hasPriceFilter
  const limit = Math.max(
    1,
    Math.min(
      100,
      Number.isFinite(Number(input.limit)) ? Math.trunc(Number(input.limit)) : 24
    )
  )
  const offset = Math.max(
    0,
    Number.isFinite(Number(input.offset)) ? Math.trunc(Number(input.offset)) : 0
  )

  const params: unknown[] = [STORE_CURRENCY_CODE]
  const where: string[] = ['p."deleted_at" is null']
  const groupKeySql = adminProductGroupKeySql("p")
  const pushParam = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  const conditionExpr = `case
      when lower(coalesce(trim(p."metadata"->>'condition'), '')) = 'usado' then 'usado'
      when lower(coalesce(trim(p."metadata"->>'condition'), '')) = 'reacondicionado' then 'reacondicionado'
      else 'nuevo'
    end`
  const genderExpr = `case
      when lower(coalesce(trim(p."metadata"->>'gender'), '')) in ('hombre', 'mujer', 'unisex')
        then lower(trim(p."metadata"->>'gender'))
      else null
    end`
  const sizeStocksExprFromProduct = `case
      when jsonb_typeof(p."metadata") = 'object'
        and jsonb_typeof(p."metadata"->'size_stocks') = 'object'
        then p."metadata"->'size_stocks'
      when jsonb_typeof(p."metadata") = 'object'
        and jsonb_typeof(p."metadata"->'sizeStocks') = 'object'
        then p."metadata"->'sizeStocks'
      else '{}'::jsonb
    end`
  const sizeStocksExprFromFiltered = `case
      when jsonb_typeof(f."metadata") = 'object'
        and jsonb_typeof(f."metadata"->'size_stocks') = 'object'
        then f."metadata"->'size_stocks'
      when jsonb_typeof(f."metadata") = 'object'
        and jsonb_typeof(f."metadata"->'sizeStocks') = 'object'
        then f."metadata"->'sizeStocks'
      else '{}'::jsonb
    end`
  const compatibilitySearchExpr = compatibilitySearchTextSql("p")

  if (status) {
    const idx = pushParam(status)
    where.push(`p."status" = ${idx}`)
  }

  if (q) {
    const exactIdx = pushParam(q)
    const likeIdx = pushParam(`%${q}%`)
    where.push(
      `(p."id" = ${exactIdx}
        or p."title" ilike ${likeIdx}
        or p."handle" ilike ${likeIdx}
        or p."description" ilike ${likeIdx}
        or ${compatibilitySearchExpr} ilike ${likeIdx})`
    )
  }

  if (categoryId) {
    const idx = pushParam(categoryId)
    where.push(
      `exists (
        select 1
        from "product_category_product" pcp
        join "product_category" c on c."id" = pcp."product_category_id" and c."deleted_at" is null
        where pcp."product_id" = p."id"
          and pcp."product_category_id" = ${idx}
      )`
    )
  }

  if (productIds.length) {
    const idx = pushParam(productIds)
    where.push(`p."id" = any(${idx}::text[])`)
  }

  if (brandSlugs.length) {
    const idx = pushParam(brandSlugs)
    where.push(
      `exists (
        select 1
        from "product_brand" pb
        join "brand" b on b."id" = pb."brand_id" and b."deleted_at" is null
        where pb."deleted_at" is null
          and pb."product_id" = p."id"
          and b."slug" = any(${idx}::text[])
      )`
    )
  }

  if (groupId) {
    const idx = pushParam(groupId)
    where.push(
      `coalesce(
        nullif(trim(p."metadata"->>'group_id'), ''),
        nullif(trim(p."metadata"->>'variant_group_id'), ''),
        nullif(trim(p."metadata"->>'family'), '')
      ) = ${idx}`
    )
  }

  if (conditions.length) {
    const idx = pushParam(conditions)
    where.push(`${conditionExpr} = any(${idx}::text[])`)
  }

  if (gender) {
    const idx = pushParam(gender)
    if (gender === "hombre" || gender === "mujer") {
      where.push(`(${genderExpr} = ${idx} or ${genderExpr} = 'unisex')`)
    } else {
      where.push(`${genderExpr} = ${idx}`)
    }
  }

  if (size) {
    const idx = pushParam(size)
    const sizeStocksValueExpr = `nullif(
      trim(
        coalesce(
          (${sizeStocksExprFromProduct})->>${idx},
          (${sizeStocksExprFromProduct})->>upper(${idx}),
          (${sizeStocksExprFromProduct})->>initcap(${idx})
        )
      ),
      ''
    )`
    where.push(
      `(lower(coalesce(trim(p."metadata"->>'size'), '')) = ${idx}
        or case
          when ${sizeStocksValueExpr} ~ '^[+-]?[0-9]+([.][0-9]+)?$'
            then (${sizeStocksValueExpr})::numeric > 0
          else false
        end)`
    )
  }

  if (hasPriceFilter) {
    where.push(`rp."resolved_price" is not null`)
    if (minPrice !== undefined) {
      const idx = pushParam(minPrice)
      where.push(`rp."resolved_price" >= ${idx}`)
    }
    if (maxPrice !== undefined) {
      const idx = pushParam(maxPrice)
      where.push(`rp."resolved_price" <= ${idx}`)
    }
  }

  const whereSql = where.length ? ` where ${where.join(" and ")}` : ""

  const buildFilteredSql = (includeResolvedPrice: boolean) => `select
      p."id",
      p."title",
      p."created_at",
      p."metadata",
      ${includeResolvedPrice ? `rp."resolved_price"` : `null::integer as "resolved_price"`}
    from "product" p
    cross join (select $1::text as "currency_code") as currency_anchor
    ${includeResolvedPrice ? resolvedPriceLateralSql("p") : ""}${whereSql}`

  const filteredSqlForIds = buildFilteredSql(includePriceForIds)
  const filteredSqlForAggregates = buildFilteredSql(includePriceForAggregates)

  const orderSql =
    sort === "precio_asc"
      ? `order by (f."resolved_price" is null) asc, f."resolved_price" asc, f."created_at" desc nulls last, f."id" asc`
      : sort === "precio_desc"
        ? `order by (f."resolved_price" is null) asc, f."resolved_price" desc, f."created_at" desc nulls last, f."id" asc`
        : sort === "nombre_asc"
          ? `order by lower(f."title") asc, f."title" asc, f."id" asc`
          : sort === "nombre_desc"
            ? `order by lower(f."title") desc, f."title" desc, f."id" asc`
            : `order by f."created_at" desc nulls last, f."id" asc`

  const limitIdx = params.length + 1
  const offsetIdx = params.length + 2
  const idsSql = `with filtered as (${filteredSqlForIds})
    select f."id"
    from filtered f
    ${orderSql}
    limit $${limitIdx} offset $${offsetIdx};`
  const countSql = `with filtered as (${filteredSqlForAggregates})
    select count(*)::int as "count"
    from filtered;`
  const availableSizesSql = `with filtered as (${filteredSqlForAggregates}),
    size_candidates as (
      select nullif(trim(f."metadata"->>'size'), '') as "size"
      from filtered f
      union all
      select nullif(trim(sz."key"), '') as "size"
      from filtered f
      cross join lateral jsonb_each_text(${sizeStocksExprFromFiltered}) as sz("key", "value")
      where case
        when sz."value" ~ '^[+-]?[0-9]+([.][0-9]+)?$' then sz."value"::numeric > 0
        else false
      end
    )
    select coalesce(array_agg(s."size"), '{}'::text[]) as "sizes"
    from (
      select sc."size"
      from size_candidates sc
      where sc."size" is not null and sc."size" <> ''
      group by sc."size"
      order by lower(sc."size"), sc."size"
    ) s;`

  const [idRows, countRows, sizesRows] = await Promise.all([
    pgQuery<{ id: string }>(idsSql, [...params, limit, offset]),
    pgQuery<{ count: number | string }>(countSql, params),
    pgQuery<{ sizes: string[] | null }>(availableSizesSql, params),
  ])

  const ids = normalizeIds(idRows.map((row) => row.id))
  const total = Math.max(0, Number(countRows[0]?.count ?? 0) || 0)
  const availableSizes = Array.isArray(sizesRows[0]?.sizes)
    ? sizesRows[0].sizes.filter(isNonEmptyString).map((size) => size.trim())
    : []

  if (!ids.length) {
    return { products: [] as CatalogProduct[], count: total, availableSizes }
  }

  const products = await getCatalogProductsByIds(ids)
  const byId = new Map(products.map((product) => [product.id, product]))
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((product): product is CatalogProduct => Boolean(product))

  return { products: ordered, count: total, availableSizes }
}

export type CatalogProductSuggestion = {
  id: string
  handle: string
  title: string
  thumbnail: string | null
  created_at: Date
  price_ars: number | null
  brand: CatalogBrand | null
  category: CatalogCategory | null
}

export async function listCatalogProductSuggestions(input: {
  q?: string
  status?: string | null
  categoryId?: string
  brandSlugs?: string[] | null
  minPrice?: number
  maxPrice?: number
  limit?: number
}) {
  const q = isNonEmptyString(input.q) ? input.q.trim() : ""
  if (q.length < 2) return [] as CatalogProductSuggestion[]

  const qLower = q.toLocaleLowerCase("es")
  const status = input.status === null ? "" : isNonEmptyString(input.status) ? input.status.trim() : ""
  const categoryId = isNonEmptyString(input.categoryId) ? input.categoryId.trim() : ""
  const brandSlugs = uniqStrings(
    (Array.isArray(input.brandSlugs) ? input.brandSlugs : [])
      .filter(isNonEmptyString)
      .map((slug) => slug.trim())
      .filter(Boolean)
  )
  const minPrice = Number.isFinite(Number(input.minPrice)) ? Number(input.minPrice) : undefined
  const maxPrice = Number.isFinite(Number(input.maxPrice)) ? Number(input.maxPrice) : undefined
  const limit = Math.max(
    1,
    Math.min(
      12,
      Number.isFinite(Number(input.limit)) ? Math.trunc(Number(input.limit)) : 8
    )
  )

  const params: unknown[] = [STORE_CURRENCY_CODE]
  const where: string[] = ['p."deleted_at" is null']
  const pushParam = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  if (status) {
    const idx = pushParam(status)
    where.push(`p."status" = ${idx}`)
  }

  if (categoryId) {
    const idx = pushParam(categoryId)
    where.push(
      `exists (
        select 1
        from "product_category_product" pcp
        join "product_category" c on c."id" = pcp."product_category_id" and c."deleted_at" is null
        where pcp."product_id" = p."id"
          and pcp."product_category_id" = ${idx}
      )`
    )
  }

  if (brandSlugs.length) {
    const idx = pushParam(brandSlugs)
    where.push(
      `exists (
        select 1
        from "product_brand" pb
        join "brand" b on b."id" = pb."brand_id" and b."deleted_at" is null
        where pb."deleted_at" is null
          and pb."product_id" = p."id"
          and b."slug" = any(${idx}::text[])
      )`
    )
  }

  if (minPrice !== undefined) {
    const idx = pushParam(minPrice)
    where.push(`rp."resolved_price" is not null`)
    where.push(`rp."resolved_price" >= ${idx}`)
  }

  if (maxPrice !== undefined) {
    const idx = pushParam(maxPrice)
    where.push(`rp."resolved_price" is not null`)
    where.push(`rp."resolved_price" <= ${idx}`)
  }

  const exactIdx = pushParam(qLower)
  const prefixIdx = pushParam(`${qLower}%`)
  const containsIdx = pushParam(`%${qLower}%`)
  const tsQueryIdx = pushParam(q)
  const compatibilitySearchExpr = compatibilitySearchTextSql("p")
  const searchVectorExpr = `sv."search_vector"`
  const trigramTitleExpr = `similarity(lower(p."title"), ${exactIdx})`
  const trigramHandleExpr = `similarity(lower(p."handle"), ${exactIdx})`
  const trigramDescriptionExpr = `similarity(lower(coalesce(p."description", '')), ${exactIdx})`
  const trigramBrandExpr = `similarity(lower(coalesce(bm."brand_name", '')), ${exactIdx})`
  const trigramCategoryExpr = `similarity(lower(coalesce(cm."category_name", '')), ${exactIdx})`
  const trigramCompatibilityExpr = `similarity(lower(coalesce(cfx."compatibility_text", '')), ${exactIdx})`
  const trigramScoreExpr = `greatest(
      ${trigramTitleExpr},
      ${trigramHandleExpr},
      ${trigramDescriptionExpr},
      ${trigramBrandExpr},
      ${trigramCategoryExpr},
      ${trigramCompatibilityExpr}
    )`

  where.push(
    `(lower(p."id") = ${exactIdx}
      or lower(p."handle") = ${exactIdx}
      or lower(p."title") = ${exactIdx}
      or lower(p."title") like ${prefixIdx}
      or lower(p."handle") like ${prefixIdx}
      or lower(p."title") like ${containsIdx}
      or lower(coalesce(p."description", '')) like ${containsIdx}
      or lower(coalesce(bm."brand_name", '')) like ${containsIdx}
      or lower(coalesce(cm."category_name", '')) like ${containsIdx}
      or lower(coalesce(cfx."compatibility_text", '')) like ${containsIdx}
      or lower(p."title") % ${exactIdx}
      or lower(p."handle") % ${exactIdx}
      or lower(coalesce(p."description", '')) % ${exactIdx}
      or lower(coalesce(bm."brand_name", '')) % ${exactIdx}
      or lower(coalesce(cm."category_name", '')) % ${exactIdx}
      or lower(coalesce(cfx."compatibility_text", '')) % ${exactIdx}
      or ${searchVectorExpr} @@ websearch_to_tsquery('simple', ${tsQueryIdx}))`
  )

  const rankExpr = `(case
      when lower(p."id") = ${exactIdx} then 1000
      when lower(p."handle") = ${exactIdx} then 920
      when lower(p."title") = ${exactIdx} then 900
      when lower(p."title") like ${prefixIdx} then 760
      when lower(p."handle") like ${prefixIdx} then 740
      when lower(coalesce(bm."brand_name", '')) like ${prefixIdx} then 700
      when lower(coalesce(cm."category_name", '')) like ${prefixIdx} then 680
      when lower(coalesce(cfx."compatibility_text", '')) like ${prefixIdx} then 660
      when lower(p."title") like ${containsIdx} then 560
      when lower(coalesce(bm."brand_name", '')) like ${containsIdx} then 520
      when lower(coalesce(cm."category_name", '')) like ${containsIdx} then 500
      when lower(coalesce(cfx."compatibility_text", '')) like ${containsIdx} then 480
      when ${searchVectorExpr} @@ websearch_to_tsquery('simple', ${tsQueryIdx}) then 420
      else 0
    end
    + coalesce(ts_rank_cd(${searchVectorExpr}, websearch_to_tsquery('simple', ${tsQueryIdx})), 0)
    + (${trigramScoreExpr} * 350))`

  const limitIdx = pushParam(limit)
  const whereSql = where.length ? `where ${where.join(" and ")}` : ""

  const rows = await pgQuery<{
    id: string
    handle: string
    title: string
    thumbnail: string | null
    created_at: Date
    price_ars: number | null
    brand_id: string | null
    brand_name: string | null
    brand_slug: string | null
    category_id: string | null
    category_name: string | null
  }>(
    `select
      p."id",
      p."handle",
      p."title",
      p."thumbnail",
      p."created_at",
      rp."resolved_price" as "price_ars",
      bm."brand_id",
      bm."brand_name",
      bm."brand_slug",
      cm."category_id",
      cm."category_name",
      ${rankExpr} as "score"
    from "product" p
    left join lateral (
      select b."id" as "brand_id", b."name" as "brand_name", b."slug" as "brand_slug"
      from "product_brand" pb
      join "brand" b on b."id" = pb."brand_id" and b."deleted_at" is null
      where pb."deleted_at" is null
        and pb."product_id" = p."id"
      order by pb."created_at" asc, pb."id" asc
      limit 1
    ) bm on true
    left join lateral (
      select c."id" as "category_id", c."name" as "category_name"
      from "product_category_product" pcp
      join "product_category" c on c."id" = pcp."product_category_id" and c."deleted_at" is null
      where pcp."product_id" = p."id"
      order by pcp."product_category_id" asc
      limit 1
    ) cm on true
    ${resolvedPriceLateralSql("p")}
    cross join lateral (
      select ${compatibilitySearchExpr} as "compatibility_text"
    ) cfx
    cross join lateral (
      select to_tsvector(
        'simple',
        concat_ws(
          ' ',
          coalesce(p."title", ''),
          coalesce(p."handle", ''),
          coalesce(p."description", ''),
          coalesce(bm."brand_name", ''),
          coalesce(cm."category_name", ''),
          coalesce(cfx."compatibility_text", '')
        )
      ) as "search_vector"
    ) sv
    ${whereSql}
    order by "score" desc, p."created_at" desc nulls last, p."id" asc
    limit ${limitIdx};`,
    params
  )

  return rows.map((row) => ({
    id: row.id,
    handle: row.handle,
    title: row.title,
    thumbnail: row.thumbnail ?? null,
    created_at: row.created_at,
    price_ars: Number.isFinite(Number(row.price_ars)) ? Math.trunc(Number(row.price_ars)) : null,
    brand:
      isNonEmptyString(row.brand_id) &&
      isNonEmptyString(row.brand_name) &&
      isNonEmptyString(row.brand_slug)
        ? {
            id: row.brand_id.trim(),
            name: row.brand_name.trim(),
            slug: row.brand_slug.trim(),
          }
        : null,
    category:
      isNonEmptyString(row.category_id) && isNonEmptyString(row.category_name)
        ? {
            id: row.category_id.trim(),
            name: row.category_name.trim(),
          }
        : null,
  }))
}

export async function listAdminCatalogProductsPage(input: {
  q?: string
  categoryId?: string
  brandSlugs?: string[] | null
  minPrice?: number
  maxPrice?: number
  statusFilter?: AdminCatalogProductsStatusFilter
  sort?: AdminCatalogProductsSort
  limit?: number
  offset?: number
}) {
  const q = isNonEmptyString(input.q) ? input.q.trim() : ""
  const categoryId = isNonEmptyString(input.categoryId) ? input.categoryId.trim() : ""
  const brandSlugs = uniqStrings(
    (Array.isArray(input.brandSlugs) ? input.brandSlugs : [])
      .filter(isNonEmptyString)
      .map((slug) => slug.trim())
      .filter(Boolean)
  )
  const minPrice = Number.isFinite(Number(input.minPrice)) ? Number(input.minPrice) : undefined
  const maxPrice = Number.isFinite(Number(input.maxPrice)) ? Number(input.maxPrice) : undefined
  const statusFilter: AdminCatalogProductsStatusFilter =
    input.statusFilter === "all" ||
    input.statusFilter === "live" ||
    input.statusFilter === "active" ||
    input.statusFilter === "draft" ||
    input.statusFilter === "archived"
      ? input.statusFilter
      : "live"
  const sort: AdminCatalogProductsSort =
    input.sort === "created_desc" ||
    input.sort === "created_asc" ||
    input.sort === "price_desc" ||
    input.sort === "price_asc" ||
    input.sort === "name_asc" ||
    input.sort === "name_desc" ||
    input.sort === "stock_desc" ||
    input.sort === "stock_asc"
      ? input.sort
      : "created_desc"
  const isPriceSort = sort === "price_desc" || sort === "price_asc"
  const isStockSort = sort === "stock_desc" || sort === "stock_asc"
  const hasPriceFilter = minPrice !== undefined || maxPrice !== undefined
  const includePriceForIds = hasPriceFilter || isPriceSort
  const includePriceForCount = hasPriceFilter
  const includeStockForIds = isStockSort
  const limit = Math.max(
    1,
    Math.min(
      200,
      Number.isFinite(Number(input.limit)) ? Math.trunc(Number(input.limit)) : 48
    )
  )
  const offset = Math.max(
    0,
    Number.isFinite(Number(input.offset)) ? Math.trunc(Number(input.offset)) : 0
  )

  const params: unknown[] = [STORE_CURRENCY_CODE]
  const where: string[] = ['p."deleted_at" is null']
  const pushParam = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  const archivedExpr = `case
      when lower(coalesce(trim(p."metadata"->>'archived'), '')) in ('true', '1', 'yes') then true
      when lower(coalesce(trim(p."metadata"->>'archived'), '')) in ('false', '0', 'no') then false
      else false
    end`

  if (q) {
    const exactIdx = pushParam(q)
    const likeIdx = pushParam(`%${q}%`)
    where.push(
      `(p."id" = ${exactIdx} or p."title" ilike ${likeIdx} or p."handle" ilike ${likeIdx} or p."description" ilike ${likeIdx})`
    )
  }

  if (categoryId) {
    const idx = pushParam(categoryId)
    where.push(
      `exists (
        select 1
        from "product_category_product" pcp
        join "product_category" c on c."id" = pcp."product_category_id" and c."deleted_at" is null
        where pcp."product_id" = p."id"
          and pcp."product_category_id" = ${idx}
      )`
    )
  }

  if (brandSlugs.length) {
    const idx = pushParam(brandSlugs)
    where.push(
      `exists (
        select 1
        from "product_brand" pb
        join "brand" b on b."id" = pb."brand_id" and b."deleted_at" is null
        where pb."deleted_at" is null
          and pb."product_id" = p."id"
          and b."slug" = any(${idx}::text[])
      )`
    )
  }

  if (statusFilter === "live") {
    where.push(`${archivedExpr} = false`)
  } else if (statusFilter === "archived") {
    where.push(`${archivedExpr} = true`)
  } else if (statusFilter === "active") {
    where.push(`p."status" = 'published'`)
    where.push(`${archivedExpr} = false`)
  } else if (statusFilter === "draft") {
    where.push(`p."status" <> 'published'`)
    where.push(`${archivedExpr} = false`)
  }

  if (hasPriceFilter) {
    where.push(`rp."resolved_price" is not null`)
    if (minPrice !== undefined) {
      const idx = pushParam(minPrice)
      where.push(`rp."resolved_price" >= ${idx}`)
    }
    if (maxPrice !== undefined) {
      const idx = pushParam(maxPrice)
      where.push(`rp."resolved_price" <= ${idx}`)
    }
  }

  const whereSql = where.length ? ` where ${where.join(" and ")}` : ""
  const groupKeySql = adminProductGroupKeySql("p")
  const buildFilteredSql = (input: {
    includeResolvedPrice: boolean
    includeAvailableQty: boolean
  }) => `select
      p."id",
      p."title",
      p."created_at",
      ${input.includeResolvedPrice ? `rp."resolved_price"` : `null::integer as "resolved_price"`},
      ${input.includeAvailableQty ? `coalesce(st."available_qty", 0)::int` : `0::int`} as "available_qty",
      ${groupKeySql} as "group_key"
    from "product" p
    cross join (select $1::text as "currency_code") as currency_anchor
    ${input.includeAvailableQty ? `left join "mp_product_stock" st on st."product_id" = p."id"` : ""}
    ${input.includeResolvedPrice ? resolvedPriceLateralSql("p") : ""}${whereSql}`

  const filteredSqlForIds = buildFilteredSql({
    includeResolvedPrice: includePriceForIds,
    includeAvailableQty: includeStockForIds,
  })
  const filteredSqlForCount = buildFilteredSql({
    includeResolvedPrice: includePriceForCount,
    includeAvailableQty: false,
  })

  const filteredOrderSql = adminProductsSortOrderSql(sort, "f")
  const representativeOrderSql = adminProductsSortOrderSql(sort, "rg")

  const limitIdx = params.length + 1
  const offsetIdx = params.length + 2
  const idsSql = `with filtered as (${filteredSqlForIds}),
    ranked_groups as (
      select
        f."group_key",
        f."id",
        f."title",
        f."created_at",
        f."resolved_price",
        f."available_qty",
        row_number() over (
          partition by f."group_key"
          ${filteredOrderSql}
        ) as "group_rank"
      from filtered f
    ),
    paged_groups as (
      select
        page_source."group_key",
        row_number() over ()::int as "page_position"
      from (
        select
          rg."group_key"
        from ranked_groups rg
        where rg."group_rank" = 1
        ${representativeOrderSql}
        limit $${limitIdx} offset $${offsetIdx}
      ) page_source
    )
    select
      f."id"
    from paged_groups pg
    join filtered f
      on f."group_key" = pg."group_key"
    order by
      pg."page_position" asc,
      f."created_at" asc nulls last,
      f."id" asc;`
  const countSql = `with filtered as (${filteredSqlForCount})
    select
      count(distinct filtered."group_key")::int as "group_count",
      count(*)::int as "product_count"
    from filtered;`

  const [idRows, countRows] = await Promise.all([
    pgQuery<{ id: string }>(idsSql, [...params, limit, offset]),
    pgQuery<{ group_count: number | string; product_count: number | string }>(countSql, params),
  ])

  const ids = normalizeIds(idRows.map((row) => row.id))
  const groupCount = Math.max(0, Number(countRows[0]?.group_count ?? 0) || 0)
  const productCount = Math.max(0, Number(countRows[0]?.product_count ?? 0) || 0)

  if (!ids.length) {
    return {
      products: [] as CatalogProduct[],
      count: groupCount,
      productCount,
      limit,
      offset,
    }
  }

  const products = await getCatalogProductsByIds(ids)
  const byId = new Map(products.map((product) => [product.id, product]))
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((product): product is CatalogProduct => Boolean(product))

  return { products: ordered, count: groupCount, productCount, limit, offset }
}

export async function getCatalogProductsByIds(
  idsRaw: string[],
  input?: { status?: string | null }
) {
  const ids = normalizeIds(idsRaw)
  if (!ids.length) return [] as CatalogProduct[]

  const status = isNonEmptyString(input?.status) ? String(input?.status).trim() : ""

  const params: unknown[] = [ids]
  let where = `where p."deleted_at" is null and p."id" = any($1::text[])`
  if (status) {
    params.push(status)
    where += ` and p."status" = $2`
  }

  const base = await pgQuery<BaseProductRow>(
    `select
      p."id",
      p."title",
      p."handle",
      p."status",
      p."description",
      p."metadata",
      p."created_at",
      p."updated_at",
      p."thumbnail"
    from "product" p
    ${where};`,
    params
  )

  return await attachRelations(base)
}
