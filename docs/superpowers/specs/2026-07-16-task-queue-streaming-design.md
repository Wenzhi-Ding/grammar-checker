# 任务队列 + 流式进度 — 设计文档

- **日期**: 2026-07-16
- **状态**: 已通过 brainstorming 审定，待实现
- **前置**: [`2026-07-15-grammar-polisher-design.md`](2026-07-15-grammar-polisher-design.md)。本设计取代其中「v1 不做流式返回」的决定；实现后需同步更新 AGENTS.md 的 Open decisions 一节。

## 1. 概述

为 Grammar Checker 增加**任务队列机制**与**流式推理进度**：

- 点 Polish 后在页面左侧列表队首插入一个任务，立即并行发出请求；编辑器不锁定。
- 流式推理期间显示「≈N tokens」进度（非百分比），让用户知道仍在推进。
- 任务完成后显示状态；后台完成的任务标「未读」。点击任务把其原文（及建议）载入编辑器。
- 列表持久化在 localStorage，上限 50 条，新任务插入队首。

## 2. 已确认决策（brainstorming 问答记录）

| 问题 | 决定 |
|---|---|
| 多任务执行方式 | **并行**：点 Polish 立即发请求，可同时跑多个 |
| 点击已完成任务 | **恢复完整评审状态**：原文 + 全部建议载入，可逐条接受/拒绝 |
| 完成后自动加载 | **仅当前聚焦的任务**自动加载；其余后台完成的标「未读」 |
| 未读语义 | 仅后台完成的任务标未读；点击后变已读 |
| 持久化 | localStorage，上限 50 条超出删最旧，每条可手动删除 |
| token 进度位置 | 列表项 + 底部按钮区，两处同步 |
| 架构 | 方案 A：纯前端并行任务 + SSE 流式直连（代理兜底） |

## 3. 数据模型与持久化

```ts
// lib/tasks/types.ts（新文件）
export type TaskStatus = "running" | "done" | "error" | "interrupted";

export interface PolishTask {
  id: string;                    // crypto.randomUUID()
  text: string;                  // 提交时的原文快照
  createdAt: number;             // Date.now()
  providerId: string;
  model: string;
  status: TaskStatus;
  approxTokens: number;          // running 期间实时增长
  result?: PolishResult;         // done 时写入，用于恢复评审态
  error?: PolishError;           // error 时写入
  unread: boolean;               // 仅后台完成的任务为 true
}
```

`PolishError` / `PolishErrorKind` / `toPolishError` 从 `hooks/usePolish.ts` 上移到 `lib/providers/shared/errors.ts`（纯类型 + 纯函数，无 React 依赖），供任务模型、usePolish、页面共用；`hooks/usePolish.ts` 改为 re-export 以免页面 import 大爆炸。

- localStorage key：`grammar-polisher.tasks.v1`。上限 50 条，超出删最旧。
- 写入捕获 `QuotaExceededError`：逐条删最旧重试，直到能写入或删完（防 50k 字长文本撑爆 ~5MB 配额）。
- 页面加载（rehydrate）时，所有 `running` 任务一律改写为 `interrupted`（请求已随页面死亡），保留原文与 × 删除，用户可重新 polish。
- 无权写 localStorage（隐私模式等）时静默降级为仅会话内。

## 4. 任务生命周期与交互规则

1. **发出**：点 Polish → 快照当前文本建任务（`running`、`unread:false`）插入队首，立即并行发出流式请求。编辑器不锁定，可继续编辑、继续发新任务。
2. **完成时自动加载规则**：任务完成时若它正是当前编辑器聚焦的任务 → 前端 `pinSpans` 后把建议载入编辑器（保持现有主流程），`unread=false`；否则任务只更新列表状态并标 `unread=true`。
   - 场景：连发 A、B（B 更新，聚焦 B）。A 后台完成 → 未读；B 完成时仍聚焦 B → 自动加载。
3. **点击任务**：
   - `done` → 原文载入文本框，`pinSpans(text, result.corrections)` 恢复全部建议为可评审状态，标记已读。
   - `running` → 原文快照载入（编辑器仍可编辑；一旦编辑即按 §4.4 脱钩，任务转后台继续，完成时标未读），按钮区旁显示该任务实时进度。
   - `error` → 原文载入，错误面板显示该任务的 error 与重试按钮（用原快照重发为新任务）。
   - `interrupted` → 原文载入，提示已中断，可重新 polish。
4. **编辑脱钩**：编辑文本即与当前聚焦任务脱钩（清建议、清聚焦；任务本身在列表中不受影响），与现有「手动编辑清建议」行为一致。
5. **删除**：每条任务带 ×；删除 `running` 任务通过 `AbortController` 中止其请求。
6. **排序**：始终按创建时间倒序（新的在队首），不重排。

## 5. 流式 Provider 层

### 5.1 接口扩展（中心契约）

```ts
// lib/providers/shared/schema.ts
export interface Provider {
  readonly id: string;
  polish(text: string, config: ProviderConfig): Promise<PolishResult>;
  /** 流式变体。onToken 每次 delta 回调累计的近似 token 数。 */
  polishStream?(
    text: string,
    config: ProviderConfig,
    onToken: (approxTokens: number) => void,
    signal?: AbortSignal,
  ): Promise<PolishResult>;
}
```

非流式 `polish` 保留（代理非流式分支与现有测试继续使用）。

### 5.2 SSE 解析（共享模块）

`lib/providers/shared/sse.ts`（新文件）：输入 `Response.body` 的 ReadableStream，产出 `data:` 载荷字符串的异步迭代器。

- 按 `\n\n` 分帧；帧内多行 `data:` 拼接；处理跨 chunk 粘包（decoder streaming + 缓冲区）。
- 跳过空帧、注释行（`:` 开头）、malformed 行；`data: [DONE]` 终止。
- 解析错误不抛出中断流，跳过该帧继续。

### 5.3 OpenAI 兼容适配器

- 请求体在现有基础上加 `stream: true` 与 `stream_options: { include_usage: true }`。
- 每收到一个含 `choices[0].delta.content` 的 chunk，累计 token 数 +1（delta 粒度 ≈ token 粒度），调 `onToken(n)`；UI 显示「≈N tokens」。
- 若最终 chunk 带 `usage.completion_tokens`，以它为准做最后一次回调。
- 累计全部 delta content 后交给现有 `parsePolishResult`。

### 5.4 Gemini 适配器

- URL 改为 `:streamGenerateContent?alt=sse&key=...`，请求体不变。
- Gemini chunk 粒度粗，token 计数用累计字符数估算：`ceil(chars / 4)`，调 `onToken(n)`。
- 最终 chunk 若带 `usageMetadata.candidatesTokenCount`，以它为准。
- 拼接 `candidates[0].content.parts[].text` 后交给 `parsePolishResult`。

### 5.5 请求构造共享化

每个适配器导出 `buildStreamRequest(text, config): { url, init }`（URL、headers、body），供两处复用：浏览器直连、代理路由。保证直连与代理发出的上游请求完全一致。

### 5.6 代理路由流式分支

`app/api/polish/route.ts`：请求体加可选 `stream: true`。

- `stream:true` → 用对应适配器的 `buildStreamRequest()` 发上游请求，把 `upstream.body` 原样管道回浏览器，`Content-Type: text/event-stream`。**不解析、不缓存、不留存 key**（同现有约束）。
- 上游返回非 2xx（尚未进入流）→ 读错误文本，按现有 `{ error }` JSON + 状态码返回。
- 非流式分支保持现状不变。

### 5.7 流式兜底

`lib/providers/shared/http.ts` 加 `callStreamWithFallback(directStream, { proxyBody })`：

- 直连在**拿到 Response 之前**抛 `TypeError`（CORS/网络）→ 自动改走 `/api/polish`（body 带 `stream:true`），语义与现有 `callWithFallback` 一致。
- 已进入流之后的断开（reader 抛错 / 提前 EOF 且无 `[DONE]`）→ 视为 network 错误（retryable），**不再自动兜底重试**，避免重复扣费与进度回退的困惑。
- 代理响应非 2xx → 读 `{ error }` 抛带 `status` 的 Error（与直连非 2xx 语义一致）。

## 6. Hook 与状态

### 6.1 `hooks/useTasks.ts`（新）

管理任务列表的唯一事实来源：

```ts
{
  tasks: PolishTask[];
  enqueue(text, meta: { providerId, model }): string;   // 返回 id，插队首
  update(id, patch): void;
  remove(id): void;                                     // running 则先 abort
  markRead(id): void;
}
```

- 内部用 reducer。**落盘时机**：仅状态迁移类操作（enqueue / done / error / remove / markRead / interrupted 改写）触发持久化；`approxTokens` 计数只活在内存（running 任务刷新后本来就要标 interrupted，计数无持久化价值），避免流式期间高频写 localStorage。
- 负责 50 上限驱逐、quota 驱逐、rehydrate→interrupted。

### 6.2 `hooks/usePolish.ts`（改造）

- 从「单发请求」改为「任务运行器」：`run(taskId, text, opts)`，内部调 `polishStream`，`onToken` 回调里 `update(taskId, { approxTokens })`；完成写 `result`/`status`；失败写 `error`/`status:"error"`。
- 持有 `Map<taskId, AbortController>`，供 `remove` 中止。
- 页面卸载不主动 abort（fetch 随页面死亡；rehydrate 已覆盖）。
- 现有 `toPolishError` 分类原样复用。

### 6.3 `app/page.tsx`（改造）

- 新增聚焦任务状态 `focusedTaskId: string | null`（null = 草稿，即现有无任务状态）。
- `onPolish`：`enqueue` → `focusedTaskId = id` → `run(...)`。
- 完成回调里执行 §4.2 的自动加载规则。
- 点击列表项 → §4.3；编辑文本 → §4.4 脱钩。
- 现有建议评审逻辑（accept/reject/accept-all/findNext）不变，只是数据来源从「最近一次 result」变为「聚焦任务的 result」。

## 7. UI 布局

- `components/TaskList.tsx`（新）：左侧栏，桌面宽 ~280px，`gp-wrap` 改双栏 grid；窄屏（<900px）折叠为顶栏按钮触发的抽屉（遮罩 + 侧滑）。
- 任务项内容：原文首 ~40 字摘要（单行省略）、相对时间（如 2 分钟前）、模型名、状态徽标、× 删除。
  - `running`：转圈 + `≈N tok` 实时更新。
  - `done` 且 `unread`：蓝点 + 加粗。
  - `done` 已读：✓ 已完成。
  - `error`：失败（红）。
  - `interrupted`：已中断（灰）。
- 底部按钮区：聚焦任务进行中时，Polish 按钮**旁**显示独立状态文本 `Polishing… ≈N tokens`，与列表项同步；否则不显示。
- **Polish 按钮不再因任务 running 而禁用**（并行设计，随时可发新任务），仅保留现有约束：无 apiKey / 文本为空 / 超字数上限。编辑器也不再有全局只读（`readOnly={busy}` 移除，busy 变为 per-task 概念）。
- 空列表：侧栏显示占位文案（如「暂无任务」），不自动隐藏侧栏。

## 8. 错误处理

- 错误按任务隔离，沿用 `PolishError` 分类（`no-key`/`auth`/`rate-limit`/`network`/`schema`），写入任务。
- `error` 任务的一键重试 = 用原快照 + 原 provider/model `enqueue` 新任务。
- 代理流式分支与直连共享同一 SSE 解析器，错误语义一致。
- API key 处理不变：仅浏览器内存/localStorage；代理只在请求体中转发，不日志不存储。

## 9. 测试（vitest，沿用 tests/ 现有风格）

| 目标 | 用例 |
|---|---|
| `shared/sse.ts` | 分帧；跨 chunk 粘包；多行 data 拼接；`[DONE]` 终止；malformed 帧跳过；注释行跳过 |
| OpenAI 流式适配器 | delta 计数回调单调递增；usage 覆盖估算值；完整 content 交给 parsePolishResult；非 2xx 抛 status |
| Gemini 流式适配器 | 字符估算回调；usageMetadata 覆盖；parts 拼接正确 |
| `callStreamWithFallback` | 直连成功；TypeError→代理流；代理非 2xx 抛 status 错 |
| `useTasks` reducer | enqueue 插队首；50 上限驱逐最旧；markRead；quota 驱逐重试；rehydrate running→interrupted |
| 代理路由 | `stream:true` 时字节透传（mock upstream body）；响应不含/不记录 key；上游非 2xx 返回 `{error}` |

UI 组件不写单测（现状一致）；布局改动人工验证桌面 + 窄屏抽屉。

## 10. 不做（本次范围外）

- 增量渲染流式中间结果（仍等完整 JSON 再 pin 建议；流式仅用于进度）。
- 任务跨标签页同步。
- 服务端任务历史 / 账号。
- 串行队列 / 并发数限制。
- 任务内建议的二次编辑与重新分析。
