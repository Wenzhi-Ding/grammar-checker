// lib/i18n/jsonld.ts
// JSON-LD generators for SEO/GEO. Pure functions returning typed objects
// that pages render via <script type="application/ld+json">.

import { BASE_URL, getStrings, type Locale } from "./index";

export function webApplicationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Grammar Checker",
    url: BASE_URL,
    applicationCategory: "LinguisticsApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires JavaScript. Requires a modern browser.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "BYOK (bring your own API key)",
      "No signup",
      "No server-side storage",
      "Inline Grammarly-style suggestions",
      "DeepSeek / Gemini / GLM / Kimi support",
      "Open source",
    ],
    inLanguage: ["en", "zh"],
    isAccessibleForFree: true,
  };
}

export function organizationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Grammar Checker",
    url: BASE_URL,
    logo: `${BASE_URL}/icon.svg`,
  };
}

export function faqSchema(lang: Locale): Record<string, unknown> {
  const s = getStrings(lang);
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: s.htmlLang,
    mainEntity: s.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}
