// tests/providers/shared/errors.test.ts
import { describe, it, expect } from "vitest";
import { toPolishError } from "@/lib/providers/shared/errors";

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

  it("falls back to network with the original message", () => {
    expect(toPolishError(new Error("boom"))).toMatchObject({ kind: "network", message: "boom", retryable: true });
  });
});
