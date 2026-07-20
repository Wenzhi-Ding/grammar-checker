# Grammar Checker

A Grammarly-style grammar and text polisher. Paste text → click **Polish** → get inline, per-span suggestions with reasons; accept or reject each one, or accept all.

**Bring your own key (BYOK):** you supply the LLM API key. It never leaves your browser.

Recommended model: **DeepSeek `deepseek-v4-flash`** — quality is more than good enough for polishing, it's fast, and a single polish costs less than ¥0.05 (~$0.01).

## Features

- Inline highlights pinned to exact spans, with one-line reasons per suggestion
- Accept / reject individual suggestions, or accept all and copy the result
- Task queue: run multiple polishes in parallel, switch between them in the sidebar
- English and Chinese UI (toggle in the top bar)
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

---

# Grammar Checker（中文）

类 Grammarly 的英语语法润色工具。粘贴文本 → 点 **Polish** → 获得逐条带原因的内联修改建议；可逐条接受/拒绝，也可一键全部接受。

**自带密钥（BYOK）：** 你来提供 LLM API Key，密钥永远不离开你的浏览器。

推荐模型：**DeepSeek `deepseek-v4-flash`** —— 润色质量足够好、速度快，单次润色成本不到 ¥0.05（约 $0.01）。

## 功能

- 内联高亮精确锚定到原文位置，每条建议附简短原因
- 可逐条接受 / 拒绝，也可全部接受后一键复制结果
- 任务队列：多个润色并行执行，侧边栏自由切换
- 中英双语 UI（顶部栏可切换）
- 支持的服务商：**DeepSeek**、**Kimi（Moonshot）**、**GLM（智谱）**、**Gemini**，以及任何 **OpenAI 兼容**的自定义接口
- 无需注册、无服务端存储 —— 文本与密钥仅留在你的设备上

## 快速开始

```bash
npm install
npm run dev     # http://localhost:3000
```

打开应用，点 ⚙️ 选择服务商，粘贴你的 API Key。Key 仅保存在你的浏览器里。

## 部署

针对 [Vercel](https://vercel.com) 优化：推送仓库后导入即可，无需任何环境变量或服务端配置。

## 开发

```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # production build
```
