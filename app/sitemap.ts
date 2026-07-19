// app/sitemap.ts
// Two locale URLs with hreflang alternates so Google indexes both en and zh.

import type { MetadataRoute } from "next";
import { BASE_URL, LOCALES, alternateLanguages } from "@/lib/i18n";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return LOCALES.map((lang) => ({
    url: `${BASE_URL}/${lang}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: lang === "en" ? 1 : 0.8,
    alternates: { languages: alternateLanguages() },
  }));
}
