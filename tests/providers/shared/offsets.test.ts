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

describe("applyAccept safety locks", () => {
  it("no-ops when accepting an already-accepted suggestion (no double mutation)", () => {
    const text = "ABCDE";
    const accepted = mk("1", 1, 2, "accepted");
    const { text: newText, suggestions } = applyAccept(text, [accepted], "1");
    expect(newText).toBe("ABCDE"); // unchanged
    expect(suggestions[0].state).toBe("accepted");
  });

  it("no-ops when accepting a rejected/superseded suggestion", () => {
    const text = "ABCDE";
    const rejected = mk("1", 1, 2, "rejected");
    const { text: newText } = applyAccept(text, [rejected], "1");
    expect(newText).toBe("ABCDE");
  });

  it("handles deletion (empty suggestion): text shortens, later offsets shift left", () => {
    const text = "ABCDE";
    // delete B at [1,2]: suggestion "" → delta = 0 - 1 = -1
    const del = { ...mk("1", 1, 2), suggestion: "" };
    const later = mk("2", 3, 4);
    const { text: newText, suggestions } = applyAccept(text, [del, later], "1");
    expect(newText).toBe("ACDE");
    expect(suggestions[1].start).toBe(2); // was 3, shifted -1
    expect(suggestions[1].end).toBe(3);
  });
});
