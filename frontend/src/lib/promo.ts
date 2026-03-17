export type PromoResult = {
  code: string;
  valid: boolean;
  discountArs: number;
  description: string;
};

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function computePromo(subtotalArs: number, rawCode: string): PromoResult {
  const subtotal = Number.isFinite(subtotalArs) ? subtotalArs : 0;
  const code = rawCode.trim().toUpperCase();

  if (!code) {
    return {
      code: "",
      valid: false,
      discountArs: 0,
      description: "Ingresá un código.",
    };
  }

  if (code === "MOTO10") {
    const discount = clampInt(subtotal * 0.1, 0, 15000);
    return {
      code,
      valid: true,
      discountArs: discount,
      description: "10% OFF (tope 15.000).",
    };
  }

  if (code === "PRIMERA") {
    const discount = subtotal >= 60000 ? 8000 : 0;
    return {
      code,
      valid: discount > 0,
      discountArs: discount,
      description:
        discount > 0
          ? "8.000 OFF en tu primera compra."
          : "Mínimo 60.000 para usar este cupón.",
    };
  }

  return {
    code,
    valid: false,
    discountArs: 0,
    description: "Cupón inválido.",
  };
}


