// lib/providers/shared/presets.ts

export type AdapterKind = "openai-compatible" | "gemini";

/**
 * Unified provider structure — every provider (built-in or user-added custom)
 * is described by this shape: baseURL, API key, and a list of models.
 */
export interface ProviderEntry {
  id: string;
  label: string;
  adapter: AdapterKind;
  baseURL: string;
  apiKey: string;
  models: string[];
  keyUrl: string;
  builtin: boolean;
}

export const BUILTIN_PROVIDERS: ProviderEntry[] = [
  { id: "deepseek", label: "DeepSeek", adapter: "openai-compatible", baseURL: "https://api.deepseek.com/v1", apiKey: "", models: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-reasoner"], keyUrl: "https://platform.deepseek.com", builtin: true },
  { id: "kimi", label: "Kimi (Moonshot)", adapter: "openai-compatible", baseURL: "https://api.moonshot.cn/v1", apiKey: "", models: ["kimi-k2.6", "kimi-k2.7"], keyUrl: "https://platform.moonshot.cn", builtin: true },
  { id: "kimi-code", label: "Kimi Code Plan", adapter: "openai-compatible", baseURL: "https://api.kimi.com/coding/v1", apiKey: "", models: ["kimi-k2.7-code", "kimi-k2.7-code-highspeed"], keyUrl: "https://platform.kimi.ai", builtin: true },
  { id: "glm", label: "GLM (智谱)", adapter: "openai-compatible", baseURL: "https://open.bigmodel.cn/api/paas/v4", apiKey: "", models: ["glm-5.2", "glm-4-flash", "glm-4-air"], keyUrl: "https://open.bigmodel.cn", builtin: true },
  { id: "glm-zai", label: "GLM Coding Plan (z.ai)", adapter: "openai-compatible", baseURL: "https://api.z.ai/api/coding/paas/v4", apiKey: "", models: ["glm-5.2"], keyUrl: "https://z.ai", builtin: true },
  { id: "gemini", label: "Gemini", adapter: "gemini", baseURL: "", apiKey: "", models: ["gemini-3.5-flash", "gemini-3.5-pro", "gemini-2.5-flash"], keyUrl: "https://ai.google.dev", builtin: true },
];

/** Fresh deep copies of the built-ins (for initial settings). */
export function defaultProviders(): ProviderEntry[] {
  return BUILTIN_PROVIDERS.map((p) => ({ ...p, models: [...p.models] }));
}

/** Keep stored providers (preserving user edits + keys), but ensure every built-in exists. */
export function mergeProviders(stored: ProviderEntry[]): ProviderEntry[] {
  const result = [...stored];
  for (const b of BUILTIN_PROVIDERS) {
    if (!result.some((p) => p.id === b.id)) result.push({ ...b, models: [...b.models] });
  }
  return result;
}

export interface ModelOption {
  provider: ProviderEntry;
  model: string;
}

/** All selectable models from providers that have an API key configured. */
export function buildModelOptions(providers: ProviderEntry[]): ModelOption[] {
  const opts: ModelOption[] = [];
  for (const p of providers) {
    if (!p.apiKey) continue;
    for (const m of p.models) opts.push({ provider: p, model: m });
  }
  return opts;
}

let customCounter = 0;
export function newCustomProvider(): ProviderEntry {
  customCounter += 1;
  return {
    id: `custom-${Date.now()}-${customCounter}`,
    label: `Custom ${customCounter}`,
    adapter: "openai-compatible",
    baseURL: "",
    apiKey: "",
    models: [],
    keyUrl: "",
    builtin: false,
  };
}
