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
  const title = "Boton de arrepentimiento";
  const description = cleanMetaText(
    `Boton de arrepentimiento de ${siteName}. Revoca tu compra online dentro del plazo legal con pasos simples y sin costos ocultos.`
  );

  return {
    title,
    description,
    ...buildSocialMetadata({
      title: `${title} | ${siteName}`,
      description: cleanMetaText(
        "Canales, plazos y condiciones para ejercer el derecho de arrepentimiento de forma simple."
      ),
      canonical: "/boton-de-arrepentimiento",
      storefront,
      imageAlt: `${siteName} boton de arrepentimiento`,
    }),
  };
}
const intro = [
  "La persona consumidora tiene derecho a revocar una compra a distancia dentro de 10 (diez) días corridos desde la entrega del producto o desde la celebración del contrato, lo último que ocurra.",
  "Si no se informó debidamente este derecho, el plazo legal no se extingue.",
];

const sections = [
  {
    heading: "1. Acceso y ejercicio del derecho",
    paragraphs: [
      "Puede ejercerse desde el link visible 'Botón de Arrepentimiento' del sitio o enviando email a soporte@frmotos.com con asunto 'Arrepentimiento de compra'.",
      "No es requisito tener cuenta, iniciar sesión ni realizar registración previa para ejercer este derecho.",
      "La revocación también puede notificarse por cualquier medio fehaciente escrito o electrónico.",
    ],
  },
  {
    heading: "2. Datos recomendados para identificar la compra",
    paragraphs: [
      "Para agilizar la gestión se recomienda informar número de pedido, nombre y apellido, DNI, email, teléfono y productos involucrados.",
      "Si no se cuenta con número de pedido, igualmente se recibirá la solicitud y se pedirán datos mínimos para ubicar la operación.",
    ],
  },
  {
    heading: "3. Confirmación y código de trámite",
    paragraphs: [
      "Dentro de las 24 horas de recibido el pedido por el mismo medio, FR Motos informará un código de identificación/registración y el procedimiento para efectivizar la revocación.",
    ],
  },
  {
    heading: "4. Devolución del producto y costos",
    paragraphs: [
      "Ejercido el arrepentimiento, la persona consumidora debe poner el producto a disposición de FR Motos.",
      "Los gastos de devolución son a cargo de FR Motos, mediante etiqueta prepagada, retiro o mecanismo equivalente sin costo.",
      "No se cobrarán cargos de gestión, penalidades ni gastos administrativos por ejercer este derecho.",
    ],
  },
  {
    heading: "5. Estado del producto",
    paragraphs: [
      "Puede examinarse el producto de manera razonable. Al devolver se solicita producto completo con accesorios/partes y embalaje/etiquetas en la medida posible.",
      "Si hubiera daños o faltantes atribuibles a uso que exceda un examen razonable, FR Motos podrá documentarlo y gestionar el caso conforme el régimen aplicable.",
    ],
  },
  {
    heading: "6. Reintegro",
    paragraphs: [
      "FR Motos cursará el reintegro por el mismo medio de pago o uno equivalente, una vez coordinada la devolución y verificada la correspondencia del producto con el pedido (control antifraude razonable).",
      "La acreditación final depende del medio de pago y de la entidad emisora.",
    ],
  },
  {
    heading: "7. Casos en los que el derecho puede no aplicar",
    paragraphs: [
      "El derecho de revocación puede tener excepciones previstas por normativa aplicable. Entre ellas, bienes confeccionados conforme especificaciones del consumidor o claramente personalizados.",
      "También pueden existir supuestos exceptuados por normativa especial para ciertos bienes consumidos, perecederos o de inmediata utilización que no admitan re-comercialización en condiciones adecuadas.",
      "En contrataciones electrónicas de alquileres turísticos, transporte de pasajeros, servicios de comidas o esparcimiento con fecha o período de ejecución específico, puede aplicar un mecanismo especial de solicitud de baja cuando no sea posible reasignar la vacante.",
      "Si un caso encuadra en una excepción, FR Motos lo informará de manera fundada.",
    ],
  },
] as const;

export default function BotonDeArrepentimientoPage() {
  return (
    <LegalTextPage
      title="Botón de Arrepentimiento"
      intro={intro}
      sections={sections}
    />
  );
}

