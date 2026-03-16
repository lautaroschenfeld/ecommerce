import type { Metadata } from "next";

import { LegalTextPage } from "@/components/legal/legal-text-page";
import {
  buildSocialMetadata,
  cleanMetaText,
  resolveSiteName,
} from "@/lib/seo";
import { getStorefrontSettingsSafe } from "@/lib/storefront-settings";

export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getStorefrontSettingsSafe();
  const siteName = resolveSiteName(storefront.storeName);
  const title = "Politica de envios";
  const description = cleanMetaText(
    `Tiempos, cobertura y condiciones de envio de ${siteName}. Compra repuestos para motos con informacion clara y seguimiento.`
  );

  return {
    title,
    description,
    ...buildSocialMetadata({
      title: `${title} | ${siteName}`,
      description: cleanMetaText(
        "Cobertura, plazos estimados, tracking y gestion de reclamos logistico-comerciales."
      ),
      canonical: "/politica-de-envios",
      storefront,
      imageAlt: `${siteName} politica de envios`,
    }),
  };
}
const sections = [
  {
    heading: "1. Alcance territorial",
    paragraphs: [
      "FR Motos realiza envíos a todo el territorio de la República Argentina, salvo restricciones logístico-operativas informadas en el proceso de compra.",
    ],
  },
  {
    heading: "2. Operadores logísticos",
    paragraphs: [
      "Los envíos se realizan mediante operadores como Correo Argentino, Andreani o cadetería local (Paraná), según disponibilidad, tipo de producto, destino y dimensiones.",
      "El operador puede variar sin afectar el costo final informado, salvo aceptación expresa de la persona compradora si existiera diferencia.",
      "La intervención de operadores logísticos no excluye la responsabilidad legal de FR Motos frente a la persona consumidora.",
    ],
  },
  {
    heading: "3. Confirmación de pago y preparación",
    paragraphs: [
      "El despacho se inicia luego de acreditado el pago y confirmada la disponibilidad operativa del pedido.",
      "En fechas especiales o picos de demanda, la preparación puede demorar.",
    ],
  },
  {
    heading: "4. Plazos de entrega",
    paragraphs: [
      "Los plazos informados son estimativos y dependen del transportista y de condiciones externas (clima, cortes, alta demanda, zonas remotas).",
      "Esto no implica renuncia de derechos: ante incumplimiento relevante, la persona consumidora puede exigir cumplimiento, aceptar un producto/servicio equivalente o resolver la operación con restitución, sin perjuicio de otros remedios legales.",
    ],
  },
  {
    heading: "5. Dirección y datos del destinatario",
    paragraphs: [
      "Es responsabilidad de la persona compradora cargar datos correctos y completos de entrega y contacto.",
      "Si el envío no puede concretarse por error en datos, ausencia reiterada o imposibilidad de acceso, FR Motos informará opciones de resolución.",
      "Costos adicionales de reenvío podrán corresponder cuando la causa sea imputable al comprador y se informe previamente.",
    ],
  },
  {
    heading: "6. Seguimiento",
    paragraphs: [
      "Cuando el operador lo permita, FR Motos brindará número de seguimiento o enlace de tracking.",
      "La activación del tracking puede demorar según el operador logístico.",
    ],
  },
  {
    heading: "7. Recepción del paquete",
    paragraphs: [
      "Se recomienda inspeccionar el estado exterior del paquete al recibirlo, documentar con fotos cualquier daño o apertura y conservar embalajes/etiquetas.",
    ],
  },
  {
    heading: "8. Daños, faltantes, extravíos y reclamos",
    paragraphs: [
      "Si hay daños visibles, faltantes o signos de manipulación, se recomienda informar dentro de 48 horas con fotos del embalaje, producto y etiqueta/guía para facilitar la gestión operativa.",
      "El plazo de 48 horas es operativo y no limita derechos legales por vicios o incumplimientos no detectables a simple vista.",
      "Si existiera extravío o incumplimiento logístico, FR Motos gestionará el reclamo con el operador y ofrecerá una salida razonable: reexpedición, entrega alternativa o restitución.",
    ],
  },
  {
    heading: "9. Productos con restricciones de transporte",
    paragraphs: [
      "Algunos productos pueden requerir embalaje especial o estar sujetos a restricciones del operador (por ejemplo, líquidos o mercadería con condiciones particulares).",
      "En esos casos FR Motos puede ajustar el método de envío por razones de seguridad o normativa logística, informándolo previamente.",
    ],
  },
  {
    heading: "10. Envío por cadetería en Paraná",
    paragraphs: [
      "Para Paraná puede ofrecerse entrega por cadete. Costo, cobertura, franjas y condiciones se informan al finalizar la compra y rigen al momento de la compra.",
    ],
  },
  {
    heading: "11. Fuerza mayor",
    paragraphs: [
      "FR Motos no responde por demoras o imposibilidades imputables a hechos externos imprevisibles o inevitables (caso fortuito/fuerza mayor).",
      "Ante esos supuestos, se informará la incidencia y se colaborará para reprogramar entrega o resolver la operación conforme corresponda.",
    ],
  },
] as const;

export default function PoliticaDeEnviosPage() {
  return (
    <LegalTextPage
      title="Política de Envíos"
      sections={sections}
    />
  );
}

