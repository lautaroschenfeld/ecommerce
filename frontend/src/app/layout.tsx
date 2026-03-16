import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Saira_Semi_Condensed } from "next/font/google";

import { DynamicGridSync } from "@/components/layout/dynamic-grid-sync";
import { GlobalAlertModal } from "@/components/layout/global-alert-modal";
import { RouteAwareSiteShell } from "@/components/layout/route-aware-site-shell";
import { StoreBackendModal } from "@/components/layout/store-backend-modal";
import {
  absoluteUrl,
  buildSocialMetadata,
  cleanMetaText,
  getSiteUrl,
  resolveSiteName,
  SITE_DESCRIPTION,
  toAbsolutePublicUrl,
} from "@/lib/seo";
import { toStoreMediaProxyUrl } from "@/lib/store-media-url";
import {
  getStorefrontSettingsSafe,
  storefrontCssVars,
} from "@/lib/storefront-settings";

import "./globals.css";
import styles from "./layout.module.css";

const saira = Saira_Semi_Condensed({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

function detectFaviconType(href: string) {
  const normalized = href.trim().toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".ico")) return "image/x-icon";
  return undefined;
}

export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getStorefrontSettingsSafe();
  const siteName = resolveSiteName(storefront.storeName);
  const description = cleanMetaText(SITE_DESCRIPTION, 160);

  return {
    metadataBase: new URL(getSiteUrl()),
    applicationName: siteName,
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description,
    keywords: [
      "ecommerce",
      "tienda online",
      "catalogo",
      "carrito",
      "finalizacion de compra",
    ],
    ...buildSocialMetadata({
      title: siteName,
      description,
      canonical: "/",
      storefront,
      imageAlt: `${siteName} vista previa`,
    }),
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const storefront = await getStorefrontSettingsSafe();
  const siteName = resolveSiteName(storefront.storeName);
  const storefrontVars = storefrontCssVars(storefront) as CSSProperties;
  const customFontCssUrl = storefront.font?.cssUrl?.trim() || "";
  const faviconUrl = toStoreMediaProxyUrl(storefront.faviconUrl.trim()) || "/favicon.ico";
  const faviconType = detectFaviconType(faviconUrl);
  const logoUrl = toStoreMediaProxyUrl(storefront.logoUrl.trim());

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: getSiteUrl(),
    logo: toAbsolutePublicUrl(logoUrl || faviconUrl || "/favicon.ico"),
    sameAs: [],
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: getSiteUrl(),
    inLanguage: storefront.storeLocale || "es-AR",
    potentialAction: {
      "@type": "SearchAction",
      target: `${absoluteUrl("/productos")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html
      lang={storefront.storeLocale || "es-AR"}
      data-theme-mode={storefront.themeMode}
      style={{ ...storefrontVars, colorScheme: storefront.themeMode }}
    >
      <head>
        <link
          rel="icon"
          href={faviconUrl}
          type={faviconType}
          data-storefront-favicon="true"
        />
        <link
          rel="shortcut icon"
          href={faviconUrl}
          type={faviconType}
          data-storefront-favicon="true"
        />
        {customFontCssUrl ? (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={customFontCssUrl} data-storefront-font />
          </>
        ) : null}
      </head>
      <body
        className={`${saira.variable} ${styles.body}`}
        style={storefrontVars}
        data-theme-mode={storefront.themeMode}
        data-store-locale={storefront.storeLocale || undefined}
        data-store-currency-code={storefront.currencyCode || undefined}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />

        <div className={styles.frame}>
          <div aria-hidden className={styles.bgGradient} />
          <div aria-hidden className={styles.bgGrid} />
          <DynamicGridSync />

          <div className={styles.contentLayer}>
            <RouteAwareSiteShell storefront={storefront}>
              {children}
            </RouteAwareSiteShell>
            <div aria-hidden className={styles.bgBottomOverlay} />
            <GlobalAlertModal />
            <StoreBackendModal />
          </div>
        </div>
      </body>
    </html>
  );
}