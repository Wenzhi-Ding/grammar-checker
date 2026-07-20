// app/[lang]/Polisher.tsx
// Client component. All interactive state for the polish editor lives here.
// Lifted verbatim from the original app/page.tsx (with the header gaining a
// language switcher). Pure UI/text decisions remain inline ternaries keyed on
// useLocale() — which is now URL-driven.

"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Editor } from "@/components/Editor";
import { SuggestionCard } from "@/components/SuggestionCard";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ModelSelect } from "@/components/ModelSelect";
import { TaskList } from "@/components/TaskList";
import { CopyIcon, GitHubIcon } from "@/components/Icons";
import { useSettings } from "@/hooks/useSettings";
import { useTasks } from "@/hooks/useTasks";
import { usePolish } from "@/hooks/usePolish";
import { useLocale } from "@/hooks/useLocale";
import { pinSpans } from "@/lib/providers/shared/match";
import { applyAccept } from "@/lib/providers/shared/offsets";
import { buildModelOptions, type ProviderEntry } from "@/lib/providers/shared/presets";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";
import { getStrings } from "@/lib/i18n";

function findNextSuggestionId(
  suggestions: PinnedCorrection[],
  currentId: string,
): string | null {
  const current = suggestions.find((s) => s.id === currentId);
  if (!current || current.start < 0) return null;
  const pending = suggestions.filter((s) => s.state === "pending" && s.start >= 0);
  const after = pending
    .filter((s) => s.start > current.start)
    .sort((a, b) => a.start - b.start)[0];
  if (after) return after.id;
  const first = pending.sort((a, b) => a.start - b.start)[0];
  return first?.id ?? null;
}

export function Polisher() {
  const MAX_CHARS = 50000;
  const { settings, update } = useSettings();
  const { tasks, enqueue, update: updateTask, remove: removeTask, markRead } = useTasks();
  const { run, abort } = usePolish(updateTask);
  const locale = useLocale();
  const s = getStrings(locale);

  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<PinnedCorrection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const [tasksOpen, setTasksOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Mirror focus into a ref so async completion callbacks read the latest value.
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    focusedRef.current = focusedTaskId;
  }, [focusedTaskId]);

  const focused = tasks.find((t) => t.id === focusedTaskId) ?? null;

  // Resolve the effective provider+model: prefer the user's selection if it has a key
  // and a valid model; otherwise fall back to the first available configured model.
  const effective = useMemo(() => {
    const options = buildModelOptions(settings.providers);
    const cur = settings.providers.find((p) => p.id === settings.selectedProviderId);
    if (cur && (cur.apiKey || cur.requiresKey === false) && cur.models.includes(settings.selectedModel)) {
      return { provider: cur, model: settings.selectedModel, options };
    }
    if (options.length) return { provider: options[0].provider, model: options[0].model, options };
    return { provider: (cur ?? settings.providers[0]) as ProviderEntry, model: settings.selectedModel, options };
  }, [settings]);

  // Fire a new task for a snapshot. On completion: auto-load if still focused
  // (the user is watching it), otherwise mark unread in the list.
  const startTask = useCallback(
    async (snapshot: string) => {
      const reasonLanguage: "en" | "zh" =
        settings.reasonLanguage === "auto"
          ? typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("zh")
            ? "zh"
            : "en"
          : settings.reasonLanguage;
      const id = enqueue(snapshot, { providerId: effective.provider.id, model: effective.model });
      setFocusedTaskId(id);
      setSuggestions([]);
      setActiveId(null);
      const body = await run(id, snapshot, {
        providerId: effective.provider.id,
        adapter: effective.provider.adapter,
        lang: locale,
        requiresKey: effective.provider.requiresKey,
        config: {
          apiKey: effective.provider.apiKey,
          model: effective.model,
          baseURL: effective.provider.baseURL || undefined,
          language: settings.language,
          reasonLanguage,
          customInstructions: settings.customInstructions,
        },
      });
      if (!body) return;
      if (focusedRef.current === id) {
        // Editor text still equals the snapshot (any edit would have detached focus).
        setSuggestions(pinSpans(snapshot, body.corrections));
        setActiveId(null);
      } else {
        updateTask(id, { unread: true });
      }
    },
    [settings, effective, enqueue, run, updateTask, locale],
  );

  const onPolish = useCallback(() => {
    void startTask(text);
  }, [startTask, text]);

  const handlePickTask = useCallback(
    (id: string) => {
      // Re-clicking the already-focused task is a no-op — reloading its snapshot
      // would wipe suggestions the user already accepted (accepts keep focus).
      if (id === focusedRef.current) return;
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      setFocusedTaskId(id);
      setText(t.text);
      setActiveId(null);
      if (t.status === "done") {
        setSuggestions(pinSpans(t.text, t.result?.corrections ?? []));
        if (t.unread) markRead(id);
      } else {
        setSuggestions([]);
      }
    },
    [tasks, markRead],
  );

  const handleRemoveTask = useCallback(
    (id: string) => {
      abort(id);
      removeTask(id);
      if (focusedRef.current === id) {
        setFocusedTaskId(null);
        setSuggestions([]);
        setActiveId(null);
      }
    },
    [abort, removeTask],
  );

  const handleAccept = useCallback(
    (id: string) => {
      setSuggestions((prev) => {
        const { text: newText, suggestions: newSugs } = applyAccept(text, prev, id);
        setText(newText);
        setActiveId(findNextSuggestionId(newSugs, id));
        return newSugs;
      });
    },
    [text],
  );

  const handleReject = useCallback((id: string) => {
    setSuggestions((prev) => {
      const newSugs = prev.map((x) => (x.id === id ? { ...x, state: "rejected" as const } : x));
      setActiveId(findNextSuggestionId(newSugs, id));
      return newSugs;
    });
  }, []);

  const handleAcceptAll = useCallback(() => {
    setSuggestions((prev) => {
      let t = text;
      let sugs = prev;
      const pending = sugs
        .filter((x) => x.state === "pending" && x.start >= 0)
        .sort((a, b) => a.start - b.start);
      for (const p of pending) {
        const r = applyAccept(t, sugs, p.id);
        t = r.text;
        sugs = r.suggestions;
      }
      setText(t);
      return sugs;
    });
    setActiveId(null);
  }, [text]);

  const handleTextChange = useCallback(
    (t: string) => {
      setText(t);
      // Manual edit invalidates pinned suggestions AND detaches from the focused
      // task (a running task keeps going in the background and lands as unread).
      if (suggestions.length > 0) {
        setSuggestions([]);
        setActiveId(null);
      }
      if (focusedRef.current !== null) setFocusedTaskId(null);
    },
    [suggestions.length],
  );

  const handleClear = useCallback(() => {
    setText("");
    setSuggestions([]);
    setActiveId(null);
    setFocusedTaskId(null);
  }, []);

  const copyResult = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  // Retry = enqueue a NEW task with the failed/interrupted task's snapshot.
  const retryFocused = useCallback(() => {
    if (focused && (focused.status === "error" || focused.status === "interrupted")) {
      void startTask(focused.text);
    }
  }, [focused, startTask]);

  const pendingCount = suggestions.filter((s) => s.state === "pending" && s.start >= 0).length;
  const unmatched = suggestions.filter((s) => s.matchTier === 3);
  const active = suggestions.find((s) => s.id === activeId) ?? null;
  const inReview = focused?.status === "done";

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCardHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  useEffect(() => {
    if (!activeId) return;
    const mark = document.querySelector<HTMLElement>(`[data-id="${activeId}"]`);
    if (mark) {
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeId]);

  return (
    <>
      <header className="gp-topbar">
        <button
          className="gp-icon-btn gp-tasks-toggle"
          title={locale === "zh" ? "任务列表" : "Tasks"}
          onClick={() => setTasksOpen((v) => !v)}
        >
          ☰
        </button>
        <div className="gp-logo">
          <span className="dot">Aa</span> Grammar Checker
        </div>
        <div className="gp-spacer" />
        <a
          className="gp-lang-switch"
          href={s.switchLang.href}
          title={s.switchLang.label}
        >
          {s.switchLang.label}
        </a>
        <SettingsPanel settings={settings} update={update} />
      </header>

      <div className="gp-layout">
        <div className={tasksOpen ? "gp-tasks-wrap open" : "gp-tasks-wrap"}>
          <TaskList
            tasks={tasks}
            focusedId={focusedTaskId}
            onPick={(id) => {
              handlePickTask(id);
              setTasksOpen(false);
            }}
            onRemove={handleRemoveTask}
            lang={locale}
          />
        </div>
        {tasksOpen && <div className="gp-tasks-backdrop" onClick={() => setTasksOpen(false)} />}

        <main
          className={active ? "gp-wrap card-active" : "gp-wrap"}
          style={active ? ({ "--gp-card-height": `${cardHeight}px` } as React.CSSProperties) : undefined}
        >
          <div className="gp-card">
            <Editor
              text={text}
              onChange={handleTextChange}
              suggestions={suggestions}
              activeId={activeId}
              onPick={setActiveId}
              maxLength={MAX_CHARS}
            />
            <div className="gp-toolbar">
              <span className={text.length > MAX_CHARS ? "gp-count gp-count-over" : "gp-count"}>{text.length} / 50,000</span>
              <div className="gp-acts">
                <button
                  className="gp-icon-btn"
                  title={copied ? (locale === "zh" ? "已复制！" : "Copied!") : (locale === "zh" ? "复制" : "Copy text")}
                  disabled={!text}
                  onClick={copyResult}
                >
                  {copied ? "✓" : <CopyIcon />}
                </button>
                <button
                  className="gp-icon-btn"
                  title={locale === "zh" ? "清空" : "Clear"}
                  disabled={!text && suggestions.length === 0}
                  onClick={handleClear}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <div className="gp-actionrow">
            <ModelSelect
              providers={settings.providers}
              providerId={effective.provider.id}
              model={effective.model}
              onChange={(pid, m) => update({ selectedProviderId: pid, selectedModel: m })}
            />
            <div className="gp-actionrow-btns">
              {focused?.status === "running" && (
                <span className="gp-progress">
                  {locale === "zh" ? `润色中… ≈${focused.approxTokens} tokens` : `Polishing… ≈${focused.approxTokens} tokens`}
                </span>
              )}
              {inReview && (
                <button
                  className="gp-btn"
                  onClick={handleAcceptAll}
                  disabled={pendingCount === 0}
                >
                  {locale === "zh" ? `全部接受 (${pendingCount})` : `Accept all (${pendingCount})`}
                </button>
              )}
              <button
                className="gp-btn gp-btn-primary"
                onClick={onPolish}
                disabled={
                  (!effective.provider.apiKey && effective.provider.requiresKey !== false) ||
                  !text ||
                  text.length > MAX_CHARS
                }
              >
                {locale === "zh" ? "润色" : "Polish"}
              </button>
            </div>
          </div>

          {focused?.status === "error" && focused.error && (
            <div className="gp-panel gp-panel-error">
              {focused.error.message}
              {focused.error.retryable && (
                <button onClick={retryFocused} style={{ marginLeft: 8, background: "none", border: "none", color: "var(--gp-blue)", cursor: "pointer", textDecoration: "underline" }}>
                  {locale === "zh" ? "重试" : "Retry"}
                </button>
              )}
            </div>
          )}

          {focused?.status === "interrupted" && (
            <div className="gp-panel gp-panel-empty">
              {locale === "zh" ? "任务已中断（页面刷新或关闭）。" : "Task was interrupted (page refresh or close)."}
              <button onClick={retryFocused} style={{ marginLeft: 8, background: "none", border: "none", color: "var(--gp-blue)", cursor: "pointer", textDecoration: "underline" }}>
                {locale === "zh" ? "重新 polish" : "Re-polish"}
              </button>
            </div>
          )}

          {focused?.status === "done" && focused.result && focused.result.corrections.length === 0 && (
            <div className="gp-panel gp-panel-empty">
              {locale === "zh" ? "未发现可润色之处。" : "Nothing to polish — your text looks good."}
            </div>
          )}

          {active && (
            <div ref={cardRef}>
              <SuggestionCard suggestion={active} onAccept={handleAccept} onReject={handleReject} />
            </div>
          )}

          {unmatched.length > 0 && (
            <details className="gp-panel gp-panel-unmatched">
              <summary>
                {locale === "zh"
                  ? `${unmatched.length} 条无法定位（仅参考）`
                  : `${unmatched.length} suggestion(s) couldn't be located (for reference)`}
              </summary>
              <ul style={{ marginTop: 8, lineHeight: 1.8 }}>
                {unmatched.map((u) => (
                  <li key={u.id}>
                    <span style={{ color: "var(--gp-red-text)" }}>{u.original}</span>
                    {u.suggestion && (
                      <>
                        {" → "}
                        <span style={{ color: "var(--gp-green)" }}>{u.suggestion}</span>
                      </>
                    )}
                    <span style={{ color: "var(--gp-sub)" }}> — {u.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </main>
      </div>

      <footer className="gp-footer">
        <p className="gp-footer-line">{s.footerLine}</p>
        <a
          className="gp-footer-link"
          href="https://github.com/Wenzhi-Ding/grammar-checker"
          target="_blank"
          rel="noopener noreferrer"
        >
          <GitHubIcon size={16} />
          <span>github.com/Wenzhi-Ding/grammar-checker</span>
        </a>
      </footer>
    </>
  );
}
