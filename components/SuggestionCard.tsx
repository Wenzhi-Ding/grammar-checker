// components/SuggestionCard.tsx
"use client";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";

interface CardProps {
  suggestion: PinnedCorrection;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export function SuggestionCard({ suggestion, onAccept, onReject }: CardProps) {
  const { original, suggestion: repl, type, reason, severity, id } = suggestion;
  return (
    <div className="gp-suggest">
      <div className="head">
        <span className="gp-badge gp-badge-type">{type}</span>
        {severity && severity !== "info" && (
          <span className={`gp-badge ${severity === "major" ? "gp-badge-major" : "gp-badge-minor"}`}>{severity}</span>
        )}
      </div>
      <div className="gp-diff">
        <span className="old">{original}</span>
        {repl && (
          <>
            {"  →  "}
            <span className="new">{repl}</span>
          </>
        )}
      </div>
      <p className="gp-reason">{reason}</p>
      <div className="foot">
        <button className="gp-btn" onClick={() => onReject(id)}>
          Reject
        </button>
        <button className="gp-btn gp-btn-primary" onClick={() => onAccept(id)}>
          Accept
        </button>
      </div>
    </div>
  );
}
