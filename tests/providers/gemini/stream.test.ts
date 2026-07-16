// tests/providers/gemini/stream.test.ts
import { describe, it, expect, vi } from "vitest";
import { createGeminiProvider } from "@/lib/providers/gemini/adapter";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

const CONFIG = { apiKey: "k", model: "gemini-3.5-flash", language: "en" as const };

function mockStreamFetch(chunks: string[]) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, body: streamOf(chunks) });
}

describe("gemini polishStream", () => {
  it("uses streamGenerateContent with alt=sse and the key in the URL", async () => {
    const fetcher = mockStreamFetch(['data: {"candidates":[{"content":{"parts":[{"text":"{\\"corrections\\":[]}"}]}}]}\n\n']);
    const provider = createGeminiProvider({ fetchImpl: fetcher });
    await provider.polishStream!("hi", CONFIG, () => {});
    const url = fetcher.mock.calls[0][0] as string;
    expect(url).toContain(":streamGenerateContent");
    expect(url).toContain("alt=sse");
    expect(url).toContain("key=k");
  });

  it("estimates tokens from accumulated chars (ceil(chars/4)) and parses result", async () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"corrections\\":"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":" []}"}]}}]}\n\n',
    ];
    const provider = createGeminiProvider({ fetchImpl: mockStreamFetch(chunks) });
    const tokens: number[] = [];
    const out = await provider.polishStream!("hi", CONFIG, (n) => tokens.push(n));
    expect(tokens).toEqual([4, 5]); // 15 chars -> 4, 19 chars -> 5
    expect(out).toEqual({ corrections: [] });
  });

  it("lets usageMetadata.candidatesTokenCount override the estimate", async () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"corrections\\":[]}"}]}}],"usageMetadata":{"candidatesTokenCount":7}}\n\n',
    ];
    const provider = createGeminiProvider({ fetchImpl: mockStreamFetch(chunks) });
    const tokens: number[] = [];
    await provider.polishStream!("hi", CONFIG, (n) => tokens.push(n));
    expect(tokens).toEqual([5, 7]);
  });

  it("throws an Error with .status on a non-OK response", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    const provider = createGeminiProvider({ fetchImpl: fetcher });
    await expect(provider.polishStream!("hi", CONFIG, () => {})).rejects.toMatchObject({ status: 403 });
  });

  it("aborts without proxy retry when the signal fires pre-stream", async () => {
    const fetcher = vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));
    const provider = createGeminiProvider({ fetchImpl: fetcher });
    const ac = new AbortController();
    await expect(provider.polishStream!("hi", CONFIG, () => {}, ac.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
