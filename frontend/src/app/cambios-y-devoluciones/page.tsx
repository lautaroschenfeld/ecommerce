import type { Metadata } from "next";

import { LegalTextPage } from "@/components/legal/legal-text-page";
import { cleanMetaText, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Cambios y devoluciones",
  description: cleanMetaText(
    `Política de cambios, devoluciones, garantía y arrepentimiento de ${SITE_NAME}.`
  ),
  alternates: {
    canonical: "/cambios-y-devoluciones",
  },
  openGraph: {
    type: "website",
    url: "/cambios-y-devoluciones",
    title: `Cambios y devoluciones | ${SITE_NAME}`,
    description: cleanMetaText(
      `Procedimientos de postventa con enfoque legal para compras online.`
    ),
  },
};

const intro = [
  "Contacto postventa: soporte@frmotos.com.",
  "Esta política se interpreta siempre de manera compatible con la normativa de defensa del consumidor y contratos de consumo vigente en Argentina.",
  "Ninguna cláusula de esta política limita derechos irrenunciables de las personas consumidoras.",
];

const sections = [
  {
    heading: "1. Alcance",
    paragraphs: [
      "Regula el procedimiento operativo para arrepentimiento en compras a distancia, devoluciones por error de preparación, reclamos por daños de transporte, garantía legal/comercial y cambios voluntarios.",
    ],
  },
  {
    heading: "2. Derecho de arrepentimiento en compras online",
    paragraphs: [
      "Si la compra se realizó a distancia, la persona consumidora puede revocar la aceptación dentro de 10 (diez) días corridos contados desde la entrega del bien o celebración del contrato, lo último que ocurra.",
      "Este derecho es irrenunciable y no puede condicionarse al pago de cargos o penalidades.",
    ],
  },
  {
    heading: "2.1 Cómo ejercerlo (canales habilitados)",
    paragraphs: [
      "Puede ejercerse desde el Botón de Arrepentimiento del sitio o por email a soporte@frmotos.com con asunto 'Arrepentimiento de compra'.",
      "Se recomienda informar número de pedido, nombre, DNI, email y teléfono. Si no hay número de pedido, se recibirá igualmente la solicitud y se pedirán datos mínimos para identificar la operación.",
      "Dentro de 24 horas de recibido el pedido por el mismo medio, FR Motos informará código de identificación y pasos para efectivizar la revocación.",
    ],
  },
  {
    heading: "2.2 Puesta a disposición y devolución sin costo",
    paragraphs: [
      "Ejercido el arrepentimiento, la persona consumidora debe poner el bien a disposición de FR Motos.",
      "Los gastos de devolución son a cargo de FR Motos, mediante etiqueta prepagada, retiro coordinado o mecanismo equivalente sin costo para la persona consumidora.",
      "No se aplicarán gastos de restocking, penalidades administrativas ni descuentos por logística en supuestos de arrepentimiento legal.",
    ],
  },
  {
    heading: "2.3 Estado del producto al devolver",
    paragraphs: [
      "Puede abrirse el paquete y examinarse el producto de manera razonable para verificar características, compatibilidad visual e integridad sin pérdida automática de derechos.",
      "Al devolver se solicita entrega completa, con accesorios/partes e identificación de compra, conservando embalaje en la medida razonable posible.",
      "Si hubiera daños, faltantes o signos de uso/instalación que excedan un examen razonable, FR Motos podrá documentarlo y gestionar el reclamo conforme el régimen aplicable.",
    ],
  },
  {
    heading: "2.4 Reintegro",
    paragraphs: [
      "FR Motos cursará el reintegro por el mismo medio de pago utilizado o uno técnicamente equivalente, una vez coordinada la devolución y verificada la correspondencia con el pedido.",
      "La instrucción de reembolso se emitirá dentro de un plazo máximo de 10 (diez) días corridos desde la recepción del producto o desde la constancia de retorno logístico, lo que ocurra primero.",
      "La acreditación final depende del medio de pago y entidad emisora, fuera de la esfera de control directo de FR Motos.",
      "La restitución de prestaciones se realiza de forma recíproca y simultánea conforme normativa aplicable.",
    ],
  },
  {
    heading: "3. Garantía legal y productos con falla o defecto",
    paragraphs: [
      "Además de eventuales garantías comerciales del fabricante, los productos alcanzados por la Ley 24.240 cuentan con garantía legal mínima: 6 (seis) meses para productos nuevos y 3 (tres) meses para usados.",
      "La cadena de comercialización responde solidariamente cuando corresponda según normativa vigente.",
    ],
  },
  {
    heading: "3.1 Cómo iniciar un reclamo por falla",
    paragraphs: [
      "Enviar email a soporte@frmotos.com con número de pedido, descripción de falla, fotos/video cuando sea posible, fecha de detección y datos de instalación si existieran.",
    ],
  },
  {
    heading: "3.2 Evaluación técnica",
    paragraphs: [
      "FR Motos puede requerir información adicional, inspección y/o revisión técnica para determinar origen del defecto y solución adecuada (reparación, reemplazo u otro remedio aplicable).",
      "La evaluación técnica no se utilizará para impedir o dilatar injustificadamente derechos de la persona consumidora.",
    ],
  },
  {
    heading: "3.3 Costos asociados a garantía",
    paragraphs: [
      "Si corresponde encuadre por garantía legal o comercial aplicable, FR Motos informará pasos y cobertura de traslados según régimen vigente.",
    ],
  },
  {
    heading: "4. Error de preparación (producto distinto al comprado)",
    paragraphs: [
      "Si se recibe un producto distinto al adquirido, FR Motos coordinará retiro del artículo equivocado y entrega del correcto, o alternativa equivalente, sin cargo para la persona consumidora.",
    ],
  },
  {
    heading: "5. Daños o faltantes atribuibles al transporte",
    paragraphs: [
      "Ante daños visibles, signos de apertura o faltantes, se recomienda tomar fotos del paquete exterior e interior, conservar embalaje y reportar dentro de 48 horas de la recepción para facilitar gestión con operador.",
      "Este plazo es operativo y no limita derechos sobre vicios no detectables a simple vista ni derechos reconocidos por normativa aplicable.",
    ],
  },
  {
    heading: "6. Cambios voluntarios por error de compra o incompatibilidad",
    paragraphs: [
      "Este apartado aplica cuando no existe falla, daño de transporte ni error de preparación y se solicita un cambio comercial.",
    ],
  },
  {
    heading: "6.1 Compatibilidad e información previa",
    paragraphs: [
      "La persona compradora debe verificar compatibilidad con modelo/año/versión antes de comprar y revisar la descripción del producto.",
      "Si hubo asesoramiento del sitio determinante para la compra, se recomienda conservar evidencia (capturas o emails) para evaluar el caso.",
    ],
  },
  {
    heading: "6.2 Condiciones para cambios voluntarios",
    paragraphs: [
      "Se evaluarán cambios voluntarios cuando el producto no fue instalado ni usado, no presenta marcas de montaje/intervención, está completo y conserva embalaje/etiquetas en la medida posible.",
    ],
  },
  {
    heading: "6.3 Costos en cambios voluntarios",
    paragraphs: [
      "En cambios voluntarios, los costos de envío de ida y vuelta pueden ser a cargo de la persona compradora, salvo decisión comercial distinta de FR Motos.",
      "No se aplicarán retenciones genéricas o indeterminadas. Cualquier costo adicional deberá ser previo, objetivo y acreditable.",
      "Este apartado aplica solo a cambios voluntarios fuera de supuestos de arrepentimiento legal, garantía, vicio, producto defectuoso o error de preparación.",
    ],
  },
  {
    heading: "7. Canal de atención y trazabilidad",
    paragraphs: [
      "Para asegurar registro, el canal preferente de postventa es soporte@frmotos.com. Si se usan otros canales, FR Motos puede solicitar confirmación por email para dejar constancia.",
    ],
  },
  {
    heading: "8. Excepciones legales al derecho de arrepentimiento",
    paragraphs: [
      "Cuando corresponda por normativa vigente, el derecho de arrepentimiento puede no aplicar en supuestos expresamente exceptuados (por ejemplo, productos confeccionados a medida o claramente personalizados).",
      "También pueden existir excepciones en ciertos bienes consumidos, perecederos o de inmediata utilización que no admitan re-comercialización en condiciones adecuadas, y en algunos servicios de ejecución en fecha o período específico bajo régimen especial.",
      "Si FR Motos invoca una excepción legal, informará el fundamento y la norma aplicable en la respuesta al consumidor.",
    ],
  },
] as const;

export default function CambiosYDevolucionesPage() {
  return (
    <LegalTextPage
      title="Política de Cambios, Devoluciones, Garantía y Arrepentimiento"
      intro={intro}
      sections={sections}
    />
  );
}
