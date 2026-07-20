// hooks/usePolish.ts
"use client";
import { useCallback, useRef } from "react";
import { getProviderFor } from "@/lib/providers/shared";
import { callWithFallback } from "@/lib/providers/shared/http";
import { noKeyError, toPolishError } from "@/lib/providers/shared/errors";
import type { PolishResult, ProviderConfig } from "@/lib/providers/shared/schema";
import type { AdapterKind } from "@/lib/providers/shared/presets";
import type { PolishTask } from "@/lib/tasks/types";
import type { Locale } from "@/lib/i18n";

export type { PolishError, PolishErrorKind } from "@/lib/providers/shared/errors";

export interface RunOptions {
  providerId: string;
  adapter: AdapterKind;
  config: ProviderConfig;
  lang: Locale;
}

type UpdateTask = (id: string, patch: Partial<PolishTask>) => void;

/**
 * Task runner: executes one polish per task id, reporting progress into the
 * task list via `update`. Multiple runs proceed in parallel — each owns an
 * AbortController so removing a running task can cancel its fetch.
 */
export function usePolish(update: UpdateTask) {
  const controllers = useRef(new Map<string, AbortController>());

  const run = useCallback(
    async (taskId: string, text: string, opts: RunOptions): Promise<PolishResult | null> => {
      if (!opts.config.apiKey) {
        update(taskId, { status: "error", error: noKeyError(opts.lang) });
        return null;
      }
      const ac = new AbortController();
      controllers.current.set(taskId, ac);
      try {
        const provider = getProviderFor({ id: opts.providerId, adapter: opts.adapter });
        const onToken = (n: number) => update(taskId, { approxTokens: n });
        let body: PolishResult;
        if (provider.polishStream) {
          // SSE path; proxy fallback on CORS lives inside polishStream.
          body = await provider.polishStream(text, opts.config, onToken, ac.signal);
        } else {
          // Legacy non-stream path (proxy fallback here, as before).
          // NOTE: abort is a no-op on this path (no signal threading) — harmless
          // today since both builtin adapters implement polishStream.
          const direct = async () => {
            const b = await provider.polish(text, opts.config);
            return { ok: true as const, status: 200, body: b };
          };
          const proxyBody = {
            providerId: opts.providerId,
            adapter: opts.adapter,
            payload: { text, config: opts.config },
          };
          ({ body } = await callWithFallback<PolishResult>(direct, { proxyBody }));
        }
        update(taskId, { status: "done", result: body });
        return body;
      } catch (err) {
        if (ac.signal.aborted) return null; // task removed mid-flight — leave no trace
        update(taskId, { status: "error", error: toPolishError(err, opts.lang) });
        return null;
      } finally {
        // Only delete OUR entry — a stale run must not remove a newer run's controller.
        if (controllers.current.get(taskId) === ac) controllers.current.delete(taskId);
      }
    },
    [update],
  );

  const abort = useCallback((taskId: string) => {
    controllers.current.get(taskId)?.abort();
  }, []);

  return { run, abort };
}
