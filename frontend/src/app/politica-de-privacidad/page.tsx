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
  const title = "Politica de privacidad";
  const description = cleanMetaText(
    `Como protegemos tus datos personales en ${siteName}: recoleccion, uso, seguridad y derechos del titular.`
  );

  return {
    title,
    description,
    ...buildSocialMetadata({
      title: `${title} | ${siteName}`,
      description: cleanMetaText(
        "Conoce como tratamos tu informacion y como ejercer acceso, rectificacion y supresion."
      ),
      canonical: "/politica-de-privacidad",
      storefront,
      imageAlt: `${siteName} politica de privacidad`,
    }),
  };
}
const intro = [
  "Esta política se interpreta y aplica conforme la Ley 25.326, su decreto reglamentario y demás normativa vigente en la República Argentina.",
  "Si alguna cláusula fuera interpretada como limitativa de derechos legales, prevalecerá la interpretación más favorable para la persona titular de los datos.",
];

const sections = [
  {
    heading: "1. Responsable del tratamiento",
    paragraphs: [
      "FR Motos, monotributista (CUIT [COMPLETAR]), con domicilio comercial en Casacuberta 683, Paraná, Entre Ríos, República Argentina, es responsable del tratamiento de los datos personales recabados por este sitio y canales asociados.",
      "Contacto para privacidad y datos personales: soporte@frmotos.com.",
    ],
  },
  {
    heading: "2. Datos que podemos recolectar",
    paragraphs: [
      "Podemos recolectar datos de identificación y contacto (nombre, email, teléfono), datos de entrega y facturación (domicilio, localidad, provincia, código postal, DNI/CUIT cuando corresponda), datos de compra y postventa, y datos técnicos de navegación.",
      "No almacenamos números completos de tarjeta ni código de seguridad. Podemos conservar constancias operativas de pago (estado, identificador de transacción y medio) para conciliación, prevención de fraude y soporte.",
    ],
  },
  {
    heading: "3. Fuentes de los datos",
    paragraphs: [
      "Los datos pueden provenir de información proporcionada por la persona usuaria, de la navegación técnica del sitio, de terceros que intervienen en la operación (pagos/logística), y de requerimientos válidos de autoridad competente.",
    ],
  },
  {
    heading: "4. Finalidades del tratamiento",
    paragraphs: [
      "4.1 Operar compras y entregas: confirmar pedido, validar pago, preparar y despachar pedidos, coordinar entrega y seguimiento.",
      "4.2 Facturación y obligaciones legales: emitir comprobantes, cumplir obligaciones fiscales/contables y atender requerimientos válidos de autoridad.",
      "4.3 Atención y postventa: gestionar cambios, devoluciones, garantías y reclamos.",
      "4.4 Seguridad: prevenir fraude, abuso y accesos no autorizados.",
      "4.5 Analítica y mejora: medir rendimiento, detectar errores y mejorar experiencia de uso.",
      "4.6 Marketing: enviar comunicaciones comerciales solo cuando exista consentimiento y con baja disponible en todo momento.",
    ],
  },
  {
    heading: "5. Base de licitud",
    paragraphs: [
      "5.1 Consentimiento libre, expreso e informado, cuando corresponda por ley.",
      "5.2 Necesidad contractual: cuando el dato deriva de una relación contractual y resulta necesario para su ejecución.",
      "5.3 Obligación legal: cuando el tratamiento sea necesario para cumplir una obligación legal o un requerimiento válido.",
    ],
  },
  {
    heading: "6. Información que brindamos al recolectar datos",
    paragraphs: [
      "Cuando recolectamos datos informamos de manera clara: finalidad del tratamiento, identidad y domicilio del responsable, destinatarios o categorías de destinatarios, carácter obligatorio o facultativo de los datos solicitados, consecuencias de proporcionar o no proporcionar datos, y forma de ejercer derechos de acceso, rectificación y supresión.",
      "En formularios donde un dato sea indispensable para ejecutar la compra o cumplir una obligación legal, ese dato se indicará como obligatorio.",
      "En datos opcionales, la negativa no impedirá navegar el sitio, aunque puede limitar funciones no esenciales.",
    ],
  },
  {
    heading: "7. Cookies y analítica",
    paragraphs: [
      "Podemos usar cookies propias y de terceros para funcionamiento, seguridad, preferencias y analítica.",
      "Si se utiliza Google Analytics o herramientas equivalentes, se emplean identificadores técnicos/cookies para estadísticas de uso.",
      "La persona usuaria puede configurar su navegador para bloquear o eliminar cookies; ello puede afectar funciones como carrito, preferencias o inicio de sesión.",
    ],
  },
  {
    heading: "8. Cesión de datos y encargados de tratamiento",
    paragraphs: [
      "No vendemos ni alquilamos datos personales.",
      "Podemos comunicar datos a proveedores de pago, operadores logísticos, proveedores de infraestructura tecnológica y autoridades competentes cuando exista requerimiento legal válido.",
      "La cesión se limita a datos necesarios y para finalidades directamente relacionadas con la operación.",
    ],
  },
  {
    heading: "9. Transferencias internacionales",
    paragraphs: [
      "La transferencia internacional de datos a países u organismos sin nivel adecuado de protección está prohibida, salvo supuestos legales de excepción.",
      "Cuando corresponda transferir datos fuera de Argentina, aplicaremos mecanismos permitidos por ley y/o consentimiento expreso cuando sea exigible.",
    ],
  },
  {
    heading: "10. Seguridad y confidencialidad",
    paragraphs: [
      "Adoptamos medidas técnicas y organizativas razonables para garantizar seguridad y confidencialidad, evitando adulteración, pérdida, consulta o tratamiento no autorizado.",
      "El personal y terceros que intervengan en el tratamiento asumen deber de confidencialidad.",
    ],
  },
  {
    heading: "11. Conservación",
    paragraphs: [
      "Conservamos datos solo durante el tiempo necesario para cumplir finalidades operativas y obligaciones legales.",
      "Datos de compra/facturación: según plazos fiscales y contables.",
      "Datos de postventa y garantía: durante el tiempo necesario para trazabilidad y defensa de derechos.",
      "Datos de marketing: hasta la baja o retiro de consentimiento.",
      "Datos técnicos de seguridad: por plazos razonables para auditoría y diagnóstico.",
    ],
  },
  {
    heading: "12. Derechos de la persona titular y plazos de respuesta",
    paragraphs: [
      "La persona titular puede ejercer derechos de acceso, rectificación, actualización, supresión y confidencialidad.",
      "Acceso: se responde dentro de 10 días corridos de intimación fehaciente.",
      "Rectificación/actualización/supresión: se responde dentro de 5 días hábiles desde el reclamo.",
      "El derecho de acceso es gratuito a intervalos no inferiores a 6 meses, salvo interés legítimo acreditado.",
      "Para ejercer derechos: soporte@frmotos.com, indicando nombre y apellido, DNI y datos para ubicar la información.",
      "Podremos requerir acreditación razonable de identidad para evitar suplantaciones.",
    ],
  },
  {
    heading: "13. Autoridad de control y reclamos",
    paragraphs: [
      "La Agencia de Acceso a la Información Pública (AAIP) es el órgano de control en materia de datos personales.",
      "Si no recibís respuesta en plazos legales o la respuesta es insuficiente, podés formular reclamo ante la AAIP.",
    ],
  },
  {
    heading: "14. Leyendas informativas para formularios y web",
    paragraphs: [
      "El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley N 25.326.",
      "La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, órgano de control de la Ley N 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan con relación al incumplimiento de las normas sobre protección de datos personales.",
    ],
  },
  {
    heading: "15. Menores de edad",
    paragraphs: [
      "El sitio no está dirigido principalmente a menores de edad. Si se detecta tratamiento indebido de datos de menores, podrá solicitarse su supresión.",
    ],
  },
  {
    heading: "16. Cambios de esta política",
    paragraphs: [
      "FR Motos puede actualizar esta política por cambios operativos o legales. La versión vigente es la publicada en el sitio con su fecha de actualización.",
    ],
  },
] as const;

export default function PoliticaDePrivacidadPage() {
  return (
    <LegalTextPage
      title="Política de Privacidad"
      intro={intro}
      sections={sections}
    />
  );
}

