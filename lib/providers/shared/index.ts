import type { Provider } from "./schema";
import { getPreset, type ProviderPreset } from "./presets";
import { createOpenAICompatibleProvider } from "../openai-compatible/adapter";
import { createGeminiProvider } from "../gemini/adapter";

export function getProvider(presetId: ProviderPreset["id"]): Provider {
  const preset = getPreset(presetId);
  if (preset.adapter === "gemini") return createGeminiProvider();
  return createOpenAICompatibleProvider({ id: preset.id });
}

export { PRESETS, getPreset } from "./presets";
export type { ProviderPreset, AdapterKind } from "./presets";
export * from "./schema";
