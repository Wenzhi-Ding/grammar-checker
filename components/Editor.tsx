// components/Editor.tsx
"use client";
import { useRef, useEffect, type ChangeEvent } from "react";
import { HighlightOverlay } from "./HighlightOverlay";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";

interface EditorProps {
  text: string;
  onChange: (t: string) => void;
  suggestions: PinnedCorrection[];
  readOnly: boolean;
  activeId: string | null;
  onPick: (id: string | null) => void;
}

export function Editor({ text, onChange, suggestions, readOnly, activeId, onPick }: EditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and overlay.
  useEffect(() => {
    const ta = taRef.current;
    const ov = overlayRef.current;
    if (!ta || !ov) return;
    const onScroll = () => {
      ov.scrollTop = ta.scrollTop;
      ov.scrollLeft = ta.scrollLeft;
    };
    ta.addEventListener("scroll", onScroll, { passive: true });
    return () => ta.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="gp-editor-wrap">
      <div ref={overlayRef} className="gp-overlay" aria-hidden>
        <HighlightOverlay text={text} suggestions={suggestions} activeId={activeId} onPick={onPick} />
      </div>
      <textarea
        ref={taRef}
        className="gp-textarea"
        style={readOnly ? { pointerEvents: "none" } : undefined}
        value={text}
        readOnly={readOnly}
        spellCheck={false}
        placeholder="Paste or type your text here…"
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      />
    </div>
  );
}
