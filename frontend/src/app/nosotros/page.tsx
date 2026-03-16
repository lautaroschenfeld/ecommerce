import type { Metadata } from "next";

import {
  buildSocialMetadata,
  cleanMetaText,
  resolveSiteName,
} from "@/lib/seo";
import { getStorefrontSettingsSafe } from "@/lib/storefront-settings";
import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getStorefrontSettingsSafe();
  const siteName = resolveSiteName(storefront.storeName);
  const title = "Nosotros";
  const description = cleanMetaText(
    `Conoce ${siteName}: una tienda especializada en repuestos y accesorios para motos, con foco en confianza y atencion real.`
  );

  return {
    title,
    description,
    ...buildSocialMetadata({
      title: `${title} | ${siteName}`,
      description: cleanMetaText(
        "Te contamos como trabajamos, como seleccionamos productos y como acompanamos cada compra."
      ),
      canonical: "/nosotros",
      storefront,
      imageAlt: `${siteName} nosotros`,
    }),
  };
}

const intro = [
  "Somos una tienda enfocada en brindar una experiencia de compra clara, rapida y confiable.",
  "Nuestro objetivo es que cada persona encuentre lo que necesita, con informacion completa y acompanamiento en todo el proceso.",
];

const sections = [
  {
    heading: "Como trabajamos",
    paragraphs: [
      "Seleccionamos productos con criterios de calidad, disponibilidad y respaldo postventa.",
      "Mantenemos catalogo, precios y stock actualizados para que puedas comprar con informacion real.",
    ],
  },
  {
    heading: "Compromiso con la atencion",
    paragraphs: [
      "Priorizamos respuestas claras y seguimiento de cada pedido desde la confirmacion hasta la entrega.",
      "Ante cualquier inconveniente, gestionamos cambios, devoluciones y consultas por los canales oficiales.",
    ],
  },
  {
    heading: "Nuestra base",
    paragraphs: [
      "Operamos desde Parana, Entre Rios, y realizamos envios a todo el pais segun condiciones logisticas vigentes.",
    ],
  },
] as const;

export default function NosotrosPage() {
  return (
    <article className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Nosotros</h1>
        {intro.map((paragraph) => (
          <p key={paragraph} className={styles.lead}>
            {paragraph}
          </p>
        ))}
      </section>

      <section className={styles.grid} aria-label="Informacion institucional">
        {sections.map((section) => (
          <article key={section.heading} className={styles.card}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </article>
        ))}
      </section>
    </article>
  );
}
