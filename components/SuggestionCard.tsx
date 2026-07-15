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
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-600">{type}</span>
        {severity && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-600">{severity}</span>
        )}
      </div>
      <div className="mb-2 font-mono text-sm">
        <span className="text-red-500 line-through">{original}</span>
        {repl && (
          <>
            {" → "}
            <span className="text-green-600">{repl}</span>
          </>
        )}
      </div>
      <p className="mb-3 text-sm text-gray-700">{reason}</p>
      <div className="flex gap-2">
        <button
          onClick={() => onAccept(id)}
          className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
        >
          Accept
        </button>
        <button
          onClick={() => onReject(id)}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
