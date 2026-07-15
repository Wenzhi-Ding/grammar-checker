// tests/providers/shared/presets.test.ts
import { describe, it, expect } from "vitest";
import { PRESETS, getPreset } from "@/lib/providers/shared/presets";

describe("provider presets", () => {
  it("includes the five supported presets", () => {
    expect(PRESETS.map((p) => p.id).sort()).toEqual(["custom", "deepseek", "gemini", "glm", "kimi"]);
  });
  it("deepseek uses openai-compatible adapter and correct baseURL", () => {
    const p = getPreset("deepseek");
    expect(p.adapter).toBe("openai-compatible");
    expect(p.baseURL).toBe("https://api.deepseek.com/v1");
    expect(p.defaultModel).toBe("deepseek-v4-pro");
  });
  it("gemini uses gemini adapter", () => {
    expect(getPreset("gemini").adapter).toBe("gemini");
  });
  it("custom has empty baseURL/model", () => {
    const p = getPreset("custom");
    expect(p.baseURL).toBe("");
    expect(p.defaultModel).toBe("");
  });
});
