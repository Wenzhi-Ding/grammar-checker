// tests/providers/shared/lang.test.ts
import { describe, it, expect } from "vitest";
import { detect } from "@/lib/providers/shared/lang";

describe("detect", () => {
  it("returns zh for predominantly CJK text", () => {
    expect(detect("今天天气很好，我们一起去公园散步。")).toBe("zh");
  });
  it("returns en for ASCII text", () => {
    expect(detect("The quick brown fox jumps.")).toBe("en");
  });
  it("returns zh when CJK ratio exceeds threshold even with mixed text", () => {
    expect(detect("我今天 ate an apple")).toBe("zh");
  });
  it("returns en for short or empty input", () => {
    expect(detect("")).toBe("en");
    expect(detect("hi")).toBe("en");
  });
});
