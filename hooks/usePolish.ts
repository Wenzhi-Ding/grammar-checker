// hooks/usePolish.ts
"use client";
import { useState, useCallback } from "react";
import { getProviderFor } from "@/lib/providers/shared";
import { callWithFallback } from "@/lib/providers/shared/http";
import type { PolishResult, ProviderConfig } from "@/lib/providers/shared/schema";
import type { AdapterKind } from "@/lib/providers/shared/presets";

export type PolishErrorKind = "no-key" | "auth" | "network" | "schema" | "rate-limit" | "timeout" | "empty";
export interface PolishError { kind: PolishErrorKind; message: string; retryable: boolean }
export type PolishStatus = "idle" | "loading" | "done" | "error";

function toPolishError(err: unknown): PolishError {
  const e = err as Error & { status?: number };
  if (e?.status === 401 || e?.status === 403) return { kind: "auth", message: "API Key 无效或无权限", retryable: false };
  if (e?.status === 429) return { kind: "rate-limit", message: "请求过于频繁，稍后重试", retryable: true };
  if (err instanceof TypeError) return { kind: "network", message: "网络错误，无法连接（已尝试代理兜底）", retryable: true };
  if (err instanceof SyntaxError) return { kind: "schema", message: "模型返回格式异常，请重试或换模型", retryable: true };
  return { kind: "network", message: e?.message ?? "未知错误", retryable: true };
}

export function usePolish() {
  const [status, setStatus] = useState<PolishStatus>("idle");
  const [result, setResult] = useState<PolishResult | null>(null);
  const [error, setError] = useState<PolishError | null>(null);

  const polish = useCallback(
    async (
      text: string,
      opts: { providerId: string; adapter: AdapterKind; config: ProviderConfig },
    ) => {
      if (!opts.config.apiKey) {
        setStatus("error");
        setError({ kind: "no-key", message: "请先在设置里填写 API Key", retryable: false });
        return;
      }
      setStatus("loading");
      setError(null);
      try {
        const provider = getProviderFor({ id: opts.providerId, adapter: opts.adapter });
        const direct = async () => {
          const body = await provider.polish(text, opts.config);
          return { ok: true as const, status: 200, body };
        };
        // On TypeError (CORS/network), retry through the stateless /api/polish route.
        const proxyBody = {
          providerId: opts.providerId,
          adapter: opts.adapter,
          payload: { text, config: opts.config },
        };
        const { body } = await callWithFallback<PolishResult>(direct, { proxyBody });
        setResult(body);
        setStatus("done");
      } catch (err) {
        setError(toPolishError(err));
        setStatus("error");
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, polish, reset };
}
