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
- **Task queue**: every polish is a `PolishTask` (see `lib/tasks/`), run in parallel,
  persisted to localStorage (cap 50, newest first). The editor shows the *focused*
  task; background completions land as "unread". Spec: `docs/superpowers/specs/2026-07-16-task-queue-streaming-design.md`.
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
   Streaming uses the same route as an SSE passthrough (`stream: true` in the
   body): the route relays upstream bytes untouched — nothing parsed, stored,
   or logged.
3. This self-heals: Kimi falls back to proxy transparently; Custom endpoints work regardless of their CORS; if a provider's policy changes, no code change is needed.

## Dev commands (after `create-next-app` scaffold)

```bash
npm run dev        # local dev server
npm run build      # production build — must pass before deploy
npm run lint       # run before commit
npm run typecheck  # if not present, add: tsc --noEmit
```

Required pre-commit order: **lint → typecheck → build**.

- **`EBUSY: resource busy or locked` on `.next/`** during `npm run build` is Dropbox locking build artifacts, not your diff — if `Compiled successfully` / `Finished TypeScript` / `Generating static pages` all passed, the failure is in the export-cleanup step only. Stop Dropbox (or delete `.next/`) and retry; don't bisect your code.

## Baseline check at session start

Before starting work, run `npm run typecheck` once. If it fails on files you haven't
touched, the breakage is inherited from a previous commit — fix the root cause first
(e.g. missing dependency), commit it separately, then start your task. Don't debug
your own diff against a red baseline you didn't create.

## Conventions

- TypeScript strict mode. No `any` in provider/shared code; infer or define types.
- All provider implementations behind the `Provider` interface in `lib/providers/`. Never import a specific SDK from a component.
- Prompt: shared structured-output instruction + the verbatim rule lives in `lib/providers/shared/prompt.ts`; English/Chinese-specific framing lives in `lib/providers/<adapter>/prompt/{en,zh}.ts`. Never inline prompts in components.
- UI text and prompts: English-first unless the user asks otherwise.
- Intentionally-unused destructured variables should use a `_` prefix (e.g., `_apiKey`); the eslint config already honors this pattern.
- Disabling `react-hooks/set-state-in-effect` is acceptable when deriving state from an async result inside `useEffect` (see `app/page.tsx` and `hooks/useSettings.ts`). Document with a comment explaining why the rule does not apply. Put the `// eslint-disable-next-line react-hooks/set-state-in-effect` ON the exact line that calls setState — not on the effect line, not after the body (a misplaced disable triggers "Unused eslint-disable directive").
- **No hardcoded user-visible strings.** Route any user-facing text (button labels, status, tooltips, placeholders, error messages, empty-state copy) through `lib/i18n/{en,zh}.ts` (for SEO/GEO blocks) or `useLocale()` + inline `locale === "zh" ? ... : ...` (for in-component strings) or a `lang: Locale` parameter (for pure functions in `lib/` — see `lib/tasks/format.ts`, `lib/providers/shared/errors.ts`). Never hardcode Chinese or English literals in components/hooks/lib.
- **After any i18n-touching change**, sweep for missed strings: `grep -rP "[\x{4e00}-\x{9fff}]" components/ hooks/ lib/ app/ --include="*.ts" --include="*.tsx"`. Every hit must be either in `lib/i18n/zh.ts` (the dictionary) or in a test file — anything else is a bug.
- **Privacy / data-flow copy wording**: never write "不经过我们的服务器/后端" or "never sent to any server" — we have a stateless `/api/polish` proxy (Kimi and other CORS-blocked providers fall back through it; see BYOK gotcha). The correct framing is "**无持久化后端**" / "**no persistent backend**" and "**不存储/记录/缓存任何输入**" / "**never stored, logged, or cached**". An inaccurate public privacy claim is a serious credibility issue, not a cosmetic one.

## Editor implementation gotchas

- The editor layers a transparent `<textarea>` over a visible overlay (`components/Editor.tsx`). When hiding text color, use `-webkit-text-fill-color: transparent` alongside `color: transparent` on WebKit/Blink, or selected text can leave a ghost/shadow. Also set `text-shadow: none` and style `::selection` explicitly.
- Keep `padding`, `font-size`, `line-height`, `white-space`, and `overflow-wrap` identical between the textarea and overlay to prevent text misalignment.

## UI / CSS gotchas

- **SVG next to text in a flex/inline-flex row**: Tailwind preflight injects `svg { display: block }`, which can stack an inline icon onto its own line (especially if the parent's flex isn't engaging or CSS is half-cached). When placing an SVG beside text, defensively scope a rule: `.container svg { display: inline-block; flex: none; vertical-align: middle; }`. Don't rely on `inline-flex` of the parent alone — and remember you cannot visually verify rendered CSS (no image input), so prefer the defensive form up front.

## Testing & debugging gotchas

- When the user reports a UI element you can't grep in this codebase, don't guess — ask them to paste its HTML from DevTools first. Our classes are all `gp-*`; anything else (e.g. `tc-status-btn`, `tc-spinner`, `content.js` errors mentioning "extension settings") is a browser grammar/translate extension injecting into localhost, not our app.

## SEO / GEO architecture (added 2026-07-19)

Full design: [`docs/superpowers/specs/2026-07-19-seo-geo-design.md`](docs/superpowers/specs/2026-07-19-seo-geo-design.md).

- **URL i18n**: `/en` + `/zh`, root `/` permanently redirects to `/en` via `next.config.ts` `redirects()` (no `app/page.tsx` / `app/layout.tsx` — `app/[lang]/layout.tsx` IS the root layout and owns `<html lang>`).
- **Locale source = URL only.** `hooks/useLocale.ts` reads from `useParams()`; the old `navigator.language` detection was removed because it caused SSR/client mismatch and broke hreflang. **Do not re-add navigator-based detection.** No auto language redirect either — it would corrupt SEO canonical.
- **Server-rendered content lives in `app/[lang]/page.tsx`** (hero `<h1>`, features grid, FAQ); the entire interactive editor was lifted verbatim into `app/[lang]/Polisher.tsx` (`"use client"`). Don't merge them back into a single client page — the server component is what makes the page crawlable.
- **i18n content dictionary**: `lib/i18n/{en,zh}.ts` (`Strings` interface in `lib/i18n/index.ts`). All SEO/GEO strings (title, description, keywords, hero, features, faq, footer, language-switch link) live there. UI components keep their inline `locale === "zh" ? ... : ...` ternaries — do not migrate those into the dictionary; it would create churn for no SEO benefit.
- **JSON-LD**: `lib/i18n/jsonld.ts` emits `Organization` + `WebApplication` (in layout, locale-independent) and `FAQPage` (in page, locale-aware). The FAQ items in JSON-LD MUST mirror `s.faq` exactly — they are the same array, do not duplicate-edit.
- **OG image**: `app/[lang]/opengraph-image.tsx` uses `next/og` `ImageResponse` (edge runtime, runtime-generated PNG). Don't replace with a static file — keeping it dynamic lets the per-locale text match the page.
- **Webmaster verification**: set `NEXT_PUBLIC_GSC_VERIFICATION` (Google) or `NEXT_PUBLIC_BING_VERIFICATION` (Bing) env vars; `generateMetadata` injects the right `<meta>` tag via `verification: { google, other: { "msvalidate.01" } }`. Leave unset in dev.
- **Analytics**: Microsoft Clarity loaded only when `NEXT_PUBLIC_CLARITY_ID` is set. Vercel Analytics always on. **No GA4** by deliberate decision — see brainstorming Q4.
- **Files that exist for crawlers only**: `app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts`, `public/llms.txt`. Touch them when adding/removing locales or changing the domain (which is also `NEXT_PUBLIC_SITE_URL`).

## Open decisions (resolve as the project grows)

- Long-document chunking (v1: short text only; the `Provider` interface reserves a `polishChunk` hook).
- SEO expansion to content-hub routes (`/about`, `/how-it-works`, `/use-cases/*`) — defer to plan B/C in the SEO/GEO spec until the v1 homepage has been indexed and shows ranking data.
