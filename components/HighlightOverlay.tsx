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

const TYPE_COLOR: Record<CorrectionType, string> = {
  grammar: "red",
  spelling: "red",
  punctuation: "red",
  style: "blue",
  "word-choice": "blue",
  clarity: "purple",
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
    const color = TYPE_COLOR[m.type];
    const weight = m.severity === "major" ? 3 : 2;
    nodes.push(
      <mark
        key={m.id}
        data-id={m.id}
        className="cursor-pointer rounded-sm pointer-events-auto"
        style={{
          textDecoration: "underline",
          textDecorationColor: color,
          textDecorationThickness: weight,
          textUnderlineOffset: 3,
          backgroundColor: activeId === m.id ? "rgba(255,235,59,0.35)" : "transparent",
        }}
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
    <div className="whitespace-pre-wrap break-words" onClick={() => onPick(null)}>
      {nodes}
    </div>
  );
}
