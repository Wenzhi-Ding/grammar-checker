import type { Provider, ProviderConfig, PolishResult } from "../shared/schema";
import { detect } from "../shared/lang";
import { assembleSystem, assembleUser, CORRECTION_TYPES } from "../shared/prompt";
import { parsePolishResult } from "../shared/parse";
import { ENGLISH_FRAMING } from "./prompt/en";
import { CHINESE_FRAMING } from "./prompt/zh";

const responseSchema = {
  type: "object",
  properties: {
    corrections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          suggestion: { type: "string" },
          type: { type: "string", enum: [...CORRECTION_TYPES] },
          reason: { type: "string" },
          severity: { type: "string", enum: ["info", "minor", "major"] },
        },
        required: ["original", "suggestion", "type", "reason"],
        propertyOrdering: ["original", "suggestion", "type", "reason", "severity"],
      },
    },
  },
  required: ["corrections"],
};

interface AdapterOpts {
  fetchImpl?: typeof fetch;
}

export function createGeminiProvider({ fetchImpl }: AdapterOpts = {}): Provider {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  return {
    id: "gemini",
    async polish(text: string, config: ProviderConfig): Promise<PolishResult> {
      const lang = config.language && config.language !== "auto" ? config.language : detect(text);
      const framing = lang === "zh" ? CHINESE_FRAMING : ENGLISH_FRAMING;
      const model = config.model || "gemini-3.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

      const res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: assembleSystem(framing) }] },
          contents: [{ role: "user", parts: [{ text: assembleUser(text) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.2,
          },
        }),
      });

      if (!res.ok) {
        const err = new Error(`gemini returned ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const content: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return parsePolishResult(content);
    },
  };
}
