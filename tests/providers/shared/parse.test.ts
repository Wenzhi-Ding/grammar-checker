// tests/providers/shared/parse.test.ts
import { describe, it, expect } from "vitest";
import { parsePolishResult } from "@/lib/providers/shared/parse";

describe("parsePolishResult", () => {
  it("parses valid JSON", () => {
    const raw = JSON.stringify({
      corrections: [{ original: "teh", suggestion: "the", type: "spelling", reason: "typo", severity: "minor" }],
    });
    const out = parsePolishResult(raw);
    expect(out.corrections).toHaveLength(1);
    expect(out.corrections[0].type).toBe("spelling");
  });

  it("throws on invalid type enum", () => {
    const raw = JSON.stringify({ corrections: [{ original: "a", suggestion: "b", type: "bogus", reason: "r" }] });
    expect(() => parsePolishResult(raw)).toThrow();
  });

  it("accepts empty corrections array", () => {
    const out = parsePolishResult('{"corrections":[]}');
    expect(out.corrections).toEqual([]);
  });
});
