// hooks/useSettings.ts
"use client";
import { useEffect, useState, useCallback } from "react";
import { type ProviderPreset } from "@/lib/providers/shared/presets";

export type ProviderId = ProviderPreset["id"];

export interface Settings {
  /** API key per provider. Empty string = not configured. */
  keys: Record<ProviderId, string>;
  /** Active provider (derived from the picked model, or custom). */
  provider: ProviderId;
  /** Active model. */
  model: string;
  /** baseURL for the custom provider. */
  customBaseURL: string;
  language: "en" | "zh" | "auto";
  /** Language the LLM writes `reason` in. "auto" = browser language. */
  reasonLanguage: "en" | "zh" | "auto";
  rememberKey: boolean;
}

const STORAGE_KEY = "grammar-polisher.settings.v2";
const STORAGE_KEY_NOSECRET = "grammar-polisher.settings.v2.nosecret";

const EMPTY_KEYS: Record<ProviderId, string> = {
  deepseek: "",
  kimi: "",
  glm: "",
  gemini: "",
  custom: "",
};

const DEFAULTS: Settings = {
  keys: { ...EMPTY_KEYS },
  provider: "deepseek",
  model: "deepseek-v4-pro",
  customBaseURL: "",
  language: "auto",
  reasonLanguage: "auto",
  rememberKey: false,
};

function load(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY_NOSECRET);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const base: Settings = {
      ...DEFAULTS,
      ...parsed,
      keys: { ...EMPTY_KEYS, ...(parsed.keys ?? {}) },
    };
    if (!base.rememberKey) base.keys = { ...EMPTY_KEYS }; // never persist keys unless opted in
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
          const { keys: _k, ...rest } = next;
          window.localStorage.setItem(STORAGE_KEY_NOSECRET, JSON.stringify(rest));
        }
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  return { settings, update };
}
