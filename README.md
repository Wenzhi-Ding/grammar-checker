# Grammar Checker

A Grammarly-style grammar and text polisher. Paste text → click **Polish** → get inline, per-span suggestions with reasons; accept or reject each one, or accept all.

**Bring your own key (BYOK):** you supply the LLM API key. It never leaves your browser.

Recommended model: **DeepSeek `deepseek-v4-flash`** — quality is more than good enough for polishing, it's fast, and costs about **$0.0006 per polish** (see [cost comparison](#cost-byok-vs-grammarly) below).

## Features

- Inline highlights pinned to exact spans, with one-line reasons per suggestion
- Accept / reject individual suggestions, or accept all and copy the result
- Task queue: run multiple polishes in parallel, switch between them in the sidebar
- English and Chinese UI (toggle in the top bar)
- Supported providers: **DeepSeek**, **Kimi (Moonshot)**, **GLM (智谱)**, **Gemini**, plus any **OpenAI-compatible** custom endpoint
- No accounts, no server-side storage — your text and key stay on your machine

## Cost: BYOK vs Grammarly

A single polish of a ~400-word English passage on DeepSeek V4 Flash costs roughly **$0.0006** — about 1,600 polishes per US dollar.

| Usage pattern | Polishes/year | DeepSeek V4 Flash | Grammarly Pro |
|---|---|---|---|
| Light (occasional emails) | ~200 | <$0.20 | $144 |
| Heavy student (daily emails + assignments) | 1,500–3,000 | **<$2** | $144 |
| Power user (50 polishes/day) | ~18,000 | **~$11** | $144 |

**How the math works:** each polish consumes ~1,800 input tokens (system prompt + user text) and ~1,200 output tokens (the corrections JSON), at DeepSeek V4 Flash's official pricing of $0.14/M input and $0.28/M output. The **$144** you'd spend on one year of Grammarly Pro buys **200,000+ polishes** on DeepSeek. Other supported models (Gemini, GLM, Kimi) are slightly pricier but in the same order of magnitude.

**The takeaway:** for almost any realistic usage level, a year of BYOK token spend is **1–2% of a Grammarly subscription** — you pay the provider directly, we never bill you.

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

推荐模型：**DeepSeek `deepseek-v4-flash`** —— 润色质量足够好、速度快，单次润色约 **¥0.004（~$0.0006）**（见下方[成本对比](#成本对比byok-vs-grammarly)）。

## 功能

- 内联高亮精确锚定到原文位置，每条建议附简短原因
- 可逐条接受 / 拒绝，也可全部接受后一键复制结果
- 任务队列：多个润色并行执行，侧边栏自由切换
- 中英双语 UI（顶部栏可切换）
- 支持的服务商：**DeepSeek**、**Kimi（Moonshot）**、**GLM（智谱）**、**Gemini**，以及任何 **OpenAI 兼容**的自定义接口
- 无需注册、无服务端存储 —— 文本与密钥仅留在你的设备上

## 成本对比：BYOK vs Grammarly

用 DeepSeek V4 Flash 润色一段约 400 词的英文，单次成本约 **$0.0006（≈¥0.004）**——大约每花 1 美元能润色 1600 次。

| 使用强度 | 年润色次数 | DeepSeek V4 Flash | Grammarly Pro |
|---|---|---|---|
| 轻度（偶尔写邮件） | ~200 | <$0.20 | $144 |
| 高强度学生（每天邮件 + 作业） | 1,500–3,000 | **不到 $2** | $144 |
| 重度用户（每天 50 次） | ~18,000 | **约 $11** | $144 |

**核算方式：** 每次润色约消耗 1800 输入 tokens（系统提示词 + 用户文本）和 1200 输出 tokens（修改建议 JSON），按 DeepSeek V4 Flash 官方定价 $0.14/百万输入、$0.28/百万输出计算。Grammarly Pro 一年的 $144 订阅费，用 DeepSeek 够润色 **20 万次以上**。其他模型（Gemini、GLM、Kimi）单价略高，但同一数量级。

**结论：** 对几乎所有真实使用强度，BYOK 一年的 token 花费只有 Grammarly 订阅的 **1–2%**——你直接付费给服务商，我们永不经手。

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
