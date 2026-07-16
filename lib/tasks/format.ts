// lib/tasks/format.ts
import type { PolishTask } from "./types";

/** First line-ish snippet of the task's source text, for the list item title. */
export function taskSnippet(text: string, max = 40): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}…`;
}

export function formatRelTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

export function taskStatusLabel(task: Pick<PolishTask, "status" | "unread">): string {
  switch (task.status) {
    case "running":
      return "进行中";
    case "done":
      return task.unread ? "未读" : "已完成";
    case "error":
      return "失败";
    case "interrupted":
      return "已中断";
  }
}
