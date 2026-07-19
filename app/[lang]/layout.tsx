// app/[lang]/layout.tsx
// Root layout (no app/layout.tsx above this). Owns <html>, <body>, fonts,
// metadata, JSON-LD scaffolding (Organization, WebApplication), and Microsoft
// Clarity. Locale-aware: <html lang> follows the [lang] segment.

import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { notFound } from "next/navigation";

import "../globals.css";
import {
  BASE_URL,
  LOCALES,
  alternateLanguages,
  canonicalFor,
  getStrings,
  isLocale,
} from "@/lib/i18n";
import { organizationSchema, webApplicationSchema } from "@/lib/i18n/jsonld";

const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

export const runtime = "nodejs";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const s = getStrings(lang);
  const canonical = canonicalFor(lang);
  const url = `${BASE_URL}${canonical}`;
  const ogImage = lang === "en" ? "/en/opengraph-image" : "/zh/opengraph-image";

  return {
    metadataBase: new URL(BASE_URL),
    title: s.title,
    description: s.metaDescription,
    keywords: s.metaKeywords,
    alternates: {
      canonical,
      languages: alternateLanguages(),
    },
    openGraph: {
      title: s.title,
      description: s.metaDescription,
      url,
      siteName: "Grammar Checker",
      locale: s.ogLocale,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: s.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: s.title,
      description: s.metaDescription,
      images: [ogImage],
    },
    robots: { index: true, follow: true },
    applicationName: "Grammar Checker",
    authors: [{ name: "Grammar Checker" }],
    generator: "Next.js",
    referrer: "origin-when-cross-origin",
    formatDetection: { email: false, address: false, telephone: false },
    verification: verificationMeta(),
  };
}

function verificationMeta(): Metadata["verification"] {
  const gsc = process.env.NEXT_PUBLIC_GSC_VERIFICATION;
  const bing = process.env.NEXT_PUBLIC_BING_VERIFICATION;
  if (!gsc && !bing) return undefined;
  return {
    google: gsc || undefined,
    other: bing ? { "msvalidate.01": bing } : undefined,
  };
}

export default async function RootLayout({ children, params }: LayoutProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  // After notFound(), lang is narrowed to Locale (isLocale is a type guard).
  const s = getStrings(lang);
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID;

  return (
    <html lang={s.htmlLang} className={`${roboto.variable} h-full antialiased`}>
      <body className="min-h-full">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationSchema()) }}
        />
        {children}
        <Analytics />
        {clarityId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityId}");`,
            }}
          />
        )}
      </body>
    </html>
  );
}
