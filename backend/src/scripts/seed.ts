import crypto from "crypto"
import * as fs from "fs/promises"
import path from "path"

import "../lib/env"

import {
  ALL_CATEGORIES,
  STORE_CURRENCY_CODE,
  STORE_REGION_COUNTRY_CODE,
  STORE_REGION_NAME,
} from "../lib/catalog"
import { runAppMigrations } from "../lib/db-migrations"
import { getBrandPgService } from "../lib/brand-pg-service"
import { getCustomerAuthPgService } from "../lib/customer-auth-pg-service"
import { prefixedNanoId } from "../lib/id"
import { pgQuery, pgTransaction } from "../lib/pg"
import { createSimpleProduct } from "../lib/products-pg-service"
import { slugify } from "../lib/slug"
import { setProductStockLevel } from "../lib/stock"

type SeedProduct = {
  title: string
  brand: string
  category: string
  priceArs: number
  sku?: string
}

type LoggerLike = {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

const logger: LoggerLike = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
}

const DEFAULT_SALES_CHANNEL_NAME = "Default Sales Channel"
const DEFAULT_SHIPPING_PROFILE_NAME = "Default Shipping Profile"
const DEFAULT_PUBLISHABLE_KEY_TITLE = "Storefront Public API"
const DEFAULT_PAYMENT_PROVIDER_ID = "pp_system_default"

function makePublishableToken() {
  return `pk_${crypto.randomBytes(32).toString("hex")}`
}

function redactToken(token: string) {
  const idx = token.indexOf("_")
  const prefix = idx >= 0 ? token.slice(0, idx + 1) : ""
  const body = idx >= 0 ? token.slice(idx + 1) : token
  if (body.length < 8) return token
  return `${prefix}${body.slice(0, 3)}***${body.slice(-3)}`
}

function normalizePublishableToken(input: unknown) {
  const value = String(input || "").trim()
  if (!value) return ""
  if (!value.startsWith("pk_")) return ""
  if (value.length < 24) return ""
  return value
}

function getPreferredPublishableTokenFromEnv() {
  return (
    normalizePublishableToken(process.env.PUBLISHABLE_API_KEY) ||
    normalizePublishableToken(process.env.STORE_PUBLISHABLE_API_KEY) ||
    normalizePublishableToken(process.env.NEXT_PUBLIC_PUBLISHABLE_API_KEY)
  )
}

async function readFrontendEnvPublishableToken() {
  const frontendEnvPath = path.resolve(__dirname, "../../../frontend/.env.local")

  try {
    const content = await fs.readFile(frontendEnvPath, "utf8")
    const line = content
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(
        (entry) =>
          entry.startsWith("NEXT_PUBLIC_PUBLISHABLE_API_KEY=") && !entry.startsWith("#")
      )
    if (!line) return ""

    const rawValue = line.slice(line.indexOf("=") + 1).trim()
    const unquoted = rawValue.replace(/^['"]|['"]$/g, "")
    return normalizePublishableToken(unquoted)
  } catch {
    return ""
  }
}

let preferredPublishableTokenPromise: Promise<string> | null = null

async function resolvePreferredPublishableToken() {
  if (preferredPublishableTokenPromise) return preferredPublishableTokenPromise

  preferredPublishableTokenPromise = (async () => {
    const fromEnv = getPreferredPublishableTokenFromEnv()
    if (fromEnv) return fromEnv
    return await readFrontendEnvPublishableToken()
  })().catch((error) => {
    preferredPublishableTokenPromise = null
    throw error
  })

  return preferredPublishableTokenPromise
}

async function getOrCreateStoreId() {
  const rows = await pgQuery<{ id: string }>(
    `select "id"
     from "store"
     where "deleted_at" is null
     order by "created_at" asc
     limit 1;`
  )

  if (rows[0]?.id) return rows[0].id

  const id = prefixedNanoId("store")
  await pgQuery(
    `insert into "store" ("id","name","created_at","updated_at","deleted_at")
     values ($1,'Ecommerce',now(),now(),null);`,
    [id]
  )
  return id
}

async function getOrCreateDefaultSalesChannelId() {
  const rows = await pgQuery<{ id: string }>(
    `select "id"
     from "sales_channel"
     where "deleted_at" is null and "name" = $1
     order by "created_at" asc
     limit 1;`,
    [DEFAULT_SALES_CHANNEL_NAME]
  )

  if (rows[0]?.id) return rows[0].id

  const id = prefixedNanoId("sc")
  await pgQuery(
    `insert into "sales_channel" ("id","name","description","is_disabled","metadata","created_at","updated_at","deleted_at")
     values ($1,$2,null,false,null,now(),now(),null);`,
    [id, DEFAULT_SALES_CHANNEL_NAME]
  )
  return id
}

async function ensureStoreDefaults(storeId: string, salesChannelId: string) {
  await pgQuery(
    `update "store"
       set "default_sales_channel_id" = $2,
           "updated_at" = now()
     where "id" = $1;`,
    [storeId, salesChannelId]
  )

  await pgTransaction(async (client) => {
    // Keep a single default currency per store.
    await client.query(
      `update "store_currency"
         set "is_default" = false,
             "updated_at" = now()
       where "deleted_at" is null and "store_id" = $1;`,
      [storeId]
    )

    const existing = await client.query(
      `select "id"
       from "store_currency"
       where "deleted_at" is null and "store_id" = $1 and "currency_code" = $2
       order by "created_at" asc
       limit 1;`,
      [storeId, STORE_CURRENCY_CODE]
    )

    const existingId =
      typeof existing.rows?.[0]?.id === "string" ? existing.rows[0].id : ""

    if (existingId) {
      await client.query(
        `update "store_currency"
           set "is_default" = true,
               "updated_at" = now()
         where "id" = $1;`,
        [existingId]
      )
      return
    }

    await client.query(
      `insert into "store_currency" ("id","currency_code","is_default","store_id","created_at","updated_at","deleted_at")
       values ($1,$2,true,$3,now(),now(),null);`,
      [prefixedNanoId("stocur"), STORE_CURRENCY_CODE, storeId]
    )
  })
}

async function getOrCreateDefaultRegion() {
  const rows = await pgQuery<{ id: string; name: string; currency_code: string }>(
    `select "id","name","currency_code"
     from "region"
     where "deleted_at" is null and "currency_code" = $1
     order by "created_at" asc
     limit 50;`,
    [STORE_CURRENCY_CODE]
  )

  const existing =
    rows.find((r) => r.name === STORE_REGION_NAME) ?? rows[0] ?? null

  if (existing?.id) return existing

  const id = prefixedNanoId("reg")
  await pgQuery(
    `insert into "region" ("id","name","currency_code","metadata","automatic_taxes","created_at","updated_at","deleted_at")
     values ($1,$2,$3,null,true,now(),now(),null);`,
    [id, STORE_REGION_NAME, STORE_CURRENCY_CODE]
  )

  return { id, name: STORE_REGION_NAME, currency_code: STORE_CURRENCY_CODE }
}

async function ensureRegionCountryAndPayments(regionId: string) {
  // region_country table is expected to be pre-populated with all countries by the base schema.
  await pgQuery(
    `update "region_country"
       set "region_id" = $2,
           "updated_at" = now()
     where "deleted_at" is null and "iso_2" = $1;`,
    [STORE_REGION_COUNTRY_CODE, regionId]
  )

  await pgQuery(
    `insert into "region_payment_provider"
      ("region_id","payment_provider_id","id","created_at","updated_at","deleted_at")
     values
      ($1,$2,$3,now(),now(),null)
     on conflict ("region_id","payment_provider_id")
     do update set "deleted_at" = null, "updated_at" = now();`,
    [regionId, DEFAULT_PAYMENT_PROVIDER_ID, prefixedNanoId("regpp")]
  )
}

async function getOrCreateDefaultShippingProfileId() {
  const rows = await pgQuery<{ id: string }>(
    `select "id"
     from "shipping_profile"
     where "deleted_at" is null and "type" = 'default'
     order by "created_at" asc
     limit 1;`
  )
  if (rows[0]?.id) return rows[0].id

  const id = prefixedNanoId("sp")
  const inserted = await pgQuery<{ id: string }>(
    `insert into "shipping_profile" ("id","name","type","metadata","created_at","updated_at","deleted_at")
     values ($1,$2,'default',null,now(),now(),null)
     on conflict ("name") where "deleted_at" is null
     do update set "updated_at" = now()
     returning "id";`,
    [id, DEFAULT_SHIPPING_PROFILE_NAME]
  )
  if (inserted[0]?.id) return inserted[0].id

  const fallback = await pgQuery<{ id: string }>(
    `select "id"
     from "shipping_profile"
     where "deleted_at" is null and "name" = $1
     limit 1;`,
    [DEFAULT_SHIPPING_PROFILE_NAME]
  )
  return fallback[0]?.id ?? id
}

async function getOrCreatePublishableApiKeyId() {
  const preferredToken = await resolvePreferredPublishableToken()

  if (preferredToken) {
    const preferredRows = await pgQuery<{
      id: string
      title: string
      token: string
      redacted: string
    }>(
      `select "id","title","token","redacted"
       from "api_key"
       where "token" = $1
       order by "created_at" asc
       limit 1;`,
      [preferredToken]
    )

    const preferred = preferredRows[0]
    if (preferred?.id) {
      const redacted = preferred.redacted || redactToken(preferredToken)

      await pgQuery(
        `update "api_key"
           set "title" = $2,
               "type" = 'publishable',
               "redacted" = $3,
               "updated_at" = now(),
               "deleted_at" = null,
               "revoked_at" = null
         where "id" = $1;`,
        [preferred.id, DEFAULT_PUBLISHABLE_KEY_TITLE, redacted]
      )

      return {
        id: preferred.id,
        title: DEFAULT_PUBLISHABLE_KEY_TITLE,
        token: preferredToken,
        redacted,
      }
    }

    const id = prefixedNanoId("apk")
    const redacted = redactToken(preferredToken)

    await pgQuery(
      `insert into "api_key"
        ("id","token","salt","redacted","title","type","created_by","created_at","updated_at","deleted_at")
       values
        ($1,$2,'',$3,$4,'publishable','',now(),now(),null);`,
      [id, preferredToken, redacted, DEFAULT_PUBLISHABLE_KEY_TITLE]
    )

    return {
      id,
      title: DEFAULT_PUBLISHABLE_KEY_TITLE,
      token: preferredToken,
      redacted,
    }
  }

  const rows = await pgQuery<{
    id: string
    title: string
    token: string
    redacted: string
  }>(
    `select "id","title","token","redacted"
     from "api_key"
     where "deleted_at" is null
       and "revoked_at" is null
       and "type" = 'publishable'
     order by "created_at" asc
     limit 10;`
  )

  const existing =
    rows.find((k) => k.title === DEFAULT_PUBLISHABLE_KEY_TITLE) ?? rows[0] ?? null

  if (existing?.id) return existing

  const id = prefixedNanoId("apk")
  const token = makePublishableToken()
  const redacted = redactToken(token)

  await pgQuery(
    `insert into "api_key"
      ("id","token","salt","redacted","title","type","created_by","created_at","updated_at","deleted_at")
     values
      ($1,$2,'',$3,$4,'publishable','',now(),now(),null);`,
    [id, token, redacted, DEFAULT_PUBLISHABLE_KEY_TITLE]
  )

  return { id, title: DEFAULT_PUBLISHABLE_KEY_TITLE, token, redacted }
}

async function ensurePublishableKeyLinkedToSalesChannel(keyId: string, salesChannelId: string) {
  await pgQuery(
    `insert into "publishable_api_key_sales_channel"
      ("publishable_key_id","sales_channel_id","id","created_at","updated_at","deleted_at")
     values
      ($1,$2,$3,now(),now(),null)
     on conflict ("publishable_key_id","sales_channel_id")
     do update set "deleted_at" = null, "updated_at" = now();`,
    [keyId, salesChannelId, prefixedNanoId("pksc")]
  )
}

async function ensureProductCategories() {
  const existing = await pgQuery<{ id: string; name: string; handle: string }>(
    `select "id","name","handle"
     from "product_category"
     where "deleted_at" is null
     order by "rank" asc, "created_at" asc;`
  )

  const idByName = new Map<string, string>()
  const existingHandles = new Set<string>()
  for (const row of existing) {
    if (typeof row?.name === "string" && row.name && typeof row?.id === "string") {
      idByName.set(row.name, row.id)
    }
    if (typeof row?.handle === "string" && row.handle) {
      existingHandles.add(row.handle)
    }
  }

  const missing = ALL_CATEGORIES.filter((name) => !idByName.has(name))
  for (const name of missing) {
    const id = prefixedNanoId("pcat")
    const handle = name.trim().toLowerCase()
    if (!handle || existingHandles.has(handle)) continue

    const rank = Math.max(0, ALL_CATEGORIES.indexOf(name))

    await pgQuery(
      `insert into "product_category"
        ("id","name","description","handle","mpath","is_active","rank","created_at","updated_at","deleted_at")
       values
        ($1,$2,'',$3,$4,true,$5,now(),now(),null);`,
      [id, name, handle, id, rank]
    )

    idByName.set(name, id)
    existingHandles.add(handle)
  }

  // Refresh map (ensures ids for categories created by other means).
  const all = await pgQuery<{ id: string; name: string }>(
    `select "id","name"
     from "product_category"
     where "deleted_at" is null
     order by "rank" asc, "created_at" asc;`
  )

  const out = new Map<string, string>()
  for (const row of all) {
    if (typeof row?.name === "string" && row.name && typeof row?.id === "string") {
      out.set(row.name, row.id)
    }
  }
  return out
}

export async function runSeed() {
  logger.info("Applying database migrations...")
  await runAppMigrations()

  logger.info("Seeding store data...")

  const storeId = await getOrCreateStoreId()
  const defaultSalesChannelId = await getOrCreateDefaultSalesChannelId()
  await ensureStoreDefaults(storeId, defaultSalesChannelId)

  logger.info(
    `Ensuring default region exists (${STORE_REGION_NAME} / ${STORE_CURRENCY_CODE.toUpperCase()})...`
  )
  const ensuredRegion = await getOrCreateDefaultRegion()
  await ensureRegionCountryAndPayments(ensuredRegion.id)

  logger.info("Ensuring publishable API key exists...")
  const publishableKey = await getOrCreatePublishableApiKeyId()
  await ensurePublishableKeyLinkedToSalesChannel(publishableKey.id, defaultSalesChannelId)

  if (publishableKey?.token) {
    logger.info(`Publishable API Key: ${publishableKey.token}`)
  } else if (publishableKey?.redacted) {
    logger.info(`Publishable API Key (redacted): ${publishableKey.redacted}`)
  }

  logger.info("Creating product categories...")
  const categoryIdByName = await ensureProductCategories()

  logger.info("Creating brands...")
  const brandsToCreate = ["Brembo", "DID", "K&N", "Motul", "Yuasa", "Athena", "SKF", "Philips"]

  const brandService = getBrandPgService()
  const existingBrands = await brandService.listBrands({}, { take: 500 })
  const existingBrandBySlug = new Map(existingBrands.map((b: any) => [b.slug, b]))

  for (const name of brandsToCreate) {
    const slug = slugify(name)
    if (existingBrandBySlug.has(slug)) continue
    const created = await brandService.createBrands({ name, slug })
    existingBrandBySlug.set(created.slug, created)
  }

  // Kept for parity with the previous seed.
  await getOrCreateDefaultShippingProfileId()

  const products: SeedProduct[] = [
    {
      title: "Pastillas de freno ceramicas",
      brand: "Brembo",
      category: "Frenos",
      priceArs: 28900,
      sku: "FRE-BRE-PAD-001",
    },
    {
      title: "Cadena 428H reforzada",
      brand: "DID",
      category: "Transmisión",
      priceArs: 45900,
      sku: "TRA-DID-CHAIN-428H",
    },
    {
      title: "Filtro de aceite premium",
      brand: "K&N",
      category: "Filtros",
      priceArs: 34900,
      sku: "FIL-KN-OIL-001",
    },
    {
      title: "Aceite 10W-40 sintetico",
      brand: "Motul",
      category: "Lubricantes",
      priceArs: 22500,
      sku: "LUB-MOT-10W40",
    },
    {
      title: "Bateria 12V 7Ah",
      brand: "Yuasa",
      category: "Baterías",
      priceArs: 68900,
      sku: "BAT-YUA-12V7",
    },
    {
      title: "Kit juntas motor completo",
      brand: "Athena",
      category: "Juntas",
      priceArs: 79900,
      sku: "MOT-ATH-GASKET-SET",
    },
    {
      title: "Juego rulemanes rueda delantera",
      brand: "SKF",
      category: "Rodamientos",
      priceArs: 31900,
      sku: "ROD-SKF-WHEEL-FR",
    },
    {
      title: "Lampara LED H4 alta potencia",
      brand: "Philips",
      category: "Iluminación",
      priceArs: 55900,
      sku: "ILU-PHI-H4-LED",
    },
  ]

  logger.info("Creating products...")
  for (const p of products) {
    const handle = slugify(p.title)

    const existing = await pgQuery<{ id: string }>(
      `select "id"
       from "product"
       where "deleted_at" is null and "handle" = $1
       limit 1;`,
      [handle]
    )

    if (existing[0]?.id) {
      await setProductStockLevel({
        productId: existing[0].id,
        availableQty: 20,
      })
      continue
    }

    const categoryId = categoryIdByName.get(p.category)
    if (!categoryId) {
      throw new Error(`Missing category id for ${p.category}`)
    }

    const brandSlug = slugify(p.brand)
    const brand = existingBrandBySlug.get(brandSlug)
    if (!brand) {
      throw new Error(`Missing brand for ${p.brand}`)
    }

    const created = await createSimpleProduct({
      title: p.title,
      handle,
      description: null,
      status: "published",
      thumbnail: null,
      images: [],
      metadata: {},
      categoryId,
      brandId: brand.id,
      variantSku: p.sku ?? null,
      currencyCode: STORE_CURRENCY_CODE,
      priceAmount: p.priceArs,
    })

    await setProductStockLevel({
      productId: created.productId,
      availableQty: 20,
    })
  }

  logger.info("Ensuring demo coupons...")
  const customerAuthService = getCustomerAuthPgService() as any

  const demoCoupons = [
    {
      code: "BIENVENIDA10",
      title: "Bienvenida",
      description: "10% OFF para la primera compra.",
      percentage_tenths: 100,
      is_active: true,
    },
    {
      code: "MOTO15",
      title: "Motos 15",
      description: "15% OFF en repuestos seleccionados.",
      percentage_tenths: 150,
      is_active: true,
    },
  ]

  for (const coupon of demoCoupons) {
    const existing = await customerAuthService.listCoupons(
      { code: coupon.code },
      { take: 1 }
    )
    if (existing[0]) continue

    await customerAuthService.createCoupons({
      ...coupon,
      used_count: 0,
      metadata: {},
    })
  }

  logger.info("Seed completed.")
  logger.info("Coupons ready.")
  logger.info(`Region: ${ensuredRegion.name} (${ensuredRegion.currency_code})`)
}

export default async function seedStorefront(_args?: any) {
  await runSeed()
}

if (require.main === module) {
  void runSeed().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
