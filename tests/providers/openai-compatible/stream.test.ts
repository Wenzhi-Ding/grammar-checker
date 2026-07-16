// tests/providers/openai-compatible/stream.test.ts
import { describe, it, expect, vi } from "vitest";
import { createOpenAICompatibleProvider } from "@/lib/providers/openai-compatible/adapter";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

const CONFIG = { apiKey: "k", model: "deepseek-v4-pro", baseURL: "https://api.deepseek.com/v1", language: "en" as const };

function mockStreamFetch(chunks: string[]) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, body: streamOf(chunks) });
}

describe("openai-compatible polishStream", () => {
  it("posts with stream:true + stream_options.include_usage", async () => {
    const fetcher = mockStreamFetch([
      'data: {"choices":[{"delta":{"content":"{\\"corrections\\":[]}"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);
    const provider = createOpenAICompatibleProvider({ id: "deepseek", fetchImpl: fetcher });
    await provider.polishStream!("hi", CONFIG, () => {});
    const body = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("counts deltas via onToken and returns the parsed result", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"{\\"corrections\\":"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" []}"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const provider = createOpenAICompatibleProvider({ id: "deepseek", fetchImpl: mockStreamFetch(chunks) });
    const tokens: number[] = [];
    const out = await provider.polishStream!("hi", CONFIG, (n) => tokens.push(n));
    expect(tokens).toEqual([1, 2]);
    expect(out).toEqual({ corrections: [] });
  });

  it("lets a final usage.completion_tokens override the estimate", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"{\\"corrections\\":[]}"}}]}\n\n',
      'data: {"choices":[],"usage":{"completion_tokens":42}}\n\n',
      "data: [DONE]\n\n",
    ];
    const provider = createOpenAICompatibleProvider({ id: "deepseek", fetchImpl: mockStreamFetch(chunks) });
    const tokens: number[] = [];
    await provider.polishStream!("hi", CONFIG, (n) => tokens.push(n));
    expect(tokens).toEqual([1, 42]);
  });

  it("skips malformed JSON frames and keeps consuming", async () => {
    const chunks = [
      "data: {oops\n\n",
      'data: {"choices":[{"delta":{"content":"{\\"corrections\\":[]}"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const provider = createOpenAICompatibleProvider({ id: "deepseek", fetchImpl: mockStreamFetch(chunks) });
    const out = await provider.polishStream!("hi", CONFIG, () => {});
    expect(out).toEqual({ corrections: [] });
  });

  it("throws an Error with .status on a non-OK response (no proxy retry)", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const provider = createOpenAICompatibleProvider({ id: "deepseek", fetchImpl: fetcher });
    await expect(provider.polishStream!("hi", CONFIG, () => {})).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("throws when the accumulated stream content is not valid JSON", async () => {
    const fetcher = mockStreamFetch(['data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: [DONE]\n\n']);
    const provider = createOpenAICompatibleProvider({ id: "deepseek", fetchImpl: fetcher });
    await expect(provider.polishStream!("hi", CONFIG, () => {})).rejects.toThrow(SyntaxError);
  });
});
