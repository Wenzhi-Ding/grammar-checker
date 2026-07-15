// lib/providers/shared/match.ts
import { diff_match_patch } from "diff-match-patch";
import type { Correction, PinnedCorrection } from "./schema";

export const MATCH_THRESHOLD = 0.5;
export const MATCH_DISTANCE = 1000;

const dmp = new diff_match_patch();
dmp.Match_Threshold = MATCH_THRESHOLD;
dmp.Match_Distance = MATCH_DISTANCE;

let idCounter = 0;
const nextId = () => `c${++idCounter}`;

function similarity(a: string, b: string): number {
  const diffs = dmp.diff_main(a, b);
  dmp.diff_cleanupSemantic(diffs);
  const equal = diffs.filter(([op]) => op === 0).reduce((n, [, s]) => n + s.length, 0);
  const maxLen = Math.max(a.length, b.length, 1);
  return equal / maxLen;
}

function pinOne(text: string, original: string, cursor: number): { start: number; end: number; tier: 1 | 2 | 3 } {
  // Tier 1: exact indexOf from cursor
  const exact = text.indexOf(original, cursor);
  if (exact >= 0) {
    return { start: exact, end: exact + original.length, tier: 1 };
  }

  // Tier 2: diff-match-patch fuzzy locator
  let idx: number;
  try {
    idx = dmp.match_main(text, original, cursor);
  } catch {
    idx = -1;
  }
  if (idx >= 0) {
    const windowLen = Math.ceil(original.length * 1.3) + 4;
    const window = text.slice(idx, idx + windowLen);
    // Guardrail: require high similarity, else drop (wrong pin is worse than no pin).
    if (similarity(original, window.slice(0, original.length + 2)) < MATCH_THRESHOLD) {
      return { start: -1, end: -1, tier: 3 };
    }
    const diffs = dmp.diff_main(original, window);
    dmp.diff_cleanupSemantic(diffs);
    let consumed = 0;
    for (const [op, str] of diffs) {
      if (op === 0) consumed += str.length;
      else if (op === 1) consumed += str.length;
      else if (op === -1) break;
      if (consumed >= original.length) break;
    }
    const end = idx + Math.max(consumed, original.length);
    return { start: idx, end, tier: 2 };
  }

  return { start: -1, end: -1, tier: 3 };
}

const SEVERITY_WEIGHT: Record<NonNullable<Correction["severity"]>, number> = { major: 3, minor: 2, info: 1 };

function removeOverlaps(pinned: PinnedCorrection[]): PinnedCorrection[] {
  const valid = pinned.filter((p) => p.start >= 0);
  valid.sort((a, b) => {
    const sa = SEVERITY_WEIGHT[a.severity ?? "minor"];
    const sb = SEVERITY_WEIGHT[b.severity ?? "minor"];
    if (sb !== sa) return sb - sa;
    const lenB = b.end - b.start;
    const lenA = a.end - a.start;
    if (lenB !== lenA) return lenB - lenA;
    return a.start - b.start;
  });
  const claimed: Array<[number, number]> = [];
  for (const p of valid) {
    const overlaps = claimed.some(([s, e]) => p.start < e && p.end > s);
    if (overlaps) p.state = "superseded";
    else claimed.push([p.start, p.end]);
  }
  return pinned;
}

export function pinSpans(text: string, corrections: Correction[]): PinnedCorrection[] {
  let cursor = 0;
  const pinned = corrections.map((correction) => {
    const { start, end, tier } = pinOne(text, correction.original, cursor);
    if (tier === 1) cursor = end;
    return { ...correction, id: nextId(), start, end, matchTier: tier, state: "pending" as const };
  });
  return removeOverlaps(pinned);
}
