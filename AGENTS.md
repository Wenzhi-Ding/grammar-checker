# AGENTS.md

Project intent, architecture constraints, and gotchas for AI agents working in this repo.

**Full design:** [`docs/superpowers/specs/2026-07-15-grammar-polisher-design.md`](docs/superpowers/specs/2026-07-15-grammar-polisher-design.md) — read it before non-trivial work.

## What this is

A Vercel-deployed web app (Grammarly-style) for grammar correction and text polishing. Users **bring their own LLM API key** (BYOK). Paste text → click "Polish" → see inline, per-span suggestions with reasons, rendered by diffing the LLM's output against the original.

## Stack (decided)

- **Next.js (App Router) + TypeScript**, deployed to Vercel.
- No backend persistence. No accounts, no server-side history. Stateless.
- Package manager: npm unless a lockfile says otherwise.

## Architecture constraints — do not violate

- **User API key lives in the browser only.** Store in memory or `localStorage`. Never persist server-side, never log it, never put it in a URL, never commit it.
- **Core UX loop**: original text → LLM returns *structured* corrections → frontend pins each to a span and renders Grammarly-style inline highlights. The LLM output must be structured, not free prose.
- **Structured output schema is the central contract** (single source of truth shared by all providers):

  ```ts
  type Correction = {
    original: string;      // VERBATIM substring of the input (prompt enforces this)
    suggestion: string;    // replacement (empty = deletion)
    type: "grammar" | "spelling" | "punctuation" | "formatting" | "style" | "clarity" | "word-choice";
    reason: string;        // one-line explanation for the user
    severity?: "info" | "minor" | "major";
  };
  type PolishResult = { corrections: Correction[] };
  ```

  `original` MUST be a verbatim copy. The frontend pins each correction via a three-tier matcher in `lib/providers/shared/match.ts`: exact `indexOf` (sequential cursor) → diff-match-patch `match_main` fuzzy fallback → drop with `console.warn`. See spec §7.

- **Provider layer is an adapter, not a switch in components.** A single `Provider` interface (`polish(text, config): Promise<PolishResult>`) resolved via `getProviderFor({id, adapter})` to one of two adapters: `openai-compatible` (JSON mode `{response_format:{type:"json_object"}}` + prompt-embedded schema) or `gemini` (`responseSchema` + `responseMimeType`).
- **Unified provider model**: every provider is a `ProviderEntry` `{id, label, adapter, baseURL, apiKey, models[], keyUrl, builtin}` in `settings.providers` (localStorage — **keys are always saved**, no opt-out). Four builtins are seeded but fully editable — **DeepSeek** (`api.deepseek.com/v1`), **Kimi/Moonshot** (`api.moonshot.cn/v1`, `kimi-k2.6`/`k2.7`), **GLM/智谱** (`open.bigmodel.cn/api/paas/v4`, `glm-5.2`/etc.), **Gemini** — with default models; users can add multiple **custom** providers (own baseURL/key/models/adapter) and delete them. Picking a model implies the provider. Adding a new standard OpenAI-compatible provider = one built-in/seed entry. **OpenAI and Anthropic are deliberately not supported.**

## BYOK gotcha — transport is runtime-decided, not hardcoded

CORS is an empirical per-provider property, so **don't hardcode "direct vs proxy" per provider.** Verified 2026-07-15 via `OPTIONS` preflight: DeepSeek, GLM, Gemini return CORS headers (direct OK); **Kimi/Moonshot does not** (browser-blocked).

1. **All providers default to direct browser calls** (key in `Authorization` header). Key visible in the user's own network tab is acceptable — their key, their machine.
2. **Auto-fallback**: the provider layer wraps each call — on a CORS/network `TypeError` (opaque failure, distinct from an HTTP status), automatically retry once through the stateless `app/api/polish/route.ts`. To keep the key out of Vercel logs, the proxy takes the key in the **request body** (not header), then relays it as `Authorization`. The route stores/logs/caches **nothing**.
3. This self-heals: Kimi falls back to proxy transparently; Custom endpoints work regardless of their CORS; if a provider's policy changes, no code change is needed.

## Dev commands (after `create-next-app` scaffold)

```bash
npm run dev        # local dev server
npm run build      # production build — must pass before deploy
npm run lint       # run before commit
npm run typecheck  # if not present, add: tsc --noEmit
```

Required pre-commit order: **lint → typecheck → build**.

## Conventions

- TypeScript strict mode. No `any` in provider/shared code; infer or define types.
- All provider implementations behind the `Provider` interface in `lib/providers/`. Never import a specific SDK from a component.
- Prompt: shared structured-output instruction + the verbatim rule lives in `lib/providers/shared/prompt.ts`; English/Chinese-specific framing lives in `lib/providers/<adapter>/prompt/{en,zh}.ts`. Never inline prompts in components.
- UI text and prompts: English-first unless the user asks otherwise.
- Intentionally-unused destructured variables should use a `_` prefix (e.g., `_apiKey`); the eslint config already honors this pattern.
- Disabling `react-hooks/set-state-in-effect` is acceptable when deriving state from an async result inside `useEffect` (see `app/page.tsx` and `hooks/useSettings.ts`). Document with a comment explaining why the rule does not apply. Put the `// eslint-disable-next-line react-hooks/set-state-in-effect` ON the exact line that calls setState — not on the effect line, not after the body (a misplaced disable triggers "Unused eslint-disable directive").

## Editor implementation gotchas

- The editor layers a transparent `<textarea>` over a visible overlay (`components/Editor.tsx`). When hiding text color, use `-webkit-text-fill-color: transparent` alongside `color: transparent` on WebKit/Blink, or selected text can leave a ghost/shadow. Also set `text-shadow: none` and style `::selection` explicitly.
- Keep `padding`, `font-size`, `line-height`, `white-space`, and `overflow-wrap` identical between the textarea and overlay to prevent text misalignment.

## Testing & debugging gotchas

- When the user reports a UI element you can't grep in this codebase, don't guess — ask them to paste its HTML from DevTools first. Our classes are all `gp-*`; anything else (e.g. `tc-status-btn`, `tc-spinner`, `content.js` errors mentioning "extension settings") is a browser grammar/translate extension injecting into localhost, not our app.

## Open decisions (resolve as the project grows)

- Streaming vs full response (v1: full response; streaming + incremental diff is a later enhancement).
- Long-document chunking (v1: short text only; the `Provider` interface reserves a `polishChunk` hook).
