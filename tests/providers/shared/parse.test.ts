// tests/providers/shared/parse.test.ts
import { describe, it, expect } from "vitest";
import { parsePolishResult, PolishParseError } from "@/lib/providers/shared/parse";

describe("parsePolishResult", () => {
  it("parses valid JSON", () => {
    const raw = JSON.stringify({
      corrections: [{ original: "teh", suggestion: "the", type: "spelling", reason: "typo", severity: "minor" }],
    });
    const out = parsePolishResult(raw);
    expect(out.corrections).toHaveLength(1);
    expect(out.corrections[0].type).toBe("spelling");
  });

  it("throws PolishParseError on invalid type enum", () => {
    const raw = JSON.stringify({ corrections: [{ original: "a", suggestion: "b", type: "bogus", reason: "r" }] });
    expect(() => parsePolishResult(raw)).toThrow(PolishParseError);
  });

  it("throws PolishParseError with a raw excerpt on non-JSON output", () => {
    try {
      parsePolishResult("Sure! Here is your corrected text: ...");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PolishParseError);
      expect((err as PolishParseError).excerpt).toContain("Sure!");
    }
  });

  it("accepts empty corrections array", () => {
    const out = parsePolishResult('{"corrections":[]}');
    expect(out.corrections).toEqual([]);
  });
});
