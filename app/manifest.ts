// app/manifest.ts
// Minimal PWA manifest — helps Bing/Apple index the app as a web app and
// gives mobile browsers a proper install card.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grammar Checker",
    short_name: "Grammar",
    description:
      "Free AI grammar checker & proofreader. BYOK — supports DeepSeek, Gemini, GLM, Kimi.",
    start_url: "/en",
    display: "standalone",
    background_color: "#f8f9fa",
    theme_color: "#1a73f8",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    categories: ["education", "productivity", "utilities"],
    lang: "en",
  };
}
