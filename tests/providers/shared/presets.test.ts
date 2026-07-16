// tests/providers/shared/presets.test.ts
import { describe, it, expect } from "vitest";
import {
  BUILTIN_PROVIDERS,
  defaultProviders,
  mergeProviders,
  buildModelOptions,
  newCustomProvider,
} from "@/lib/providers/shared/presets";

describe("providers", () => {
  it("seeds the 4 built-in providers with empty keys", () => {
    expect(BUILTIN_PROVIDERS.map((p) => p.id).sort()).toEqual(["deepseek", "gemini", "glm", "kimi"]);
    expect(BUILTIN_PROVIDERS.every((p) => p.builtin && p.apiKey === "")).toBe(true);
  });

  it("defaultProviders returns fresh copies (no shared model-array refs)", () => {
    const a = defaultProviders();
    const b = defaultProviders();
    expect(a).not.toBe(b);
    expect(a[0].models).not.toBe(b[0].models);
    expect(a[0].models).toEqual(b[0].models);
  });

  it("buildModelOptions only includes providers that have an API key", () => {
    const ps = defaultProviders();
    expect(buildModelOptions(ps)).toHaveLength(0); // none configured
    ps[0].apiKey = "k";
    const opts = buildModelOptions(ps);
    expect(opts.every((o) => o.provider.id === "deepseek")).toBe(true);
    expect(opts.length).toBe(ps[0].models.length);
  });

  it("newCustomProvider yields a unique, non-builtin entry", () => {
    const a = newCustomProvider();
    const b = newCustomProvider();
    expect(a.builtin).toBe(false);
    expect(a.id).toMatch(/^custom-/);
    expect(a.id).not.toBe(b.id);
  });

  it("mergeProviders keeps stored providers and fills in any missing built-ins", () => {
    const stored = [{ ...defaultProviders()[0], apiKey: "kept", baseURL: "https://edited" }];
    const merged = mergeProviders(stored);
    // edited built-in preserved
    expect(merged.find((p) => p.id === "deepseek")?.apiKey).toBe("kept");
    expect(merged.find((p) => p.id === "deepseek")?.baseURL).toBe("https://edited");
    // missing built-ins filled in
    expect(merged.map((p) => p.id).sort()).toEqual(["deepseek", "gemini", "glm", "kimi"]);
  });
});
