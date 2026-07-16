// lib/tasks/store.ts
import type { PolishTask } from "./types";

export const MAX_TASKS = 50;
export const TASKS_STORAGE_KEY = "grammar-polisher.tasks.v1";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function enqueueTask(tasks: PolishTask[], task: PolishTask): PolishTask[] {
  return [task, ...tasks].slice(0, MAX_TASKS);
}

export function updateTask(tasks: PolishTask[], id: string, patch: Partial<PolishTask>): PolishTask[] {
  return tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

export function removeTask(tasks: PolishTask[], id: string): PolishTask[] {
  return tasks.filter((t) => t.id !== id);
}

/** After a reload, any task still marked running is dead (its fetch died with the page). */
export function rehydrateTasks(tasks: PolishTask[]): PolishTask[] {
  return tasks.map((t) => (t.status === "running" ? { ...t, status: "interrupted" as const } : t));
}

export function loadTasks(storage: StorageLike): PolishTask[] {
  try {
    const raw = storage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return rehydrateTasks(parsed as PolishTask[]);
  } catch {
    return [];
  }
}

/** Persist; on quota errors evict the oldest until it fits (or give up silently). */
export function saveTasks(storage: StorageLike, tasks: PolishTask[]): void {
  let current = tasks;
  for (;;) {
    try {
      storage.setItem(TASKS_STORAGE_KEY, JSON.stringify(current));
      return;
    } catch {
      if (current.length === 0) return;
      current = current.slice(0, -1);
    }
  }
}
