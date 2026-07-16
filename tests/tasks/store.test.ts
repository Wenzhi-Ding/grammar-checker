// tests/tasks/store.test.ts
import { describe, it, expect } from "vitest";
import {
  MAX_TASKS,
  TASKS_STORAGE_KEY,
  enqueueTask,
  updateTask,
  removeTask,
  rehydrateTasks,
  loadTasks,
  saveTasks,
  type StorageLike,
} from "@/lib/tasks/store";
import type { PolishTask } from "@/lib/tasks/types";

function makeTask(id: string, over: Partial<PolishTask> = {}): PolishTask {
  return {
    id,
    text: `text-${id}`,
    createdAt: Number(id) || 0,
    providerId: "deepseek",
    model: "deepseek-v4-pro",
    status: "running",
    approxTokens: 0,
    unread: false,
    ...over,
  };
}

function memoryStorage(): StorageLike & { dump(): PolishTask[] } {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    dump: () => JSON.parse(map.get(TASKS_STORAGE_KEY) ?? "[]") as PolishTask[],
  };
}

describe("enqueueTask", () => {
  it("prepends the new task at the head", () => {
    const next = enqueueTask([makeTask("1")], makeTask("2"));
    expect(next.map((t) => t.id)).toEqual(["2", "1"]);
  });

  it("evicts the oldest beyond MAX_TASKS", () => {
    let tasks: PolishTask[] = [];
    for (let i = 1; i <= MAX_TASKS + 3; i++) tasks = enqueueTask(tasks, makeTask(String(i)));
    expect(tasks).toHaveLength(MAX_TASKS);
    expect(tasks[0].id).toBe(String(MAX_TASKS + 3));
    expect(tasks.some((t) => t.id === "1")).toBe(false);
  });
});

describe("updateTask / removeTask", () => {
  it("patches only the matching task", () => {
    const next = updateTask([makeTask("1"), makeTask("2")], "2", { approxTokens: 9 });
    expect(next[1].approxTokens).toBe(9);
    expect(next[0].approxTokens).toBe(0);
  });

  it("removes by id", () => {
    expect(removeTask([makeTask("1"), makeTask("2")], "1").map((t) => t.id)).toEqual(["2"]);
  });
});

describe("rehydrateTasks", () => {
  it("marks running tasks as interrupted, leaves others alone", () => {
    const out = rehydrateTasks([makeTask("1"), makeTask("2", { status: "done" }), makeTask("3", { status: "error" })]);
    expect(out.map((t) => t.status)).toEqual(["interrupted", "done", "error"]);
  });
});

describe("loadTasks", () => {
  it("returns [] on corrupt JSON", () => {
    const storage = memoryStorage();
    storage.setItem(TASKS_STORAGE_KEY, "{{{");
    expect(loadTasks(storage)).toEqual([]);
  });

  it("rehydrates running tasks loaded from storage", () => {
    const storage = memoryStorage();
    storage.setItem(TASKS_STORAGE_KEY, JSON.stringify([makeTask("1")]));
    expect(loadTasks(storage)[0].status).toBe("interrupted");
  });
});

describe("saveTasks", () => {
  it("persists serialized tasks", () => {
    const storage = memoryStorage();
    saveTasks(storage, [makeTask("1")]);
    expect(storage.dump()).toHaveLength(1);
  });

  it("evicts oldest on QuotaExceededError until it fits", () => {
    const map = new Map<string, string>();
    const storage: StorageLike & { dump(): PolishTask[] } = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        if ((JSON.parse(v) as unknown[]).length > 2) {
          const e = new Error("quota");
          e.name = "QuotaExceededError";
          throw e;
        }
        map.set(k, v);
      },
      dump: () => JSON.parse(map.get(TASKS_STORAGE_KEY) ?? "[]") as PolishTask[],
    };
    saveTasks(storage, [makeTask("5"), makeTask("4"), makeTask("3"), makeTask("2"), makeTask("1")]);
    expect(storage.dump().map((t) => t.id)).toEqual(["5", "4"]);
  });

  it("silently gives up when storage always throws", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => saveTasks(storage, [makeTask("1")])).not.toThrow();
  });
});
