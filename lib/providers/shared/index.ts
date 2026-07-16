// lib/providers/shared/index.ts
import type { Provider } from "./schema";
import type { AdapterKind } from "./presets";
import { createOpenAICompatibleProvider } from "../openai-compatible/adapter";
import { createGeminiProvider } from "../gemini/adapter";

/** Pick the adapter implementation from a provider entry's adapter kind. */
export function getProviderFor(entry: { id: string; adapter: AdapterKind }): Provider {
  if (entry.adapter === "gemini") return createGeminiProvider();
  return createOpenAICompatibleProvider({ id: entry.id });
}

export {
  BUILTIN_PROVIDERS,
  defaultProviders,
  mergeProviders,
  buildModelOptions,
  newCustomProvider,
} from "./presets";
export type { ProviderEntry, AdapterKind, ModelOption } from "./presets";
export * from "./schema";
