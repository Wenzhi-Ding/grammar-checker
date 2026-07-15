import { describe, it, expect, vi, beforeEach } from "vitest";
import { callWithFallback } from "@/lib/providers/shared/http";

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
});
