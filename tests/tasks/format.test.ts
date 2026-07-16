// tests/tasks/format.test.ts
import { describe, it, expect } from "vitest";
import { taskSnippet, formatRelTime, taskStatusLabel } from "@/lib/tasks/format";

describe("taskSnippet", () => {
  it("collapses whitespace and trims", () => {
    expect(taskSnippet("  hello\n\nworld  ")).toBe("hello world");
  });

  it("truncates beyond 40 chars with an ellipsis", () => {
    const out = taskSnippet("a".repeat(50));
    expect(out).toBe(`${"a".repeat(40)}…`);
  });

  it("keeps short text intact", () => {
    expect(taskSnippet("short")).toBe("short");
  });
});

describe("formatRelTime", () => {
  const now = Date.parse("2026-07-16T12:00:00");

  it("just now under a minute", () => {
    expect(formatRelTime(now - 30_000, now)).toBe("刚刚");
  });

  it("minutes under an hour", () => {
    expect(formatRelTime(now - 5 * 60_000, now)).toBe("5 分钟前");
  });

  it("hours under a day", () => {
    expect(formatRelTime(now - 3 * 3_600_000, now)).toBe("3 小时前");
  });

  it("M-D beyond a day", () => {
    const ts = Date.parse("2026-07-10T08:00:00");
    expect(formatRelTime(ts, now)).toBe("7-10");
  });
});

describe("taskStatusLabel", () => {
  it("maps statuses, with unread done shown as 未读", () => {
    expect(taskStatusLabel({ status: "running", unread: false })).toBe("进行中");
    expect(taskStatusLabel({ status: "done", unread: true })).toBe("未读");
    expect(taskStatusLabel({ status: "done", unread: false })).toBe("已完成");
    expect(taskStatusLabel({ status: "error", unread: false })).toBe("失败");
    expect(taskStatusLabel({ status: "interrupted", unread: false })).toBe("已中断");
  });
});
