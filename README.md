# Grammar Checker

A Grammarly-style grammar and text polisher. Paste text → click **Polish** → get inline, per-span suggestions with reasons; accept or reject each one, or accept all.

**Bring your own key (BYOK):** you supply the LLM API key. It never leaves your browser.

Recommended: **DeepSeek `deepseek-v4-flash`** — quality is more than good enough for polishing, it's fast, and a single polish costs less than ¥0.05 (~$0.01).

## Features

- Inline highlights pinned to exact spans, with one-line reasons per suggestion
- Accept / reject individual suggestions, or accept all and copy the result
- Task queue: run multiple polishes in parallel, switch between them in the sidebar
- English and Chinese support
- Supported providers: **DeepSeek**, **Kimi (Moonshot)**, **GLM (智谱)**, **Gemini**, plus any **OpenAI-compatible** custom endpoint
- No accounts, no server-side storage — your text and key stay on your machine

## Getting Started

```bash
npm install
npm run dev     # http://localhost:3000
```

Open the app, click ⚙️, pick a provider, and paste your API key. The key is stored in your browser only.

## Deployment

Optimized for [Vercel](https://vercel.com): push the repo and import it — no environment variables or server config required.

## Development

```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # production build
```
