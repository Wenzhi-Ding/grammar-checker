import type { Provider, ProviderConfig, PolishResult } from "../shared/schema";
import { detect } from "../shared/lang";
import { assembleSystem, assembleUser, CORRECTION_TYPES } from "../shared/prompt";
import { parsePolishResult } from "../shared/parse";
import { callStreamWithFallback, toHttpError } from "../shared/http";
import { iterateSSE } from "../shared/sse";
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

export interface StreamRequest {
  url: string;
  init: RequestInit;
}

interface GeminiStreamChunk {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { candidatesTokenCount?: number };
}

function buildBody(text: string, config: ProviderConfig): string {
  const lang = config.language && config.language !== "auto" ? config.language : detect(text);
  const framing = lang === "zh" ? CHINESE_FRAMING : ENGLISH_FRAMING;
  return JSON.stringify({
    systemInstruction: { parts: [{ text: assembleSystem(framing, config.reasonLanguage, config.customInstructions) }] },
    contents: [{ role: "user", parts: [{ text: assembleUser(text) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.2,
    },
  });
}

/** Streaming request shared by the browser direct call and the /api/polish proxy route. */
export function buildStreamRequest(text: string, config: ProviderConfig): StreamRequest {
  const model = config.model || "gemini-3.5-flash";
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildBody(text, config),
    },
  };
}

async function readGeminiStream(res: Response, onToken: (approxTokens: number) => void): Promise<PolishResult> {
  if (!res.body) throw new Error("response has no body");
  let content = "";
  let approx = 0;
  let usageTokens: number | null = null;
  for await (const payload of iterateSSE(res.body)) {
    let chunk: GeminiStreamChunk;
    try {
      chunk = JSON.parse(payload) as GeminiStreamChunk;
    } catch {
      continue; // malformed frame — skip, keep consuming
    }
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) content += p.text ?? "";
    if (parts.length > 0) {
      approx = Math.max(1, Math.ceil(content.length / 4));
      onToken(approx);
    }
    const usage = chunk.usageMetadata?.candidatesTokenCount;
    if (typeof usage === "number") usageTokens = usage;
  }
  if (usageTokens !== null) onToken(Math.max(approx, usageTokens));
  return parsePolishResult(content);
}

export function createGeminiProvider({ fetchImpl }: AdapterOpts = {}): Provider {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  return {
    id: "gemini",
    async polish(text: string, config: ProviderConfig): Promise<PolishResult> {
      const model = config.model || "gemini-3.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildBody(text, config),
      });
      if (!res.ok) throw await toHttpError("gemini", res);
      const data = await res.json();
      const content: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return parsePolishResult(content);
    },

    async polishStream(text, config, onToken, signal) {
      const { url, init } = buildStreamRequest(text, config);
      const res = await callStreamWithFallback(
        () => fetchFn(url, { ...init, signal }),
        { proxyBody: { providerId: "gemini", adapter: "gemini", payload: { text, config } }, signal },
        (u, i) => fetchFn(u, i),
      );
      if (!res.ok) throw await toHttpError("gemini", res);
      return readGeminiStream(res, onToken);
    },
  };
}
