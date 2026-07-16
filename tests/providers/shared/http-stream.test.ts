// tests/providers/shared/http-stream.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { callStreamWithFallback } from "@/lib/providers/shared/http";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("callStreamWithFallback", () => {
  it("returns the direct response untouched when direct resolves", async () => {
    const directRes = { ok: true, status: 200 } as unknown as Response;
    const direct = vi.fn().mockResolvedValue(directRes);
    const proxyFetch = vi.fn();
    const out = await callStreamWithFallback(direct, { proxyBody: { a: 1 } }, proxyFetch);
    expect(out).toBe(directRes);
    expect(proxyFetch).not.toHaveBeenCalled();
  });

  it("falls back to the proxy (with stream:true) on TypeError", async () => {
    const proxyRes = { ok: true, status: 200 } as unknown as Response;
    const direct = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const proxyFetch = vi.fn().mockResolvedValue(proxyRes);
    const out = await callStreamWithFallback(
      direct,
      { proxyBody: { providerId: "kimi", payload: {} } },
      proxyFetch,
    );
    expect(out).toBe(proxyRes);
    const [url, init] = proxyFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/polish");
    expect(JSON.parse(init.body as string)).toMatchObject({ providerId: "kimi", stream: true });
  });

  it("does NOT fall back on a non-TypeError", async () => {
    const err = Object.assign(new Error("unauthorized"), { status: 401 });
    const direct = vi.fn().mockRejectedValue(err);
    const proxyFetch = vi.fn();
    await expect(callStreamWithFallback(direct, { proxyBody: {} }, proxyFetch)).rejects.toThrow("unauthorized");
    expect(proxyFetch).not.toHaveBeenCalled();
  });

  it("throws (with status) when the proxy returns non-OK", async () => {
    const direct = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const proxyFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate limited" }),
    });
    await expect(callStreamWithFallback(direct, { proxyBody: {} }, proxyFetch)).rejects.toMatchObject({
      status: 429,
      message: "rate limited",
    });
  });
});
