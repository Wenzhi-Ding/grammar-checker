// lib/tasks/format.ts
import type { PolishTask } from "./types";
import type { Locale } from "@/lib/i18n";

/** First line-ish snippet of the task's source text, for the list item title. */
export function taskSnippet(text: string, max = 40): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}…`;
}

const REL_TIME = {
  en: { justNow: "just now", minAgo: (m: number) => `${m} min ago`, hrAgo: (h: number) => `${h} hr ago` },
  zh: { justNow: "刚刚", minAgo: (m: number) => `${m} 分钟前`, hrAgo: (h: number) => `${h} 小时前` },
} as const;

export function formatRelTime(ts: number, now: number, lang: Locale = "en"): string {
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60_000);
  const t = REL_TIME[lang];
  if (m < 1) return t.justNow;
  if (m < 60) return t.minAgo(m);
  const h = Math.floor(m / 60);
  if (h < 24) return t.hrAgo(h);
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

const STATUS_LABELS = {
  en: {
    running: "Running",
    doneUnread: "Unread",
    doneRead: "Done",
    error: "Failed",
    interrupted: "Interrupted",
  },
  zh: {
    running: "进行中",
    doneUnread: "未读",
    doneRead: "已完成",
    error: "失败",
    interrupted: "已中断",
  },
} as const;

export function taskStatusLabel(
  task: Pick<PolishTask, "status" | "unread">,
  lang: Locale = "en",
): string {
  const l = STATUS_LABELS[lang];
  switch (task.status) {
    case "running":
      return l.running;
    case "done":
      return task.unread ? l.doneUnread : l.doneRead;
    case "error":
      return l.error;
    case "interrupted":
      return l.interrupted;
  }
}
