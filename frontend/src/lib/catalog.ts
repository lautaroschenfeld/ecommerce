export const PRIMARY_CATEGORIES = [
  "Motor",
  "Transmisión",
  "Lubricantes",
  "Frenos",
  "Electricidad",
  "Ruedas",
  "Indumentaria",
  "Accesorios",
] as const;

export const ALL_CATEGORIES = [
  "Motor",
  "Transmisión",
  "Frenos",
  "Electricidad",
  "Ruedas",
  "Accesorios",
  "Lubricantes",
  "Filtros",
  "Baterías",
  "Iluminación",
  "Juntas",
  "Carburación",
  "Embrague",
  "Suspensión",
  "Rodamientos",
  "Tornillería",
  "Indumentaria",
] as const;

export type Category = (typeof ALL_CATEGORIES)[number];
