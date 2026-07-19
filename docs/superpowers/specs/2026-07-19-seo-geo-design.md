# SEO + GEO 双语落地 — 设计文档

- **日期**: 2026-07-19
- **状态**: 已通过 brainstorming 审定；用户授权跳过 review 直接执行
- **前置**: [`2026-07-15-grammar-polisher-design.md`](2026-07-15-grammar-polisher-design.md)
- **域**: `https://grammar-checker.app`
- **品牌**: Grammar Checker

## 1. 概述

为 Grammar Checker 落地 SEO（搜索引擎优化）与 GEO（生成式引擎优化），让 Google/Bing 等传统爬虫与 ChatGPT/Perplexity/Gemini 等 LLM 抓取器都能读到 informative 的内容。

核心策略：

1. **URL 化双语**：`/`（英文）、`/zh`（中文），hreflang 双向关联，Google/LLM 都能索引到两个语言版本。
2. **服务端渲染内容**：把当前 `"use client"` 整页拆为「server 骨架（hero + FAQ + JSON-LD）+ client 子组件（Editor + 交互）」。爬虫读得到 `<h1>` 和 FAQ 文本。
3. **结构化数据**：`WebApplication` + `FAQPage` + `Organization` 三类 JSON-LD。
4. **GEO 配套文件**：`llms.txt`、`robots.ts`、`sitemap.ts`、`manifest.ts`。
5. **站长工具**：Microsoft Clarity 集成；spec 中给 GSC + Bing Webmaster 注册步骤（外部配置，无需代码）。

## 2. 已确认决策

| 问题 | 决定 |
|---|---|
| 目标受众 | 中英双语并重；`/` 英文 + `/zh` 中文 |
| 品牌 | "Grammar Checker"；域名 `grammar-checker.app` |
| 内容位置 | 首页加 hero + Features + FAQ 区块（不另建 `/about` 等页面） |
| 分析工具 | Vercel Analytics（已有）+ Microsoft Clarity；GSC + Bing Webmaster（外部配置）；**不装 GA** |
| FAQ 角度 | 学术 + 职场 + 英语学习 三类共 ~10 问 |
| 方案 | A：极简路由（`/`、`/zh`）+ 首页内容区块 |
| i18n 库 | 不引入（用字典对象足够） |
| 现有 useLocale | 改为 URL-driven，保留 hook 接口不变 |

## 3. 路由结构

```
app/
├── [lang]/
│   ├── layout.tsx          # server component: metadata + JSON-LD + <html lang>
│   ├── page.tsx            # server component: hero + <Polisher> + FAQ + footer
│   └── Polisher.tsx        # client component: 现有 page.tsx 全部交互逻辑
├── api/                    # 不动
├── robots.ts               # 新增
├── sitemap.ts              # 新增
├── manifest.ts             # 新增
├── icon.svg                # 不动
└── globals.css             # 不动
public/
├── llms.txt                # 新增
├── og.png                  # 新增（1200×630）
├── og.zh.png               # 新增
└── ...（现有 svg 不动）
lib/
└── i18n/
    ├── index.ts            # getStrings(lang), LOCALES, DEFAULT_LOCALE, 类型
    ├── en.ts               # hero / features / faq / footer
    └── zh.ts               # 同上
```

### Locale 来源

- **URL 结构**：`/en`（英文）+ `/zh`（中文）+ `/` → 永久重定向到 `/en`。
- 用 `next.config.ts` 的 `redirects()` 处理 `/ → /en`（permanent=true），避免 `app/page.tsx` 与 `app/[lang]/layout.tsx` 同时争夺根布局。
- **`[lang]` segment** 接受 `"en" | "zh"`，由 `generateStaticParams` 固定。不匹配（如 `/de`）→ `notFound()`。
- `app/[lang]/layout.tsx` 是真正的根布局（定义 `<html lang={lang}>`、`<body>`），**不存在 `app/layout.tsx`**。
- `useLocale` 改为读 URL（`useParams`），删除 navigator 检测——避免客户端与 URL 不一致。
- **不做自动语言重定向**（会破坏 SEO canonical）。中文用户通过右上角语言切换按钮到达 `/zh`。
- 为什么选择 `/en` 而不是 `/`：双语并重时 `/en` + `/zh` 更对称，给 Google 发出"两套等权版本"的信号。

## 4. 数据模型：`lib/i18n/`

```ts
// lib/i18n/index.ts
export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export type FAQItem = { q: string; a: string };
export type FeatureItem = { title: string; body: string };

export interface Strings {
  lang: Locale;
  htmlLang: string;          // "en" | "zh-CN"
  title: string;             // <title>
  metaDescription: string;
  metaKeywords: string[];
  ogLocale: string;          // "en_US" | "zh_CN"
  heroH1: string;            // <h1>
  heroSub: string;           // 1 句副标题
  features: FeatureItem[];   // 4-6 项
  faq: FAQItem[];            // ~10 项
  footerLine: string;
  switchLang: { to: string; href: string };  // 切换按钮文案与目标 URL
}

export function getStrings(lang: Locale): Strings;
export function isLocale(x: string): x is Locale;
```

文案细节见 §6。

## 5. Metadata 与 JSON-LD

### `app/[lang]/layout.tsx`（server component）

```ts
export async function generateMetadata({ params }): Promise<Metadata> {
  const { lang } = await params;
  const s = getStrings(lang);
  const url = `${BASE_URL}/${lang}`;
  return {
    title: s.title,
    description: s.metaDescription,
    keywords: s.metaKeywords,
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: `/${lang}`,
      languages: {
        en: "/en",
        zh: "/zh",
        "x-default": "/en",
      },
    },
    openGraph: {
      title: s.title,
      description: s.metaDescription,
      url,
      siteName: "Grammar Checker",
      images: [{ url: lang === "en" ? "/og.png" : "/og.zh.png", width: 1200, height: 630, alt: s.title }],
      locale: s.ogLocale,
      type: "website",
    },
    twitter: { card: "summary_large_image", title: s.title, description: s.metaDescription, images: [lang === "en" ? "/og.png" : "/og.zh.png"] },
    robots: { index: true, follow: true },
  };
}
```

`<html lang={s.htmlLang}>` 跟随 locale。

### JSON-LD（在 `page.tsx` 内以 `<script type="application/ld+json">` 注入）

1. **`WebApplication`**
   ```json
   {
     "@context": "https://schema.org",
     "@type": "WebApplication",
     "name": "Grammar Checker",
     "url": "https://grammar-checker.app",
     "applicationCategory": "LinguisticsApplication",
     "operatingSystem": "Web",
     "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
     "featureList": ["BYOK", "No signup", "No server-side storage", "DeepSeek/Gemini/GLM/Kimi"],
     "inLanguage": ["en", "zh"]
   }
   ```
2. **`FAQPage`** — 把 `s.faq` 数组映射为 `mainEntity`。
3. **`Organization`** — 极简，name/url/logo。

JSON-LD 用一个 `lib/i18n/jsonld.ts` 的 helper 生成，避免散落。

## 6. 内容文案要点

英文版（节选）：

- **`title`**: `"Grammar Checker — Free AI Proofreader | Grammar Checker"`
- **`metaDescription`**: `"Free AI grammar checker & proofreader. Paste your text, get instant corrections with explanations. BYOK — supports DeepSeek, Gemini, GLM, Kimi. No signup."`
- **`heroH1`**: `"Free AI Grammar Checker & Proofreader"`
- **`heroSub`**: `"Paste your text, get inline suggestions with reasons. Bring your own API key — runs entirely in your browser."`
- **features（6 项）**：BYOK privacy / No signup / Multi-model / Inline diff / Local storage / Open source
- **faq（10 项，分 3 类）**：
  - 学术：How do I check grammar in my academic paper? / Is this tool suitable for proofreading essays? / Does it work for IELTS or TOEFL writing?
  - 职场：Can I use this for business emails? / How do I proofread a professional report? / Is my email content safe?
  - 工具：How is this different from Grammarly? / What does BYOK mean? / Which AI models are supported? / Is my data stored?

中文版镜像，含主关键词：`语法检查`、`英语润色`、`论文语法检查`、`邮件语法检查`、`AI 校对`。

FAQ 答案 2-3 句，含一句可被 LLM 直接引述的事实（"Grammar Checker is a free BYOK tool that supports DeepSeek, Gemini, GLM, and Kimi..."）。

## 7. 文件清单与实现要点

| 文件 | 类型 | 要点 |
|---|---|---|
| `app/page.tsx` | 删除 | 不存在；改用 `next.config.ts` redirects 处理 `/ → /en` |
| `app/[lang]/layout.tsx` | 新增 | **真正的根布局**；定义 `<html lang>`、`<body>`；`generateStaticParams`、`generateMetadata`、Clarity 脚本 |
| `app/[lang]/page.tsx` | 新增 | server component；hero、`<Polisher lang={lang} />`、FAQ、JSON-LD、footer |
| `app/[lang]/Polisher.tsx` | 新增（client） | 移入现有 `app/page.tsx` 全部交互逻辑；接 `lang` prop；语言切换按钮 |
| `app/[lang]/opengraph-image.tsx` | 新增 | 用 `next/og` `ImageResponse` 运行时生成 PNG（§10） |
| `app/robots.ts` | 新增 | `allow: "/"`，`sitemap: ...` |
| `app/sitemap.ts` | 新增 | `/en`、`/zh` 两条；含 alternates |
| `app/manifest.ts` | 新增 | PWA manifest |
| `lib/i18n/{index,en,zh}.ts` | 新增 | 字典与 helper |
| `lib/i18n/jsonld.ts` | 新增 | JSON-LD 生成器 |
| `hooks/useLocale.ts` | 改写 | URL-driven（`useParams`），返回 `[lang, setLang]` 或仅 `lang` |
| `public/llms.txt` | 新增 | GEO 入口文本 |
| `public/og.png`、`public/og.zh.png` | 新增 | 1200×630（SVG → 转码或纯 SVG 含 `.png` 扩展——见 §10） |
| `.env.example` 或 `next.config.ts` | 改 | 暴露 `NEXT_PUBLIC_CLARITY_ID` 和 `NEXT_PUBLIC_SITE_URL` |
| `AGENTS.md` | 更新 | 加入 SEO/GEO 决策摘要、Clarity ID 字段说明 |

## 8. Microsoft Clarity 集成

在 `app/[lang]/layout.tsx` 的 `<body>` 末尾注入 Clarity 脚本（仅当 `NEXT_PUBLIC_CLARITY_ID` 存在时）：

```tsx
{process.env.NEXT_PUBLIC_CLARITY_ID && (
  <script
    dangerouslySetInnerHTML={{
      __html: `(function(c,l,a,r,i,t,y){...standard snippet...})(window,document,"clarity","script","${process.env.NEXT_PUBLIC_CLARITY_ID}");`,
    }}
  />
)}
```

Clarity ID 通过环境变量传入；未配置则不渲染，本地开发零负担。

## 9. 外部工具注册步骤（无需代码）

### Google Search Console

1. 访问 https://search.google.com/search-console → Add property → URL prefix → `https://grammar-checker.app`
2. 验证方式（任选）：
   - **HTML meta tag**（推荐）：把 GSC 提供的 `<meta name="google-site-verification" content="...">` 加到 `layout.tsx` 的 `verification.google` 字段。
   - 或 DNS TXT 记录（需要域名注册商面板）。
3. 提交 sitemap：`https://grammar-checker.app/sitemap.xml`
4. 用 URL Inspection 工具请求首次索引 `/` 和 `/zh`。

### Bing Webmaster Tools

1. 访问 https://www.bing.com/webmasters → Add site → `https://grammar-checker.app`
2. 验证方式：HTML meta tag（同上，加到 `verification.other` 或在 layout 里写 `<meta name="msvalidate.01" content="...">`）。或直接导入 GSC。
3. 提交 sitemap：同上 URL。
4. **对 GEO 重要**：Bing 给 ChatGPT Search、Copilot 提供网页索引，所以这一步别跳过。

### Microsoft Clarity

1. 访问 https://clarity.microsoft.com → New project → 站点 URL `https://grammar-checker.app`
2. 拿到 Project ID（形如 `abcdefghij`）
3. 在 Vercel 项目 Settings → Environment Variables 加：`NEXT_PUBLIC_CLARITY_ID=<id>`
4. 重新部署。

## 10. OG 图实现

SVG 直接保存为 `.svg` 在某些社交平台（Twitter/X、LinkedIn）兼容性差，最佳实践是真 PNG。两条路：

- **路 A**（推荐，零依赖）：写一份 SVG，用 Next.js 的 `next/og` `ImageResponse` 在 `app/[lang]/opengraph-image.tsx` 路由内**运行时生成 PNG**（Satori）。Vercel 边缘缓存。
- **路 B**（更简单）：手写 SVG → 用浏览器/Inkscape 一次性导出 PNG → 放 `public/og.png`。开发期不可见，需离线处理。

**选 A**：用 `app/[lang]/opengraph-image.tsx`（Next 内置 OG image route，自动生成并绑定到 metadata）。

## 11. 不做的事（YAGNI）

- 不做 `/blog`、`/about`、`/how-it-works`、`/use-cases/*` 等独立内容页（留给方案 B/C）。
- 不引入 next-intl / react-i18next / FormatJS 等 i18n 库（字典对象足够）。
- 不做 sitemap index（只有两条 URL）。
- 不重写 Editor 组件的交互逻辑。
- 不装 Google Analytics 4。
- 不做反向链接外展、内容营销（运营范畴）。

## 12. 验收

- `npm run lint`、`npm run typecheck`、`npm run build` 三件套通过。
- `curl https://grammar-checker.app/` → 301 到 `/en`。
- `curl https://grammar-checker.app/en` 的 HTML 包含 `<h1>`、JSON-LD `WebApplication`、JSON-LD `FAQPage`、`<link rel="alternate" hreflang="zh" href="/zh">`。
- `curl https://grammar-checker.app/sitemap.xml` 列出 `/en`、`/zh` 两条含 alternates。
- `curl https://grammar-checker.app/robots.txt` 允许全站并指向 sitemap。
- `curl https://grammar-checker.app/llms.txt` 返回 GEO 文本。
- `curl https://grammar-checker.app/en/opengraph-image` 返回 PNG。
- 手动在 GSC 验证域名并提交 sitemap。

## 13. 风险

- **`"use client"` 整页拆分**：现有 `app/page.tsx` 是一个 410 行的客户端组件，移动到 `Polisher.tsx` 时需保持所有 hooks/状态逻辑不动。如果出错，任务队列与流式推理会崩。**缓解**：纯文本移动 + 一次性 build 验证 + 保留原文件结构。
- **OG 图运行时生成**：Satori 不支持所有 CSS；用 flexbox + 简单文本即可，避免复杂图形。
- **环境变量未配置**：本地 dev 时不渲染 Clarity 脚本——已用 `process.env.NEXT_PUBLIC_CLARITY_ID &&` 短路。
- **EBUSY**：`npm run build` 可能被 Dropbox 锁 `.next/`，按 AGENTS.md 指引处理。
