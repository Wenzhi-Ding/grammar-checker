// app/[lang]/opengraph-image.tsx
// Runtime-generated 1200x630 OG image via next/og (Satori). Cached at the
// edge. Per-locale: English text for /en, Chinese text for /zh.

import { ImageResponse } from "next/og";
import { getStrings, isLocale } from "@/lib/i18n";

export const runtime = "edge";
export const alt = "Grammar Checker — Free AI Proofreader";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ lang: string }> };

export default async function OgImage({ params }: Props) {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : "en";
  const s = getStrings(locale);
  const isZh = locale === "zh";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #f1f6fe 0%, #ffffff 50%, #f3e8fe 100%)",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              background: "linear-gradient(135deg, #4285f4, #1a73f8 60%, #a142f4)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              fontWeight: 700,
            }}
          >
            Aa
          </div>
          <div style={{ fontSize: 36, color: "#202124", fontWeight: 500 }}>
            Grammar Checker
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: "#202124",
            lineHeight: 1.1,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          {s.heroH1}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: "#5f6368",
            lineHeight: 1.35,
            maxWidth: 980,
          }}
        >
          {isZh
            ? "BYOK · 支持 DeepSeek / Gemini / GLM / Kimi · 纯前端 · 无需注册"
            : "BYOK · DeepSeek / Gemini / GLM / Kimi · in-browser · no signup"}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            fontSize: 26,
            color: "#1a73f8",
            fontWeight: 500,
          }}
        >
          grammar-checker.app
        </div>
      </div>
    ),
    { ...size },
  );
}
