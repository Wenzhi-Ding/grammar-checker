// lib/providers/shared/presets.ts

export type AdapterKind = "openai-compatible" | "gemini";

export interface ProviderPreset {
  id: "deepseek" | "kimi" | "glm" | "gemini" | "custom";
  label: string;
  adapter: AdapterKind;
  baseURL: string;        // "" for gemini (uses SDK default) and custom (user fills)
  defaultModel: string;
  keyUrl: string;         // where to obtain an API key
}

export const PRESETS: ProviderPreset[] = [
  { id: "deepseek", label: "DeepSeek",  adapter: "openai-compatible", baseURL: "https://api.deepseek.com/v1",          defaultModel: "deepseek-v4-pro",  keyUrl: "https://platform.deepseek.com" },
  { id: "kimi",     label: "Kimi (Moonshot)", adapter: "openai-compatible", baseURL: "https://api.moonshot.cn/v1",       defaultModel: "kimi-k2.7-code",   keyUrl: "https://platform.moonshot.cn" },
  { id: "glm",      label: "GLM (智谱)", adapter: "openai-compatible", baseURL: "https://open.bigmodel.cn/api/paas/v4", defaultModel: "glm-5.2",          keyUrl: "https://open.bigmodel.cn" },
  { id: "gemini",   label: "Gemini",    adapter: "gemini",            baseURL: "",                                      defaultModel: "gemini-3.5-flash", keyUrl: "https://ai.google.dev" },
  { id: "custom",   label: "Custom",    adapter: "openai-compatible", baseURL: "",                                      defaultModel: "",                 keyUrl: "" },
];

export function getPreset(id: ProviderPreset["id"]): ProviderPreset {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown provider preset: ${id}`);
  return p;
}
