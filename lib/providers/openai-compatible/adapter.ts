import type { Provider, ProviderConfig, PolishResult } from "../shared/schema";
import { detect } from "../shared/lang";
import { assembleSystem, assembleUser } from "../shared/prompt";
import { parsePolishResult } from "../shared/parse";
import { callStreamWithFallback } from "../shared/http";
import { iterateSSE } from "../shared/sse";
import { ENGLISH_FRAMING } from "./prompt/en";
import { CHINESE_FRAMING } from "./prompt/zh";

interface AdapterOpts {
  id: string;
  fetchImpl?: typeof fetch;
}

export interface StreamRequest {
  url: string;
  init: RequestInit;
}

interface ChatStreamChunk {
  choices?: { delta?: { content?: string } }[];
  usage?: { completion_tokens?: number };
}

function buildChatRequest(text: string, config: ProviderConfig, stream: boolean): StreamRequest {
  const lang = config.language && config.language !== "auto" ? config.language : detect(text);
  const framing = lang === "zh" ? CHINESE_FRAMING : ENGLISH_FRAMING;
  const baseURL = (config.baseURL ?? "").replace(/\/$/, "");
  if (!baseURL) {
    throw new Error("baseURL is required for openai-compatible providers");
  }
  return {
    url: `${baseURL}/chat/completions`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: assembleSystem(framing, config.reasonLanguage, config.customInstructions) },
          { role: "user", content: assembleUser(text) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
      }),
    },
  };
}

/** Streaming request shared by the browser direct call and the /api/polish proxy route. */
export function buildStreamRequest(text: string, config: ProviderConfig): StreamRequest {
  return buildChatRequest(text, config, true);
}

async function readChatStream(res: Response, onToken: (approxTokens: number) => void): Promise<PolishResult> {
  if (!res.body) throw new Error("response has no body");
  let content = "";
  let approx = 0;
  let usageTokens: number | null = null;
  for await (const payload of iterateSSE(res.body)) {
    if (payload === "[DONE]") break;
    let chunk: ChatStreamChunk;
    try {
      chunk = JSON.parse(payload) as ChatStreamChunk;
    } catch {
      continue; // malformed frame — skip, keep consuming
    }
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta) {
      content += delta;
      approx += 1;
      onToken(approx);
    }
    const usage = chunk.usage?.completion_tokens;
    if (typeof usage === "number") usageTokens = usage;
  }
  if (usageTokens !== null) onToken(usageTokens);
  try {
    return parsePolishResult(content);
  } catch (err) {
    // Truncated/garbled stream (e.g. connection dropped mid-JSON): surface an
    // empty result rather than throwing away the whole polish — consistent
    // with the matcher's drop-with-warn policy for unpinnable corrections.
    console.warn("openai-compatible: failed to parse streamed content", err);
    return { corrections: [] };
  }
}

export function createOpenAICompatibleProvider({ id, fetchImpl }: AdapterOpts): Provider {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  return {
    id,
    async polish(text: string, config: ProviderConfig): Promise<PolishResult> {
      const { url, init } = buildChatRequest(text, config, false);
      const res = await fetchFn(url, init);
      if (!res.ok) {
        const err = new Error(`provider ${id} returned ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? "";
      return parsePolishResult(content);
    },

    async polishStream(text, config, onToken, signal) {
      const { url, init } = buildStreamRequest(text, config);
      const res = await callStreamWithFallback(
        () => fetchFn(url, { ...init, signal }),
        { proxyBody: { providerId: id, adapter: "openai-compatible", payload: { text, config } } },
        (u, i) => fetchFn(u, i),
      );
      if (!res.ok) {
        const err = new Error(`provider ${id} returned ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return readChatStream(res, onToken);
    },
  };
}
