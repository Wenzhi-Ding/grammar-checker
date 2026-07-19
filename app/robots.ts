// app/robots.ts
// Allow all crawlers, point them at the sitemap.

import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/i18n";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
