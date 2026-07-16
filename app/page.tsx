// app/page.tsx
"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Editor } from "@/components/Editor";
import { SuggestionCard } from "@/components/SuggestionCard";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ModelSelect } from "@/components/ModelSelect";
import { CopyIcon } from "@/components/Icons";
import { useSettings } from "@/hooks/useSettings";
import { usePolish } from "@/hooks/usePolish";
import { pinSpans } from "@/lib/providers/shared/match";
import { applyAccept } from "@/lib/providers/shared/offsets";
import { buildModelOptions, type ProviderEntry } from "@/lib/providers/shared/presets";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";

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

export default function Home() {
  const MAX_CHARS = 50000;
  const { settings, update } = useSettings();
  const { status, result, error, polish, reset } = usePolish();

  const [text, setText] = useState("");
  const [polishedText, setPolishedText] = useState("");
  const [suggestions, setSuggestions] = useState<PinnedCorrection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "done" && result) {
      // One-time derivation from async-arriving result — setState in effect is the
      // canonical pattern here; the rule's "derive during render" guidance doesn't apply.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions(pinSpans(polishedText, result.corrections));
      setActiveId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, status]);

  // Resolve the effective provider+model: prefer the user's selection if it has a key
  // and a valid model; otherwise fall back to the first available configured model.
  const effective = useMemo(() => {
    const options = buildModelOptions(settings.providers);
    const cur = settings.providers.find((p) => p.id === settings.selectedProviderId);
    if (cur && cur.apiKey && cur.models.includes(settings.selectedModel)) {
      return { provider: cur, model: settings.selectedModel, options };
    }
    if (options.length) return { provider: options[0].provider, model: options[0].model, options };
    return { provider: (cur ?? settings.providers[0]) as ProviderEntry, model: settings.selectedModel, options };
  }, [settings]);

  const onPolish = useCallback(async () => {
    setPolishedText(text);
    setSuggestions([]);
    setActiveId(null);
    const reasonLanguage: "en" | "zh" =
      settings.reasonLanguage === "auto"
        ? typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("zh")
          ? "zh"
          : "en"
        : settings.reasonLanguage;
    const apiKey = effective.provider.apiKey;
    const baseURL = effective.provider.baseURL || undefined;
    await polish(text, {
      providerId: effective.provider.id,
      adapter: effective.provider.adapter,
      config: {
        apiKey,
        model: effective.model,
        baseURL,
        language: settings.language,
        reasonLanguage,
      },
    });
  }, [text, settings, effective, polish]);

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
      const newSugs = prev.map((s) => (s.id === id ? { ...s, state: "rejected" as const } : s));
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
      // Manual edit invalidates pinned suggestions (offsets go stale); clear them so
      // highlights don't misalign and accepts don't corrupt. User can re-polish.
      if (suggestions.length > 0 || status === "done") {
        setSuggestions([]);
        setActiveId(null);
        reset();
      }
    },
    [suggestions.length, status, reset],
  );

  const handleClear = useCallback(() => {
    setText("");
    setSuggestions([]);
    setActiveId(null);
    reset();
  }, [reset]);

  const copyResult = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  const pendingCount = suggestions.filter((s) => s.state === "pending" && s.start >= 0).length;
  const unmatched = suggestions.filter((s) => s.matchTier === 3);
  const active = suggestions.find((s) => s.id === activeId) ?? null;
  const inReview = status === "done";
  const busy = status === "loading";

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
        <div className="gp-logo">
          <span className="dot">Aa</span> Grammar Checker
        </div>
        <div className="gp-spacer" />
        <SettingsPanel settings={settings} update={update} />
      </header>

      <main
        className={active ? "gp-wrap card-active" : "gp-wrap"}
        style={active ? ({ "--gp-card-height": `${cardHeight}px` } as React.CSSProperties) : undefined}
      >
        <div className="gp-card">
          <Editor
            text={text}
            onChange={handleTextChange}
            suggestions={suggestions}
            readOnly={busy}
            activeId={activeId}
            onPick={setActiveId}
            maxLength={MAX_CHARS}
          />
          <div className="gp-toolbar">
            <span className={text.length > MAX_CHARS ? "gp-count gp-count-over" : "gp-count"}>{text.length} / 50,000</span>
            <div className="gp-acts">
              <button
                className="gp-icon-btn"
                title={copied ? "Copied!" : "Copy text"}
                disabled={!text}
                onClick={copyResult}
              >
                {copied ? "✓" : <CopyIcon />}
              </button>
              <button
                className="gp-icon-btn"
                title="Clear"
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
            {inReview && (
              <button
                className="gp-btn"
                onClick={handleAcceptAll}
                disabled={pendingCount === 0}
              >
                Accept all ({pendingCount})
              </button>
            )}
            <button
              className="gp-btn gp-btn-primary"
              onClick={onPolish}
              disabled={busy || !effective.provider.apiKey || !text || text.length > MAX_CHARS}
            >
              {busy ? "Polishing…" : "Polish"}
            </button>
          </div>
        </div>

        {error && (
          <div className="gp-panel gp-panel-error">
            {error.message}
            {error.retryable && (
              <button onClick={onPolish} style={{ marginLeft: 8, background: "none", border: "none", color: "var(--gp-blue)", cursor: "pointer", textDecoration: "underline" }}>
                重试
              </button>
            )}
          </div>
        )}

        {inReview && result && result.corrections.length === 0 && (
          <div className="gp-panel gp-panel-empty">未发现可润色之处。</div>
        )}

        {active && (
          <div ref={cardRef}>
            <SuggestionCard suggestion={active} onAccept={handleAccept} onReject={handleReject} />
          </div>
        )}

        {unmatched.length > 0 && (
          <details className="gp-panel gp-panel-unmatched">
            <summary>{unmatched.length} 条无法定位（仅参考）</summary>
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
    </>
  );
}
