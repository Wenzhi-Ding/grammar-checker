// tests/providers/shared/offsets.test.ts
import { describe, it, expect } from "vitest";
import { applyAccept } from "@/lib/providers/shared/offsets";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";

const mk = (id: string, start: number, end: number, state: PinnedCorrection["state"] = "pending"): PinnedCorrection => ({
  id, start, end, state,
  original: "o", suggestion: "s", type: "grammar", reason: "r", severity: "minor", matchTier: 1 as const,
});

describe("applyAccept", () => {
  it("applies the edit and shifts later offsets by delta", () => {
    const text = "ABCDE";
    const suggestions = [mk("1", 1, 2), mk("2", 3, 4)];
    const { text: newText, suggestions: newSugs } = applyAccept(text, suggestions, "1");
    expect(newText).toBe("AsCDE");
    expect(newSugs[1].start).toBe(3);
    expect(newSugs[0].state).toBe("accepted");
  });

  it("shifts later offsets when suggestion length differs", () => {
    const text = "ABCDE";
    const suggestions = [mk("1", 0, 1), mk("2", 3, 4)];
    const { text: newText, suggestions: newSugs } = applyAccept(text, suggestions, "1", "XYZ");
    expect(newText).toBe("XYZBCDE");
    expect(newSugs[1].start).toBe(5);
    expect(newSugs[1].end).toBe(6);
  });

  it("does not shift earlier offsets", () => {
    const text = "ABCDE";
    const suggestions = [mk("1", 0, 1), mk("2", 3, 4)];
    const { suggestions: newSugs } = applyAccept(text, suggestions, "2");
    expect(newSugs[0].start).toBe(0);
  });
});
