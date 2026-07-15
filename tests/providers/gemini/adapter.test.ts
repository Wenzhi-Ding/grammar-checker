import { describe, it, expect, vi } from "vitest";
import { createGeminiProvider } from "@/lib/providers/gemini/adapter";

function mockFetch(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: content }] } }] }),
  });
}

describe("gemini adapter", () => {
  it("calls generateContent with responseSchema + responseMimeType", async () => {
    const fetcher = mockFetch(JSON.stringify({ corrections: [] }));
    const provider = createGeminiProvider({ fetchImpl: fetcher });
    await provider.polish("hi", { apiKey: "k", model: "gemini-3.5-flash", language: "en" });
    const [url] = fetcher.mock.calls[0];
    expect(String(url)).toContain("generateContent");
    expect(String(url)).toContain("key=k");
  });

  it("returns parsed corrections", async () => {
    const content = JSON.stringify({ corrections: [{ original: "teh", suggestion: "the", type: "spelling", reason: "typo" }] });
    const provider = createGeminiProvider({ fetchImpl: mockFetch(content) });
    const out = await provider.polish("teh", { apiKey: "k", model: "m", language: "en" });
    expect(out.corrections[0].suggestion).toBe("the");
  });

  it("throws an Error with .status when gemini returns a non-OK response", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const provider = createGeminiProvider({ fetchImpl: fetcher });
    await expect(
      provider.polish("hi", { apiKey: "bad", model: "gemini-3.5-flash", language: "en" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
