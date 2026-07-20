// lib/i18n/zh.ts
import type { Strings } from "./index";

export const zh: Strings = {
  lang: "zh",
  htmlLang: "zh-CN",
  ogLocale: "zh_CN",
  title: "Grammar Checker — 免费 AI 英语语法检查与润色工具",
  metaDescription:
    "免费 AI 英语语法检查与润色工具。粘贴文本即可获得逐条修改建议与解释，编辑器内直接接受或拒绝。BYOK 自带 Key，支持 DeepSeek、Gemini、GLM、Kimi。无需注册，纯前端运行，文本不上传任何服务器。",
  metaKeywords: [
    "语法检查",
    "英语润色",
    "英语语法检查",
    "AI 校对",
    "论文语法检查",
    "邮件语法检查",
    "英文校对工具",
    "AI proofreader",
    "grammar checker",
    "IELTS 写作检查",
    "留学文书润色",
    "BYOK 语法工具",
  ],
  heroH1: "免费 AI 英语语法检查与润色工具",
  heroSub:
    "粘贴文本，逐句获得带原因的修改建议，编辑器内直接接受或拒绝。自带 API Key，文本与 Key 仅存于浏览器，绝不上传。每次润色约 ¥0.004——Grammarly 一年 $144，这里一年不到 $2。",
  features: [
    {
      title: "BYOK 自带 API Key",
      body:
        "粘贴你自己的 DeepSeek、Gemini、GLM 或 Kimi API Key 即可使用。无需注册、无需订阅。按 DeepSeek V4 Flash 估算，单次润色约 ¥0.004，Grammarly 一年的 $144 订阅费够你润色 20 万次以上。",
    },
    {
      title: "纯前端运行",
      body:
        "文本和 Key 仅存于你的设备。我们没有后端数据库，也不记录你的输入。",
    },
    {
      title: "类 Grammarly 的内联建议",
      body:
        "每条建议都精确锚定到原文中的位置，可在编辑器中直接接受、拒绝或一键全部接受。",
    },
    {
      title: "多模型多服务商",
      body:
        "支持 DeepSeek、Gemini、GLM、Kimi，或任何 OpenAI 兼容接口。一键添加自定义服务商。",
    },
    {
      title: "本地任务历史",
      body:
        "最近 50 次润色任务保存在 localStorage。点开任意任务即可恢复原文与全部建议。",
    },
    {
      title: "完全开源",
      body:
        "可在 GitHub 自托管或审阅全部代码。无追踪像素，不向第三方出售数据。",
    },
  ],
  faq: [
    // 学术
    {
      q: "如何检查我的学术论文语法？",
      a: "把摘要、引言或任意段落粘贴到编辑器，点击 Polish。Grammar Checker 会以行内方式返回语法、拼写、标点和风格修改建议，每条都附简短解释，适合在投稿或答辩前给论文、研究稿、学位论文做最后校对。",
    },
    {
      q: "这个工具适合润色留学申请文书吗？",
      a: "适合。Personal Statement、Statement of Purpose、奖学金申请文书都可以直接粘贴。因为是 BYOK 模式，我们没有持久化后端——你的文本仅用于本次润色，绝不被存储、记录或缓存。",
    },
    {
      q: "可以用来检查雅思、托福写作吗？",
      a: "可以。IELTS Task 1、Task 2 与 TOEFL Independent Writing 的回答都可直接粘贴。每条建议都按 grammar、word-choice、clarity 等类型分类，方便你看出哪些错误最影响分数。",
    },
    // 职场
    {
      q: "可以用来检查商务英文邮件吗？",
      a: "可以。Grammar Checker 非常适合英文邮件、报告、Slack 消息的润色。style 与 clarity 两类建议可以捕捉到普通语法检查工具漏掉的语气和冗长问题。",
    },
    {
      q: "如何润色一份正式报告？",
      a: "建议每次粘贴一节（5000–10000 字符最佳），点击 Polish，逐条审视建议、接受认可的修改，再把润色后的文本复制回原文档。",
    },
    {
      q: "我的邮件内容安全吗？",
      a: "文本在你的浏览器内处理，再发往你配置的 LLM 服务商（DeepSeek、Gemini、GLM 或 Kimi）。我们没有持久化后端，不存储、不记录、不缓存你的任何输入。",
    },
    // 工具与 BYOK
    {
      q: "和 Grammarly 有什么区别？",
      a: "Grammarly 需要账号，并把你的文本发到它的服务器。Grammar Checker 是免费、开源、BYOK 模式的工具：你自带 LLM API Key，编辑器在浏览器内运行，无需注册。支持 DeepSeek、Gemini、GLM、Kimi，可自由选择最适合你写作风格的模型。",
    },
    {
      q: "BYOK 是什么意思？",
      a: "BYOK = Bring Your Own Key（自带密钥）。你不需要付订阅费，而是粘贴来自 DeepSeek、Gemini 等服务商的 API Key，按 token 直接付费给服务商——通常比语法工具的订阅便宜得多。",
    },
    {
      q: "用 DeepSeek 润色一次大概多少钱？",
      a: "以 DeepSeek V4 Flash 官方定价估算（输入 $0.14/百万 tokens，输出 $0.28/百万 tokens）：润色一段约 400 词的英文，约消耗 1800 输入 tokens（含系统提示词）和 1200 输出 tokens（修改建议 JSON），单次成本约 $0.0006（约合人民币 0.004 元）——大约润色 1600 次才花 1 美元。短邮件更低，但即使 500 词以上的长段落也很少超过 $0.001。其他模型（Gemini、GLM、Kimi）单价略高，但同一数量级。",
    },
    {
      q: "BYOK 比 Grammarly 订阅便宜多少？",
      a: "Grammarly Pro 年费 $144（$12/月）。同样的钱用 DeepSeek V4 Flash 够润色 20 万次以上。一个高强度用户（每天写英文邮件 + 作业，一年约 1500–3000 次润色）一年的 LLM 费用通常不到 $2，不到 Grammarly 年费的 2%。即便每天润色 50 次的极端重度用户，一年也只要约 $11。",
    },
    {
      q: "支持哪些 AI 模型？",
      a: "内置支持 DeepSeek、Kimi（Moonshot）、GLM（智谱）、Google Gemini。你也可以在设置面板添加任何 OpenAI 兼容接口或 Gemini 兼容接口作为自定义服务商。",
    },
    {
      q: "我的数据会被存储吗？",
      a: "无服务端存储。你的 API Key、文本、最近 50 条任务快照都仅保存在浏览器 localStorage 中。清空浏览器数据即全部删除。",
    },
  ],
  footerLine:
    "完全开源 · 纯前端运行 · API Key 与文本不会上传到任何服务器",
  switchLang: { label: "English", href: "/en" },
};
