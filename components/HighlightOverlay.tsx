// components/HighlightOverlay.tsx
"use client";
import { Fragment, type ReactNode } from "react";
import type { PinnedCorrection, CorrectionType } from "@/lib/providers/shared/schema";

interface OverlayProps {
  text: string;
  suggestions: PinnedCorrection[];
  activeId: string | null;
  onPick: (id: string | null) => void;
}

const TYPE_CLASS: Record<CorrectionType, string> = {
  grammar: "gp-hl-grammar",
  spelling: "gp-hl-grammar",
  punctuation: "gp-hl-grammar",
  formatting: "gp-hl-formatting",
  style: "gp-hl-style",
  "word-choice": "gp-hl-style",
  clarity: "gp-hl-clarity",
};

export function HighlightOverlay({ text, suggestions, activeId, onPick }: OverlayProps) {
  // Only render pending suggestions; sort by start.
  const marks = suggestions
    .filter((s) => s.state === "pending" && s.start >= 0)
    .sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue; // skip overlaps defensively
    if (m.start > cursor) nodes.push(<Fragment key={`t-${cursor}`}>{text.slice(cursor, m.start)}</Fragment>);
    const cls = [
      "gp-hl pointer-events-auto",
      TYPE_CLASS[m.type],
      m.severity === "major" ? "gp-hl-major" : "",
      activeId === m.id ? "gp-hl-active" : "",
    ].join(" ");
    nodes.push(
      <mark
        key={m.id}
        data-id={m.id}
        className={cls}
        onClick={(e) => {
          e.stopPropagation();
          onPick(activeId === m.id ? null : m.id);
        }}
      >
        {text.slice(m.start, m.end)}
      </mark>,
    );
    cursor = m.end;
  }
  if (cursor < text.length) nodes.push(<Fragment key={`t-end`}>{text.slice(cursor)}</Fragment>);

  return (
    <div onClick={() => onPick(null)}>{nodes}</div>
  );
}
