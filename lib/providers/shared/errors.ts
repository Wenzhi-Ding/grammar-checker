// lib/providers/shared/errors.ts
export type PolishErrorKind = "no-key" | "auth" | "network" | "schema" | "rate-limit" | "timeout" | "empty";
export interface PolishError {
  kind: PolishErrorKind;
  message: string;
  retryable: boolean;
}

export function toPolishError(err: unknown): PolishError {
  const e = err as Error & { status?: number };
  if (e?.status === 401 || e?.status === 403) return { kind: "auth", message: "API Key 无效或无权限", retryable: false };
  if (e?.status === 429) return { kind: "rate-limit", message: "请求过于频繁，稍后重试", retryable: true };
  if (err instanceof TypeError) return { kind: "network", message: "网络错误，无法连接（已尝试代理兜底）", retryable: true };
  if (err instanceof SyntaxError) return { kind: "schema", message: "模型返回格式异常，请重试或换模型", retryable: true };
  return { kind: "network", message: e?.message ?? "未知错误", retryable: true };
}
