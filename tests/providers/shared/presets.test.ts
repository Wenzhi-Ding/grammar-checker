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
  it("seeds the built-in providers with empty keys", () => {
    expect(BUILTIN_PROVIDERS.map((p) => p.id).sort()).toEqual([
      "deepseek",
      "gemini",
      "glm",
      "kimi",
      "ollama",
      "openai",
    ]);
    expect(BUILTIN_PROVIDERS.every((p) => p.builtin && p.apiKey === "")).toBe(true);
  });

  it("marks only Ollama as keyless", () => {
    const ollama = BUILTIN_PROVIDERS.find((p) => p.id === "ollama");
    expect(ollama?.requiresKey).toBe(false);
    expect(BUILTIN_PROVIDERS.filter((p) => p.id !== "ollama").every((p) => p.requiresKey === true)).toBe(true);
  });

  it("seeds Ollama pointing at localhost with no default models", () => {
    const ollama = BUILTIN_PROVIDERS.find((p) => p.id === "ollama");
    expect(ollama?.adapter).toBe("openai-compatible");
    expect(ollama?.baseURL).toBe("http://localhost:11434/v1");
    expect(ollama?.models).toEqual([]);
  });

  // Pinned so stale defaults (retired upstream model ids) can't slip back in —
  // refresh this list whenever the provider docs change, verifying each id
  // against official docs first.
  it("seeds current default model lists for the keyed builtins", () => {
    const models = (id: string) => BUILTIN_PROVIDERS.find((p) => p.id === id)!.models;
    expect(models("deepseek")).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
    expect(models("kimi")).toEqual(["kimi-k3", "kimi-k2.6"]);
    expect(models("glm")).toEqual(["glm-5.3", "glm-5.3-flash"]);
    expect(models("gemini")).toEqual(["gemini-3.8-flash", "gemini-3.1-pro-preview"]);
    expect(models("openai")).toEqual(["gpt-6-luna", "gpt-6.1-sol"]);
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
    expect(buildModelOptions(ps).filter((o) => o.provider.id !== "ollama")).toHaveLength(0); // none configured
    ps[0].apiKey = "k";
    const opts = buildModelOptions(ps).filter((o) => o.provider.id !== "ollama");
    expect(opts.every((o) => o.provider.id === "deepseek")).toBe(true);
    expect(opts.length).toBe(ps[0].models.length);
  });

  it("buildModelOptions includes keyless providers even without an API key", () => {
    const ps = defaultProviders();
    // Ollama seeds with empty models — simulate the user adding one in Settings.
    const ollama = ps.find((p) => p.id === "ollama")!;
    ollama.models.push("llama3.1:8b");
    const opts = buildModelOptions(ps);
    const ollamaOpts = opts.filter((o) => o.provider.id === "ollama");
    expect(ollamaOpts.length).toBe(1);
    expect(ollamaOpts[0].model).toBe("llama3.1:8b");
  });

  it("buildModelOptions yields no Ollama entries when its model list is empty", () => {
    const ps = defaultProviders(); // Ollama ships with models: []
    const opts = buildModelOptions(ps);
    expect(opts.filter((o) => o.provider.id === "ollama")).toHaveLength(0);
  });

  it("buildModelOptions still excludes keyed providers with empty API key", () => {
    const ps = defaultProviders();
    // deepseek/kimi/glm/gemini/openai all have requiresKey:true and empty apiKey
    const opts = buildModelOptions(ps);
    expect(opts.filter((o) => o.provider.id !== "ollama")).toHaveLength(0);
  });

  it("newCustomProvider defaults to requiresKey:true", () => {
    expect(newCustomProvider().requiresKey).toBe(true);
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
    expect(merged.map((p) => p.id).sort()).toEqual(["deepseek", "gemini", "glm", "kimi", "ollama", "openai"]);
  });
});
