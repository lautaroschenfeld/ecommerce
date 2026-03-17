import "../lib/env"

import { pgQuery } from "../lib/pg"

type SectionKey = "general" | "specs" | "accessories" | "functions" | "others"
type ValueType = "text" | "long_text" | "number" | "boolean"
type Value = string | number | boolean | null

type CharacteristicItem = {
  id: string
  key: string
  label: string
  section: SectionKey
  type: ValueType
  value: Value
  unit?: string
  isExtra?: boolean
}

type FieldDef = {
  key: string
  label: string
  section: SectionKey
  type: ValueType
  defaultUnit?: string
}

type ProductRow = {
  id: string
  title: string
  metadata: Record<string, unknown> | null
  weight: number | string | null
  category_name: string | null
  brand_name: string | null
}

const BASE_FIELDS: FieldDef[] = [
  { key: "brand", label: "Marca", section: "general", type: "text" },
  { key: "model", label: "Modelo", section: "general", type: "text" },
  { key: "line", label: "Linea", section: "general", type: "text" },
  { key: "color", label: "Color", section: "general", type: "text" },
  { key: "material", label: "Material", section: "specs", type: "text" },
  { key: "weight", label: "Peso", section: "specs", type: "number", defaultUnit: "g" },
  { key: "package_contents", label: "Contenido del paquete", section: "accessories", type: "long_text" },
  { key: "notes", label: "Observaciones", section: "others", type: "long_text" },
]

const TEMPLATE_BY_CATEGORY: Record<string, FieldDef[]> = {
  Motor: [
    { key: "engine_type", label: "Tipo de motor", section: "specs", type: "text" },
    { key: "displacement", label: "Cilindrada", section: "specs", type: "number", defaultUnit: "cc" },
    { key: "power", label: "Potencia", section: "specs", type: "number", defaultUnit: "W" },
    { key: "torque", label: "Torque", section: "specs", type: "number", defaultUnit: "Nm" },
    { key: "includes_manual", label: "Incluye manual", section: "accessories", type: "boolean" },
    { key: "low_consumption", label: "Bajo consumo", section: "functions", type: "boolean" },
  ],
  "Transmisión": [
    { key: "transmission_type", label: "Tipo de transmision", section: "general", type: "text" },
    { key: "gear_count", label: "Cantidad de marchas", section: "specs", type: "number" },
    { key: "ratio", label: "Relacion", section: "specs", type: "text" },
    { key: "includes_kit", label: "Incluye kit", section: "accessories", type: "boolean" },
    { key: "reinforced", label: "Reforzada", section: "functions", type: "boolean" },
  ],
  Lubricantes: [
    { key: "oil_type", label: "Tipo de lubricante", section: "general", type: "text" },
    { key: "viscosity", label: "Viscosidad", section: "general", type: "text" },
    { key: "base_type", label: "Base", section: "specs", type: "text" },
    { key: "volume", label: "Contenido", section: "specs", type: "number", defaultUnit: "ml" },
    { key: "api_spec", label: "Norma API", section: "specs", type: "text" },
    { key: "synthetic", label: "Es sintetico", section: "functions", type: "boolean" },
  ],
  Frenos: [
    { key: "position", label: "Posicion", section: "general", type: "text" },
    { key: "diameter", label: "Diametro", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "thickness", label: "Espesor", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "includes_pads", label: "Incluye pastillas", section: "accessories", type: "boolean" },
    { key: "abs_compatible", label: "Compatible con ABS", section: "functions", type: "boolean" },
  ],
  Electricidad: [
    { key: "power_type", label: "Tipo de alimentacion", section: "general", type: "text" },
    { key: "voltage", label: "Voltaje", section: "specs", type: "number", defaultUnit: "V" },
    { key: "wattage", label: "Potencia", section: "specs", type: "number", defaultUnit: "W" },
    { key: "current", label: "Corriente", section: "specs", type: "number", defaultUnit: "A" },
    { key: "includes_wiring", label: "Incluye cableado", section: "accessories", type: "boolean" },
    { key: "wifi", label: "Con Wi-Fi", section: "functions", type: "boolean" },
  ],
  Ruedas: [
    { key: "wheel_type", label: "Tipo de rueda", section: "general", type: "text" },
    { key: "position", label: "Posicion", section: "general", type: "text" },
    { key: "rim_diameter", label: "Diametro de llanta", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "width", label: "Ancho", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "includes_valve", label: "Incluye valvula", section: "accessories", type: "boolean" },
    { key: "tubeless", label: "Tubeless", section: "functions", type: "boolean" },
  ],
  Accesorios: [
    { key: "compatibility", label: "Compatibilidad", section: "general", type: "text" },
    { key: "length", label: "Largo", section: "specs", type: "number", defaultUnit: "cm" },
    { key: "width", label: "Ancho", section: "specs", type: "number", defaultUnit: "cm" },
    { key: "height", label: "Alto", section: "specs", type: "number", defaultUnit: "cm" },
    { key: "piece_count", label: "Cantidad de piezas", section: "accessories", type: "number" },
    { key: "includes_manual", label: "Incluye manual", section: "accessories", type: "boolean" },
    { key: "waterproof", label: "Impermeable", section: "functions", type: "boolean" },
  ],
  "Baterías": [
    { key: "battery_type", label: "Tipo de bateria", section: "general", type: "text" },
    { key: "technology", label: "Tecnologia", section: "general", type: "text" },
    { key: "voltage", label: "Voltaje", section: "specs", type: "number", defaultUnit: "V" },
    { key: "capacity", label: "Capacidad", section: "specs", type: "number", defaultUnit: "mAh" },
    { key: "starting_current", label: "Corriente de arranque", section: "specs", type: "number", defaultUnit: "A" },
    { key: "maintenance_free", label: "Libre de mantenimiento", section: "functions", type: "boolean" },
  ],
  Filtros: [
    { key: "filter_type", label: "Tipo de filtro", section: "general", type: "text" },
    { key: "compatibility", label: "Compatibilidad", section: "general", type: "text" },
    { key: "height", label: "Alto", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "outer_diameter", label: "Diametro exterior", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "includes_o_ring", label: "Incluye o-ring", section: "accessories", type: "boolean" },
    { key: "washable", label: "Lavable", section: "functions", type: "boolean" },
  ],
  "Iluminación": [
    { key: "light_type", label: "Tipo de iluminacion", section: "general", type: "text" },
    { key: "technology", label: "Tecnologia", section: "general", type: "text" },
    { key: "voltage", label: "Voltaje", section: "specs", type: "number", defaultUnit: "V" },
    { key: "power", label: "Potencia", section: "specs", type: "number", defaultUnit: "W" },
    { key: "includes_harness", label: "Incluye arnes", section: "accessories", type: "boolean" },
    { key: "waterproof", label: "Impermeable", section: "functions", type: "boolean" },
  ],
  Juntas: [
    { key: "gasket_type", label: "Tipo de junta", section: "general", type: "text" },
    { key: "compatibility", label: "Compatibilidad", section: "general", type: "text" },
    { key: "thickness", label: "Espesor", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "includes_set", label: "Incluye set", section: "accessories", type: "boolean" },
    { key: "high_temperature", label: "Alta temperatura", section: "functions", type: "boolean" },
  ],
  Carburación: [
    { key: "carburetor_type", label: "Tipo de carburador", section: "general", type: "text" },
    { key: "venturi_diameter", label: "Diametro de venturi", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "includes_jets", label: "Incluye chicleres", section: "accessories", type: "boolean" },
    { key: "electric_choke", label: "Cebador electrico", section: "functions", type: "boolean" },
  ],
  Embrague: [
    { key: "clutch_type", label: "Tipo de embrague", section: "general", type: "text" },
    { key: "disc_diameter", label: "Diametro del disco", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "disc_count", label: "Cantidad de discos", section: "specs", type: "number" },
    { key: "includes_springs", label: "Incluye resortes", section: "accessories", type: "boolean" },
    { key: "anti_slip", label: "Anti deslizamiento", section: "functions", type: "boolean" },
  ],
  "Suspensión": [
    { key: "suspension_type", label: "Tipo de suspension", section: "general", type: "text" },
    { key: "position", label: "Posicion", section: "general", type: "text" },
    { key: "length", label: "Largo", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "travel", label: "Recorrido", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "includes_bushings", label: "Incluye bujes", section: "accessories", type: "boolean" },
    { key: "adjustable_preload", label: "Precarga regulable", section: "functions", type: "boolean" },
  ],
  Rodamientos: [
    { key: "bearing_type", label: "Tipo de rodamiento", section: "general", type: "text" },
    { key: "application", label: "Aplicacion", section: "general", type: "text" },
    { key: "inner_diameter", label: "Diametro interno", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "outer_diameter", label: "Diametro externo", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "thickness", label: "Espesor", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "sealed", label: "Sellado", section: "functions", type: "boolean" },
  ],
  "Tornillería": [
    { key: "fastener_type", label: "Tipo de tornilleria", section: "general", type: "text" },
    { key: "thread_type", label: "Tipo de rosca", section: "general", type: "text" },
    { key: "diameter", label: "Diametro", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "length", label: "Largo", section: "specs", type: "number", defaultUnit: "mm" },
    { key: "anti_corrosion", label: "Anticorrosivo", section: "functions", type: "boolean" },
  ],
  Indumentaria: [
    { key: "gender", label: "Genero", section: "general", type: "text" },
    { key: "season", label: "Temporada", section: "general", type: "text" },
    { key: "fabric", label: "Tela", section: "specs", type: "text" },
    { key: "closure_type", label: "Tipo de cierre", section: "specs", type: "text" },
    { key: "includes_accessories", label: "Incluye accesorios", section: "accessories", type: "boolean" },
    { key: "breathable", label: "Respirable", section: "functions", type: "boolean" },
  ],
}

const PREFILL_KEYS: Record<string, string[]> = {
  brand: ["brand"],
  model: ["model", "modelo"],
  line: ["line", "linea"],
  color: ["color"],
  material: ["material"],
  gender: ["gender", "genero"],
  compatibility: ["compatibility", "compatible_with"],
  season: ["season", "temporada"],
  viscosity: ["viscosity", "viscosidad"],
  oil_type: ["oil_type", "tipo_lubricante"],
  filter_type: ["filter_type", "tipo_filtro"],
  battery_type: ["battery_type", "tipo_bateria"],
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>()
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--")) flags.add(raw)
  }
  return {
    force: flags.has("--force"),
    dryRun: flags.has("--dry-run"),
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value > 0
  const normalized = text(value).toLowerCase()
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "si") return true
  if (normalized === "false" || normalized === "0" || normalized === "no") return false
  return undefined
}

function mergeFields(category: string) {
  const out: FieldDef[] = []
  const seen = new Set<string>()
  for (const field of [...BASE_FIELDS, ...(TEMPLATE_BY_CATEGORY[category] ?? [])]) {
    if (!field.key || seen.has(field.key)) continue
    seen.add(field.key)
    out.push(field)
  }
  return out
}

function pickPrefillValue(field: FieldDef, input: {
  metadata: Record<string, unknown>
  brand: string
  model: string
  weight?: number
}) {
  if (field.key === "brand" && input.brand) return input.brand
  if (field.key === "model" && input.model) return input.model

  if (field.key === "weight" && input.weight !== undefined) return input.weight

  const candidates = PREFILL_KEYS[field.key] ?? [field.key]
  for (const key of candidates) {
    const raw = input.metadata[key]
    if (field.type === "boolean") {
      const parsed = toBoolean(raw)
      if (parsed !== undefined) return parsed
      continue
    }
    if (field.type === "number") {
      const parsed = toNumber(raw)
      if (parsed !== undefined) return parsed
      continue
    }
    const str = text(raw)
    if (str) return str
  }
  return undefined
}

function buildCharacteristics(row: ProductRow): { version: 1; items: CharacteristicItem[] } {
  const metadata = asRecord(row.metadata) ?? {}
  const category = text(row.category_name)
  const fields = mergeFields(category)
  const brand = text(row.brand_name)
  const model = text(row.title)
  const weight = toNumber(row.weight)

  const items = fields.map((field) => {
    const prefill = pickPrefillValue(field, { metadata, brand, model, weight })
    const value: Value =
      prefill !== undefined
        ? (prefill as Value)
        : field.type === "boolean"
          ? false
          : field.type === "number"
            ? null
            : ""

    return {
      id: field.key,
      key: field.key,
      label: field.label,
      section: field.section,
      type: field.type,
      value,
      unit: field.defaultUnit,
      isExtra: false,
    }
  })

  return {
    version: 1,
    items,
  }
}

async function listProducts() {
  return await pgQuery<ProductRow>(
    `select
      p.id,
      p.title,
      p.metadata,
      p.weight,
      (
        select b.name
        from product_brand pb
        join brand b on b.id = pb.brand_id
        where pb.product_id = p.id
          and b.deleted_at is null
        order by b.name asc
        limit 1
      ) as brand_name,
      (
        select pc.name
        from product_category_product pcp
        join product_category pc on pc.id = pcp.product_category_id
        where pcp.product_id = p.id
          and pc.deleted_at is null
        order by pc.name asc
        limit 1
      ) as category_name
     from product p
     where p.deleted_at is null
     order by p.created_at desc;`
  )
}

async function updateProductMetadata(
  productId: string,
  metadata: Record<string, unknown>
) {
  await pgQuery(
    `update product
       set metadata = $2::jsonb,
           updated_at = now()
     where id = $1
       and deleted_at is null;`,
    [productId, JSON.stringify(metadata)]
  )
}

async function run() {
  const args = parseArgs(process.argv)
  const products = await listProducts()

  let updated = 0
  let skippedExisting = 0
  let errors = 0

  for (const product of products) {
    try {
      const metadata = asRecord(product.metadata) ?? {}
      const currentCharacteristics = asRecord(metadata.characteristics)
      const hasItems =
        currentCharacteristics && Array.isArray(currentCharacteristics.items)
          ? currentCharacteristics.items.length > 0
          : false

      if (!args.force && hasItems) {
        skippedExisting += 1
        continue
      }

      const nextMetadata: Record<string, unknown> = {
        ...metadata,
        characteristics: buildCharacteristics(product),
      }

      if (args.dryRun) {
        updated += 1
        continue
      }

      await updateProductMetadata(product.id, nextMetadata)
      updated += 1
    } catch (error) {
      errors += 1
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[backfill-characteristics] ${product.id}: ${message}`)
    }
  }

  console.log(
    JSON.stringify(
      {
        total: products.length,
        updated,
        skippedExisting,
        errors,
        dryRun: args.dryRun,
        force: args.force,
      },
      null,
      2
    )
  )
}

void run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[backfill-characteristics] fatal: ${message}`)
  process.exit(1)
})
