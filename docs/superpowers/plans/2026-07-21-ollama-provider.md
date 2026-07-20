# Ollama Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ollama as a fifth builtin provider so users can polish text against local models (e.g. `gemma4:12b`) running in Ollama on `http://localhost:11434`, no API key required.

**Architecture:** Reuse the existing `openai-compatible` adapter (Ollama exposes `/v1/chat/completions`). Add a `requiresKey: boolean` field to `ProviderEntry` so keyless providers pass the existing gates. Detect localhost URLs in the streaming fallback path and skip the `/api/polish` proxy retry (which cannot reach the user's localhost from Vercel), throwing a clear error instead.

**Tech Stack:** Next.js + TypeScript, Vitest, existing `openai-compatible` adapter, localStorage settings.

**Spec:** [`docs/superpowers/specs/2026-07-21-ollama-provider-design.md`](../specs/2026-07-21-ollama-provider-design.md)

---

## File Structure

**Modify:**
- `lib/providers/shared/presets.ts` — add `requiresKey` field to `ProviderEntry`; append Ollama to `BUILTIN_PROVIDERS`; fix `buildModelOptions` gating; set `requiresKey: true` in `newCustomProvider`.
- `lib/providers/shared/http.ts` — extend `callStreamWithFallback` opts with optional `baseURL`; add localhost detection that skips the proxy retry.
- `lib/providers/openai-compatible/adapter.ts` — pass `config.baseURL` into `callStreamWithFallback` opts.
- `app/[lang]/Polisher.tsx` — relax two `apiKey` gates (effective-provider check + Polish button disabled).
- `components/SettingsPanel.tsx` — hide API key input for keyless providers; show static note instead.
- `hooks/useSettings.ts` — bump `STORAGE_KEY` from `v8` → `v9`; add `v8` to `LEGACY_KEYS`.
- `tests/providers/shared/presets.test.ts` — update builtin-id assertion; add Ollama + keyless coverage.
- `tests/providers/shared/http-stream.test.ts` — add localhost-skip coverage.

**No new files.**

---

## Task 1: Add `requiresKey` field, Ollama builtin, and fix `buildModelOptions` gating

**Files:**
- Modify: `lib/providers/shared/presets.ts`
- Test: `tests/providers/shared/presets.test.ts`

- [ ] **Step 1: Update `presets.test.ts` with failing assertions**

Replace the existing "seeds the built-in providers" test and add new ones. Open `tests/providers/shared/presets.test.ts` and replace the first `it(...)` block (lines 12-15) with:

```ts
  it("seeds the built-in providers with empty keys", () => {
    expect(BUILTIN_PROVIDERS.map((p) => p.id).sort()).toEqual([
      "deepseek",
      "gemini",
      "glm",
      "kimi",
      "ollama",
    ]);
    expect(BUILTIN_PROVIDERS.every((p) => p.builtin && p.apiKey === "")).toBe(true);
  });

  it("marks only Ollama as keyless", () => {
    const ollama = BUILTIN_PROVIDERS.find((p) => p.id === "ollama");
    expect(ollama?.requiresKey).toBe(false);
    expect(BUILTIN_PROVIDERS.filter((p) => p.id !== "ollama").every((p) => p.requiresKey === true)).toBe(true);
  });

  it("seeds Ollama pointing at localhost with the gemma4:12b default model", () => {
    const ollama = BUILTIN_PROVIDERS.find((p) => p.id === "ollama");
    expect(ollama?.adapter).toBe("openai-compatible");
    expect(ollama?.baseURL).toBe("http://localhost:11434/v1");
    expect(ollama?.models).toContain("gemma4:12b");
  });
```

Then update the existing "buildModelOptions only includes providers that have an API key" test (lines 25-32) — append a new case after it (do not replace the existing one):

```ts
  it("buildModelOptions includes keyless providers even without an API key", () => {
    const ps = defaultProviders();
    // Ollama is seeded with empty apiKey but requiresKey:false
    const opts = buildModelOptions(ps);
    const ollamaOpts = opts.filter((o) => o.provider.id === "ollama");
    expect(ollamaOpts.length).toBe(1);
    expect(ollamaOpts[0].model).toBe("gemma4:12b");
  });

  it("buildModelOptions still excludes keyed providers with empty API key", () => {
    const ps = defaultProviders();
    // deepseek/kimi/glm/gemini all have requiresKey:true and empty apiKey
    const opts = buildModelOptions(ps);
    expect(opts.filter((o) => o.provider.id !== "ollama")).toHaveLength(0);
  });

  it("newCustomProvider defaults to requiresKey:true", () => {
    expect(newCustomProvider().requiresKey).toBe(true);
  });
```

Also update the `mergeProviders` test (line 49) — change the expected id list:

```ts
    expect(merged.map((p) => p.id).sort()).toEqual(["deepseek", "gemini", "glm", "kimi", "ollama"]);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- presets.test`
Expected: FAIL — `requiresKey` undefined, `ollama` not in BUILTIN_PROVIDERS.

- [ ] **Step 3: Update `lib/providers/shared/presets.ts`**

Replace the `ProviderEntry` interface (lines 9-18) to add the field:

```ts
export interface ProviderEntry {
  id: string;
  label: string;
  adapter: AdapterKind;
  baseURL: string;
  apiKey: string;
  models: string[];
  keyUrl: string;
  builtin: boolean;
  requiresKey: boolean;
}
```

Replace the entire `BUILTIN_PROVIDERS` array (lines 20-25) — add `requiresKey: true` to each existing entry and append Ollama:

```ts
export const BUILTIN_PROVIDERS: ProviderEntry[] = [
  { id: "deepseek", label: "DeepSeek", adapter: "openai-compatible", baseURL: "https://api.deepseek.com/v1", apiKey: "", models: ["deepseek-v4-flash", "deepseek-v4-pro"], keyUrl: "https://platform.deepseek.com", builtin: true, requiresKey: true },
  { id: "kimi", label: "Kimi (Moonshot)", adapter: "openai-compatible", baseURL: "https://api.moonshot.cn/v1", apiKey: "", models: ["kimi-k2.6", "kimi-k2.7"], keyUrl: "https://platform.moonshot.cn", builtin: true, requiresKey: true },
  { id: "glm", label: "GLM (智谱)", adapter: "openai-compatible", baseURL: "https://open.bigmodel.cn/api/paas/v4", apiKey: "", models: ["glm-5.2"], keyUrl: "https://open.bigmodel.cn", builtin: true, requiresKey: true },
  { id: "gemini", label: "Gemini", adapter: "gemini", baseURL: "", apiKey: "", models: ["gemini-3.5-flash", "gemini-3.1-pro"], keyUrl: "https://ai.google.dev", builtin: true, requiresKey: true },
  { id: "ollama", label: "Ollama (Local)", adapter: "openai-compatible", baseURL: "http://localhost:11434/v1", apiKey: "", models: ["gemma4:12b"], keyUrl: "", builtin: true, requiresKey: false },
];
```

Update `buildModelOptions` (line 50) — change the gating check:

```ts
    if (!p.apiKey && p.requiresKey !== false) continue;
```

Update `newCustomProvider` (lines 57-68) — add `requiresKey: true`:

```ts
  return {
    id: `custom-${Date.now()}-${customCounter}`,
    label: `Custom ${customCounter}`,
    adapter: "openai-compatible",
    baseURL: "",
    apiKey: "",
    models: [],
    keyUrl: "",
    builtin: false,
    requiresKey: true,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- presets.test`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/presets.ts tests/providers/shared/presets.test.ts
git commit -m "feat(providers): add Ollama builtin with requiresKey field"
```

---

## Task 2: Skip proxy fallback for localhost URLs in `callStreamWithFallback`

**Files:**
- Modify: `lib/providers/shared/http.ts`
- Test: `tests/providers/shared/http-stream.test.ts`

- [ ] **Step 1: Add failing tests to `http-stream.test.ts`**

Append these two tests inside the existing `describe("callStreamWithFallback", ...)` block (before the closing `});` at line 64):

```ts
  it("does NOT fall back to proxy when baseURL is localhost (Ollama case)", async () => {
    const direct = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const proxyFetch = vi.fn();
    await expect(
      callStreamWithFallback(
        direct,
        { proxyBody: { providerId: "ollama" }, baseURL: "http://localhost:11434/v1" },
        proxyFetch,
      ),
    ).rejects.toThrow(/Ollama.*ollama serve/i);
    expect(proxyFetch).not.toHaveBeenCalled();
  });

  it("still falls back to proxy when baseURL is a cloud URL", async () => {
    const proxyRes = { ok: true, status: 200 } as unknown as Response;
    const direct = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const proxyFetch = vi.fn().mockResolvedValue(proxyRes);
    const out = await callStreamWithFallback(
      direct,
      { proxyBody: { providerId: "kimi" }, baseURL: "https://api.moonshot.cn/v1" },
      proxyFetch,
    );
    expect(out).toBe(proxyRes);
    expect(proxyFetch).toHaveBeenCalledTimes(1);
  });

  it("treats 127.0.0.1 as localhost too", async () => {
    const direct = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const proxyFetch = vi.fn();
    await expect(
      callStreamWithFallback(
        direct,
        { proxyBody: {}, baseURL: "http://127.0.0.1:11434/v1" },
        proxyFetch,
      ),
    ).rejects.toThrow(/Ollama.*ollama serve/i);
    expect(proxyFetch).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- http-stream.test`
Expected: FAIL — `baseURL` not a recognized opt, proxy IS called, error doesn't match.

- [ ] **Step 3: Update `lib/providers/shared/http.ts`**

Add a localhost-detection helper near the top of the file (after the existing imports, before `toHttpError`):

```ts
/** True if the URL points at the user's own machine — the Vercel proxy cannot reach it. */
function isLocalhostBaseURL(baseURL: string | undefined): boolean {
  if (!baseURL) return false;
  try {
    const host = new URL(baseURL).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
```

Update the `callStreamWithFallback` signature (around line 71-75) to accept `baseURL` in `opts`, and add the localhost short-circuit inside the `catch` block (before the existing `if (!(err instanceof TypeError)) throw err;`):

```ts
export async function callStreamWithFallback(
  direct: () => Promise<Response>,
  opts: { proxyBody: ProxyBody; signal?: AbortSignal; baseURL?: string },
  proxyFetch?: (url: string, init: RequestInit) => Promise<Response>,
): Promise<Response> {
  try {
    return await direct();
  } catch (err) {
    if (!(err instanceof TypeError)) throw err;
    if (isLocalhostBaseURL(opts.baseURL)) {
      throw new Error(
        `Could not reach local Ollama at ${opts.baseURL}. Is \`ollama serve\` running? (Ollama only works when the app runs locally, not on the deployed site.)`,
      );
    }
    const fetcher = proxyFetch ?? globalThis.fetch;
    const res = await fetcher("/api/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...opts.proxyBody, stream: true }),
      signal: opts.signal ?? null,
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- http-stream.test`
Expected: PASS — all 7 tests green (4 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/http.ts tests/providers/shared/http-stream.test.ts
git commit -m "feat(providers): skip proxy fallback for localhost URLs"
```

---

## Task 3: Pass `baseURL` from the OpenAI-compatible adapter into the fallback

**Files:**
- Modify: `lib/providers/openai-compatible/adapter.ts`

- [ ] **Step 1: Update the `polishStream` call to `callStreamWithFallback`**

In `lib/providers/openai-compatible/adapter.ts`, find the `polishStream` method (around lines 98-107). Add `baseURL: config.baseURL` to the `opts` object passed to `callStreamWithFallback`:

```ts
    async polishStream(text, config, onToken, signal) {
      const { url, init } = buildStreamRequest(text, config);
      const res = await callStreamWithFallback(
        () => fetchFn(url, { ...init, signal }),
        {
          proxyBody: { providerId: id, adapter: "openai-compatible", payload: { text, config } },
          signal,
          baseURL: config.baseURL,
        },
        (u, i) => fetchFn(u, i),
      );
      if (!res.ok) throw await toHttpError(`provider ${id}`, res);
      return readChatStream(res, onToken);
    },
```

- [ ] **Step 2: Run adapter tests to confirm no regressions**

Run: `npm test -- openai-compatible`
Expected: PASS — existing adapter/stream tests still green (they mock fetch and don't hit the localhost branch).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/providers/openai-compatible/adapter.ts
git commit -m "feat(providers): pass baseURL into streaming fallback for localhost detection"
```

---

## Task 4: Relax the two `apiKey` gates in `Polisher.tsx`

**Files:**
- Modify: `app/[lang]/Polisher.tsx`

- [ ] **Step 1: Update the effective-provider check (line 70)**

Change:

```ts
    if (cur && cur.apiKey && cur.models.includes(settings.selectedModel)) {
```

to:

```ts
    if (cur && (cur.apiKey || cur.requiresKey === false) && cur.models.includes(settings.selectedModel)) {
```

- [ ] **Step 2: Update the Polish button disabled state (line 350)**

Change:

```tsx
                disabled={!effective.provider.apiKey || !text || text.length > MAX_CHARS}
```

to:

```tsx
                disabled={
                  (!effective.provider.apiKey && effective.provider.requiresKey !== false) ||
                  !text ||
                  text.length > MAX_CHARS
                }
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/[lang]/Polisher.tsx
git commit -m "feat(ui): allow keyless providers (Ollama) to be selected and triggered"
```

---

## Task 5: Hide the API key field for keyless providers in `SettingsPanel.tsx`

**Files:**
- Modify: `components/SettingsPanel.tsx`

- [ ] **Step 1: Replace the API Key input block with a conditional**

In `components/SettingsPanel.tsx`, find the API Key label + input + note block (lines 98-118):

```tsx
          <label className="gp-field-label">API Key</label>
          <input
            className="gp-input"
            type="password"
            value={editing?.apiKey ?? ""}
            placeholder={
              locale === "zh"
                ? editing?.keyUrl
                  ? `从 ${editing.keyUrl} 获取`
                  : "粘贴 API Key"
                : editing?.keyUrl
                  ? `Get it from ${editing.keyUrl}`
                  : "Paste your API key"
            }
            onChange={(e) => patchProvider(editing.id, { apiKey: e.target.value })}
          />
          <p className="gp-key-note">
            {locale === "zh"
              ? "Key 与文本仅存于浏览器，绝不上传。"
              : "Your key & text never leave the browser."}
          </p>
```

Replace with a conditional on `editing?.requiresKey`:

```tsx
          {editing?.requiresKey === false ? (
            <>
              <label className="gp-field-label">
                {locale === "zh" ? "API Key" : "API Key"}
              </label>
              <p className="gp-key-note">
                {locale === "zh"
                  ? "Ollama 在本地运行，无需 API Key。请确保 `ollama serve` 已启动。"
                  : "Ollama runs locally — no API key needed. Make sure `ollama serve` is running."}
              </p>
            </>
          ) : (
            <>
              <label className="gp-field-label">API Key</label>
              <input
                className="gp-input"
                type="password"
                value={editing?.apiKey ?? ""}
                placeholder={
                  locale === "zh"
                    ? editing?.keyUrl
                      ? `从 ${editing.keyUrl} 获取`
                      : "粘贴 API Key"
                    : editing?.keyUrl
                      ? `Get it from ${editing.keyUrl}`
                      : "Paste your API key"
                }
                onChange={(e) => patchProvider(editing.id, { apiKey: e.target.value })}
              />
              <p className="gp-key-note">
                {locale === "zh"
                  ? "Key 与文本仅存于浏览器，绝不上传。"
                  : "Your key & text never leave the browser."}
              </p>
            </>
          )}
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/SettingsPanel.tsx
git commit -m "feat(ui): hide API key field for keyless providers, show local-run note"
```

---

## Task 6: Bump settings storage version from v8 to v9

**Files:**
- Modify: `hooks/useSettings.ts`

- [ ] **Step 1: Update `STORAGE_KEY` and `LEGACY_KEYS`**

In `hooks/useSettings.ts`, change line 18:

```ts
const STORAGE_KEY = "grammar-polisher.settings.v9";
```

Update the `LEGACY_KEYS` array (lines 19-27) to include `v8` at the top:

```ts
const LEGACY_KEYS = [
  "grammar-polisher.settings.v8",
  "grammar-polisher.settings.v7",
  "grammar-polisher.settings.v6",
  "grammar-polisher.settings.v5",
  "grammar-polisher.settings.v4",
  "grammar-polisher.settings.v3",
  "grammar-polisher.settings.v3.nosecret",
  "grammar-polisher.settings.v2",
];
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add hooks/useSettings.ts
git commit -m "chore(settings): bump storage to v9 to pull in Ollama builtin"
```

---

## Task 7: Full verification (lint + typecheck + test + build)

**Files:** none (verification only)

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: PASS, no errors. If eslint reports `react-hooks/set-state-in-effect` warnings on lines you did NOT touch, ignore them (pre-existing per AGENTS.md).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: Compiled successfully. (If you hit `EBUSY: resource busy or locked` on `.next/`, that's Dropbox locking build artifacts per AGENTS.md — pause Dropbox or delete `.next/` and retry. Do NOT bisect your code.)

- [ ] **Step 5: Manual verification with local Ollama**

Prerequisite: `ollama serve` running locally, `gemma4:12b` pulled (`ollama pull gemma4:12b`).

1. `npm run dev`
2. Open the app, click the Settings gear.
3. Select "Ollama (Local)" from the provider dropdown.
4. Confirm: API Key field is hidden, replaced with the "runs locally" note.
5. Confirm: Base URL shows `http://localhost:11434/v1`.
6. Confirm: Models textarea shows `gemma4:12b`.
7. Close Settings. Paste a sentence with a grammar error into the editor (e.g., "She dont knows me").
8. Confirm: the Polish button is ENABLED (no API key required).
9. Click Polish. Confirm: stream completes and inline suggestions appear.

- [ ] **Step 6: Manual verification of localhost error path**

1. Stop `ollama serve` (so the local endpoint is unreachable).
2. In the running app, click Polish on any text.
3. Confirm: an error appears naming Ollama and suggesting `ollama serve` (NOT a generic 502 from the proxy).

---

## Notes for the implementer

- **No i18n dictionary changes needed.** The new "Ollama runs locally" string is an in-component ternary on `locale`, which is the convention for SettingsPanel strings per AGENTS.md. Do not migrate it into `lib/i18n/`.
- **The privacy copy** "Your key & text never leave the browser" is pre-existing and slightly inaccurate for cloud providers (text does go to the LLM API). Per the spec, fixing that copy is **out of scope** for this work — leave it alone.
- **`ProviderConfig` (schema.ts) does NOT get a `requiresKey` field.** Only `ProviderEntry` (the settings-level shape) gets it. The adapter receives `apiKey: ""` for Ollama and sends an empty `Authorization: Bearer ` header, which Ollama ignores. Verified safe.
- **The proxy route `app/api/polish/route.ts` does NOT need changes.** Its `apiKey` gate stays as-is — Ollama is never proxied (Task 2 short-circuits the fallback for localhost URLs).
- **Commit messages** follow the existing repo convention: lowercase, scoped (`feat(providers):`, `feat(ui):`, `chore(settings):`).
- **Per AGENTS.md**, do NOT push or open a PR — just local commits. The user will sync manually.
