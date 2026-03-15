import type { Category } from "@/lib/catalog";
import { nanoid } from "nanoid";

export type ProductCharacteristicSectionKey =
  | "general"
  | "compatibility"
  | "specs"
  | "accessories"
  | "functions"
  | "others";

export type ProductCharacteristicValueType =
  | "text"
  | "long_text"
  | "number"
  | "boolean";

export type ProductCharacteristicValue = string | number | boolean | null;

export type ProductCharacteristicItem = {
  id: string;
  key: string;
  label: string;
  section: ProductCharacteristicSectionKey;
  type: ProductCharacteristicValueType;
  value: ProductCharacteristicValue;
  unit?: string;
  isExtra?: boolean;
};

type ProductCharacteristicFieldDefinition = {
  key: string;
  label: string;
  section: ProductCharacteristicSectionKey;
  type: ProductCharacteristicValueType;
  defaultUnit?: string;
};

type ProductCharacteristicTemplate = {
  fields: ProductCharacteristicFieldDefinition[];
};

type ProductCharacteristicHints = {
  brand?: string;
  model?: string;
  color?: string;
};

type ProductCharacteristicsMetadataPayload = {
  version: 1;
  items: ProductCharacteristicItem[];
};

export type SeoAdditionalProperty = {
  "@type": "PropertyValue";
  name: string;
  value: string;
};

export const MAX_EXTRA_CHARACTERISTICS = 15;
export const METRIC_UNIT_OPTIONS = [
  "mm",
  "cm",
  "m",
  "g",
  "kg",
  "ml",
  "l",
  "mAh",
  "V",
  "W",
  "A",
  "Nm",
  "cc",
];

export const PRODUCT_CHARACTERISTIC_SECTIONS: Array<{
  key: ProductCharacteristicSectionKey;
  label: string;
}> = [
  { key: "general", label: "Caracteristicas generales" },
  { key: "compatibility", label: "Compatibilidad" },
  { key: "specs", label: "Especificaciones" },
  { key: "accessories", label: "Accesorios" },
  { key: "functions", label: "Funciones" },
  { key: "others", label: "Otros" },
];

const BASE_TEMPLATE_FIELDS: ProductCharacteristicFieldDefinition[] = [
  { key: "brand", label: "Marca", section: "general", type: "text" },
  { key: "model", label: "Modelo", section: "general", type: "text" },
  { key: "line", label: "Linea", section: "general", type: "text" },
  { key: "color", label: "Color", section: "general", type: "text" },
  { key: "material", label: "Material", section: "specs", type: "text" },
  { key: "weight", label: "Peso", section: "specs", type: "number", defaultUnit: "g" },
  {
    key: "package_contents",
    label: "Contenido del paquete",
    section: "accessories",
    type: "long_text",
  },
  { key: "notes", label: "Observaciones", section: "others", type: "long_text" },
];

const COMPATIBILITY_TEMPLATE_FIELDS: ProductCharacteristicFieldDefinition[] = [
  {
    key: "compatibility",
    label: "Modelos compatibles",
    section: "compatibility",
    type: "long_text",
  },
  {
    key: "compatible_years",
    label: "Anos compatibles",
    section: "compatibility",
    type: "text",
  },
  {
    key: "oem_code",
    label: "Codigo OEM",
    section: "compatibility",
    type: "text",
  },
  {
    key: "universal_fit",
    label: "Repuesto universal",
    section: "compatibility",
    type: "boolean",
  },
];

const TEMPLATE_BY_CATEGORY: Partial<Record<Category, ProductCharacteristicTemplate>> = {
  Motor: {
    fields: [
      { key: "origin", label: "Origen", section: "general", type: "text" },
      { key: "engine_type", label: "Tipo de motor", section: "specs", type: "text" },
      {
        key: "displacement",
        label: "Cilindrada",
        section: "specs",
        type: "number",
        defaultUnit: "cc",
      },
      { key: "power", label: "Potencia", section: "specs", type: "number", defaultUnit: "W" },
      { key: "torque", label: "Torque", section: "specs", type: "number", defaultUnit: "Nm" },
      {
        key: "includes_manual",
        label: "Incluye manual",
        section: "accessories",
        type: "boolean",
      },
      {
        key: "includes_install_kit",
        label: "Incluye kit de instalacion",
        section: "accessories",
        type: "boolean",
      },
      {
        key: "forced_cooling",
        label: "Refrigeracion forzada",
        section: "functions",
        type: "boolean",
      },
      { key: "low_consumption", label: "Bajo consumo", section: "functions", type: "boolean" },
    ],
  },
  Frenos: {
    fields: [
      { key: "position", label: "Posicion", section: "general", type: "text" },
      { key: "diameter", label: "Diametro", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "thickness", label: "Espesor", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "brake_material", label: "Material de frenado", section: "specs", type: "text" },
      {
        key: "includes_pads",
        label: "Incluye pastillas",
        section: "accessories",
        type: "boolean",
      },
      {
        key: "includes_hardware",
        label: "Incluye tornilleria",
        section: "accessories",
        type: "boolean",
      },
      {
        key: "abs_compatible",
        label: "Compatible con ABS",
        section: "functions",
        type: "boolean",
      },
      { key: "ventilated", label: "Ventilado", section: "functions", type: "boolean" },
      { key: "high_performance", label: "Alto rendimiento", section: "functions", type: "boolean" },
    ],
  },
  "Transmisión": {
    fields: [
      { key: "transmission_type", label: "Tipo de transmision", section: "general", type: "text" },
      { key: "compatibility", label: "Compatibilidad", section: "general", type: "text" },
      { key: "gear_count", label: "Cantidad de marchas", section: "specs", type: "number" },
      { key: "ratio", label: "Relacion", section: "specs", type: "text" },
      { key: "material", label: "Material", section: "specs", type: "text" },
      { key: "includes_kit", label: "Incluye kit", section: "accessories", type: "boolean" },
      { key: "includes_manual", label: "Incluye manual", section: "accessories", type: "boolean" },
      { key: "high_performance", label: "Alto rendimiento", section: "functions", type: "boolean" },
      { key: "reinforced", label: "Reforzada", section: "functions", type: "boolean" },
    ],
  },
  Lubricantes: {
    fields: [
      { key: "oil_type", label: "Tipo de lubricante", section: "general", type: "text" },
      { key: "viscosity", label: "Viscosidad", section: "general", type: "text" },
      { key: "base_type", label: "Base", section: "specs", type: "text" },
      { key: "volume", label: "Contenido", section: "specs", type: "number", defaultUnit: "ml" },
      { key: "api_spec", label: "Norma API", section: "specs", type: "text" },
      { key: "jaso_spec", label: "Norma JASO", section: "specs", type: "text" },
      { key: "pour_spout", label: "Incluye pico vertedor", section: "accessories", type: "boolean" },
      { key: "sealed_package", label: "Envase sellado", section: "functions", type: "boolean" },
      { key: "synthetic", label: "Es sintetico", section: "functions", type: "boolean" },
    ],
  },
  Ruedas: {
    fields: [
      { key: "wheel_type", label: "Tipo de rueda", section: "general", type: "text" },
      { key: "position", label: "Posicion", section: "general", type: "text" },
      { key: "rim_diameter", label: "Diametro de llanta", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "width", label: "Ancho", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "load_index", label: "Indice de carga", section: "specs", type: "text" },
      { key: "includes_valve", label: "Incluye valvula", section: "accessories", type: "boolean" },
      { key: "includes_balancing", label: "Incluye balanceo", section: "accessories", type: "boolean" },
      { key: "tubeless", label: "Tubeless", section: "functions", type: "boolean" },
      { key: "reinforced", label: "Reforzada", section: "functions", type: "boolean" },
    ],
  },
  Electricidad: {
    fields: [
      { key: "power_type", label: "Tipo de alimentacion", section: "general", type: "text" },
      { key: "voltage", label: "Voltaje", section: "specs", type: "number", defaultUnit: "V" },
      { key: "wattage", label: "Potencia", section: "specs", type: "number", defaultUnit: "W" },
      {
        key: "capacity",
        label: "Capacidad",
        section: "specs",
        type: "number",
        defaultUnit: "mAh",
      },
      { key: "current", label: "Corriente", section: "specs", type: "number", defaultUnit: "A" },
      {
        key: "includes_wiring",
        label: "Incluye cableado",
        section: "accessories",
        type: "boolean",
      },
      {
        key: "includes_remote",
        label: "Incluye control remoto",
        section: "accessories",
        type: "boolean",
      },
      { key: "wifi", label: "Con Wi-Fi", section: "functions", type: "boolean" },
      { key: "bluetooth", label: "Con Bluetooth", section: "functions", type: "boolean" },
      { key: "gps", label: "Con GPS", section: "functions", type: "boolean" },
    ],
  },
  "Baterías": {
    fields: [
      { key: "battery_type", label: "Tipo de bateria", section: "general", type: "text" },
      { key: "technology", label: "Tecnologia", section: "general", type: "text" },
      { key: "voltage", label: "Voltaje", section: "specs", type: "number", defaultUnit: "V" },
      { key: "capacity", label: "Capacidad", section: "specs", type: "number", defaultUnit: "mAh" },
      { key: "starting_current", label: "Corriente de arranque", section: "specs", type: "number", defaultUnit: "A" },
      { key: "includes_terminals", label: "Incluye bornes", section: "accessories", type: "boolean" },
      { key: "includes_charger", label: "Incluye cargador", section: "accessories", type: "boolean" },
      { key: "maintenance_free", label: "Libre de mantenimiento", section: "functions", type: "boolean" },
      { key: "with_indicator", label: "Con indicador de carga", section: "functions", type: "boolean" },
    ],
  },
  Filtros: {
    fields: [
      { key: "filter_type", label: "Tipo de filtro", section: "general", type: "text" },
      { key: "compatibility", label: "Compatibilidad", section: "general", type: "text" },
      { key: "height", label: "Alto", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "outer_diameter", label: "Diametro exterior", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "filter_material", label: "Material filtrante", section: "specs", type: "text" },
      { key: "includes_o_ring", label: "Incluye o-ring", section: "accessories", type: "boolean" },
      { key: "includes_gasket", label: "Incluye junta", section: "accessories", type: "boolean" },
      { key: "washable", label: "Lavable", section: "functions", type: "boolean" },
      { key: "high_flow", label: "Alto flujo", section: "functions", type: "boolean" },
    ],
  },
  "Iluminación": {
    fields: [
      { key: "light_type", label: "Tipo de iluminacion", section: "general", type: "text" },
      { key: "technology", label: "Tecnologia", section: "general", type: "text" },
      { key: "voltage", label: "Voltaje", section: "specs", type: "number", defaultUnit: "V" },
      { key: "power", label: "Potencia", section: "specs", type: "number", defaultUnit: "W" },
      { key: "color_temperature", label: "Temperatura de color", section: "specs", type: "number" },
      { key: "includes_harness", label: "Incluye arnes", section: "accessories", type: "boolean" },
      { key: "includes_switch", label: "Incluye interruptor", section: "accessories", type: "boolean" },
      { key: "waterproof", label: "Impermeable", section: "functions", type: "boolean" },
      { key: "high_intensity", label: "Alta intensidad", section: "functions", type: "boolean" },
    ],
  },
  Juntas: {
    fields: [
      { key: "gasket_type", label: "Tipo de junta", section: "general", type: "text" },
      { key: "compatibility", label: "Compatibilidad", section: "general", type: "text" },
      { key: "material", label: "Material", section: "specs", type: "text" },
      { key: "thickness", label: "Espesor", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "length", label: "Largo", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "includes_set", label: "Incluye set", section: "accessories", type: "boolean" },
      { key: "includes_sealant", label: "Incluye sellador", section: "accessories", type: "boolean" },
      { key: "high_temperature", label: "Alta temperatura", section: "functions", type: "boolean" },
      { key: "oil_resistant", label: "Resistente al aceite", section: "functions", type: "boolean" },
    ],
  },
  Carburación: {
    fields: [
      { key: "carburetor_type", label: "Tipo de carburador", section: "general", type: "text" },
      { key: "compatibility", label: "Compatibilidad", section: "general", type: "text" },
      { key: "venturi_diameter", label: "Diametro de venturi", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "fuel_type", label: "Tipo de combustible", section: "specs", type: "text" },
      { key: "body_material", label: "Material del cuerpo", section: "specs", type: "text" },
      { key: "includes_jets", label: "Incluye chicleres", section: "accessories", type: "boolean" },
      { key: "includes_cable", label: "Incluye cable", section: "accessories", type: "boolean" },
      { key: "electric_choke", label: "Cebador electrico", section: "functions", type: "boolean" },
      { key: "performance_tuned", label: "Ajustado a performance", section: "functions", type: "boolean" },
    ],
  },
  Embrague: {
    fields: [
      { key: "clutch_type", label: "Tipo de embrague", section: "general", type: "text" },
      { key: "compatibility", label: "Compatibilidad", section: "general", type: "text" },
      { key: "disc_diameter", label: "Diametro del disco", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "disc_count", label: "Cantidad de discos", section: "specs", type: "number" },
      { key: "material", label: "Material", section: "specs", type: "text" },
      { key: "includes_springs", label: "Incluye resortes", section: "accessories", type: "boolean" },
      { key: "includes_plate", label: "Incluye placa", section: "accessories", type: "boolean" },
      { key: "anti_slip", label: "Anti deslizamiento", section: "functions", type: "boolean" },
      { key: "high_temperature", label: "Alta temperatura", section: "functions", type: "boolean" },
    ],
  },
  "Suspensión": {
    fields: [
      { key: "suspension_type", label: "Tipo de suspension", section: "general", type: "text" },
      { key: "position", label: "Posicion", section: "general", type: "text" },
      { key: "length", label: "Largo", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "travel", label: "Recorrido", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "spring_rate", label: "Rigidez de resorte", section: "specs", type: "text" },
      { key: "includes_bushings", label: "Incluye bujes", section: "accessories", type: "boolean" },
      { key: "includes_mounting", label: "Incluye anclajes", section: "accessories", type: "boolean" },
      { key: "adjustable_preload", label: "Precarga regulable", section: "functions", type: "boolean" },
      { key: "gas_charged", label: "Presurizado a gas", section: "functions", type: "boolean" },
    ],
  },
  Rodamientos: {
    fields: [
      { key: "bearing_type", label: "Tipo de rodamiento", section: "general", type: "text" },
      { key: "application", label: "Aplicacion", section: "general", type: "text" },
      { key: "inner_diameter", label: "Diametro interno", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "outer_diameter", label: "Diametro externo", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "thickness", label: "Espesor", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "includes_retainer", label: "Incluye reten", section: "accessories", type: "boolean" },
      { key: "includes_grease", label: "Incluye grasa", section: "accessories", type: "boolean" },
      { key: "sealed", label: "Sellado", section: "functions", type: "boolean" },
      { key: "high_speed", label: "Alta velocidad", section: "functions", type: "boolean" },
    ],
  },
  "Tornillería": {
    fields: [
      { key: "fastener_type", label: "Tipo de tornilleria", section: "general", type: "text" },
      { key: "thread_type", label: "Tipo de rosca", section: "general", type: "text" },
      { key: "diameter", label: "Diametro", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "length", label: "Largo", section: "specs", type: "number", defaultUnit: "mm" },
      { key: "material", label: "Material", section: "specs", type: "text" },
      { key: "includes_washers", label: "Incluye arandelas", section: "accessories", type: "boolean" },
      { key: "includes_nuts", label: "Incluye tuercas", section: "accessories", type: "boolean" },
      { key: "anti_corrosion", label: "Anticorrosivo", section: "functions", type: "boolean" },
      { key: "high_resistance", label: "Alta resistencia", section: "functions", type: "boolean" },
    ],
  },
  Accesorios: {
    fields: [
      { key: "compatibility", label: "Compatibilidad", section: "general", type: "text" },
      { key: "length", label: "Largo", section: "specs", type: "number", defaultUnit: "cm" },
      { key: "width", label: "Ancho", section: "specs", type: "number", defaultUnit: "cm" },
      { key: "height", label: "Alto", section: "specs", type: "number", defaultUnit: "cm" },
      { key: "piece_count", label: "Cantidad de piezas", section: "accessories", type: "number" },
      {
        key: "includes_manual",
        label: "Incluye manual",
        section: "accessories",
        type: "boolean",
      },
      { key: "waterproof", label: "Impermeable", section: "functions", type: "boolean" },
      { key: "foldable", label: "Plegable", section: "functions", type: "boolean" },
      { key: "outdoor_use", label: "Uso exterior", section: "functions", type: "boolean" },
    ],
  },
  Indumentaria: {
    fields: [
      { key: "gender", label: "Genero", section: "general", type: "text" },
      { key: "season", label: "Temporada", section: "general", type: "text" },
      { key: "fabric", label: "Tela", section: "specs", type: "text" },
      { key: "closure_type", label: "Tipo de cierre", section: "specs", type: "text" },
      { key: "wash_care", label: "Cuidado de lavado", section: "specs", type: "text" },
      { key: "breathable", label: "Respirable", section: "functions", type: "boolean" },
      { key: "thermal", label: "Termica", section: "functions", type: "boolean" },
      { key: "reflective", label: "Reflectiva", section: "functions", type: "boolean" },
    ],
  },
};

const HIDDEN_CHARACTERISTIC_KEYS = new Set(["includes_accessories"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "si") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return undefined;
}

function normalizeValueByType(
  type: ProductCharacteristicValueType,
  value: unknown
): ProductCharacteristicValue {
  if (type === "boolean") {
    const parsed = toBoolean(value);
    return parsed !== undefined ? parsed : false;
  }
  if (type === "number") {
    const parsed = toNumber(value);
    return parsed !== undefined ? parsed : null;
  }
  const str = text(value);
  return str;
}

function valueIsMeaningful(item: ProductCharacteristicItem) {
  if (item.type === "boolean") return true;
  if (item.type === "number") return typeof item.value === "number" && Number.isFinite(item.value);
  return typeof item.value === "string" && item.value.trim().length > 0;
}

function slugifyKey(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

function dedupeTemplateFields(fields: ProductCharacteristicFieldDefinition[]) {
  const seen = new Set<string>();
  const out: ProductCharacteristicFieldDefinition[] = [];
  for (const field of fields) {
    if (!field.key || seen.has(field.key)) continue;
    seen.add(field.key);
    out.push(field);
  }
  return out;
}

function normalizeSectionKey(value: unknown): ProductCharacteristicSectionKey {
  const normalized = text(value).toLowerCase();
  return normalized === "general" ||
    normalized === "compatibility" ||
    normalized === "specs" ||
    normalized === "accessories" ||
    normalized === "functions" ||
    normalized === "others"
    ? normalized
    : "others";
}

function templateForCategory(category: Category | string | undefined) {
  const byCategory = category ? TEMPLATE_BY_CATEGORY[category as Category] : undefined;
  const includeCompatibility = Boolean(category && category !== "Indumentaria");
  const fields = dedupeTemplateFields([
    ...BASE_TEMPLATE_FIELDS,
    ...(includeCompatibility ? COMPATIBILITY_TEMPLATE_FIELDS : []),
    ...(byCategory?.fields ?? []),
  ]);
  return { fields };
}

function isHiddenCharacteristicKey(key: string) {
  return HIDDEN_CHARACTERISTIC_KEYS.has(key.trim().toLowerCase());
}

function defaultValueForDefinition(
  field: ProductCharacteristicFieldDefinition,
  hints?: ProductCharacteristicHints
) {
  if (field.key === "brand" && hints?.brand?.trim()) return hints.brand.trim();
  if (field.key === "model" && hints?.model?.trim()) return hints.model.trim();
  if (field.key === "color" && hints?.color?.trim()) return hints.color.trim();
  if (field.type === "boolean") return false;
  if (field.type === "number") return null;
  return "";
}

function createItemFromDefinition(
  field: ProductCharacteristicFieldDefinition,
  hints?: ProductCharacteristicHints
): ProductCharacteristicItem {
  return {
    id: field.key,
    key: field.key,
    label: field.label,
    section: field.section,
    type: field.type,
    value: defaultValueForDefinition(field, hints),
    unit: field.defaultUnit,
    isExtra: false,
  };
}

function parseRawCharacteristics(
  metadata: Record<string, unknown> | undefined
): ProductCharacteristicItem[] {
  const source = asRecord(metadata?.characteristics);
  if (!source) return [];
  const rawItems = Array.isArray(source.items) ? source.items : [];
  const out: ProductCharacteristicItem[] = [];

  for (const [index, raw] of rawItems.entries()) {
    const rec = asRecord(raw);
    if (!rec) continue;

    const key = text(rec.key);
    const label = text(rec.label) || key;
    if (!key || !label) continue;

    const section = normalizeSectionKey(rec.section);

    const typeRaw = text(rec.type).toLowerCase();
    const type: ProductCharacteristicValueType =
      typeRaw === "text" ||
      typeRaw === "long_text" ||
      typeRaw === "number" ||
      typeRaw === "boolean"
        ? typeRaw
        : "text";

    const item: ProductCharacteristicItem = {
      id: text(rec.id) || `${key}-${index + 1}`,
      key,
      label,
      section,
      type,
      value: normalizeValueByType(type, rec.value),
      unit: text(rec.unit) || undefined,
      isExtra: rec.isExtra === true,
    };
    out.push(item);
  }

  return out;
}

function splitTemplateAndExtraItems(
  items: ProductCharacteristicItem[],
  templateKeys: Set<string>
) {
  const templateItems = new Map<string, ProductCharacteristicItem>();
  const extraItems: ProductCharacteristicItem[] = [];

  for (const item of items) {
    if (item.isExtra || !templateKeys.has(item.key)) {
      extraItems.push({
        ...item,
        id: item.id || `extra-${extraItems.length + 1}`,
        section: "others",
        isExtra: true,
      });
      continue;
    }

    if (!templateItems.has(item.key)) {
      templateItems.set(item.key, item);
    }
  }

  return {
    templateItems,
    extraItems: extraItems.slice(0, MAX_EXTRA_CHARACTERISTICS),
  };
}

function mergeTemplateWithExisting(
  fields: ProductCharacteristicFieldDefinition[],
  existingItems: Map<string, ProductCharacteristicItem>,
  hints?: ProductCharacteristicHints
) {
  return fields.map((field) => {
    const existing = existingItems.get(field.key);
    if (!existing) return createItemFromDefinition(field, hints);

    return {
      ...existing,
      id: field.key,
      key: field.key,
      label: field.label,
      section: field.section,
      type: field.type,
      value: normalizeValueByType(field.type, existing.value),
      unit: text(existing.unit) || field.defaultUnit,
      isExtra: false,
    } satisfies ProductCharacteristicItem;
  });
}

export function createExtraProductCharacteristic(indexHint = 0): ProductCharacteristicItem {
  const next = Math.max(1, Math.trunc(indexHint) || 1);
  return {
    id: `extra-${nanoid(10)}`,
    key: `extra_${next}`,
    label: "",
    section: "others",
    type: "text",
    value: "",
    isExtra: true,
  };
}

export function syncProductCharacteristicsForCategory(
  existing: ProductCharacteristicItem[] | undefined,
  category: Category | string | undefined,
  hints?: ProductCharacteristicHints
) {
  const template = templateForCategory(category);
  const templateKeys = new Set(
    template.fields
      .map((field) => field.key)
      .filter((key) => !isHiddenCharacteristicKey(key))
  );
  const existingItems = (existing ?? []).filter(
    (item) => !isHiddenCharacteristicKey(item.key)
  );
  const { templateItems, extraItems } = splitTemplateAndExtraItems(existingItems, templateKeys);
  const mergedTemplate = mergeTemplateWithExisting(template.fields, templateItems, hints);
  return [...mergedTemplate, ...extraItems];
}

export function readProductCharacteristicsFromMetadata(
  metadata: Record<string, unknown> | undefined,
  options?: {
    category?: Category | string;
    hints?: ProductCharacteristicHints;
  }
) {
  const parsed = parseRawCharacteristics(metadata);
  return syncProductCharacteristicsForCategory(parsed, options?.category, options?.hints);
}

export function serializeProductCharacteristicsForMetadata(
  items: ProductCharacteristicItem[]
): ProductCharacteristicsMetadataPayload {
  const normalized = items
    .map((item, index) => {
      const key = text(item.key) || slugifyKey(item.label) || `extra_${index + 1}`;
      const label = text(item.label) || key;
      const section = normalizeSectionKey(item.section);
      const type: ProductCharacteristicValueType =
        item.type === "text" ||
        item.type === "long_text" ||
        item.type === "number" ||
        item.type === "boolean"
          ? item.type
          : "text";

      return {
        id: text(item.id) || `${key}-${index + 1}`,
        key,
        label,
        section,
        type,
        value: normalizeValueByType(type, item.value),
        unit: text(item.unit) || undefined,
        isExtra: item.isExtra === true,
      } satisfies ProductCharacteristicItem;
    })
    .slice(0, 300);

  return {
    version: 1,
    items: normalized,
  };
}

export function getCharacteristicSectionLabel(section: ProductCharacteristicSectionKey) {
  return PRODUCT_CHARACTERISTIC_SECTIONS.find((current) => current.key === section)?.label || "Otros";
}

export function isRenderableCharacteristic(item: ProductCharacteristicItem) {
  return valueIsMeaningful(item);
}

export function formatCharacteristicValue(item: ProductCharacteristicItem) {
  if (item.type === "boolean") {
    return item.value === true ? "Si" : "No";
  }
  if (item.type === "number") {
    const num = typeof item.value === "number" ? item.value : undefined;
    if (num === undefined || !Number.isFinite(num)) return "";
    const unit = text(item.unit);
    return unit ? `${num} ${unit}` : String(num);
  }
  const raw = text(item.value);
  if (item.key === "gender") {
    const normalized = raw.toLowerCase();
    if (normalized === "unisex") return "Unisex";
    if (normalized === "hombre") return "Hombre";
    if (normalized === "mujer") return "Mujer";
  }
  return raw;
}

export function groupRenderableCharacteristicsBySection(items: ProductCharacteristicItem[]) {
  return PRODUCT_CHARACTERISTIC_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    items: items.filter((item) => item.section === section.key && isRenderableCharacteristic(item)),
  })).filter((section) => section.items.length > 0);
}

export function findCharacteristicByKey(items: ProductCharacteristicItem[], key: string) {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return undefined;
  return items.find((item) => item.key.trim().toLowerCase() === normalized);
}

export function normalizeExtraCharacteristicKey(label: string, fallbackIndex: number) {
  return slugifyKey(label) || `extra_${Math.max(1, Math.trunc(fallbackIndex) || 1)}`;
}

export function toSeoAdditionalProperties(
  items: ProductCharacteristicItem[],
  max = 80
): SeoAdditionalProperty[] {
  const out: SeoAdditionalProperty[] = [];
  for (const item of items) {
    if (!isRenderableCharacteristic(item)) continue;
    const name = text(item.label);
    const value = formatCharacteristicValue(item);
    if (!name || !value) continue;
    out.push({
      "@type": "PropertyValue",
      name,
      value,
    });
    if (out.length >= max) break;
  }
  return out;
}
