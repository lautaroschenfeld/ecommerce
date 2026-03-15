import type { Metadata } from "next";

import { cleanMetaText, SITE_NAME } from "@/lib/seo";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Contacto",
  description: cleanMetaText(
    `Canales de contacto y atencion para clientes de ${SITE_NAME}.`
  ),
  alternates: {
    canonical: "/contacto",
  },
  openGraph: {
    type: "website",
    url: "/contacto",
    title: `Contacto | ${SITE_NAME}`,
    description: cleanMetaText(
      "Escribinos para consultas de compra, pedidos y postventa."
    ),
  },
};

const intro = [
  "Si tenes una consulta comercial o de postventa, podes escribirnos por los canales oficiales.",
  "Para agilizar la atencion, inclui numero de pedido cuando corresponda.",
];

const sections = [
  {
    heading: "Canal principal",
    paragraphs: [
      "Email: soporte@frmotos.com",
      "Atendemos consultas de productos, compras, envios, cambios y devoluciones.",
    ],
  },
  {
    heading: "Ubicacion comercial",
    paragraphs: [
      "Casacuberta 683, Parana, Entre Rios, Republica Argentina.",
    ],
  },
  {
    heading: "Recomendaciones para tu consulta",
    points: [
      "Indica nombre completo y telefono de contacto.",
      "Detalla el motivo de la consulta en pocas lineas.",
      "Si es por postventa, agrega numero de pedido y fotos si aplica.",
    ],
  },
] as const;

export default function ContactoPage() {
  const canalPrincipal = sections[0];
  const ubicacion = sections[1];
  const recomendaciones = sections[2];

  return (
    <article className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Contacto</h1>
        {intro.map((paragraph) => (
          <p key={paragraph} className={styles.lead}>
            {paragraph}
          </p>
        ))}
      </section>

      <section className={styles.layout} aria-label="Canales de contacto">
        <article className={styles.card}>
          <h2>{canalPrincipal.heading}</h2>
          {canalPrincipal.paragraphs?.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </article>

        <article className={styles.card}>
          <h2>{ubicacion.heading}</h2>
          {ubicacion.paragraphs?.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </article>
      </section>

      <article className={styles.card}>
        <h2>{recomendaciones.heading}</h2>
        {recomendaciones.points?.length ? (
          <ul>
            {recomendaciones.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        ) : null}
      </article>
    </article>
  );
}
