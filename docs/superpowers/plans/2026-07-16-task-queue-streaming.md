# 任务队列 + 流式进度 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Grammar Checker 增加并行任务队列（左侧列表、持久化、点击恢复评审态）与 SSE 流式 token 进度。

**Architecture:** 纯前端并行任务 + SSE 流式直连（CORS TypeError 时代理兜底透传）。任务列表存 localStorage（上限 50）。设计见 `docs/superpowers/specs/2026-07-16-task-queue-streaming-design.md`。

**Tech Stack:** Next.js App Router + TypeScript strict + vitest（jsdom）+ @testing-library/react。

**约定：**
- 每个 Task 完成后按步骤里的命令提交（repo 风格：小写类型前缀）。
- 跑单个测试文件：`npx vitest run <path>`；全量：`npm test`。
- 测试中未使用的回调参数用 `_` 前缀（eslint 已配置豁免）。

---

### Task 1: SSE 解析器 `lib/providers/shared/sse.ts`

**Files:**
- Create: `lib/providers/shared/sse.ts`
- Test: `tests/providers/shared/sse.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/providers/shared/sse.test.ts
import { describe, it, expect } from "vitest";
import { iterateSSE } from "@/lib/providers/shared/sse";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect(chunks: string[]): Promise<string[]> {
  const out: string[] = [];
  for await (const p of iterateSSE(streamOf(chunks))) out.push(p);
  return out;
}

describe("iterateSSE", () => {
  it("yields data payloads frame by frame", async () => {
    expect(await collect(["data: a\n\ndata: b\n\n"])).toEqual(["a", "b"]);
  });

  it("handles frames split across chunks", async () => {
    expect(await collect(["data: a\n", "\ndata: b", "\n\n"])).toEqual(["a", "b"]);
  });

  it("joins multi-line data lines", async () => {
    expect(await collect(["data: a\ndata: b\n\n"])).toEqual(["a\nb"]);
  });

  it("skips comment lines and blank lines", async () => {
    expect(await collect([": ping\n\ndata: x\n\n"])).toEqual(["x"]);
  });

  it("skips malformed lines without a colon prefix", async () => {
    expect(await collect(["garbage\ndata: x\n\n"])).toEqual(["x"]);
  });

  it("flushes a trailing frame that lacks the final delimiter", async () => {
    expect(await collect(["data: tail"])).toEqual(["tail"]);
  });

  it("handles CRLF delimiters", async () => {
    expect(await collect(["data: a\r\n\r\ndata: b\r\n\r\n"])).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/providers/shared/sse.test.ts`
Expected: FAIL — `Cannot find module '@/lib/providers/shared/sse'`

- [ ] **Step 3: 实现**

```ts
// lib/providers/shared/sse.ts
/**
 * Minimal SSE parser: turns a ReadableStream of bytes into an async generator
 * of `data:` payloads (multi-line data joined with "\n"). Comment lines
 * (":..."), event:/id:/retry: fields, and malformed lines are skipped.
 * A trailing frame without a final blank-line delimiter is flushed at EOF.
 */
export async function* iterateSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  const framePayload = (frame: string): string | null => {
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line === "" || line.startsWith(":")) continue;
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
      // ignore event:/id:/retry: and anything malformed
    }
    return dataLines.length ? dataLines.join("\n") : null;
  };

  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const idx = buffer.search(/\r\n\r\n|\n\n/);
        if (idx < 0) break;
        const delim = buffer.slice(idx).match(/^\r\n\r\n|^\n\n/);
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + (delim ? delim[0].length : 2));
        const payload = framePayload(frame);
        if (payload !== null) yield payload;
      }
    }
    buffer += decoder.decode();
    const payload = framePayload(buffer);
    if (payload !== null) yield payload;
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/providers/shared/sse.test.ts`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/sse.ts tests/providers/shared/sse.test.ts
git commit -m "feat: shared SSE stream parser"
```

---

### Task 2: 错误分类上移 `lib/providers/shared/errors.ts`

**Files:**
- Create: `lib/providers/shared/errors.ts`
- Modify: `hooks/usePolish.ts`（本 Task 只做 re-export，Task 9 才重写）
- Test: `tests/providers/shared/errors.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/providers/shared/errors.test.ts`
Expected: FAIL — `Cannot find module '@/lib/providers/shared/errors'`

- [ ] **Step 3: 实现 errors.ts 并让 usePolish re-export**

```ts
// lib/providers/shared/errors.ts
export type PolishErrorKind = "no-key" | "auth" | "network" | "schema" | "rate-limit" | "timeout" | "empty";
export interface PolishError {
  kind: PolishErrorKind;
  message: string;
  retryable: boolean;
}

export function toPolishError(err: unknown): PolishError {
  const e = err as Error & { status?: number };
  if (e?.status === 401 || e?.status === 403) return { kind: "auth", message: "API Key 无效或无权限", retryable: false };
  if (e?.status === 429) return { kind: "rate-limit", message: "请求过于频繁，稍后重试", retryable: true };
  if (err instanceof TypeError) return { kind: "network", message: "网络错误，无法连接（已尝试代理兜底）", retryable: true };
  if (err instanceof SyntaxError) return { kind: "schema", message: "模型返回格式异常，请重试或换模型", retryable: true };
  return { kind: "network", message: e?.message ?? "未知错误", retryable: true };
}
```

把 `hooks/usePolish.ts` 顶部的类型/函数定义替换为 re-export（其余不动）：

```ts
// hooks/usePolish.ts —— 顶部替换后长这样（仅展示变动部分）
"use client";
import { useState, useCallback } from "react";
import { getProviderFor } from "@/lib/providers/shared";
import { callWithFallback } from "@/lib/providers/shared/http";
import { toPolishError } from "@/lib/providers/shared/errors";
import type { PolishResult, ProviderConfig } from "@/lib/providers/shared/schema";
import type { AdapterKind } from "@/lib/providers/shared/presets";

export type { PolishError, PolishErrorKind } from "@/lib/providers/shared/errors";
```

同时删掉文件内原来的 `PolishErrorKind` / `PolishError` / `toPolishError` 定义（`PolishStatus` 保留到 Task 9 重写时处理）。

- [ ] **Step 4: 跑测试 + 类型检查**

Run: `npx vitest run tests/providers/shared/errors.test.ts && npm run typecheck`
Expected: 5 passed；tsc 无错误

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/errors.ts hooks/usePolish.ts tests/providers/shared/errors.test.ts
git commit -m "refactor: move PolishError/toPolishError to shared/errors"
```

---

### Task 3: 流式兜底 `callStreamWithFallback`

**Files:**
- Modify: `lib/providers/shared/http.ts`
- Test: `tests/providers/shared/http-stream.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/providers/shared/http-stream.test.ts`
Expected: FAIL — `callStreamWithFallback is not a function`

- [ ] **Step 3: 在 http.ts 末尾追加实现**

```ts
/**
 * Streaming variant of callWithFallback. `direct()` returns the raw SSE
 * Response as-is (ok or not — the caller inspects it). Only a TypeError
 * (browser CORS/network opaque failure, thrown BEFORE any stream bytes are
 * consumed) triggers one proxy retry via /api/polish with `stream: true`
 * added to the body. Mid-stream failures must NOT be retried here.
 */
export async function callStreamWithFallback(
  direct: () => Promise<Response>,
  opts: { proxyBody: ProxyBody },
  proxyFetch?: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Response> {
  try {
    return await direct();
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    const fetcher = proxyFetch ?? globalThis.fetch;
    const res = await fetcher("/api/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...opts.proxyBody, stream: true }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const err2 = new Error(body.error ?? `proxy returned ${res.status}`) as Error & { status: number };
      err2.status = res.status;
      throw err2;
    }
    return res;
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/providers/shared/http-stream.test.ts tests/providers/shared/http.test.ts`
Expected: 全部通过（旧的 callWithFallback 测试不回归）

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/http.ts tests/providers/shared/http-stream.test.ts
git commit -m "feat: callStreamWithFallback for SSE proxy fallback"
```

---

### Task 4: OpenAI 兼容适配器流式支持

**Files:**
- Modify: `lib/providers/shared/schema.ts`（Provider 接口加 polishStream）
- Modify: `lib/providers/openai-compatible/adapter.ts`（重构 + polishStream + buildStreamRequest）
- Test: `tests/providers/openai-compatible/stream.test.ts`

- [ ] **Step 1: 先在 schema.ts 扩展 Provider 接口**

```ts
// lib/providers/shared/schema.ts —— Provider 接口替换为：
export interface Provider {
  readonly id: string;
  polish(text: string, config: ProviderConfig): Promise<PolishResult>;
  /**
   * Streaming variant. onToken fires with the CUMULATIVE approximate output
   * token count as deltas arrive (monotonic, non-decreasing). Falls back to
   * the /api/polish proxy on a CORS/network TypeError before the stream
   * starts; mid-stream failures are NOT retried.
   */
  polishStream?(
    text: string,
    config: ProviderConfig,
    onToken: (approxTokens: number) => void,
    signal?: AbortSignal,
  ): Promise<PolishResult>;
}
```

- [ ] **Step 2: 写失败测试**

```ts
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
    const fetcher = mockStreamFetch(['data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: [DONE]\n\n']);
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
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/providers/openai-compatible/stream.test.ts`
Expected: FAIL — `provider.polishStream is not a function`

- [ ] **Step 4: 重写 adapter.ts（完整替换）**

```ts
import type { Provider, ProviderConfig, PolishResult } from "../shared/schema";
import { detect } from "../shared/lang";
import { assembleSystem, assembleUser } from "../shared/prompt";
import { parsePolishResult } from "../shared/parse";
import { callStreamWithFallback } from "../shared/http";
import { iterateSSE } from "../shared/sse";
import { ENGLISH_FRAMING } from "./prompt/en";
import { CHINESE_FRAMING } from "./prompt/zh";

interface AdapterOpts {
  id: string;
  fetchImpl?: typeof fetch;
}

export interface StreamRequest {
  url: string;
  init: RequestInit;
}

interface ChatStreamChunk {
  choices?: { delta?: { content?: string } }[];
  usage?: { completion_tokens?: number };
}

function buildChatRequest(text: string, config: ProviderConfig, stream: boolean): StreamRequest {
  const lang = config.language && config.language !== "auto" ? config.language : detect(text);
  const framing = lang === "zh" ? CHINESE_FRAMING : ENGLISH_FRAMING;
  const baseURL = (config.baseURL ?? "").replace(/\/$/, "");
  if (!baseURL) {
    throw new Error("baseURL is required for openai-compatible providers");
  }
  return {
    url: `${baseURL}/chat/completions`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: assembleSystem(framing, config.reasonLanguage) },
          { role: "user", content: assembleUser(text) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
      }),
    },
  };
}

/** Streaming request shared by the browser direct call and the /api/polish proxy route. */
export function buildStreamRequest(text: string, config: ProviderConfig): StreamRequest {
  return buildChatRequest(text, config, true);
}

async function readChatStream(res: Response, onToken: (approxTokens: number) => void): Promise<PolishResult> {
  if (!res.body) throw new Error("response has no body");
  let content = "";
  let approx = 0;
  let usageTokens: number | null = null;
  for await (const payload of iterateSSE(res.body)) {
    if (payload === "[DONE]") break;
    let chunk: ChatStreamChunk;
    try {
      chunk = JSON.parse(payload) as ChatStreamChunk;
    } catch {
      continue; // malformed frame — skip, keep consuming
    }
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (delta) {
      content += delta;
      approx += 1;
      onToken(approx);
    }
    const usage = chunk.usage?.completion_tokens;
    if (typeof usage === "number") usageTokens = usage;
  }
  if (usageTokens !== null) onToken(usageTokens);
  return parsePolishResult(content);
}

export function createOpenAICompatibleProvider({ id, fetchImpl }: AdapterOpts): Provider {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  return {
    id,
    async polish(text: string, config: ProviderConfig): Promise<PolishResult> {
      const { url, init } = buildChatRequest(text, config, false);
      const res = await fetchFn(url, init);
      if (!res.ok) {
        const err = new Error(`provider ${id} returned ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? "";
      return parsePolishResult(content);
    },

    async polishStream(text, config, onToken, signal) {
      const { url, init } = buildStreamRequest(text, config);
      const res = await callStreamWithFallback(
        () => fetchFn(url, { ...init, signal }),
        { proxyBody: { providerId: id, adapter: "openai-compatible", payload: { text, config } } },
        (u, i) => fetchFn(u, i),
      );
      if (!res.ok) {
        const err = new Error(`provider ${id} returned ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return readChatStream(res, onToken);
    },
  };
}
```

- [ ] **Step 5: 跑全部 openai 测试确认通过（含旧测试不回归）**

Run: `npx vitest run tests/providers/openai-compatible`
Expected: 旧 4 个 + 新 5 个全部通过

- [ ] **Step 6: Commit**

```bash
git add lib/providers/shared/schema.ts lib/providers/openai-compatible/adapter.ts tests/providers/openai-compatible/stream.test.ts
git commit -m "feat(openai-compatible): SSE polishStream + shared buildStreamRequest"
```

---

### Task 5: Gemini 适配器流式支持

**Files:**
- Modify: `lib/providers/gemini/adapter.ts`
- Test: `tests/providers/gemini/stream.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
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
    const fetcher = mockStreamFetch(['data: {"candidates":[{"content":{"parts":[{"text":"x"}]}}]}\n\n']);
    const provider = createGeminiProvider({ fetchImpl: fetcher });
    await provider.polishStream!("hi", CONFIG, () => {});
    const url = fetcher.mock.calls[0][0] as string;
    expect(url).toContain(":streamGenerateContent");
    expect(url).toContain("alt=sse");
    expect(url).toContain("key=k");
  });

  it("estimates tokens from accumulated chars (ceil(chars/4)) and parses result", async () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"corrections\\":"}}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":" []}"}}]}}]}\n\n',
    ];
    const provider = createGeminiProvider({ fetchImpl: mockStreamFetch(chunks) });
    const tokens: number[] = [];
    const out = await provider.polishStream!("hi", CONFIG, (n) => tokens.push(n));
    expect(tokens).toEqual([4, 5]); // 15 chars -> 4, 19 chars -> 5
    expect(out).toEqual({ corrections: [] });
  });

  it("lets usageMetadata.candidatesTokenCount override the estimate", async () => {
    const chunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"corrections\\":[]}"}}]}}],"usageMetadata":{"candidatesTokenCount":7}}\n\n',
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
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/providers/gemini/stream.test.ts`
Expected: FAIL — `provider.polishStream is not a function`

- [ ] **Step 3: 重写 adapter.ts（完整替换；responseSchema 常量保持原样）**

```ts
import type { Provider, ProviderConfig, PolishResult } from "../shared/schema";
import { detect } from "../shared/lang";
import { assembleSystem, assembleUser, CORRECTION_TYPES } from "../shared/prompt";
import { parsePolishResult } from "../shared/parse";
import { callStreamWithFallback } from "../shared/http";
import { iterateSSE } from "../shared/sse";
import { ENGLISH_FRAMING } from "./prompt/en";
import { CHINESE_FRAMING } from "./prompt/zh";

const responseSchema = {
  type: "object",
  properties: {
    corrections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          suggestion: { type: "string" },
          type: { type: "string", enum: [...CORRECTION_TYPES] },
          reason: { type: "string" },
          severity: { type: "string", enum: ["info", "minor", "major"] },
        },
        required: ["original", "suggestion", "type", "reason"],
        propertyOrdering: ["original", "suggestion", "type", "reason", "severity"],
      },
    },
  },
  required: ["corrections"],
};

interface AdapterOpts {
  fetchImpl?: typeof fetch;
}

export interface StreamRequest {
  url: string;
  init: RequestInit;
}

interface GeminiStreamChunk {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { candidatesTokenCount?: number };
}

function buildBody(text: string, config: ProviderConfig): string {
  const lang = config.language && config.language !== "auto" ? config.language : detect(text);
  const framing = lang === "zh" ? CHINESE_FRAMING : ENGLISH_FRAMING;
  return JSON.stringify({
    systemInstruction: { parts: [{ text: assembleSystem(framing, config.reasonLanguage) }] },
    contents: [{ role: "user", parts: [{ text: assembleUser(text) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0.2,
    },
  });
}

/** Streaming request shared by the browser direct call and the /api/polish proxy route. */
export function buildStreamRequest(text: string, config: ProviderConfig): StreamRequest {
  const model = config.model || "gemini-3.5-flash";
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildBody(text, config),
    },
  };
}

async function readGeminiStream(res: Response, onToken: (approxTokens: number) => void): Promise<PolishResult> {
  if (!res.body) throw new Error("response has no body");
  let content = "";
  let usageTokens: number | null = null;
  for await (const payload of iterateSSE(res.body)) {
    let chunk: GeminiStreamChunk;
    try {
      chunk = JSON.parse(payload) as GeminiStreamChunk;
    } catch {
      continue; // malformed frame — skip, keep consuming
    }
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) content += p.text ?? "";
    if (parts.length > 0) onToken(Math.max(1, Math.ceil(content.length / 4)));
    const usage = chunk.usageMetadata?.candidatesTokenCount;
    if (typeof usage === "number") usageTokens = usage;
  }
  if (usageTokens !== null) onToken(usageTokens);
  return parsePolishResult(content);
}

export function createGeminiProvider({ fetchImpl }: AdapterOpts = {}): Provider {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  return {
    id: "gemini",
    async polish(text: string, config: ProviderConfig): Promise<PolishResult> {
      const model = config.model || "gemini-3.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildBody(text, config),
      });
      if (!res.ok) {
        const err = new Error(`gemini returned ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const content: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return parsePolishResult(content);
    },

    async polishStream(text, config, onToken, signal) {
      const { url, init } = buildStreamRequest(text, config);
      const res = await callStreamWithFallback(
        () => fetchFn(url, { ...init, signal }),
        { proxyBody: { providerId: "gemini", adapter: "gemini", payload: { text, config } } },
        (u, i) => fetchFn(u, i),
      );
      if (!res.ok) {
        const err = new Error(`gemini returned ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return readGeminiStream(res, onToken);
    },
  };
}
```

- [ ] **Step 4: 跑全部 gemini 测试确认通过（含旧测试不回归）**

Run: `npx vitest run tests/providers/gemini`
Expected: 旧测试 + 新 4 个全部通过

- [ ] **Step 5: Commit**

```bash
git add lib/providers/gemini/adapter.ts tests/providers/gemini/stream.test.ts
git commit -m "feat(gemini): SSE polishStream + shared buildStreamRequest"
```

---

### Task 6: 代理路由流式透传

**Files:**
- Modify: `app/api/polish/route.ts`
- Test: `tests/api/polish-stream.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/api/polish-stream.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/polish/route";

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/polish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

const STREAM_BODY = {
  providerId: "deepseek",
  adapter: "openai-compatible",
  stream: true,
  payload: {
    text: "hi",
    config: { apiKey: "SECRET_KEY", model: "deepseek-v4-pro", baseURL: "https://api.deepseek.com/v1" },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/api/polish stream passthrough", () => {
  it("pipes upstream SSE bytes back with an event-stream content type", async () => {
    const upstream = new Response(streamOf(["data: {}\n\n"]), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeReq(STREAM_BODY));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(await res.text()).toBe("data: {}\n\n");
  });

  it("forwards the api key upstream as Authorization, never in the response", async () => {
    const upstream = new Response(streamOf(["data: {}\n\n"]), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeReq(STREAM_BODY));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer SECRET_KEY");
    expect(await res.text()).not.toContain("SECRET_KEY");
  });

  it("returns {error} with the upstream status when upstream is not OK", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(makeReq(STREAM_BODY));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("401");
  });

  it("returns 400 when the api key is missing", async () => {
    const res = await POST(makeReq({ ...STREAM_BODY, payload: { text: "hi", config: { apiKey: "", model: "m" } } }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/api/polish-stream.test.ts`
Expected: FAIL — 流式分支尚不存在（返回的 JSON 不是 SSE / content-type 不匹配）

- [ ] **Step 3: 修改 route.ts（完整替换）**

```ts
// app/api/polish/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createGeminiProvider, buildStreamRequest as buildGeminiStreamRequest } from "@/lib/providers/gemini/adapter";
import { createOpenAICompatibleProvider, buildStreamRequest as buildOpenAIStreamRequest } from "@/lib/providers/openai-compatible/adapter";
import type { ProviderConfig } from "@/lib/providers/shared/schema";
import type { AdapterKind } from "@/lib/providers/shared/presets";

export const runtime = "nodejs";
// Stateless: no caching, no persistence.
export const dynamic = "force-dynamic";

interface ProxyRequest {
  providerId: string;
  adapter: AdapterKind;
  payload: { text: string; config: ProviderConfig };
  stream?: boolean;
}

export async function POST(req: NextRequest) {
  let body: ProxyRequest;
  try {
    body = (await req.json()) as ProxyRequest;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const { providerId, adapter, payload } = body;
  if (!providerId || !adapter || !payload?.config?.apiKey || typeof payload?.text !== "string") {
    return NextResponse.json(
      { error: "missing providerId, adapter, payload.config.apiKey, or payload.text" },
      { status: 400 },
    );
  }

  // Streaming passthrough: relay the upstream SSE byte stream untouched.
  // Nothing is parsed, stored, cached, or logged — same stateless contract.
  if (body.stream) {
    try {
      const { url, init } =
        adapter === "gemini"
          ? buildGeminiStreamRequest(payload.text, payload.config)
          : buildOpenAIStreamRequest(payload.text, payload.config);
      const upstream = await fetch(url, init);
      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => "");
        return NextResponse.json(
          { error: `upstream returned ${upstream.status}: ${detail.slice(0, 300)}` },
          { status: upstream.ok ? 502 : upstream.status },
        );
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "proxy stream failed";
      // SECURITY: never include the apiKey in the response or logs.
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  try {
    const impl =
      adapter === "gemini"
        ? createGeminiProvider()
        : createOpenAICompatibleProvider({ id: providerId });
    const result = await impl.polish(payload.text, payload.config);
    return NextResponse.json(result);
  } catch (err) {
    const status = (err as Error & { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "proxy polish failed";
    // SECURITY: never include the apiKey in the response or logs.
    return NextResponse.json({ error: message }, { status });
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/api/polish-stream.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add app/api/polish/route.ts tests/api/polish-stream.test.ts
git commit -m "feat(proxy): SSE stream passthrough via shared buildStreamRequest"
```

---

### Task 7: 任务模型与纯存储 `lib/tasks/`

**Files:**
- Create: `lib/tasks/types.ts`
- Create: `lib/tasks/store.ts`
- Test: `tests/tasks/store.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/tasks/store.test.ts
import { describe, it, expect } from "vitest";
import {
  MAX_TASKS,
  TASKS_STORAGE_KEY,
  enqueueTask,
  updateTask,
  removeTask,
  rehydrateTasks,
  loadTasks,
  saveTasks,
  type StorageLike,
} from "@/lib/tasks/store";
import type { PolishTask } from "@/lib/tasks/types";

function makeTask(id: string, over: Partial<PolishTask> = {}): PolishTask {
  return {
    id,
    text: `text-${id}`,
    createdAt: Number(id) || 0,
    providerId: "deepseek",
    model: "deepseek-v4-pro",
    status: "running",
    approxTokens: 0,
    unread: false,
    ...over,
  };
}

function memoryStorage(): StorageLike & { dump(): PolishTask[] } {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    dump: () => JSON.parse(map.get(TASKS_STORAGE_KEY) ?? "[]") as PolishTask[],
  };
}

describe("enqueueTask", () => {
  it("prepends the new task at the head", () => {
    const next = enqueueTask([makeTask("1")], makeTask("2"));
    expect(next.map((t) => t.id)).toEqual(["2", "1"]);
  });

  it("evicts the oldest beyond MAX_TASKS", () => {
    let tasks: PolishTask[] = [];
    for (let i = 1; i <= MAX_TASKS + 3; i++) tasks = enqueueTask(tasks, makeTask(String(i)));
    expect(tasks).toHaveLength(MAX_TASKS);
    expect(tasks[0].id).toBe(String(MAX_TASKS + 3));
    expect(tasks.some((t) => t.id === "1")).toBe(false);
  });
});

describe("updateTask / removeTask", () => {
  it("patches only the matching task", () => {
    const next = updateTask([makeTask("1"), makeTask("2")], "2", { approxTokens: 9 });
    expect(next[1].approxTokens).toBe(9);
    expect(next[0].approxTokens).toBe(0);
  });

  it("removes by id", () => {
    expect(removeTask([makeTask("1"), makeTask("2")], "1").map((t) => t.id)).toEqual(["2"]);
  });
});

describe("rehydrateTasks", () => {
  it("marks running tasks as interrupted, leaves others alone", () => {
    const out = rehydrateTasks([makeTask("1"), makeTask("2", { status: "done" }), makeTask("3", { status: "error" })]);
    expect(out.map((t) => t.status)).toEqual(["interrupted", "done", "error"]);
  });
});

describe("loadTasks", () => {
  it("returns [] on corrupt JSON", () => {
    const storage = memoryStorage();
    storage.setItem(TASKS_STORAGE_KEY, "{{{");
    expect(loadTasks(storage)).toEqual([]);
  });

  it("rehydrates running tasks loaded from storage", () => {
    const storage = memoryStorage();
    storage.setItem(TASKS_STORAGE_KEY, JSON.stringify([makeTask("1")]));
    expect(loadTasks(storage)[0].status).toBe("interrupted");
  });
});

describe("saveTasks", () => {
  it("persists serialized tasks", () => {
    const storage = memoryStorage();
    saveTasks(storage, [makeTask("1")]);
    expect(storage.dump()).toHaveLength(1);
  });

  it("evicts oldest on QuotaExceededError until it fits", () => {
    const map = new Map<string, string>();
    const storage: StorageLike & { dump(): PolishTask[] } = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        if ((JSON.parse(v) as unknown[]).length > 2) {
          const e = new Error("quota");
          e.name = "QuotaExceededError";
          throw e;
        }
        map.set(k, v);
      },
      dump: () => JSON.parse(map.get(TASKS_STORAGE_KEY) ?? "[]") as PolishTask[],
    };
    saveTasks(storage, [makeTask("5"), makeTask("4"), makeTask("3"), makeTask("2"), makeTask("1")]);
    expect(storage.dump().map((t) => t.id)).toEqual(["5", "4"]);
  });

  it("silently gives up when storage always throws", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => saveTasks(storage, [makeTask("1")])).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/tasks/store.test.ts`
Expected: FAIL — `Cannot find module '@/lib/tasks/store'`

- [ ] **Step 3: 实现 types.ts 与 store.ts**

```ts
// lib/tasks/types.ts
import type { PolishResult } from "@/lib/providers/shared/schema";
import type { PolishError } from "@/lib/providers/shared/errors";

export type TaskStatus = "running" | "done" | "error" | "interrupted";

export interface PolishTask {
  id: string;                    // crypto.randomUUID()
  text: string;                  // snapshot of the source text at enqueue time
  createdAt: number;             // Date.now()
  providerId: string;
  model: string;
  status: TaskStatus;
  approxTokens: number;          // grows live while running (memory only)
  result?: PolishResult;         // set when done — restores the review state
  error?: PolishError;           // set when error
  unread: boolean;               // true only for tasks completed in the background
}
```

```ts
// lib/tasks/store.ts
import type { PolishTask } from "./types";

export const MAX_TASKS = 50;
export const TASKS_STORAGE_KEY = "grammar-polisher.tasks.v1";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function enqueueTask(tasks: PolishTask[], task: PolishTask): PolishTask[] {
  return [task, ...tasks].slice(0, MAX_TASKS);
}

export function updateTask(tasks: PolishTask[], id: string, patch: Partial<PolishTask>): PolishTask[] {
  return tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

export function removeTask(tasks: PolishTask[], id: string): PolishTask[] {
  return tasks.filter((t) => t.id !== id);
}

/** After a reload, any task still marked running is dead (its fetch died with the page). */
export function rehydrateTasks(tasks: PolishTask[]): PolishTask[] {
  return tasks.map((t) => (t.status === "running" ? { ...t, status: "interrupted" as const } : t));
}

export function loadTasks(storage: StorageLike): PolishTask[] {
  try {
    const raw = storage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return rehydrateTasks(parsed as PolishTask[]);
  } catch {
    return [];
  }
}

/** Persist; on quota errors evict the oldest until it fits (or give up silently). */
export function saveTasks(storage: StorageLike, tasks: PolishTask[]): void {
  let current = tasks;
  for (;;) {
    try {
      storage.setItem(TASKS_STORAGE_KEY, JSON.stringify(current));
      return;
    } catch {
      if (current.length === 0) return;
      current = current.slice(0, -1);
    }
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/tasks/store.test.ts`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/types.ts lib/tasks/store.ts tests/tasks/store.test.ts
git commit -m "feat: task model + pure store with localStorage persistence"
```

---

### Task 8: `hooks/useTasks.ts`

**Files:**
- Create: `hooks/useTasks.ts`
- Test: `tests/hooks/useTasks.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// tests/hooks/useTasks.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTasks } from "@/hooks/useTasks";
import { TASKS_STORAGE_KEY } from "@/lib/tasks/store";
import type { PolishTask } from "@/lib/tasks/types";

function storedTask(id: string, over: Partial<PolishTask> = {}): PolishTask {
  return {
    id,
    text: `text-${id}`,
    createdAt: 1,
    providerId: "deepseek",
    model: "m",
    status: "done",
    approxTokens: 3,
    unread: true,
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useTasks", () => {
  it("loads persisted tasks on mount (running -> interrupted)", () => {
    window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify([storedTask("a", { status: "running" })]));
    const { result } = renderHook(() => useTasks());
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].status).toBe("interrupted");
  });

  it("enqueue prepends and persists", () => {
    const { result } = renderHook(() => useTasks());
    let id = "";
    act(() => {
      id = result.current.enqueue("hello", { providerId: "deepseek", model: "m" });
    });
    expect(result.current.tasks[0].id).toBe(id);
    expect(result.current.tasks[0].status).toBe("running");
    const persisted = JSON.parse(window.localStorage.getItem(TASKS_STORAGE_KEY) ?? "[]") as PolishTask[];
    expect(persisted[0]?.id).toBe(id);
  });

  it("approxTokens-only updates stay in memory (no storage write)", () => {
    const { result } = renderHook(() => useTasks());
    let id = "";
    act(() => {
      id = result.current.enqueue("hello", { providerId: "deepseek", model: "m" });
    });
    const spy = vi.spyOn(Storage.prototype, "setItem");
    act(() => {
      result.current.update(id, { approxTokens: 12 });
    });
    expect(result.current.tasks[0].approxTokens).toBe(12);
    expect(spy).not.toHaveBeenCalled();
  });

  it("status-changing updates persist", () => {
    const { result } = renderHook(() => useTasks());
    let id = "";
    act(() => {
      id = result.current.enqueue("hello", { providerId: "deepseek", model: "m" });
    });
    act(() => {
      result.current.update(id, { status: "done", result: { corrections: [] } });
    });
    const persisted = JSON.parse(window.localStorage.getItem(TASKS_STORAGE_KEY) ?? "[]") as PolishTask[];
    expect(persisted[0]?.status).toBe("done");
  });

  it("markRead clears unread and persists", () => {
    window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify([storedTask("a")]));
    const { result } = renderHook(() => useTasks());
    act(() => {
      result.current.markRead("a");
    });
    expect(result.current.tasks[0].unread).toBe(false);
    const persisted = JSON.parse(window.localStorage.getItem(TASKS_STORAGE_KEY) ?? "[]") as PolishTask[];
    expect(persisted[0]?.unread).toBe(false);
  });

  it("remove deletes and persists", () => {
    const { result } = renderHook(() => useTasks());
    let id = "";
    act(() => {
      id = result.current.enqueue("hello", { providerId: "deepseek", model: "m" });
    });
    act(() => {
      result.current.remove(id);
    });
    expect(result.current.tasks).toHaveLength(0);
    expect(JSON.parse(window.localStorage.getItem(TASKS_STORAGE_KEY) ?? "[]")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/hooks/useTasks.test.tsx`
Expected: FAIL — `Cannot find module '@/hooks/useTasks'`

- [ ] **Step 3: 实现**

```ts
// hooks/useTasks.ts
"use client";
import { useCallback, useEffect, useState } from "react";
import { enqueueTask, loadTasks, removeTask, saveTasks, updateTask } from "@/lib/tasks/store";
import type { PolishTask } from "@/lib/tasks/types";

/** Token-count ticks are high-frequency and worthless after a reload — memory only. */
function isTokenOnlyPatch(patch: Partial<PolishTask>): boolean {
  return Object.keys(patch).every((k) => k === "approxTokens");
}

export function useTasks() {
  const [tasks, setTasks] = useState<PolishTask[]>([]);

  useEffect(() => {
    // Hydration-safe load (DEFAULTS first paint, storage after mount) — same
    // pattern as useSettings. Also writes the rehydrated list back so
    // interrupted tasks don't get re-marked on every load.
    const loaded = loadTasks(window.localStorage);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTasks(loaded);
    saveTasks(window.localStorage, loaded);
  }, []);

  const enqueue = useCallback((text: string, meta: { providerId: string; model: string }): string => {
    const task: PolishTask = {
      id: crypto.randomUUID(),
      text,
      createdAt: Date.now(),
      providerId: meta.providerId,
      model: meta.model,
      status: "running",
      approxTokens: 0,
      unread: false,
    };
    setTasks((prev) => {
      const next = enqueueTask(prev, task);
      saveTasks(window.localStorage, next);
      return next;
    });
    return task.id;
  }, []);

  const update = useCallback((id: string, patch: Partial<PolishTask>) => {
    setTasks((prev) => {
      const next = updateTask(prev, id, patch);
      if (!isTokenOnlyPatch(patch)) saveTasks(window.localStorage, next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setTasks((prev) => {
      const next = removeTask(prev, id);
      saveTasks(window.localStorage, next);
      return next;
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setTasks((prev) => {
      const next = updateTask(prev, id, { unread: false });
      saveTasks(window.localStorage, next);
      return next;
    });
  }, []);

  return { tasks, enqueue, update, remove, markRead };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/hooks/useTasks.test.tsx`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add hooks/useTasks.ts tests/hooks/useTasks.test.tsx
git commit -m "feat: useTasks hook (persistence on status changes only)"
```

---

### Task 9: `hooks/usePolish.ts` 重写为任务运行器

**Files:**
- Modify: `hooks/usePolish.ts`（完整重写）
- Test: `tests/hooks/usePolish.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/hooks/usePolish.test.tsx`
Expected: FAIL — 现有 usePolish 没有 run/abort（`result.current.run is not a function`）

- [ ] **Step 3: 完整重写 usePolish.ts**

```ts
// hooks/usePolish.ts
"use client";
import { useCallback, useRef } from "react";
import { getProviderFor } from "@/lib/providers/shared";
import { callWithFallback } from "@/lib/providers/shared/http";
import { toPolishError } from "@/lib/providers/shared/errors";
import type { PolishResult, ProviderConfig } from "@/lib/providers/shared/schema";
import type { AdapterKind } from "@/lib/providers/shared/presets";
import type { PolishTask } from "@/lib/tasks/types";

export type { PolishError, PolishErrorKind } from "@/lib/providers/shared/errors";

export interface RunOptions {
  providerId: string;
  adapter: AdapterKind;
  config: ProviderConfig;
}

type UpdateTask = (id: string, patch: Partial<PolishTask>) => void;

/**
 * Task runner: executes one polish per task id, reporting progress into the
 * task list via `update`. Multiple runs proceed in parallel — each owns an
 * AbortController so removing a running task can cancel its fetch.
 */
export function usePolish(update: UpdateTask) {
  const controllers = useRef(new Map<string, AbortController>());

  const run = useCallback(
    async (taskId: string, text: string, opts: RunOptions): Promise<PolishResult | null> => {
      if (!opts.config.apiKey) {
        update(taskId, {
          status: "error",
          error: { kind: "no-key", message: "请先在设置里填写 API Key", retryable: false },
        });
        return null;
      }
      const ac = new AbortController();
      controllers.current.set(taskId, ac);
      try {
        const provider = getProviderFor({ id: opts.providerId, adapter: opts.adapter });
        const onToken = (n: number) => update(taskId, { approxTokens: n });
        let body: PolishResult;
        if (provider.polishStream) {
          // SSE path; proxy fallback on CORS lives inside polishStream.
          body = await provider.polishStream(text, opts.config, onToken, ac.signal);
        } else {
          // Legacy non-stream path (proxy fallback here, as before).
          const direct = async () => {
            const b = await provider.polish(text, opts.config);
            return { ok: true as const, status: 200, body: b };
          };
          const proxyBody = {
            providerId: opts.providerId,
            adapter: opts.adapter,
            payload: { text, config: opts.config },
          };
          ({ body } = await callWithFallback<PolishResult>(direct, { proxyBody }));
        }
        update(taskId, { status: "done", result: body });
        return body;
      } catch (err) {
        if (ac.signal.aborted) return null; // task removed mid-flight — leave no trace
        update(taskId, { status: "error", error: toPolishError(err) });
        return null;
      } finally {
        controllers.current.delete(taskId);
      }
    },
    [update],
  );

  const abort = useCallback((taskId: string) => {
    controllers.current.get(taskId)?.abort();
  }, []);

  return { run, abort };
}
```

注意：本重写删除了旧的 `status/result/error/reset` 状态与 `PolishStatus` 类型；`app/page.tsx` 在 Task 12 才会切到新 API，此 Task 后 `npm run typecheck` 会暂时报错，属预期——**Step 4 只跑 vitest，不跑 typecheck**。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/hooks/usePolish.test.tsx`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add hooks/usePolish.ts tests/hooks/usePolish.test.tsx
git commit -m "feat: rewrite usePolish as parallel task runner with abort"
```

---

### Task 10: 展示辅助 `lib/tasks/format.ts`

**Files:**
- Create: `lib/tasks/format.ts`
- Test: `tests/tasks/format.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/tasks/format.test.ts
import { describe, it, expect } from "vitest";
import { taskSnippet, formatRelTime, taskStatusLabel } from "@/lib/tasks/format";

describe("taskSnippet", () => {
  it("collapses whitespace and trims", () => {
    expect(taskSnippet("  hello\n\nworld  ")).toBe("hello world");
  });

  it("truncates beyond 40 chars with an ellipsis", () => {
    const out = taskSnippet("a".repeat(50));
    expect(out).toBe(`${"a".repeat(40)}…`);
  });

  it("keeps short text intact", () => {
    expect(taskSnippet("short")).toBe("short");
  });
});

describe("formatRelTime", () => {
  const now = Date.parse("2026-07-16T12:00:00");

  it("just now under a minute", () => {
    expect(formatRelTime(now - 30_000, now)).toBe("刚刚");
  });

  it("minutes under an hour", () => {
    expect(formatRelTime(now - 5 * 60_000, now)).toBe("5 分钟前");
  });

  it("hours under a day", () => {
    expect(formatRelTime(now - 3 * 3_600_000, now)).toBe("3 小时前");
  });

  it("M-D beyond a day", () => {
    const ts = Date.parse("2026-07-10T08:00:00");
    expect(formatRelTime(ts, now)).toBe("7-10");
  });
});

describe("taskStatusLabel", () => {
  it("maps statuses, with unread done shown as 未读", () => {
    expect(taskStatusLabel({ status: "running", unread: false })).toBe("进行中");
    expect(taskStatusLabel({ status: "done", unread: true })).toBe("未读");
    expect(taskStatusLabel({ status: "done", unread: false })).toBe("已完成");
    expect(taskStatusLabel({ status: "error", unread: false })).toBe("失败");
    expect(taskStatusLabel({ status: "interrupted", unread: false })).toBe("已中断");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/tasks/format.test.ts`
Expected: FAIL — `Cannot find module '@/lib/tasks/format'`

- [ ] **Step 3: 实现**

```ts
// lib/tasks/format.ts
import type { PolishTask } from "./types";

/** First line-ish snippet of the task's source text, for the list item title. */
export function taskSnippet(text: string, max = 40): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}…`;
}

export function formatRelTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

export function taskStatusLabel(task: Pick<PolishTask, "status" | "unread">): string {
  switch (task.status) {
    case "running":
      return "进行中";
    case "done":
      return task.unread ? "未读" : "已完成";
    case "error":
      return "失败";
    case "interrupted":
      return "已中断";
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/tasks/format.test.ts`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/format.ts tests/tasks/format.test.ts
git commit -m "feat: task list display helpers"
```

---

### Task 11: `components/TaskList.tsx` 侧栏组件

**Files:**
- Create: `components/TaskList.tsx`

无单测（纯展示组件，与现状一致）；以 lint + typecheck 验证。

- [ ] **Step 1: 实现组件**

```tsx
// components/TaskList.tsx
"use client";
import type { PolishTask } from "@/lib/tasks/types";
import { formatRelTime, taskSnippet, taskStatusLabel } from "@/lib/tasks/format";

interface TaskListProps {
  tasks: PolishTask[];
  focusedId: string | null;
  onPick: (id: string) => void;
  onRemove: (id: string) => void;
}

export function TaskList({ tasks, focusedId, onPick, onRemove }: TaskListProps) {
  const now = Date.now();
  return (
    <aside className="gp-tasks">
      <div className="gp-tasks-title">任务</div>
      {tasks.length === 0 && <div className="gp-tasks-empty">暂无任务</div>}
      <ul className="gp-tasks-list">
        {tasks.map((t) => {
          const cls = [
            "gp-task",
            t.id === focusedId ? "gp-task-focused" : "",
            t.status === "done" && t.unread ? "gp-task-unread" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={t.id}>
              <button type="button" className={cls} onClick={() => onPick(t.id)}>
                <span className="gp-task-top">
                  <span className="gp-task-snippet">{taskSnippet(t.text)}</span>
                  {t.status === "done" && t.unread && <span className="gp-task-dot" />}
                </span>
                <span className="gp-task-meta">
                  <span className={`gp-task-status gp-task-status-${t.status}`}>
                    {t.status === "running" ? `进行中 ≈${t.approxTokens} tok` : taskStatusLabel(t)}
                  </span>
                  <span className="gp-task-model">{t.model}</span>
                  <span className="gp-task-time">{formatRelTime(t.createdAt, now)}</span>
                </span>
              </button>
              <button
                type="button"
                className="gp-task-remove"
                title="删除"
                onClick={() => onRemove(t.id)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 2: 验证**

Run: `npm run typecheck`
Expected: **只允许** `app/page.tsx` 报错（usePolish 旧 API 已在 Task 9 移除，Task 12 才接线——预期内）；`components/TaskList.tsx` 不得有任何错误。

- [ ] **Step 3: Commit**

```bash
git add components/TaskList.tsx
git commit -m "feat: TaskList sidebar component"
```

---

### Task 12: 页面接线（page.tsx + Editor + globals.css）

**Files:**
- Modify: `app/page.tsx`（完整重写）
- Modify: `components/Editor.tsx`（移除 readOnly prop —— busy 已成 per-task 概念，编辑器不再全局锁定）
- Modify: `app/globals.css`（布局 + 侧栏样式追加）

无单测（页面装配）；以 lint + typecheck + build + 人工验证为准。

- [ ] **Step 1: 完整重写 app/page.tsx**

```tsx
// app/page.tsx
"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Editor } from "@/components/Editor";
import { SuggestionCard } from "@/components/SuggestionCard";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ModelSelect } from "@/components/ModelSelect";
import { TaskList } from "@/components/TaskList";
import { CopyIcon } from "@/components/Icons";
import { useSettings } from "@/hooks/useSettings";
import { useTasks } from "@/hooks/useTasks";
import { usePolish } from "@/hooks/usePolish";
import { pinSpans } from "@/lib/providers/shared/match";
import { applyAccept } from "@/lib/providers/shared/offsets";
import { buildModelOptions, type ProviderEntry } from "@/lib/providers/shared/presets";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";

function findNextSuggestionId(
  suggestions: PinnedCorrection[],
  currentId: string,
): string | null {
  const current = suggestions.find((s) => s.id === currentId);
  if (!current || current.start < 0) return null;
  const pending = suggestions.filter((s) => s.state === "pending" && s.start >= 0);
  const after = pending
    .filter((s) => s.start > current.start)
    .sort((a, b) => a.start - b.start)[0];
  if (after) return after.id;
  const first = pending.sort((a, b) => a.start - b.start)[0];
  return first?.id ?? null;
}

export default function Home() {
  const MAX_CHARS = 50000;
  const { settings, update } = useSettings();
  const { tasks, enqueue, update: updateTask, remove: removeTask, markRead } = useTasks();
  const { run, abort } = usePolish(updateTask);

  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<PinnedCorrection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const [tasksOpen, setTasksOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Mirror focus into a ref so async completion callbacks read the latest value.
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    focusedRef.current = focusedTaskId;
  }, [focusedTaskId]);

  const focused = tasks.find((t) => t.id === focusedTaskId) ?? null;

  // Resolve the effective provider+model: prefer the user's selection if it has a key
  // and a valid model; otherwise fall back to the first available configured model.
  const effective = useMemo(() => {
    const options = buildModelOptions(settings.providers);
    const cur = settings.providers.find((p) => p.id === settings.selectedProviderId);
    if (cur && cur.apiKey && cur.models.includes(settings.selectedModel)) {
      return { provider: cur, model: settings.selectedModel, options };
    }
    if (options.length) return { provider: options[0].provider, model: options[0].model, options };
    return { provider: (cur ?? settings.providers[0]) as ProviderEntry, model: settings.selectedModel, options };
  }, [settings]);

  // Fire a new task for a snapshot. On completion: auto-load if still focused
  // (the user is watching it), otherwise mark unread in the list.
  const startTask = useCallback(
    async (snapshot: string) => {
      const reasonLanguage: "en" | "zh" =
        settings.reasonLanguage === "auto"
          ? typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("zh")
            ? "zh"
            : "en"
          : settings.reasonLanguage;
      const id = enqueue(snapshot, { providerId: effective.provider.id, model: effective.model });
      setFocusedTaskId(id);
      setSuggestions([]);
      setActiveId(null);
      const body = await run(id, snapshot, {
        providerId: effective.provider.id,
        adapter: effective.provider.adapter,
        config: {
          apiKey: effective.provider.apiKey,
          model: effective.model,
          baseURL: effective.provider.baseURL || undefined,
          language: settings.language,
          reasonLanguage,
        },
      });
      if (!body) return;
      if (focusedRef.current === id) {
        // Editor text still equals the snapshot (any edit would have detached focus).
        setSuggestions(pinSpans(snapshot, body.corrections));
        setActiveId(null);
      } else {
        updateTask(id, { unread: true });
      }
    },
    [settings, effective, enqueue, run, updateTask],
  );

  const onPolish = useCallback(() => {
    void startTask(text);
  }, [startTask, text]);

  const handlePickTask = useCallback(
    (id: string) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      setFocusedTaskId(id);
      setText(t.text);
      setActiveId(null);
      if (t.status === "done") {
        setSuggestions(pinSpans(t.text, t.result?.corrections ?? []));
        if (t.unread) markRead(id);
      } else {
        setSuggestions([]);
      }
    },
    [tasks, markRead],
  );

  const handleRemoveTask = useCallback(
    (id: string) => {
      abort(id);
      removeTask(id);
      if (focusedRef.current === id) {
        setFocusedTaskId(null);
        setSuggestions([]);
        setActiveId(null);
      }
    },
    [abort, removeTask],
  );

  const handleAccept = useCallback(
    (id: string) => {
      setSuggestions((prev) => {
        const { text: newText, suggestions: newSugs } = applyAccept(text, prev, id);
        setText(newText);
        setActiveId(findNextSuggestionId(newSugs, id));
        return newSugs;
      });
    },
    [text],
  );

  const handleReject = useCallback((id: string) => {
    setSuggestions((prev) => {
      const newSugs = prev.map((s) => (s.id === id ? { ...s, state: "rejected" as const } : s));
      setActiveId(findNextSuggestionId(newSugs, id));
      return newSugs;
    });
  }, []);

  const handleAcceptAll = useCallback(() => {
    setSuggestions((prev) => {
      let t = text;
      let sugs = prev;
      const pending = sugs
        .filter((x) => x.state === "pending" && x.start >= 0)
        .sort((a, b) => a.start - b.start);
      for (const p of pending) {
        const r = applyAccept(t, sugs, p.id);
        t = r.text;
        sugs = r.suggestions;
      }
      setText(t);
      return sugs;
    });
    setActiveId(null);
  }, [text]);

  const handleTextChange = useCallback(
    (t: string) => {
      setText(t);
      // Manual edit invalidates pinned suggestions AND detaches from the focused
      // task (a running task keeps going in the background and lands as unread).
      if (suggestions.length > 0) {
        setSuggestions([]);
        setActiveId(null);
      }
      if (focusedRef.current !== null) setFocusedTaskId(null);
    },
    [suggestions.length],
  );

  const handleClear = useCallback(() => {
    setText("");
    setSuggestions([]);
    setActiveId(null);
    setFocusedTaskId(null);
  }, []);

  const copyResult = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  // Retry = enqueue a NEW task with the failed/interrupted task's snapshot.
  const retryFocused = useCallback(() => {
    if (focused && (focused.status === "error" || focused.status === "interrupted")) {
      void startTask(focused.text);
    }
  }, [focused, startTask]);

  const pendingCount = suggestions.filter((s) => s.state === "pending" && s.start >= 0).length;
  const unmatched = suggestions.filter((s) => s.matchTier === 3);
  const active = suggestions.find((s) => s.id === activeId) ?? null;
  const inReview = focused?.status === "done";

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCardHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  useEffect(() => {
    if (!activeId) return;
    const mark = document.querySelector<HTMLElement>(`[data-id="${activeId}"]`);
    if (mark) {
      mark.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeId]);

  return (
    <>
      <header className="gp-topbar">
        <button
          className="gp-icon-btn gp-tasks-toggle"
          title="任务列表"
          onClick={() => setTasksOpen((v) => !v)}
        >
          ☰
        </button>
        <div className="gp-logo">
          <span className="dot">Aa</span> Grammar Checker
        </div>
        <div className="gp-spacer" />
        <SettingsPanel settings={settings} update={update} />
      </header>

      <div className="gp-layout">
        <div className={tasksOpen ? "gp-tasks-wrap open" : "gp-tasks-wrap"}>
          <TaskList
            tasks={tasks}
            focusedId={focusedTaskId}
            onPick={(id) => {
              handlePickTask(id);
              setTasksOpen(false);
            }}
            onRemove={handleRemoveTask}
          />
        </div>
        {tasksOpen && <div className="gp-tasks-backdrop" onClick={() => setTasksOpen(false)} />}

        <main
          className={active ? "gp-wrap card-active" : "gp-wrap"}
          style={active ? ({ "--gp-card-height": `${cardHeight}px` } as React.CSSProperties) : undefined}
        >
          <div className="gp-card">
            <Editor
              text={text}
              onChange={handleTextChange}
              suggestions={suggestions}
              activeId={activeId}
              onPick={setActiveId}
              maxLength={MAX_CHARS}
            />
            <div className="gp-toolbar">
              <span className={text.length > MAX_CHARS ? "gp-count gp-count-over" : "gp-count"}>{text.length} / 50,000</span>
              <div className="gp-acts">
                <button
                  className="gp-icon-btn"
                  title={copied ? "Copied!" : "Copy text"}
                  disabled={!text}
                  onClick={copyResult}
                >
                  {copied ? "✓" : <CopyIcon />}
                </button>
                <button
                  className="gp-icon-btn"
                  title="Clear"
                  disabled={!text && suggestions.length === 0}
                  onClick={handleClear}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <div className="gp-actionrow">
            <ModelSelect
              providers={settings.providers}
              providerId={effective.provider.id}
              model={effective.model}
              onChange={(pid, m) => update({ selectedProviderId: pid, selectedModel: m })}
            />
            <div className="gp-actionrow-btns">
              {focused?.status === "running" && (
                <span className="gp-progress">Polishing… ≈{focused.approxTokens} tokens</span>
              )}
              {inReview && (
                <button
                  className="gp-btn"
                  onClick={handleAcceptAll}
                  disabled={pendingCount === 0}
                >
                  Accept all ({pendingCount})
                </button>
              )}
              <button
                className="gp-btn gp-btn-primary"
                onClick={onPolish}
                disabled={!effective.provider.apiKey || !text || text.length > MAX_CHARS}
              >
                Polish
              </button>
            </div>
          </div>

          {focused?.status === "error" && focused.error && (
            <div className="gp-panel gp-panel-error">
              {focused.error.message}
              {focused.error.retryable && (
                <button onClick={retryFocused} style={{ marginLeft: 8, background: "none", border: "none", color: "var(--gp-blue)", cursor: "pointer", textDecoration: "underline" }}>
                  重试
                </button>
              )}
            </div>
          )}

          {focused?.status === "interrupted" && (
            <div className="gp-panel gp-panel-empty">
              任务已中断（页面刷新或关闭）。
              <button onClick={retryFocused} style={{ marginLeft: 8, background: "none", border: "none", color: "var(--gp-blue)", cursor: "pointer", textDecoration: "underline" }}>
                重新 polish
              </button>
            </div>
          )}

          {focused?.status === "done" && focused.result && focused.result.corrections.length === 0 && (
            <div className="gp-panel gp-panel-empty">未发现可润色之处。</div>
          )}

          {active && (
            <div ref={cardRef}>
              <SuggestionCard suggestion={active} onAccept={handleAccept} onReject={handleReject} />
            </div>
          )}

          {unmatched.length > 0 && (
            <details className="gp-panel gp-panel-unmatched">
              <summary>{unmatched.length} 条无法定位（仅参考）</summary>
              <ul style={{ marginTop: 8, lineHeight: 1.8 }}>
                {unmatched.map((u) => (
                  <li key={u.id}>
                    <span style={{ color: "var(--gp-red-text)" }}>{u.original}</span>
                    {u.suggestion && (
                      <>
                        {" → "}
                        <span style={{ color: "var(--gp-green)" }}>{u.suggestion}</span>
                      </>
                    )}
                    <span style={{ color: "var(--gp-sub)" }}> — {u.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </main>
      </div>
    </>
  );
}
```

- [ ] **Step 2: 移除 Editor 的 readOnly prop**

`components/Editor.tsx` 改动三处：

```tsx
// 1) props 接口删除 readOnly 行：
interface EditorProps {
  text: string;
  onChange: (t: string) => void;
  suggestions: PinnedCorrection[];
  activeId: string | null;
  onPick: (id: string | null) => void;
  maxLength?: number;
}

// 2) 函数签名删除 readOnly：
export function Editor({ text, onChange, suggestions, activeId, onPick, maxLength }: EditorProps) {

// 3) textarea 删除 readOnly={readOnly} 属性行。
```

- [ ] **Step 3: globals.css 追加侧栏样式（追加到文件末尾）**

```css
/* ---- task queue layout (sidebar + main) ---- */
.gp-layout {
  display: flex; gap: 24px; align-items: flex-start;
  max-width: 1120px; margin: 40px auto 80px; padding: 0 20px;
}
.gp-layout .gp-wrap { flex: 1; min-width: 0; max-width: none; margin: 0; padding: 0; }
.gp-tasks-wrap { width: 280px; flex-shrink: 0; position: sticky; top: 88px; }
.gp-tasks {
  background: #fff; border: 1px solid var(--gp-line); border-radius: 12px;
  box-shadow: var(--gp-shadow); overflow: hidden;
}
.gp-tasks-title { padding: 12px 16px; font-size: 13px; font-weight: 600; color: var(--gp-sub); border-bottom: 1px solid var(--gp-line); }
.gp-tasks-empty { padding: 24px 16px; font-size: 13px; color: var(--gp-sub); text-align: center; }
.gp-tasks-list { list-style: none; margin: 0; padding: 0; max-height: calc(100vh - 200px); overflow-y: auto; }
.gp-tasks-list li { position: relative; border-bottom: 1px solid var(--gp-line); }
.gp-tasks-list li:last-child { border-bottom: none; }
.gp-task {
  display: block; width: 100%; text-align: left; border: none; background: transparent;
  cursor: pointer; padding: 10px 36px 10px 14px; font-family: inherit;
}
.gp-task:hover { background: var(--gp-blue-soft); }
.gp-task-focused { background: var(--gp-blue-soft); box-shadow: inset 2px 0 0 var(--gp-blue); }
.gp-task-top { display: flex; align-items: center; gap: 6px; }
.gp-task-snippet { font-size: 13px; color: var(--gp-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gp-task-unread .gp-task-snippet { font-weight: 600; }
.gp-task-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gp-blue); flex-shrink: 0; }
.gp-task-meta { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 11px; color: var(--gp-sub); }
.gp-task-status-running { color: var(--gp-blue); }
.gp-task-status-running::before {
  content: ""; display: inline-block; width: 10px; height: 10px; margin-right: 4px;
  border: 2px solid var(--gp-blue); border-top-color: transparent; border-radius: 50%;
  animation: gp-spin 0.8s linear infinite; vertical-align: -1px;
}
@keyframes gp-spin { to { transform: rotate(360deg); } }
.gp-task-status-error { color: var(--gp-red-text); }
.gp-task-model { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gp-task-time { margin-left: auto; flex-shrink: 0; }
.gp-task-remove {
  position: absolute; top: 8px; right: 8px; width: 24px; height: 24px;
  border: none; border-radius: 50%; background: transparent; color: var(--gp-sub);
  cursor: pointer; font-size: 14px; line-height: 1;
}
.gp-task-remove:hover { background: rgba(60, 64, 67, 0.08); color: var(--gp-red-text); }
.gp-progress { font-size: 13px; color: var(--gp-sub); align-self: center; }
.gp-tasks-toggle { display: none; }
.gp-tasks-backdrop { display: none; }

@media (max-width: 899px) {
  .gp-tasks-toggle { display: flex; }
  .gp-tasks-wrap {
    position: fixed; left: 0; top: 64px; bottom: 0; z-index: 45; width: 300px;
    transform: translateX(-100%); transition: transform 0.2s; background: var(--gp-bg);
  }
  .gp-tasks-wrap.open { transform: translateX(0); box-shadow: var(--gp-shadow-pop); }
  .gp-tasks { border-radius: 0; height: 100%; }
  .gp-tasks-backdrop { display: block; position: fixed; inset: 64px 0 0 0; z-index: 44; background: rgba(0, 0, 0, 0.3); }
  .gp-layout { gap: 0; }
}
```

- [ ] **Step 4: 全量验证**

Run: `npm run lint && npm run typecheck && npm test`
Expected: 全部通过。若 `react-hooks/set-state-in-effect` 在 page.tsx 报错，按 AGENTS.md 惯例在精确的 setState 行上加 `// eslint-disable-next-line react-hooks/set-state-in-effect` 并附一句理由注释。

- [ ] **Step 5: 人工冒烟（开发服务器）**

Run: `npm run dev`，浏览器打开 http://localhost:3000 验证：
1. 配好任一 provider key → 输入文本 → Polish → 左侧队首出现任务，token 计数实时增长；
2. 完成后建议自动加载（主流程不变）；
3. 再改文字发第二个任务 → 第一个若在后台完成，列表标蓝点「未读」；
4. 点击未读任务 → 原文 + 建议恢复，蓝点消失；
5. 刷新页面 → 列表保留；若有 running 任务则显示「已中断」；
6. 窄屏（<900px）→ 顶栏 ☰ 打开抽屉；
7. Kimi（无 CORS）→ 自动走代理，流式进度正常。
验证后关闭 dev server。

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx components/Editor.tsx app/globals.css
git commit -m "feat: task queue sidebar + streaming progress wiring"
```

---

### Task 13: 文档同步与最终验收

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: 更新 AGENTS.md**

1. 「Open decisions」一节删除 `Streaming vs full response (v1: full response; streaming + incremental diff is a later enhancement).` 这一条。
2. 「BYOK gotcha」一节的第 2 点末尾追加一句：

```md
   Streaming uses the same route as an SSE passthrough (`stream: true` in the
   body): the route relays upstream bytes untouched — nothing parsed, stored,
   or logged.
```

3. 「Core UX loop」下方追加一条架构约束：

```md
- **Task queue**: every polish is a `PolishTask` (see `lib/tasks/`), run in parallel,
  persisted to localStorage (cap 50, newest first). The editor shows the *focused*
  task; background completions land as "unread". Spec: `docs/superpowers/specs/2026-07-16-task-queue-streaming-design.md`.
```

- [ ] **Step 2: 按仓库 pre-commit 顺序全量验证**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: 全部通过，build 成功。

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): task queue + streaming are now implemented"
```

---

## 附：任务依赖图

```
Task 1 (sse) ──┬──> Task 4 (openai stream) ──┐
Task 3 (http-stream) ──┬──> Task 4 ──────────┤
                └──> Task 5 (gemini stream) ─┴──> Task 6 (proxy route)
Task 2 (errors) ──> Task 7 (store) ──> Task 8 (useTasks) ──┐
                                        Task 9 (usePolish) ┤
Task 10 (format) ──> Task 11 (TaskList) ───────────────────┴──> Task 12 (page+css) ──> Task 13 (docs)
```

