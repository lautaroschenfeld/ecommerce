"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import styles from "./legal-text-page.module.css";

type LegalTextPageSection = {
  heading: string;
  paragraphs?: readonly string[];
  points?: readonly string[];
};

type LegalTextPageProps = {
  title: string;
  intro?: readonly string[];
  sections?: readonly LegalTextPageSection[];
};

export function LegalTextPage({
  title,
  intro = [],
  sections = [],
}: LegalTextPageProps) {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return (
    <article className={styles.page}>
      <h1>{title}</h1>
      <div className={styles.body}>
        {intro.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {sections.map((section) => (
          <section key={section.heading} className={styles.section}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.points?.length ? (
              <ul>
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </article>
  );
}
