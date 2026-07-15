import { describe, it, expect } from "vitest";
import { pinSpans } from "@/lib/providers/shared/match";
import type { Correction } from "@/lib/providers/shared/schema";

const c = (original: string, suggestion = "X", severity: Correction["severity"] = "minor"): Correction => ({
  original,
  suggestion,
  type: "grammar",
  reason: "r",
  severity,
});

describe("pinSpans Tier 1 (exact indexOf)", () => {
  it("pins an exact substring", () => {
    const text = "the quick brown fox";
    const out = pinSpans(text, [c("quick")]);
    expect(out[0].start).toBe(4);
    expect(out[0].end).toBe(9);
    expect(out[0].matchTier).toBe(1);
    expect(out[0].state).toBe("pending");
  });

  it("disambiguates repeated phrases by document order (sequential cursor)", () => {
    const text = "the cat and the cat";
    const out = pinSpans(text, [c("cat"), c("cat")]);
    expect(out[0].start).toBe(4);
    expect(out[1].start).toBe(16);
  });

  it("leaves unmatched as -1 with tier 3", () => {
    const text = "hello world";
    const out = pinSpans(text, [c("missing")]);
    expect(out[0].start).toBe(-1);
    expect(out[0].end).toBe(-1);
    expect(out[0].matchTier).toBe(3);
  });
});

describe("pinSpans Tier 2 (dmp fuzzy fallback)", () => {
  it("recovers when LLM collapsed whitespace", () => {
    // input has double space; LLM "normalized" original to single space
    const text = "the  quick brown fox";
    const out = pinSpans(text, [c("the quick")]);
    expect(out[0].matchTier).toBe(2);
    expect(out[0].start).toBe(0);
    expect(out[0].end).toBeGreaterThanOrEqual(9);
  });

  it("recovers when LLM swapped smart quotes for straight", () => {
    const text = "she said \u201Chello\u201D there";
    const out = pinSpans(text, [c('she said "hello"')]);
    expect(out[0].matchTier).toBe(2);
    expect(out[0].start).toBe(0);
  });
});

describe("pinSpans Tier 2 guardrail", () => {
  it("downgrades a low-similarity fuzzy match to tier 3", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const out = pinSpans(text, [c("zzzzz qqqq unrelated gibberish phrase here")]);
    expect(out[0].matchTier).toBe(3);
    expect(out[0].start).toBe(-1);
  });
});
