// hooks/useSettings.ts
"use client";
import { useEffect, useState, useCallback } from "react";
import { getPreset, type ProviderPreset } from "@/lib/providers/shared/presets";

export interface Settings {
  presetId: ProviderPreset["id"];
  apiKey: string;
  model: string;
  baseURL: string;
  language: "en" | "zh" | "auto";
  rememberKey: boolean;
}

const STORAGE_KEY = "grammar-polisher.settings.v1";
const STORAGE_KEY_NOSECRET = "grammar-polisher.settings.v1.nosecret"; // when rememberKey=false

const DEFAULTS: Settings = {
  presetId: "deepseek",
  apiKey: "",
  model: "deepseek-v4-pro",
  baseURL: "https://api.deepseek.com/v1",
  language: "auto",
  rememberKey: false,
};

function load(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY_NOSECRET);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const base = { ...DEFAULTS, ...parsed };
    if (!base.rememberKey) base.apiKey = ""; // never persist key unless opted in
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
    // The fully-blessed alternative is useSyncExternalStore; deferred as a v1 simplification.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(load());
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // when switching preset, refill model/baseURL defaults if user hadn't customized
      if (patch.presetId && patch.presetId !== prev.presetId) {
        const p = getPreset(patch.presetId);
        next.model = p.defaultModel;
        next.baseURL = p.baseURL;
      }
      try {
        if (next.rememberKey) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          window.localStorage.removeItem(STORAGE_KEY_NOSECRET);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
          const { apiKey: _apiKey, ...rest } = next;
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
