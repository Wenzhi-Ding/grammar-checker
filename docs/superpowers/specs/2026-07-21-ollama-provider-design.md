# Ollama 本地 provider — 设计文档

- **日期**: 2026-07-21
- **状态**: 已通过 brainstorming 审定，待用户 review
- **前置**: [`2026-07-15-grammar-polisher-design.md`](2026-07-15-grammar-polisher-design.md)
- **触发**: 用户在本地 Ollama 运行 `gemma4:12b`，希望将其作为 provider 测试 grammar-checker。

## 1. 概述

把 Ollama 作为第五个 builtin provider 接入，让用户可以对本地模型（如 `gemma4:12b`）跑 polish。Ollama 暴露 OpenAI 兼容端点 `http://localhost:11434/v1/chat/completions`，支持 `response_format: {type: "json_object"}`，因此**复用现有 `openai-compatible` adapter**，无需新增 adapter。

核心难点不是协议，而是两个已有假设：

1. 现有代码默认「provider 必须有 apiKey」——`buildModelOptions`、Polish 按钮的 disabled 判断都 gate on `apiKey` 非空。Ollama 不需要 key，必须放开。
2. 现有 `callStreamWithFallback` 在浏览器直连遭遇 `TypeError`（CORS/网络）时会自动回落到 `/api/polish` 代理。但代理跑在 Vercel 上，**够不到用户的 `localhost`**——对 Ollama 的回落是必然失败且误导用户。

## 2. 已确认决策

| 问题 | 决定 |
|---|---|
| Ollama 形态 | 第五个 builtin，不是 custom provider |
| adapter | `openai-compatible`（复用） |
| baseURL | `http://localhost:11434/v1`（用户可在 Settings 改） |
| 默认模型 | 仅 `gemma4:12b`（用户确认） |
| key 处理 | 新增 `ProviderEntry.requiresKey: boolean`；Ollama = false |
| 模型发现 | hardcoded（不做 `/api/tags` live fetch） |
| 代理回落 | 检测到 localhost URL 时跳过，直接抛清晰错误 |
| 部署形态约束 | Ollama 仅在 `npm run dev` 本地运行可用；Vercel 上的 HTTPS 页面调 `http://localhost` 是 mixed content |

## 3. 数据模型变更

`lib/providers/shared/presets.ts` 的 `ProviderEntry` 加一个字段：

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
  requiresKey: boolean;   // 新增 — Ollama = false，其余 = true
}
```

**默认值约定**：所有 gating 判断使用 `requiresKey !== false`（即只有显式置 false 才视为 keyless）。这样老 localStorage 里没有该字段的 provider 一律视为「需要 key」，安全。

`newCustomProvider()` 显式置 `requiresKey: true`。

## 4. Builtin seed

在 `BUILTIN_PROVIDERS` 末尾追加 Ollama，并给现有四项显式补 `requiresKey: true`：

```ts
export const BUILTIN_PROVIDERS: ProviderEntry[] = [
  { id: "deepseek", ..., requiresKey: true },
  { id: "kimi",     ..., requiresKey: true },
  { id: "glm",      ..., requiresKey: true },
  { id: "gemini",   ..., requiresKey: true },
  {
    id: "ollama",
    label: "Ollama (Local)",
    adapter: "openai-compatible",
    baseURL: "http://localhost:11434/v1",
    apiKey: "",
    models: ["gemma4:12b"],
    keyUrl: "",
    builtin: true,
    requiresKey: false,
  },
];
```

## 5. Gating 判断修改（四处）

统一规则：原本 `!provider.apiKey` 的判断改为「apiKey 空 **且** `requiresKey !== false`」。

| 位置 | 修改前 | 修改后 |
|---|---|---|
| `lib/providers/shared/presets.ts:50` (`buildModelOptions`) | `if (!p.apiKey) continue;` | `if (!p.apiKey && p.requiresKey !== false) continue;` |
| `app/[lang]/Polisher.tsx:70` (effective provider) | `cur && cur.apiKey && …` | `cur && (cur.apiKey \|\| cur.requiresKey === false) && …` |
| `app/[lang]/Polisher.tsx:350` (Polish 按钮 disabled) | `disabled={!effective.provider.apiKey \|\| …}` | `disabled={(!effective.provider.apiKey && effective.provider.requiresKey !== false) \|\| …}` |
| `hooks/usePolish.ts:33` (runtime no-key guard) | `if (!opts.config.apiKey) { …noKeyError… }` | `if (!opts.config.apiKey && opts.requiresKey !== false) { …noKeyError… }`；`RunOptions` 增 `requiresKey?: boolean` 字段；`Polisher.tsx` 构造 `run()` 调用时传 `requiresKey: effective.provider.requiresKey` |

`app/api/polish/route.ts:29` 的 `apiKey` gate 不动——Ollama 走直连、不进代理，gate 是 moot。

`ProviderConfig`（`lib/providers/shared/schema.ts:36`）不加 `requiresKey`——adapter 只是把 `apiKey` 当字符串塞进 `Authorization` 头；Ollama 忽略空 Bearer，没问题。

## 6. Settings UI（`components/SettingsPanel.tsx`）

- **API Key 输入框**：当 `editing.requiresKey === false` 时整段隐藏，替换为静态提示：
  - EN: "Ollama runs locally — no API key needed. Make sure `ollama serve` is running."
  - ZH: "Ollama 在本地运行，无需 API Key。请确保 `ollama serve` 已启动。"
- **Base URL 输入框**：保留可见可编辑（用户可能改端口或主机）。
- **隐私文案**（`SettingsPanel.tsx:114-118`）：保留现状不动。该文案对 cloud provider 本就略不准确（text 会发去 LLM API），是 pre-existing 问题，超出本 spec 范围。

## 7. 本地回落与 mixed content 处理

### 7.1 修改 `callStreamWithFallback`

`lib/providers/shared/http.ts` 给 `callStreamWithFallback` 增加可选参数（或 `opts` 字段）`baseURL?: string`。在 catch 分支里：

```ts
if (isLocalhost(opts.baseURL)) {
  throw new Error(locale === "zh"
    ? `无法连接本地 Ollama（${opts.baseURL}）。请确认 \`ollama serve\` 已启动。（Ollama 仅在本地运行 app 时可用，部署站点不可用。）`
    : `Could not reach local Ollama at ${opts.baseURL}. Is \`ollama serve\` running? (Ollama only works when the app runs locally, not on the deployed site.)`
  );
}
// 否则按原逻辑回落到 /api/polish
```

`isLocalhost` 判断：URL hostname ∈ `{localhost, "127.0.0.1", "::1"}` 或以 `http://localhost` 开头。

### 7.2 调用方传参

`openai-compatible/adapter.ts:101` 的 `callStreamWithFallback` 调用，在 `opts` 里多带一个 `baseURL: config.baseURL`。

错误信息中英双语——`http.ts` 是纯函数模块，按 AGENTS.md 约定，给函数加 `lang: Locale` 参数；调用方（adapter）从 `config.reasonLanguage` 或 `config.language` 推断。如果太重，简化为只发英文错误，UI 层捕获后用 `usePolish` 的错误分类统一本地化。**实现时优先选后者**（错误文案统一在 UI 层本地化，http.ts 只抛英文）。

## 8. 存储迁移

`hooks/useSettings.ts`：

- `STORAGE_KEY` 从 `grammar-polisher.settings.v8` → `grammar-polisher.settings.v9`
- 把 `grammar-polisher.settings.v8` 加到 `LEGACY_KEYS`

老用户首次加载 v9（localStorage 里没有）→ 找到 v8 → 走 `migrate()`：

1. 从 `BUILTIN_PROVIDERS` 重建 fresh provider 列表（五个 builtin 都带正确的 `requiresKey`）
2. 按 id 把老 apiKey carry over
3. 保留用户自建的 custom provider（没有 `requiresKey` 字段，gating 判断为 truthy → 视为需要 key，正确）

新用户首次加载 → 使用 `DEFAULTS` → `defaultProviders()` spread `BUILTIN_PROVIDERS` → 全部字段正确。

## 9. 测试（`tests/providers/shared/presets.test.ts`）

- 更新现有断言：`BUILTIN_PROVIDERS.map(p => p.id).sort()` 应等于 `["deepseek", "gemini", "glm", "kimi", "ollama"]`。
- 新增：Ollama 的 `requiresKey === false`；其余四个 `requiresKey === true`。
- 新增：`buildModelOptions` 在 Ollama `apiKey` 为空时仍包含 Ollama 的模型。
- 新增：`buildModelOptions` 对 `requiresKey: true` 且 `apiKey` 为空的 custom provider 仍然跳过（默认行为不变）。

`tests/providers/shared/http-stream.test.ts`（已存在，追加用例）：

- `callStreamWithFallback` 在 `opts.baseURL` 指向 localhost 且 direct 抛 `TypeError` 时，**不**回落代理，而是直接抛清晰错误（断言 error message 包含 "Ollama" 或 "ollama serve"）。
- 反向断言：`opts.baseURL` 是云端（如 `https://api.deepseek.com/v1`）时，原有的 TypeError 回落代理行为不变（避免本改动破坏 Kimi 路径）。

## 10. 不在本 spec 范围内

- 通过 `GET /api/tags` 实时拉取已安装模型列表（hardcoded 已满足当前测试需求）
- 支持 LM Studio、llama.cpp server 等其他本地 runtime（它们也是 OpenAI 兼容，用户可自行作为 custom provider 添加）
- 修正 cloud provider 的隐私文案（pre-existing 问题，单独开 spec）
- HTTPS Ollama（用户自配反代 + 证书）—— `baseURL` 可编辑已支持，无需特殊处理

## 11. 实现顺序建议

1. `presets.ts`：加字段 + Ollama seed
2. 改三处 gating 判断
3. `http.ts`：localhost 检测 + 跳过回落
4. `adapter.ts`：传 `baseURL`
5. `SettingsPanel.tsx`：条件隐藏 API Key 字段
6. `useSettings.ts`：升 STORAGE_KEY 到 v9
7. 测试更新 + 新增
8. `npm run lint && npm run typecheck && npm run build` 全过
9. 手动验证：本地启动 Ollama + `npm run dev`，选 Ollama provider，选 `gemma4:12b`，跑一次 polish
