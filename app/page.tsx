// app/page.tsx
"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Editor } from "@/components/Editor";
import { SuggestionCard } from "@/components/SuggestionCard";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ModelSelect } from "@/components/ModelSelect";
import { useSettings } from "@/hooks/useSettings";
import { usePolish } from "@/hooks/usePolish";
import { pinSpans } from "@/lib/providers/shared/match";
import { applyAccept } from "@/lib/providers/shared/offsets";
import { buildModelOptions, PROVIDER_MODELS, getPreset } from "@/lib/providers/shared/presets";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";

export default function Home() {
  const { settings, update } = useSettings();
  const { status, result, error, polish, reset } = usePolish();

  const [text, setText] = useState("");
  const [polishedText, setPolishedText] = useState("");
  const [suggestions, setSuggestions] = useState<PinnedCorrection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    const options = buildModelOptions(settings.keys);
    if (
      settings.provider !== "custom" &&
      settings.keys[settings.provider] &&
      PROVIDER_MODELS[settings.provider].includes(settings.model)
    ) {
      return { provider: settings.provider, model: settings.model, options };
    }
    if (settings.provider === "custom" && settings.keys.custom && settings.model) {
      return { provider: "custom" as const, model: settings.model, options };
    }
    if (options.length) return { provider: options[0].provider, model: options[0].model, options };
    return { provider: settings.provider, model: settings.model, options };
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
    const apiKey = settings.keys[effective.provider];
    const baseURL =
      effective.provider === "custom" ? settings.customBaseURL : getPreset(effective.provider).baseURL;
    await polish(text, {
      presetId: effective.provider,
      config: {
        apiKey,
        model: effective.model,
        baseURL: baseURL || undefined,
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
        return newSugs;
      });
      setActiveId(null);
    },
    [text],
  );

  const handleReject = useCallback((id: string) => {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, state: "rejected" as const } : s)));
    setActiveId(null);
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
  }, [text]);

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

  return (
    <>
      <header className="gp-topbar">
        <div className="gp-logo">
          <span className="dot">Aa</span> Grammar Polisher
        </div>
        <div className="gp-spacer" />
        <SettingsPanel settings={settings} update={update} />
      </header>

      <main className="gp-wrap">
        <div className="gp-card">
          <Editor
            text={text}
            onChange={setText}
            suggestions={suggestions}
            readOnly={inReview || busy}
            activeId={activeId}
            onPick={setActiveId}
          />
          <div className="gp-toolbar">
            <span className="gp-count">{text.length} / 5,000</span>
            <div className="gp-acts">
              <button
                className="gp-icon-btn"
                title={copied ? "Copied!" : "Copy text"}
                disabled={!text}
                onClick={copyResult}
              >
                {copied ? "✓" : "📋"}
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
            keys={settings.keys}
            provider={effective.provider}
            model={effective.model}
            onChange={(p, m) => update({ provider: p, model: m })}
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
              disabled={busy || !settings.keys[effective.provider] || !text}
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
          <SuggestionCard suggestion={active} onAccept={handleAccept} onReject={handleReject} />
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
