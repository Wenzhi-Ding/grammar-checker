# Grammar Checker — 设计文档

- **日期**: 2026-07-15
- **状态**: 已通过 brainstorming 审定，待实现
- **范围**: v1（短文本，预留长文本扩展）

## 1. 概述

Vercel 部署的网页应用，Grammarly 式语法纠正与文本润色。用户**自带 LLM API Key（BYOK）**：粘贴文本 → 点 Polish → 前端把 LLM 返回的结构化建议与原文做比对，渲染成内联高亮，逐条 Accept/Reject。

核心契约：**LLM 返回结构化的 corrections，前端用混合匹配引擎把每条 correction 钉到原文的一个区间**，再渲染与应用编辑。

## 2. 范围（v1 做 / 不做）

### v1 做
- 粘贴短文本（几百词内）→ Polish → Grammarly 式内联高亮 → 逐条 Accept/Reject + Accept all → 复制结果。
- BYOK，5 个 provider preset：**DeepSeek、Kimi(Moonshot)、GLM(智谱)、Gemini、Custom**。
- 英文 / 中文各一套针对性 prompt；其他语言走通用 fallback。
- 设置面板（provider / key / model / 可选 baseURL / 可选 language 覆盖），key 可选记忆到 `localStorage`。
- 用户 key 只活在浏览器，绝不进服务端持久化。

### v1 不做（接口预留，不实现）
- 长文档分块（`Provider` 接口预留 `polishChunk`，v1 只走单次 `polish`）。
- 流式返回（v1 等完整响应）。
- 应用编辑后重新分析。
- 账号 / 服务端历史 / 协作。

## 3. Provider 注册表（presets）+ Adapter 实现

把"怎么调"（adapter 代码）和"调谁"（preset 配置）分开。**新增一个 OpenAI 兼容厂商 = 加一行 preset，不改代码。**

**Adapter 实现（只有 2 种代码）：** `gemini` · `openai-compatible`

| Preset | adapter | baseURL | 默认 model |
|---|---|---|---|
| DeepSeek | openai-compatible | `api.deepseek.com/v1` | `deepseek-v4-pro` |
| Kimi (Moonshot) | openai-compatible | `api.moonshot.cn/v1` | `kimi-k2.7-code` |
| GLM (智谱) | openai-compatible | `open.bigmodel.cn/api/paas/v4` | `glm-5.2` |
| Gemini | gemini | — | `gemini-3.5-flash` |
| Custom | openai-compatible | 用户填 | 用户填 |

### 3.1 传输：直连优先 + 自动 proxy 兜底（不硬编码 transport）

CORS 是每家 provider 的经验属性，**不该在 preset 里写死**。已实测（2026-07-15，预检 `OPTIONS`）：

| Provider | CORS 预检 | 结论 |
|---|---|---|
| DeepSeek | `access-control-allow-origin` ✅ | 可直连 |
| GLM (智谱) | 完整 CORS 头 ✅ | 可直连 |
| Gemini | Google API 允许浏览器直连 ✅ | 可直连 |
| Kimi (Moonshot) | `204` 仅 `Vary`，**无 allow-origin** ❌ | 浏览器被拦 |

策略：
- **所有 provider 默认浏览器直连**（key 放 `Authorization` header）。
- **Provider 层包一层自动兜底**：`fetch` 直连失败且报的是 CORS/网络型错误（浏览器对 CORS 失败只抛 `TypeError: Failed to fetch`，区别于收到 HTTP 状态码）时，自动重试一次，改走无状态 `app/api/polish/route.ts`。
- Route handler 始终部署，作为通用兜底；不针对某一家。Kimi 因此自动落到 proxy，用户无感；Custom（任意 baseURL）也不用猜。
- 唯一代价：首次 CORS 失败会多等"一次失败直连 + 一次 proxy 重试"，只发生在 Kimi 这类 provider。

## 4. 类型与 Provider 接口（中心契约）

```ts
// lib/providers/shared/schema.ts
export type CorrectionType = "grammar" | "spelling" | "punctuation"
                           | "style" | "clarity" | "word-choice";
export type Severity = "info" | "minor" | "major";

export interface Correction {        // LLM 返回的原始建议（无 span）
  original: string;                  // 原样复制，禁止规范化
  suggestion: string;                // "" = 删除
  type: CorrectionType;
  reason: string;
  severity?: Severity;
}
export interface PolishResult { corrections: Correction[] }

export interface PinnedCorrection extends Correction {
  start: number; end: number;        // 匹配引擎补上，-1 = 未匹配
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;                  // openai-compatible 用
  language?: "en" | "zh" | "auto";   // 默认 auto
}

export interface Provider {
  readonly id: string;
  polish(text: string, config: ProviderConfig): Promise<PolishResult>;
}
```

**关键解耦：`Provider.polish` 只负责"从 LLM 拿到原始 corrections"，不带 span。** 把 corrections 钉到原文区间是独立的 `pinSpans()`（第 7 节），所有 provider 共用。provider 层纯粹，匹配逻辑只写一遍、测一遍。

## 5. 结构化输出策略

| adapter | 调用 | 结构化输出方式 |
|---|---|---|
| `openai-compatible`<br>(DeepSeek/Kimi/GLM/Custom) | `POST {baseURL}/chat/completions` | **JSON mode**：`response_format:{type:"json_object"}` + prompt 里写死 schema 描述。各家对 `json_schema` strict 模式支持不一，`json_object` 是最稳的最大公约数。 |
| `gemini` | `generateContent?key=...` | `generationConfig.responseMimeType="application/json"` + `responseSchema`（JSON Schema 子集，Gemini 原生支持）。 |

**统一解析管线**：`JSON.parse → zod 校验 → 失败则带错误信息重试一次 → 仍失败抛 PolishError(kind:"schema")`。`Correction` 形状定义一次，同时派生三份：prompt 里的文字描述、Gemini 的 `responseSchema`、zod 校验器——单一事实源。

## 6. Prompt：共享指令 + 英中差异化

```
shared/prompt.ts   结构化输出公共指令（schema 描述 + "original 必须原样" 铁律 + 输出格式 + "按文中顺序返回"）
shared/lang.ts     detect(text)：CJK 字符占比 > 阈值 → zh，否则 en（可被 config.language 覆盖）
prompt/en.ts       英文针对性 framing
prompt/zh.ts       中文针对性 framing
```

**共享铁律（写进所有 prompt，匹配引擎就靠它）：**
> `original` 必须是输入里字符的**逐字复制**，包含错误也不要改；不得规范化空格 / 引号 / 标点。前端按精确子串定位。corrections 按在文中出现的先后顺序返回。

**英文 prompt（`en.ts`）侧重点：** grammar（主谓一致、时态、冠词）、spelling、punctuation、word-choice、clarity。类型分布以 grammar/spelling 为主。

**中文 prompt（`zh.ts`）侧重点：** 汉字无"拼写"，弱化 grammar/spelling；主攻**冗余、口语化→书面化、用词不当、中文标点规范、语序、清晰度**。明确要求"保留原意、不要过度重写、不建议无意义的风格替换"。类型分布以 style/clarity/word-choice 为主；severity 校准更保守（中文润色主观性强，少给 major）。

**一次 polish 的完整流程：**
```
polish(text, config):
  lang = config.language === "auto" ? detect(text) : config.language
  prompt = assemblePrompt(lang, text)          // 公共指令 + 对应语言 framing + 原文
  raw = await callLLM(prompt, config)          // adapter 各自的 json mode / responseSchema
  return { corrections: parseAndValidate(raw) } // zod 校验 + 一次修复重试
# 之后 UI 层：pinned = pinSpans(text, corrections); render(pinned)
```

## 7. 匹配引擎（`shared/match.ts`）

项目风险最高、最该被测厚的模块。纯逻辑、零 LLM 依赖，可无障碍单测。用 [diff-match-patch](https://github.com/google/diff-match-patch)（Google 库，无依赖、小）做模糊兜底。

### 7.1 三层匹配 `pinSpans(text, corrections): PinnedCorrection[]`

```
cursor = 0  （顺序游标，靠 prompt 的"按顺序返回"保证）
for each correction:
  ── Tier 1 精确 indexOf ──
  idx = text.indexOf(original, cursor)
  if idx >= 0:  pin {idx, idx+len}; cursor = idx+len; continue

  ── Tier 2 diff-match-patch 模糊兜底 ──
  idx = dmp.match_main(text, original, 0)   # 专为"在长文本里找最像 pattern 的位置"设计
  if idx >= 0:
      end = idx + dmpInferredLen(...)        # 用 diff_main 算实际对齐长度，吸收长度漂移
      pin {idx, end}; continue

  ── Tier 3 放弃 ──
  pin {start:-1, end:-1}; console.warn("unmatched", original)
```

Tier 2 天然能吸收 LLM"顺手规范化"的空格 / 引号 / 全半角差异。**不用正则、不让 LLM 给偏移**（正则转义不可靠，LLM 数字符更不可靠）。

### 7.2 顺序保证
prompt 加共享铁律"按文中先后顺序返回"，使 Tier 1 的顺序游标消歧（同一短语多次出现时按出现顺序依次认领）在绝大多数情况下成立。偶发乱序 → Tier 1 miss → 自动落 Tier 2，不影响正确性。

### 7.3 重叠处理（pin 完之后）
- 按 `(start 升序, severity 权重降序, length 降序)` 排序。
- 贪心扫描：与已保留区间重叠的，丢弃优先级较低的那条，标 `superseded`。
- 保证同一段文字不会有两个高亮打架。**这一步是不重叠保证，第 8.3 的偏移重算就靠它。**

### 7.4 阈值与安全护栏
- `dmp.Match_Threshold = 0.5`、`Match_Distance = 1000`，作为 `shared/match.ts` 顶部可调常量。
- **假阳性护栏**：Tier 2 命中后校验 `original` 与命中区间的相似度；若实际 diff 过大（说明 `match_main` 钉到了"像但其实是别处"的位置），降级为 Tier 3 放弃。**钉错位置比丢弃更糟**——用户可能在错的地方接受修改。

## 8. 前端 / UX

> 视觉外观（具体配色、popover 样式）留到实现时真机迭代；本节锁的是**行为和渲染模型**。

### 8.1 渲染模型：textarea + overlay
`<textarea>` 无法给内部文字加样式，用两层结构：背后 overlay div 渲染同款文字 + `<mark>` 高亮；上面透明 textarea（文字透明、光标可见）接收输入/IME/同步滚动。两层 font/padding/line-height/width 完全一致。**不用 contenteditable**（光标、粘贴消毒、中文 IME、阻止误编辑都是灾难）。流程是"先粘贴编辑 → 再 review"，review 期间基础文本只通过 accept 动作改变。

### 8.2 编辑器状态机
```
idle ─[粘贴]→ editing ─[Polish]→ loading ─→ review(高亮)
                                                │ accept/reject 不改态，只更新 suggestions/text
                                                ▼ 全部处理完
                                              done ─[copy]/[clear]→ editing
```

### 8.3 应用编辑时的偏移重算（核心难点）
靠 §7.3 的不重叠保证，accept 时是干净的 **O(n) 增量调整**，不重新匹配：
```
accept(S):
  delta = S.suggestion.length - (S.end - S.start)
  text  = text.slice(0,S.start) + S.suggestion + text.slice(S.end)
  for each pending T with T.start >= S.end:  T.start += delta; T.end += delta
  S.state = "accepted"
```
- `Accept all`：按文档顺序逐个套用。
- `Reject`：仅标 `state="rejected"`，不动文本。
- stable id 全程不变，方便 React key 和测试。

### 8.4 高亮与卡片（视觉 spec）
- 每条 pending → `<mark class="hl hl-{type}" data-id>`。Grammarly 式**下划线**（非背景），颜色按 type：grammar/spelling/punctuation 红、style/word-choice 蓝、clarity 紫；major 加粗。
- hover/click → 弹卡片：`原文 → suggestion`、`reason`、type 徽标、`[Accept] [Reject]`。
- Tier 3 未匹配建议不画高亮，收进"N 条无法定位"折叠面板，仍可看 reason。

### 8.5 设置面板（⚙️）
Provider 下拉（DeepSeek/Kimi/GLM/Gemini/Custom）→ 选 Custom 出 baseURL → API Key（password，"记住"勾选存 localStorage，否则仅内存）→ Model（预填 preset 默认，可改）→ Language override（auto/en/zh）→ "测试连接"发最小请求验证。

### 8.6 布局
单栏，编辑器居中、最大宽 ~720px。顶栏：标题 + 当前 provider + **Polish** + ⚙️。底栏：字数 + "N 条建议" + 复制结果。移动端 suggestion 卡片改底部 sheet。

## 9. 错误处理 + 安全 / BYOK

### 9.1 错误分类（统一收敛成 `PolishError`）
```ts
type PolishError = { kind: "no-key"|"auth"|"network"|"schema"|"rate-limit"|"timeout"|"empty"; message: string; retryable: boolean };
```
| 场景 | 处理 |
|---|---|
| 未配 key | Polish 按钮 disabled + tooltip |
| 401/403 | 设置面板 key 标红，提示无效/无权限 |
| fetch 抛 TypeError（CORS/网络） | **触发 §3.1 自动兜底**，重走 `/api/polish`；仍失败提示网络错误 |
| JSON 解析 / zod 校验失败 | 带错误信息重试一次（让模型自修）；仍失败降级提示换模型 |
| Tier 3 未匹配 | 不报错，静默进"无法定位"面板 + console.warn |
| 429 | 提示频繁，v1 不做自动退避 |
| >30s | abort + 超时提示 |
| 返回 0 corrections | **正常态**："未发现可润色之处" |

### 9.2 BYOK 红线
- **key 只在浏览器**：默认内存；勾选"记住"才进 `localStorage`。绝不入 cookie / URL / 服务端日志。
- **直连**：key 放 `Authorization` header 直发 provider。出现在用户自己 network tab——可接受。
- **proxy route handler**（仅 CORS 失败时走）：key 走**请求 body**（非 header）传给 route（避免 Vercel 日志记 header），route 内部再拼 Authorization 转发；转发后立即丢弃，**不 console.log、不缓存、不 telemetry**，代码里显式不引入任何持久化。
- **防泄漏护栏**：仓库绝不出现真实 key（.gitignore + review）；错误信息回显前脱敏；CSP `connect-src` 允许 https:（v1 简单起见）。

## 10. 测试策略

按"纯逻辑优先、风险越高测越厚"分配：
1. **匹配引擎 `shared/match.ts`（最高优先级）** — 纯函数、无 mock、零 LLM 依赖。三层算法 + 消歧 + 重叠去重叠全夹具覆盖。
2. **偏移重算（§8.3）** — 单测：accept 一条后后续 start/end 正确平移；accept all 顺序应用结果正确。
3. **Provider 层** — mock fetch/SDK，验证：prompt 组装（语言选择、verbatim 铁律在内）、JSON 解析、zod 校验、修复重试、错误映射。openai-compatible 和 gemini 各一套。
4. **UI 集成（轻量）** — React Testing Library / Playwright：粘贴固定文本 + mock provider 返回固定 corrections → 断言高亮数、accept 后文本变、reject 不变、accept all。
5. **真实 LLM 冒烟（手动）** — 实现后用真实 key 跑 EN + ZH 各一段，记进 README "如何验证"。

不追求覆盖率指标，资源集中在 1 和 2 两个纯逻辑核心。

## 11. 目录结构（建议）

```
lib/providers/
  shared/schema.ts        Correction / PolishResult / PinnedCorrection / Provider 接口
  shared/prompt.ts        公共结构化输出指令 + verbatim 铁律
  shared/lang.ts          detect(text)
  shared/match.ts         pinSpans 三层匹配 + 重叠去重叠  ← 最高测试优先级
  shared/parse.ts         JSON.parse + zod 校验 + 修复重试
  shared/http.ts          直连 + 自动 proxy 兜底包装
  openai-compatible/      adapter + prompt/{en,zh}.ts
  gemini/                 adapter + prompt/{en,zh}.ts
  index.ts                按 ProviderConfig 选 adapter 的工厂 + preset 注册表
app/
  page.tsx                编辑器 + overlay + 高亮 + 卡片
  api/polish/route.ts     无状态 proxy 兜底（仅 CORS 失败时走）
components/               Settings 面板、SuggestionCard、HighlightOverlay 等
```
