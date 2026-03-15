import type { Metadata } from "next";

import { LegalTextPage } from "@/components/legal/legal-text-page";
import { cleanMetaText, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: cleanMetaText(
    `Condiciones generales de compra y uso del sitio de ${SITE_NAME}.`
  ),
  alternates: {
    canonical: "/terminos-y-condiciones",
  },
  openGraph: {
    type: "website",
    url: "/terminos-y-condiciones",
    title: `Términos y condiciones | ${SITE_NAME}`,
    description: cleanMetaText(
      `Leé las condiciones de compra y uso antes de operar en nuestra tienda.`
    ),
  },
};

const intro = [
  "Al realizar una compra en este sitio aceptas estas condiciones generales de contratación.",
  "Estas condiciones se interpretan conforme la normativa argentina de defensa del consumidor y contratos de consumo.",
  "Ninguna cláusula de este documento limita derechos irrenunciables de las personas consumidoras.",
];

const sections = [
  {
    heading: "1. Información comercial y precios",
    paragraphs: [
      "Los precios, promociones, disponibilidad y descripciones de productos pueden actualizarse sin previo aviso.",
      "Se respetará el precio y condiciones informadas al momento de confirmar la compra.",
    ],
  },
  {
    heading: "2. Formación del contrato",
    paragraphs: [
      "La aceptación definitiva del pedido queda sujeta a la acreditación del pago, validación razonable de datos y disponibilidad de stock.",
      "Si existiera imposibilidad de cumplimiento por falta sobreviniente de stock u otra causa objetiva, FR Motos informará la situación y ofrecerá alternativas legalmente válidas.",
    ],
  },
  {
    heading: "3. Pagos y facturación",
    paragraphs: [
      "Los pagos se procesan por medios habilitados en checkout.",
      "FR Motos emitirá la documentación fiscal que corresponda conforme normativa vigente.",
    ],
  },
  {
    heading: "4. Envío, entrega y postventa",
    paragraphs: [
      "Las condiciones de envío, cambios, devoluciones, garantía y arrepentimiento se rigen por sus políticas específicas publicadas en el sitio.",
      "Ante conflicto entre estas condiciones y la normativa de orden público, prevalecerá la norma legal aplicable.",
    ],
  },
  {
    heading: "5. Uso del sitio",
    paragraphs: [
      "El sitio debe utilizarse de forma lícita y sin afectar su funcionamiento ni derechos de terceros.",
      "No se permite realizar maniobras de fraude, suplantación de identidad o uso abusivo de la plataforma.",
    ],
  },
  {
    heading: "6. Modificaciones",
    paragraphs: [
      "FR Motos puede actualizar estos términos por cambios operativos o legales. La versión vigente será la publicada en el sitio con su fecha de actualización.",
    ],
  },
] as const;

export default function TerminosYCondicionesPage() {
  return (
    <LegalTextPage
      title="Términos y Condiciones"
      intro={intro}
      sections={sections}
    />
  );
}
