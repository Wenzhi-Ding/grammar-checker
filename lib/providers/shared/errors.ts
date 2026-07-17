// lib/providers/shared/errors.ts
import { PolishParseError } from "./parse";

export type PolishErrorKind = "no-key" | "auth" | "network" | "schema" | "rate-limit" | "timeout" | "empty";
export interface PolishError {
  kind: PolishErrorKind;
  message: string;
  retryable: boolean;
}

const SCHEMA_MESSAGE =
  "格式解析失败：模型返回的内容无法解析为结构化结果。使用同一模型重试，或更换更强的模型，通常可以解决此问题。";

export function toPolishError(err: unknown): PolishError {
  const e = err as Error & { status?: number; kind?: string };
  if (e?.status === 401 || e?.status === 403) return { kind: "auth", message: "API Key 无效或无权限", retryable: false };
  if (e?.status === 429) return { kind: "rate-limit", message: "请求过于频繁，稍后重试", retryable: true };
  // e.kind === "schema" is set by the proxy route when the parse failed server-side.
  if (err instanceof PolishParseError || err instanceof SyntaxError || e?.kind === "schema") {
    return { kind: "schema", message: SCHEMA_MESSAGE, retryable: true };
  }
  if (err instanceof TypeError) return { kind: "network", message: "网络错误，无法连接（已尝试代理兜底）", retryable: true };
  // HTTP failure: adapters/proxy embed the upstream status and a body excerpt
  // in the message — surface it verbatim so the user sees the provider's detail.
  if (typeof e?.status === "number") {
    return { kind: "network", message: `模型请求失败（HTTP ${e.status}）：${e.message}`, retryable: true };
  }
  return { kind: "network", message: e?.message ?? "未知错误", retryable: true };
}
