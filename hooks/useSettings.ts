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
  rememberKey: boolean;
}

const STORAGE_KEY = "grammar-polisher.settings.v3";
const STORAGE_KEY_NOSECRET = "grammar-polisher.settings.v3.nosecret";

const DEFAULTS: Settings = {
  providers: defaultProviders(),
  selectedProviderId: "deepseek",
  selectedModel: "deepseek-v4-pro",
  language: "auto",
  reasonLanguage: "auto",
  rememberKey: false,
};

function stripKeys(providers: ProviderEntry[]): ProviderEntry[] {
  return providers.map((p) => ({ ...p, apiKey: "" }));
}

function load(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY_NOSECRET);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const base: Settings = {
      ...DEFAULTS,
      ...parsed,
      providers: mergeProviders(parsed.providers ?? defaultProviders()),
    };
    if (!base.rememberKey) base.providers = stripKeys(base.providers);
    return base;
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
        if (next.rememberKey) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          window.localStorage.removeItem(STORAGE_KEY_NOSECRET);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
          const safe = { ...next, providers: stripKeys(next.providers) };
          window.localStorage.setItem(STORAGE_KEY_NOSECRET, JSON.stringify(safe));
        }
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  return { settings, update };
}
