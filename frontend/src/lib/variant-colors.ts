export type VariantColorOption = {
  value: string;
  label: string;
};

export const VARIANT_COLOR_OPTIONS: VariantColorOption[] = [
  { value: "Negro", label: "Negro" },
  { value: "Gris", label: "Gris" },
  { value: "Blanco", label: "Blanco" },
  { value: "Marron", label: "Marron" },
  { value: "Beige", label: "Beige" },
  { value: "Verde", label: "Verde" },
  { value: "Azul", label: "Azul" },
  { value: "Rojo", label: "Rojo" },
  { value: "Rosado", label: "Rosado" },
  { value: "Amarillo", label: "Amarillo" },
];

const VARIANT_COLOR_SWATCH_BY_KEY: Record<string, string> = {
  negro: "#111827",
  gris: "#6b7280",
  blanco: "#f8fafc",
  marron: "#8b5e34",
  beige: "#d6c3a3",
  verde: "#16a34a",
  azul: "#2563eb",
  rojo: "#dc2626",
  rosado: "#ec4899",
  amarillo: "#eab308",
};

export function normalizeColorKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function resolveVariantColorSwatch(color: string) {
  const normalized = normalizeColorKey(color);
  const mapped = VARIANT_COLOR_SWATCH_BY_KEY[normalized];
  if (mapped) return mapped;

  const raw = color.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return raw;
  return undefined;
}

export function resolveVariantColorOptions(currentColor: string) {
  const normalizedCurrent = currentColor.trim();
  if (!normalizedCurrent) return VARIANT_COLOR_OPTIONS;

  const hasCurrent = VARIANT_COLOR_OPTIONS.some(
    (option) => option.value.toLowerCase() === normalizedCurrent.toLowerCase()
  );
  if (hasCurrent) return VARIANT_COLOR_OPTIONS;

  return [{ value: normalizedCurrent, label: normalizedCurrent }, ...VARIANT_COLOR_OPTIONS];
}
