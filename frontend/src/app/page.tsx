import type { Metadata } from "next";

import { BrandsCarousel } from "@/components/home/brands-carousel";
import { HomeHeroBleedImage } from "@/components/home/home-hero-bleed-image";
import { HomeBestSellers } from "@/components/home/home-best-sellers";
import { PrimaryCategories } from "@/components/products/primary-categories";
import { HomeViewTelemetry } from "@/components/telemetry/home-view-telemetry";
import { bannerFocusStyle } from "@/lib/banner-focus-style";
import {
  absoluteUrl,
  buildSocialMetadata,
  cleanMetaText,
  resolveSiteName,
  SITE_DESCRIPTION,
} from "@/lib/seo";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";
import { getStorefrontSettingsSafe } from "@/lib/storefront-settings";

import styles from "./page.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getStorefrontSettingsSafe();
  const siteName = resolveSiteName(storefront.storeName);
  const description = cleanMetaText(SITE_DESCRIPTION, 160);

  return {
    title: "Inicio",
    description,
    ...buildSocialMetadata({
      title: siteName,
      description,
      canonical: "/",
      storefront,
      imageAlt: `${siteName} inicio`,
    }),
  };
}

export default async function Home() {
  const storefront = await getStorefrontSettingsSafe();
  const siteName = resolveSiteName(storefront.storeName);
  const description = cleanMetaText(SITE_DESCRIPTION, 160);
  const banner = storefront.heroBanner;
  const heroUrl = toStoreMediaProxyUrl(banner.imageUrl.trim()) || "/assets/home/hero.webp";
  const heroFocusX = Number.isFinite(banner.focusX) ? Math.max(0, Math.min(100, banner.focusX)) : 50;
  const heroFocusY = Number.isFinite(banner.focusY) ? Math.max(0, Math.min(100, banner.focusY)) : 50;
  const heroZoom = Number.isFinite(banner.zoom) ? Math.max(1, Math.min(3, banner.zoom)) : 1;

  const homeJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: siteName,
    url: absoluteUrl("/"),
    description,
    inLanguage: storefront.storeLocale || "es-AR",
  };

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