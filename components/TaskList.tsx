// components/TaskList.tsx
"use client";
import type { PolishTask } from "@/lib/tasks/types";
import { formatRelTime, taskSnippet, taskStatusLabel } from "@/lib/tasks/format";

interface TaskListProps {
  tasks: PolishTask[];
  focusedId: string | null;
  onPick: (id: string) => void;
  onRemove: (id: string) => void;
}

export function TaskList({ tasks, focusedId, onPick, onRemove }: TaskListProps) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamps must be computed per render; the list re-renders on every task update, so "now" staleness is bounded
  const now = Date.now();
  return (
    <aside className="gp-tasks">
      <div className="gp-tasks-title">任务</div>
      {tasks.length === 0 && <div className="gp-tasks-empty">暂无任务</div>}
      <ul className="gp-tasks-list">
        {tasks.map((t) => {
          const cls = [
            "gp-task",
            t.id === focusedId ? "gp-task-focused" : "",
            t.status === "done" && t.unread ? "gp-task-unread" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={t.id}>
              <button
                type="button"
                className={cls}
                onClick={() => onPick(t.id)}
                aria-current={t.id === focusedId ? "true" : undefined}
              >
                <span className="gp-task-top">
                  <span className="gp-task-snippet">{taskSnippet(t.text)}</span>
                  {t.status === "done" && t.unread && <span className="gp-task-dot" />}
                </span>
                <span className="gp-task-meta">
                  <span className={`gp-task-status gp-task-status-${t.status}`}>
                    {t.status === "running" ? `进行中 ≈${t.approxTokens} tok` : taskStatusLabel(t)}
                  </span>
                  <span className="gp-task-model">{t.model}</span>
                  <span className="gp-task-time">{formatRelTime(t.createdAt, now)}</span>
                </span>
              </button>
              <button
                type="button"
                className="gp-task-remove"
                title="删除"
                aria-label="删除"
                onClick={() => onRemove(t.id)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
