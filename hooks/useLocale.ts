// hooks/useLocale.ts
import { useEffect, useState } from "react";

export type Locale = "zh" | "en";

// Picks the UI-strings locale from navigator.language.
// Returns "en" on first paint (deterministic for SSR/hydration), then resolves
// to "zh" after mount if the browser's language is Chinese. The setState happens
// unconditionally on mount because the source (navigator) is only available
// client-side — it cannot be derived during render, so the
// react-hooks/set-state-in-effect rule does not apply.
export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    const zh = typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("zh");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(zh ? "zh" : "en");
  }, []);
  return locale;
}
