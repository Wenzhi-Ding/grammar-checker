// tests/providers/shared/errors.test.ts
import { describe, it, expect } from "vitest";
import { toPolishError } from "@/lib/providers/shared/errors";
import { PolishParseError } from "@/lib/providers/shared/parse";

describe("toPolishError", () => {
  it("classifies 401/403 as auth (not retryable)", () => {
    const err = Object.assign(new Error("unauthorized"), { status: 401 });
    expect(toPolishError(err)).toMatchObject({ kind: "auth", retryable: false });
    const err403 = Object.assign(new Error("forbidden"), { status: 403 });
    expect(toPolishError(err403)).toMatchObject({ kind: "auth", retryable: false });
  });

  it("classifies 429 as rate-limit (retryable)", () => {
    const err = Object.assign(new Error("slow down"), { status: 429 });
    expect(toPolishError(err)).toMatchObject({ kind: "rate-limit", retryable: true });
  });

  it("classifies TypeError as network (CORS/connection)", () => {
    expect(toPolishError(new TypeError("Failed to fetch"))).toMatchObject({ kind: "network", retryable: true });
  });

  it("classifies SyntaxError as schema (bad model output)", () => {
    expect(toPolishError(new SyntaxError("Unexpected token"))).toMatchObject({ kind: "schema", retryable: true });
  });

  it("classifies PolishParseError as schema with a clear retry/stronger-model hint", () => {
    const err = new PolishParseError("not json at all", new SyntaxError("Unexpected token"));
    const out = toPolishError(err);
    expect(out).toMatchObject({ kind: "schema", retryable: true });
    expect(out.message).toContain("格式解析失败");
    expect(out.message).toContain("更强的模型");
  });

  it("classifies proxy-tagged kind:'schema' as schema even without a PolishParseError", () => {
    const err = Object.assign(new Error("model output is not valid structured JSON"), { status: 422, kind: "schema" });
    expect(toPolishError(err)).toMatchObject({ kind: "schema", retryable: true });
  });

  it("surfaces HTTP status and provider detail for request failures", () => {
    const err = Object.assign(new Error('provider deepseek: {"error":{"message":"Insufficient Balance"}}'), {
      status: 402,
    });
    const out = toPolishError(err);
    expect(out.kind).toBe("network");
    expect(out.message).toContain("402");
    expect(out.message).toContain("Insufficient Balance");
  });

  it("falls back to network with the original message", () => {
    expect(toPolishError(new Error("boom"))).toMatchObject({ kind: "network", message: "boom", retryable: true });
  });
});
