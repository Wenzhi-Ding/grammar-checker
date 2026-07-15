// app/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { Editor } from "@/components/Editor";
import { SuggestionCard } from "@/components/SuggestionCard";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useSettings } from "@/hooks/useSettings";
import { usePolish } from "@/hooks/usePolish";
import { pinSpans } from "@/lib/providers/shared/match";
import { applyAccept } from "@/lib/providers/shared/offsets";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";

export default function Home() {
  const { settings, update } = useSettings();
  const { status, result, error, polish, reset } = usePolish();

  const [text, setText] = useState("");
  const [polishedText, setPolishedText] = useState(""); // snapshot at polish time (avoid loading race)
  const [suggestions, setSuggestions] = useState<PinnedCorrection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // When a fresh result arrives, pin it against the text-as-it-was-when-polished.
  // (useEffect, NOT useMemo — setting state in render is an anti-pattern.)
  useEffect(() => {
    if (status === "done" && result) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- result arrives async from usePolish; pin against the snapshot captured at polish time (useMemo would re-pin on every text edit)
      setSuggestions(pinSpans(polishedText, result.corrections));
      setActiveId(null);
    }
    // Deliberately depend on result/status only; re-pinning on every `text` change
    // (e.g. after an accept) would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, status]);

  const onPolish = useCallback(async () => {
    setPolishedText(text); // capture before the (possibly async) request
    await polish(text, {
      presetId: settings.presetId,
      config: {
        apiKey: settings.apiKey,
        model: settings.model,
        baseURL: settings.baseURL || undefined,
        language: settings.language,
      },
    });
  }, [text, settings, polish]);

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
      // ONLY accept pending AND located (start>=0) suggestions.
      // Tier-3 unmatched (start=-1) must be skipped — applyAccept would corrupt text.
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

  // Pending = located + pending (excludes unmatched tier-3).
  const pendingCount = suggestions.filter((s) => s.state === "pending" && s.start >= 0).length;
  const unmatched = suggestions.filter((s) => s.matchTier === 3);
  const active = suggestions.find((s) => s.id === activeId) ?? null;
  const inReview = status === "done";
  const busy = status === "loading";

  const copyResult = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Grammar Polisher</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{settings.presetId}</span>
          <SettingsPanel settings={settings} update={update} />
        </div>
      </header>

      <Editor
        text={text}
        onChange={setText}
        suggestions={suggestions}
        readOnly={inReview || busy}
        activeId={activeId}
        onPick={setActiveId}
      />

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{text.length} chars</span>
        <div className="flex gap-2">
          {inReview ? (
            <>
              <button
                onClick={handleAcceptAll}
                disabled={pendingCount === 0}
                className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-40"
              >
                Accept all ({pendingCount})
              </button>
              <button onClick={copyResult} className="rounded border border-gray-300 px-3 py-1 text-sm">
                {copied ? "Copied!" : "Copy result"}
              </button>
              <button
                onClick={() => {
                  reset();
                  setSuggestions([]);
                }}
                className="rounded border border-gray-300 px-3 py-1 text-sm"
              >
                Clear
              </button>
            </>
          ) : (
            <button
              onClick={onPolish}
              disabled={busy || !settings.apiKey || !text}
              className="rounded bg-blue-600 px-4 py-1 text-sm text-white disabled:opacity-40"
            >
              {busy ? "Polishing…" : "Polish"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
          {error.retryable && (
            <button onClick={onPolish} className="ml-2 underline">
              重试
            </button>
          )}
        </div>
      )}

      {inReview && result && result.corrections.length === 0 && (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          未发现可润色之处。
        </div>
      )}

      {active && <SuggestionCard suggestion={active} onAccept={handleAccept} onReject={handleReject} />}

      {unmatched.length > 0 && (
        <details className="rounded border border-gray-200 p-3 text-sm">
          <summary className="cursor-pointer text-gray-600">{unmatched.length} 条无法定位（仅参考）</summary>
          <ul className="mt-2 space-y-1">
            {unmatched.map((u) => (
              <li key={u.id}>
                <span className="font-mono text-red-500">{u.original}</span>
                {u.suggestion && (
                  <>
                    {" → "}
                    <span className="font-mono text-green-600">{u.suggestion}</span>
                  </>
                )}
                <span className="text-gray-500"> — {u.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
