import type { Metadata } from "next";

import { BrandsCarousel } from "@/components/home/brands-carousel";
import { HomeHeroBleedImage } from "@/components/home/home-hero-bleed-image";
import { HomeBestSellers } from "@/components/home/home-best-sellers";
import { PrimaryCategories } from "@/components/products/primary-categories";
import { HomeViewTelemetry } from "@/components/telemetry/home-view-telemetry";
import { bannerFocusStyle } from "@/lib/banner-focus-style";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";
import { getStorefrontSettingsSafe } from "@/lib/storefront-settings";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Inicio",
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

const homeJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: SITE_NAME,
  url: absoluteUrl("/"),
  description: SITE_DESCRIPTION,
  inLanguage: "es-AR",
};

export default async function Home() {
  const storefront = await getStorefrontSettingsSafe();
  const banner = storefront.heroBanner;
  const heroUrl = toStoreMediaProxyUrl(banner.imageUrl.trim()) || "/assets/home/hero.webp";
  const heroFocusX = Number.isFinite(banner.focusX) ? Math.max(0, Math.min(100, banner.focusX)) : 50;
  const heroFocusY = Number.isFinite(banner.focusY) ? Math.max(0, Math.min(100, banner.focusY)) : 50;
  const heroZoom = Number.isFinite(banner.zoom) ? Math.max(1, Math.min(3, banner.zoom)) : 1;

  return (
    <>
      <HomeViewTelemetry />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      <div className={styles.stack}>
        <section className={styles.heroBleed} aria-hidden>
          <div className={styles.heroBleedMedia}>
            <HomeHeroBleedImage
              src={heroUrl}
              className={styles.heroBleedImage}
              style={bannerFocusStyle(heroFocusX, heroFocusY, heroZoom)}
            />
          </div>
        </section>
        <PrimaryCategories />
        <BrandsCarousel />
        <HomeBestSellers />
      </div>
    </>
  );
}

