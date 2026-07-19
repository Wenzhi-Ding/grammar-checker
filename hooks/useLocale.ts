// hooks/useLocale.ts
// URL-driven locale. The [lang] segment in the URL is the single source of
// truth (so SSR, hydration, and client all agree). The previous
// navigator.language-based detection was replaced because it produced a
// mismatch between the URL the crawler sees and the locale the page renders
// in — bad for hreflang and for GEO crawlers that don't run JS.

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n";

// Returns the locale derived from the URL's [lang] segment.
// On first paint (SSR/initial hydration) it returns DEFAULT_LOCALE so the
// rendered markup is deterministic; after mount, useParams resolves to the
// real segment. The setState happens unconditionally because useParams is a
// client-only hook — the value cannot be derived during render, so the
// react-hooks/set-state-in-effect rule does not apply.
export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const params = useParams();
  useEffect(() => {
    const lang = typeof params?.lang === "string" ? params.lang : "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(isLocale(lang) ? lang : DEFAULT_LOCALE);
  }, [params]);
  return locale;
}
