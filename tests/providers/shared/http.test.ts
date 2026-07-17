import { describe, it, expect, vi, beforeEach } from "vitest";
import { callWithFallback, toHttpError } from "@/lib/providers/shared/http";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("callWithFallback", () => {
  it("returns the direct response when direct succeeds", async () => {
    const direct = vi.fn().mockResolvedValue({ ok: true, body: "direct-result" });
    const out = await callWithFallback(direct, { proxyBody: { provider: "x", payload: {} } });
    expect(out.body).toBe("direct-result");
  });

  it("falls back to proxy on TypeError (CORS/network)", async () => {
    const direct = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const proxyFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => "proxy-result",
    });
    const out = await callWithFallback(direct, { proxyBody: { provider: "x", payload: { apiKey: "k" } } }, proxyFetch);
    expect(direct).toHaveBeenCalledTimes(1);
    expect(proxyFetch).toHaveBeenCalledTimes(1);
    expect(out.body).toBe("proxy-result");
    expect(out.ok).toBe(true);
    expect(out.status).toBe(200);
  });

  it("does NOT fall back on a normal Error with HTTP status (non-CORS)", async () => {
    const err = Object.assign(new Error("unauthorized"), { status: 401 });
    const direct = vi.fn().mockRejectedValue(err);
    const proxyFetch = vi.fn();
    await expect(
      callWithFallback(direct, { proxyBody: { provider: "x", payload: {} } }, proxyFetch),
    ).rejects.toThrow("unauthorized");
    expect(proxyFetch).not.toHaveBeenCalled();
  });

  it("throws (with status) when the proxy returns non-OK", async () => {
    const direct = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const proxyFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid API key" }),
    });
    await expect(
      callWithFallback(direct, { proxyBody: { provider: "x", payload: {} } }, proxyFetch),
    ).rejects.toMatchObject({ status: 401, message: "Invalid API key" });
  });

  it("propagates kind from the proxy error body", async () => {
    const direct = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const proxyFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "model output is not valid structured JSON", kind: "schema" }),
    });
    await expect(
      callWithFallback(direct, { proxyBody: { provider: "x", payload: {} } }, proxyFetch),
    ).rejects.toMatchObject({ status: 422, kind: "schema" });
  });
});

describe("toHttpError", () => {
  it("embeds a truncated body excerpt and sets .status", async () => {
    const res = new Response('{"error":{"message":"Insufficient Balance"}}', { status: 402 });
    const err = await toHttpError("provider deepseek", res);
    expect(err.status).toBe(402);
    expect(err.message).toContain("provider deepseek");
    expect(err.message).toContain("Insufficient Balance");
  });

  it("truncates very long bodies", async () => {
    const res = new Response("x".repeat(1000), { status: 500 });
    const err = await toHttpError("gemini", res);
    expect(err.message.length).toBeLessThanOrEqual("gemini: ".length + 300);
  });

  it("falls back to a bare status message when the body is unreadable", async () => {
    const res = { status: 503 } as unknown as Response; // no .text()
    const err = await toHttpError("provider kimi", res);
    expect(err.status).toBe(503);
    expect(err.message).toBe("provider kimi returned 503");
  });
});
