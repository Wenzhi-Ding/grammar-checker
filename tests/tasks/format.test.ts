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

  it("English: just now / min / hr", () => {
    expect(formatRelTime(now - 30_000, now)).toBe("just now");
    expect(formatRelTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(formatRelTime(now - 3 * 3_600_000, now)).toBe("3 hr ago");
  });

  it("Chinese: 刚刚 / 分钟前 / 小时前", () => {
    expect(formatRelTime(now - 30_000, now, "zh")).toBe("刚刚");
    expect(formatRelTime(now - 5 * 60_000, now, "zh")).toBe("5 分钟前");
    expect(formatRelTime(now - 3 * 3_600_000, now, "zh")).toBe("3 小时前");
  });

  it("M-D beyond a day (locale-independent)", () => {
    const ts = Date.parse("2026-07-10T08:00:00");
    expect(formatRelTime(ts, now)).toBe("7-10");
    expect(formatRelTime(ts, now, "zh")).toBe("7-10");
  });
});

describe("taskStatusLabel", () => {
  it("English: maps statuses, with unread done shown as Unread", () => {
    expect(taskStatusLabel({ status: "running", unread: false })).toBe("Running");
    expect(taskStatusLabel({ status: "done", unread: true })).toBe("Unread");
    expect(taskStatusLabel({ status: "done", unread: false })).toBe("Done");
    expect(taskStatusLabel({ status: "error", unread: false })).toBe("Failed");
    expect(taskStatusLabel({ status: "interrupted", unread: false })).toBe("Interrupted");
  });

  it("Chinese: 进行中 / 未读 / 已完成 / 失败 / 已中断", () => {
    expect(taskStatusLabel({ status: "running", unread: false }, "zh")).toBe("进行中");
    expect(taskStatusLabel({ status: "done", unread: true }, "zh")).toBe("未读");
    expect(taskStatusLabel({ status: "done", unread: false }, "zh")).toBe("已完成");
    expect(taskStatusLabel({ status: "error", unread: false }, "zh")).toBe("失败");
    expect(taskStatusLabel({ status: "interrupted", unread: false }, "zh")).toBe("已中断");
  });
});
