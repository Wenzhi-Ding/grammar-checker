// lib/providers/shared/match.ts
import { diff_match_patch } from "diff-match-patch";
import type { Correction, PinnedCorrection } from "./schema";

const dmp = new diff_match_patch();

export const MATCH_THRESHOLD = 0.5;
export const MATCH_DISTANCE = 1000;

let idCounter = 0;
const nextId = () => `c${++idCounter}`;

function pinOne(text: string, original: string, cursor: number): { start: number; end: number; tier: 1 | 2 | 3 } {
  // Tier 1: exact indexOf from cursor
  const exact = text.indexOf(original, cursor);
  if (exact >= 0) {
    return { start: exact, end: exact + original.length, tier: 1 };
  }
  // Tier 2/3 stubbed for later tasks; for now return unmatched.
  return { start: -1, end: -1, tier: 3 };
}

export function pinSpans(text: string, corrections: Correction[]): PinnedCorrection[] {
  let cursor = 0;
  return corrections.map((correction) => {
    const { start, end, tier } = pinOne(text, correction.original, cursor);
    if (tier === 1) cursor = end;
    return { ...correction, id: nextId(), start, end, matchTier: tier, state: "pending" as const };
  });
}
