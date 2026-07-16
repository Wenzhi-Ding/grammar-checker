// hooks/useTasks.ts
"use client";
import { useCallback, useEffect, useState } from "react";
import { enqueueTask, loadTasks, removeTask, saveTasks, updateTask } from "@/lib/tasks/store";
import type { PolishTask } from "@/lib/tasks/types";

/** Token-count ticks are high-frequency and worthless after a reload — memory only. */
function isTokenOnlyPatch(patch: Partial<PolishTask>): boolean {
  return Object.keys(patch).every((k) => k === "approxTokens");
}

/**
 * Task list state + localStorage persistence.
 * NOTE: saveTasks is invoked inside setState updaters, which React may
 * double-invoke (StrictMode) or invoke-then-discard (concurrent). This is
 * safe ONLY because saveTasks is idempotent — if persistence ever gains
 * non-idempotent behavior (revision counters, cross-tab sync), move
 * persistence out of the updaters first.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<PolishTask[]>([]);

  useEffect(() => {
    // Hydration-safe load (DEFAULTS first paint, storage after mount) — same
    // pattern as useSettings. Also writes the rehydrated list back so
    // interrupted tasks don't get re-marked on every load.
    const loaded = loadTasks(window.localStorage);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks(loaded);
    saveTasks(window.localStorage, loaded);
  }, []);

  const enqueue = useCallback((text: string, meta: { providerId: string; model: string }): string => {
    const task: PolishTask = {
      id: crypto.randomUUID(),
      text,
      createdAt: Date.now(),
      providerId: meta.providerId,
      model: meta.model,
      status: "running",
      approxTokens: 0,
      unread: false,
    };
    setTasks((prev) => {
      const next = enqueueTask(prev, task);
      saveTasks(window.localStorage, next);
      return next;
    });
    return task.id;
  }, []);

  const update = useCallback((id: string, patch: Partial<PolishTask>) => {
    setTasks((prev) => {
      const next = updateTask(prev, id, patch);
      if (!isTokenOnlyPatch(patch)) saveTasks(window.localStorage, next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setTasks((prev) => {
      const next = removeTask(prev, id);
      saveTasks(window.localStorage, next);
      return next;
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setTasks((prev) => {
      const next = updateTask(prev, id, { unread: false });
      saveTasks(window.localStorage, next);
      return next;
    });
  }, []);

  return { tasks, enqueue, update, remove, markRead };
}
