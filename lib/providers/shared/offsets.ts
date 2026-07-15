// lib/providers/shared/offsets.ts
import type { PinnedCorrection } from "./schema";

export function applyAccept(
  text: string,
  suggestions: PinnedCorrection[],
  id: string,
  replacementOverride?: string,
): { text: string; suggestions: PinnedCorrection[] } {
  const target = suggestions.find((s) => s.id === id);
  if (!target) return { text, suggestions };

  const replacement = replacementOverride ?? target.suggestion;
  const delta = replacement.length - (target.end - target.start);
  const newText = text.slice(0, target.start) + replacement + text.slice(target.end);

  const newSugs = suggestions.map((s) => {
    if (s.id === id) return { ...s, state: "accepted" as const };
    if (s.start >= target.end) return { ...s, start: s.start + delta, end: s.end + delta };
    return s;
  });

  return { text: newText, suggestions: newSugs };
}
