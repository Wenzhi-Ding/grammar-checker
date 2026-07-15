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
