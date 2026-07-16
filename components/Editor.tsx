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

  // Bidirectional scroll sync (textarea <-> overlay).
  // In review mode the overlay is the interactive layer (scrollable + marks clickable);
  // in edit mode the textarea is. Either way, keep them aligned.
  useEffect(() => {
    const ta = taRef.current;
    const ov = overlayRef.current;
    if (!ta || !ov) return;
    let syncing = false;
    const sync = (from: HTMLElement, to: HTMLElement) => {
      if (syncing || from.scrollTop === to.scrollTop) return;
      syncing = true;
      to.scrollTop = from.scrollTop;
      syncing = false;
    };
    const onTa = () => sync(ta, ov);
    const onOv = () => sync(ov, ta);
    ta.addEventListener("scroll", onTa, { passive: true });
    ov.addEventListener("scroll", onOv, { passive: true });
    return () => {
      ta.removeEventListener("scroll", onTa);
      ov.removeEventListener("scroll", onOv);
    };
  }, []);

  return (
    <div className="gp-editor-wrap">
      <div
        ref={overlayRef}
        className="gp-overlay"
        style={{ pointerEvents: readOnly ? "auto" : "none" }}
        aria-hidden
      >
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
