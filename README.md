# Grammar Polisher

A Vercel-deployed, **bring-your-own-key** (BYOK) Grammarly-style grammar/text polisher. Paste text → click **Polish** → see inline, per-span suggestions with reasons; accept/reject each or accept all.

Supported providers (you supply the API key): **DeepSeek**, **Kimi (Moonshot)**, **GLM (智谱)**, **Gemini**, and any **OpenAI-compatible** custom endpoint.

## Setup

```bash
npm install
npm run dev     # http://localhost:3000
```

Open the app, click ⚙️, pick a provider, paste your API key, (optionally) tune the model. The key is stored in your browser only — check "记住 Key" to persist it to `localStorage`; otherwise it lives in memory for the session.

## How to verify

Automated gate (run before commit):

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Manual smoke tests (need real API keys + `npm run dev`):

1. **English** — configure DeepSeek/GLM/Gemini. Paste:
   `She dont know what your doing, becouse the team have went home.`
   Expect several highlights; accept one (text updates), **Accept all**, **Copy result**.
2. **Chinese** — paste: `这个方案我觉得吧，可能会有一些潜在的风险存在，我们需要进一步的来进行讨论。`
   Expect style/clarity/word-choice suggestions (中文润色 prompt focuses there).
3. **Kimi proxy fallback** — configure a Kimi key, polish any text. In DevTools Network you should see a failed direct call to `api.moonshot.cn` (CORS-blocked) followed by a successful `/api/polish` call — the stateless proxy re-runs the polish server-side. Results render normally.

## Architecture

- **Provider layer**: one `Provider` interface, two adapters (`openai-compatible`, `gemini`) + a preset registry. Adding an OpenAI-compatible provider = one config line.
- **Matching engine** (`lib/providers/shared/match.ts`): pins each LLM correction to a span via exact `indexOf` → diff-match-patch fuzzy → drop (with a similarity guardrail — a wrong pin is worse than no pin).
- **CORS self-heal**: all providers default to direct browser calls; on a network/CORS `TypeError`, automatically retry once through the stateless `/api/polish` route (key in body, nothing logged/cached).
- **Full design**: [`docs/superpowers/specs/2026-07-15-grammar-polisher-design.md`](docs/superpowers/specs/2026-07-15-grammar-polisher-design.md)

## Tech

Next.js 16 (App Router) · TypeScript (strict) · Vitest · zod · diff-match-patch
