// hooks/useSettings.ts
"use client";
import { useEffect, useState, useCallback } from "react";
import { defaultProviders, mergeProviders, type ProviderEntry } from "@/lib/providers/shared/presets";

export interface Settings {
  /** All providers (built-ins + user-added customs), each with its own baseURL/apiKey/models. */
  providers: ProviderEntry[];
  selectedProviderId: string;
  selectedModel: string;
  language: "en" | "zh" | "auto";
  /** Language the LLM writes `reason` in. "auto" = browser language. */
  reasonLanguage: "en" | "zh" | "auto";
  /** User extra instructions appended to the system prompt (hard rules always remain). */
  customInstructions: string;
}

const STORAGE_KEY = "grammar-polisher.settings.v8";
const LEGACY_KEYS = [
  "grammar-polisher.settings.v7",
  "grammar-polisher.settings.v6",
  "grammar-polisher.settings.v5",
  "grammar-polisher.settings.v4",
  "grammar-polisher.settings.v3",
  "grammar-polisher.settings.v3.nosecret",
  "grammar-polisher.settings.v2",
];

const DEFAULTS: Settings = {
  providers: defaultProviders(),
  selectedProviderId: "deepseek",
  selectedModel: "deepseek-v4-pro",
  language: "auto",
  reasonLanguage: "auto",
  customInstructions: "",
};

/** Migrate from older storage: use FRESH builtin seeds (new model lists + new builtins),
 *  carry over saved API keys by id, and keep any user-added custom providers intact. */
function migrate(parsed: Partial<Settings>): Settings {
  const fresh = defaultProviders();
  const old = parsed.providers ?? [];
  const providers = [
    ...fresh.map((p) => ({ ...p, apiKey: old.find((s) => s.id === p.id)?.apiKey ?? "" })),
    ...old.filter((s) => !s.builtin),
  ];
  return {
    ...DEFAULTS,
    selectedProviderId: parsed.selectedProviderId ?? DEFAULTS.selectedProviderId,
    selectedModel: parsed.selectedModel ?? DEFAULTS.selectedModel,
    language: parsed.language ?? DEFAULTS.language,
    reasonLanguage: parsed.reasonLanguage ?? DEFAULTS.reasonLanguage,
    providers,
  };
}

function load(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const v4 = window.localStorage.getItem(STORAGE_KEY);
    if (v4) {
      const parsed = JSON.parse(v4) as Partial<Settings>;
      return { ...DEFAULTS, ...parsed, providers: mergeProviders(parsed.providers ?? defaultProviders()) };
    }
    for (const key of LEGACY_KEYS) {
      const raw = window.localStorage.getItem(key);
      if (raw) return migrate(JSON.parse(raw) as Partial<Settings>);
    }
    return DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    // Hydration-safe localStorage read: server + first client paint use DEFAULTS,
    // then sync from storage after mount. (Lazy useState init would mismatch SSR HTML.)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(load());
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next: Settings = { ...prev, ...patch };
      try {
        // Keys are always persisted to localStorage (per user request).
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  return { settings, update };
}
