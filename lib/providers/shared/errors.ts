// lib/providers/shared/errors.ts
import { PolishParseError } from "./parse";
import type { Locale } from "@/lib/i18n";

export type PolishErrorKind = "no-key" | "auth" | "network" | "schema" | "rate-limit" | "timeout" | "empty";
export interface PolishError {
  kind: PolishErrorKind;
  message: string;
  retryable: boolean;
}

const MESSAGES = {
  en: {
    noKey: "Please add your API key in Settings first.",
    auth: "API key is invalid or lacks permission.",
    rateLimit: "Rate limited — please retry in a moment.",
    schema:
      "Could not parse the model's response as structured output. Re-trying with the same model, or switching to a stronger one, usually fixes this.",
    network: "Network error — could not connect (proxy fallback was already attempted).",
    httpFail: (status: number, msg: string) => `Model request failed (HTTP ${status}): ${msg}`,
    unknown: "Unknown error",
  },
  zh: {
    noKey: "请先在设置里填写 API Key",
    auth: "API Key 无效或无权限",
    rateLimit: "请求过于频繁，稍后重试",
    schema:
      "格式解析失败：模型返回的内容无法解析为结构化结果。使用同一模型重试，或更换更强的模型，通常可以解决此问题。",
    network: "网络错误，无法连接（已尝试代理兜底）",
    httpFail: (status: number, msg: string) => `模型请求失败（HTTP ${status}）：${msg}`,
    unknown: "未知错误",
  },
} as const;

export function noKeyError(lang: Locale = "en"): PolishError {
  return { kind: "no-key", message: MESSAGES[lang].noKey, retryable: false };
}

export function toPolishError(err: unknown, lang: Locale = "en"): PolishError {
  const t = MESSAGES[lang];
  const e = err as Error & { status?: number; kind?: string };
  if (e?.status === 401 || e?.status === 403) return { kind: "auth", message: t.auth, retryable: false };
  if (e?.status === 429) return { kind: "rate-limit", message: t.rateLimit, retryable: true };
  // e.kind === "schema" is set by the proxy route when the parse failed server-side.
  if (err instanceof PolishParseError || err instanceof SyntaxError || e?.kind === "schema") {
    return { kind: "schema", message: t.schema, retryable: true };
  }
  if (err instanceof TypeError) return { kind: "network", message: t.network, retryable: true };
  // HTTP failure: adapters/proxy embed the upstream status and a body excerpt
  // in the message — surface it verbatim so the user sees the provider's detail.
  if (typeof e?.status === "number") {
    return { kind: "network", message: t.httpFail(e.status, e.message), retryable: true };
  }
  return { kind: "network", message: e?.message ?? t.unknown, retryable: true };
}
