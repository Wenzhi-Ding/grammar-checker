// tests/hooks/usePolish.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePolish } from "@/hooks/usePolish";
import { getProviderFor } from "@/lib/providers/shared";

vi.mock("@/lib/providers/shared", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/providers/shared")>();
  return { ...orig, getProviderFor: vi.fn() };
});

const mockedGetProvider = vi.mocked(getProviderFor);

const OPTS = {
  providerId: "deepseek",
  adapter: "openai-compatible" as const,
  config: { apiKey: "k", model: "m", baseURL: "https://api.deepseek.com/v1" },
};

beforeEach(() => {
  mockedGetProvider.mockReset();
});

describe("usePolish.run", () => {
  it("streams: forwards token ticks, then marks the task done and returns the result", async () => {
    const update = vi.fn();
    const polishStream = vi.fn().mockImplementation(async (_t: string, _c: unknown, onToken: (n: number) => void) => {
      onToken(4);
      onToken(11);
      return { corrections: [] };
    });
    mockedGetProvider.mockReturnValue({ id: "deepseek", polish: vi.fn(), polishStream });
    const { result } = renderHook(() => usePolish(update));

    let out: unknown;
    await act(async () => {
      out = await result.current.run("t1", "hello", OPTS);
    });
    expect(out).toEqual({ corrections: [] });
    expect(update).toHaveBeenNthCalledWith(1, "t1", { approxTokens: 4 });
    expect(update).toHaveBeenNthCalledWith(2, "t1", { approxTokens: 11 });
    expect(update).toHaveBeenNthCalledWith(3, "t1", { status: "done", result: { corrections: [] } });
  });

  it("marks error without calling the provider when the key is missing", async () => {
    const update = vi.fn();
    const { result } = renderHook(() => usePolish(update));
    let out: unknown;
    await act(async () => {
      out = await result.current.run("t1", "hello", { ...OPTS, config: { ...OPTS.config, apiKey: "" } });
    });
    expect(out).toBeNull();
    expect(mockedGetProvider).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith("t1", expect.objectContaining({ status: "error" }));
  });

  it("classifies failures into the task error field", async () => {
    const update = vi.fn();
    const polishStream = vi.fn().mockRejectedValue(Object.assign(new Error("unauthorized"), { status: 401 }));
    mockedGetProvider.mockReturnValue({ id: "deepseek", polish: vi.fn(), polishStream });
    const { result } = renderHook(() => usePolish(update));
    let out: unknown;
    await act(async () => {
      out = await result.current.run("t1", "hello", OPTS);
    });
    expect(out).toBeNull();
    expect(update).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ status: "error", error: expect.objectContaining({ kind: "auth" }) }),
    );
  });

  it("stays silent when the task was aborted mid-flight (removed)", async () => {
    const update = vi.fn();
    const polishStream = vi.fn().mockImplementation(
      (_t: string, _c: unknown, _on: (n: number) => void, signal: AbortSignal) =>
        new Promise((_res, rej) => signal.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")))),
    );
    mockedGetProvider.mockReturnValue({ id: "deepseek", polish: vi.fn(), polishStream });
    const { result } = renderHook(() => usePolish(update));

    let p: Promise<unknown> | null = null;
    await act(async () => {
      p = result.current.run("t1", "hello", OPTS);
    });
    act(() => {
      result.current.abort("t1");
    });
    await act(async () => {
      await p;
    });
    expect(update).not.toHaveBeenCalledWith("t1", expect.objectContaining({ status: "error" }));
    expect(update).not.toHaveBeenCalledWith("t1", expect.objectContaining({ status: "done" }));
  });

  it("falls back to non-stream polish when the provider lacks polishStream", async () => {
    const update = vi.fn();
    const polish = vi.fn().mockResolvedValue({ corrections: [] });
    mockedGetProvider.mockReturnValue({ id: "deepseek", polish });
    const { result } = renderHook(() => usePolish(update));
    let out: unknown;
    await act(async () => {
      out = await result.current.run("t1", "hello", OPTS);
    });
    expect(out).toEqual({ corrections: [] });
    expect(polish).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith("t1", { status: "done", result: { corrections: [] } });
  });
});
