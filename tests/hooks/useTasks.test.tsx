// tests/hooks/useTasks.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTasks } from "@/hooks/useTasks";
import { TASKS_STORAGE_KEY } from "@/lib/tasks/store";
import type { PolishTask } from "@/lib/tasks/types";

function storedTask(id: string, over: Partial<PolishTask> = {}): PolishTask {
  return {
    id,
    text: `text-${id}`,
    createdAt: 1,
    providerId: "deepseek",
    model: "m",
    status: "done",
    approxTokens: 3,
    unread: true,
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useTasks", () => {
  it("loads persisted tasks on mount (running -> interrupted)", () => {
    window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify([storedTask("a", { status: "running" })]));
    const { result } = renderHook(() => useTasks());
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].status).toBe("interrupted");
  });

  it("enqueue prepends and persists", () => {
    const { result } = renderHook(() => useTasks());
    let id = "";
    act(() => {
      id = result.current.enqueue("hello", { providerId: "deepseek", model: "m" });
    });
    expect(result.current.tasks[0].id).toBe(id);
    expect(result.current.tasks[0].status).toBe("running");
    const persisted = JSON.parse(window.localStorage.getItem(TASKS_STORAGE_KEY) ?? "[]") as PolishTask[];
    expect(persisted[0]?.id).toBe(id);
  });

  it("approxTokens-only updates stay in memory (no storage write)", () => {
    const { result } = renderHook(() => useTasks());
    let id = "";
    act(() => {
      id = result.current.enqueue("hello", { providerId: "deepseek", model: "m" });
    });
    const spy = vi.spyOn(Storage.prototype, "setItem");
    act(() => {
      result.current.update(id, { approxTokens: 12 });
    });
    expect(result.current.tasks[0].approxTokens).toBe(12);
    expect(spy).not.toHaveBeenCalled();
  });

  it("status-changing updates persist", () => {
    const { result } = renderHook(() => useTasks());
    let id = "";
    act(() => {
      id = result.current.enqueue("hello", { providerId: "deepseek", model: "m" });
    });
    act(() => {
      result.current.update(id, { status: "done", result: { corrections: [] } });
    });
    const persisted = JSON.parse(window.localStorage.getItem(TASKS_STORAGE_KEY) ?? "[]") as PolishTask[];
    expect(persisted[0]?.status).toBe("done");
  });

  it("markRead clears unread and persists", () => {
    window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify([storedTask("a")]));
    const { result } = renderHook(() => useTasks());
    act(() => {
      result.current.markRead("a");
    });
    expect(result.current.tasks[0].unread).toBe(false);
    const persisted = JSON.parse(window.localStorage.getItem(TASKS_STORAGE_KEY) ?? "[]") as PolishTask[];
    expect(persisted[0]?.unread).toBe(false);
  });

  it("remove deletes and persists", () => {
    const { result } = renderHook(() => useTasks());
    let id = "";
    act(() => {
      id = result.current.enqueue("hello", { providerId: "deepseek", model: "m" });
    });
    act(() => {
      result.current.remove(id);
    });
    expect(result.current.tasks).toHaveLength(0);
    expect(JSON.parse(window.localStorage.getItem(TASKS_STORAGE_KEY) ?? "[]")).toHaveLength(0);
  });
});
