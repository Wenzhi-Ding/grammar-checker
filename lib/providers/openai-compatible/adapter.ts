import type { Provider, ProviderConfig, PolishResult } from "../shared/schema";
import { detect } from "../shared/lang";
import { assembleSystem, assembleUser } from "../shared/prompt";
import { parsePolishResult } from "../shared/parse";
import { ENGLISH_FRAMING } from "./prompt/en";
import { CHINESE_FRAMING } from "./prompt/zh";

interface AdapterOpts {
  id: string;
  fetchImpl?: typeof fetch;
}

export function createOpenAICompatibleProvider({ id, fetchImpl }: AdapterOpts): Provider {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  return {
    id,
    async polish(text: string, config: ProviderConfig): Promise<PolishResult> {
      const lang = config.language && config.language !== "auto" ? config.language : detect(text);
      const framing = lang === "zh" ? CHINESE_FRAMING : ENGLISH_FRAMING;
      const baseURL = (config.baseURL ?? "").replace(/\/$/, "");
      if (!baseURL) {
        throw new Error("baseURL is required for openai-compatible providers");
      }

      const messages = [
        { role: "system", content: assembleSystem(framing) },
        { role: "user", content: assembleUser(text) },
      ];

      const res = await fetchFn(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        const err = new Error(`provider ${id} returned ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? "";
      return parsePolishResult(content);
    },
  };
}
