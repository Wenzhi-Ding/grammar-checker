// hooks/usePolish.ts
"use client";
import { useState, useCallback } from "react";
import { getProviderFor } from "@/lib/providers/shared";
import { callWithFallback } from "@/lib/providers/shared/http";
import { toPolishError } from "@/lib/providers/shared/errors";
import type { PolishError } from "@/lib/providers/shared/errors";
import type { PolishResult, ProviderConfig } from "@/lib/providers/shared/schema";
import type { AdapterKind } from "@/lib/providers/shared/presets";

export type { PolishError, PolishErrorKind } from "@/lib/providers/shared/errors";
export type PolishStatus = "idle" | "loading" | "done" | "error";

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
