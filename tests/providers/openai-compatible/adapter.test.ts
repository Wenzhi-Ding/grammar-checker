import { describe, it, expect, vi } from "vitest";
import { createOpenAICompatibleProvider } from "@/lib/providers/openai-compatible/adapter";

function mockFetch(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

describe("openai-compatible adapter", () => {
  it("posts to {baseURL}/chat/completions with json_object response_format", async () => {
    const fetcher = mockFetch(JSON.stringify({ corrections: [] }));
    const provider = createOpenAICompatibleProvider({ id: "deepseek", fetchImpl: fetcher });
    await provider.polish("hello", { apiKey: "k", model: "deepseek-v4-pro", baseURL: "https://api.deepseek.com/v1", language: "en" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.model).toBe("deepseek-v4-pro");
    expect((init as RequestInit).headers.Authorization).toBe("Bearer k");
  });

  it("returns parsed corrections", async () => {
    const content = JSON.stringify({ corrections: [{ original: "teh", suggestion: "the", type: "spelling", reason: "typo", severity: "minor" }] });
    const provider = createOpenAICompatibleProvider({ id: "deepseek", fetchImpl: mockFetch(content) });
    const out = await provider.polish("teh", { apiKey: "k", model: "m", baseURL: "https://api.deepseek.com/v1", language: "en" });
    expect(out.corrections).toHaveLength(1);
    expect(out.corrections[0].suggestion).toBe("the");
  });

  it("selects Chinese framing when language is zh", async () => {
    const fetcher = mockFetch(JSON.stringify({ corrections: [] }));
    const provider = createOpenAICompatibleProvider({ id: "glm", fetchImpl: fetcher });
    await provider.polish("你好", { apiKey: "k", model: "glm-5.2", baseURL: "https://open.bigmodel.cn/api/paas/v4", language: "zh" });
    const body = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].content).toContain("中文润色");
  });
});
