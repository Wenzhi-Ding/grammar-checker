// lib/i18n/index.ts
// Locale + content-string dictionary for SEO/GEO.
// UI components keep their inline `locale === "zh" ? ... : ...` ternaries;
// this module provides the SEO/GEO content blocks (hero, features, faq, footer,
// metadata) used by server components.

import type { Metadata } from "next";
import { en } from "./en";
import { zh } from "./zh";

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://grammar-checker.app";

export interface FAQItem {
  q: string;
  a: string;
}

export interface FeatureItem {
  title: string;
  body: string;
}

export interface Strings {
  lang: Locale;
  htmlLang: string; // value for <html lang="...">
  ogLocale: string; // og:locale value
  title: string;
  metaDescription: string;
  metaKeywords: string[];
  heroH1: string;
  heroSub: string;
  features: FeatureItem[];
  faq: FAQItem[];
  footerLine: string;
  switchLang: { label: string; href: string };
}

const DICT: Record<Locale, Strings> = { en, zh };

export function isLocale(x: string | undefined | null): x is Locale {
  return !!x && (LOCALES as readonly string[]).includes(x);
}

export function getStrings(lang: Locale): Strings {
  return DICT[lang];
}

export function canonicalFor(lang: Locale): string {
  return `/${lang}`;
}

export function alternateLanguages(): Record<string, string> {
  return {
    en: "/en",
    zh: "/zh",
    "x-default": "/en",
  };
}

export type { Metadata };
