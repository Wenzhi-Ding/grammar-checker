// lib/i18n/en.ts
import type { Strings } from "./index";

export const en: Strings = {
  lang: "en",
  htmlLang: "en",
  ogLocale: "en_US",
  title: "Grammar Checker — Free AI Proofreader & Polisher",
  metaDescription:
    "Free AI grammar checker & proofreader. Paste your text, get inline corrections with explanations. BYOK — supports DeepSeek, Gemini, GLM, and Kimi. No signup, no server-side storage.",
  metaKeywords: [
    "grammar checker",
    "grammar check",
    "proofreader",
    "AI proofreader",
    "grammar corrector",
    "spell checker",
    "punctuation checker",
    "text polisher",
    "BYOK grammar checker",
    "academic writing checker",
    "business email grammar",
    "IELTS writing checker",
  ],
  heroH1: "Free AI Grammar Checker & Proofreader",
  heroSub:
    "Paste your text and get inline, per-span corrections with one-line reasons. Bring your own API key — your text and key never leave your browser. At ~$0.0006 per polish, a year of heavy use costs under $2 — versus Grammarly's $144.",
  features: [
    {
      title: "Bring your own key (BYOK)",
      body:
        "Paste your own API key for DeepSeek, Gemini, GLM, or Kimi. No accounts, no subscription. At DeepSeek V4 Flash rates, one polish costs about $0.0006 — the $144 you'd spend on a year of Grammarly buys 200,000+ polishes.",
    },
    {
      title: "Runs entirely in your browser",
      body:
        "Your text and API key stay on your device. We have no backend database and do not log your input.",
    },
    {
      title: "Inline Grammarly-style suggestions",
      body:
        "Each correction is pinned to the exact span in your text. Accept, reject, or accept-all directly in the editor.",
    },
    {
      title: "Multi-model, multi-provider",
      body:
        "Switch between DeepSeek, Gemini, GLM, Kimi, or any OpenAI-compatible endpoint. Add custom providers in one click.",
    },
    {
      title: "Local task history",
      body:
        "Your last 50 polish tasks persist in localStorage. Re-open any task to restore the original text and all suggestions.",
    },
    {
      title: "100% open source",
      body:
        "Self-host or audit the code on GitHub. No tracking pixels, no analytics sold to third parties.",
    },
  ],
  faq: [
    // Academic
    {
      q: "How do I check grammar in my academic paper?",
      a: "Paste your abstract, introduction, or any paragraph into the editor and click Polish. Grammar Checker returns inline corrections for grammar, spelling, punctuation, and style, each with a short explanation. It is suitable for proofreading essays, research papers, and dissertation drafts before submission.",
    },
    {
      q: "Is this tool suitable for proofreading college admissions essays?",
      a: "Yes. Grammar Checker handles personal statements, statements of purpose, and scholarship essays the same way as any other text. Because it runs in your browser with your own API key, we have no persistent backend — your essay text is never stored, logged, or cached.",
    },
    {
      q: "Does it work for IELTS or TOEFL writing?",
      a: "Yes. IELTS Task 1, Task 2, and TOEFL Independent Writing responses can be pasted directly. Corrections are tagged by type — grammar, word-choice, clarity — so you can see which errors most affect your band score.",
    },
    // Business
    {
      q: "Can I use this for business emails?",
      a: "Yes. Grammar Checker is well suited for proofreading professional emails, reports, and Slack messages. The 'style' and 'clarity' correction categories catch tone and conciseness issues that pure grammar checkers miss.",
    },
    {
      q: "How do I proofread a professional report?",
      a: "Paste one section at a time (5,000–10,000 characters works best) and click Polish. Review the inline suggestions, accept the ones you agree with, and copy the cleaned text back to your document.",
    },
    {
      q: "Is my email content safe?",
      a: "Your text is processed in the browser and sent to the LLM provider you configured (DeepSeek, Gemini, GLM, or Kimi). We run no persistent backend — nothing you type is stored, logged, or cached.",
    },
    // Tool & BYOK
    {
      q: "How is this different from Grammarly?",
      a: "Grammarly requires an account and routes your text through its servers. Grammar Checker is a free, open-source BYOK tool: you bring your own LLM API key, the editor runs in your browser, and there is no signup. It supports DeepSeek, Gemini, GLM, and Kimi, letting you pick the model that best fits your writing.",
    },
    {
      q: "What does BYOK mean?",
      a: "BYOK stands for 'Bring Your Own Key'. Instead of paying a subscription, you paste an API key from a provider like DeepSeek or Gemini. You pay the provider directly for tokens — typically much cheaper than a grammar-tool subscription.",
    },
    {
      q: "How much does a single polish cost with DeepSeek?",
      a: "Using DeepSeek V4 Flash official pricing ($0.14 per million input tokens, $0.28 per million output tokens): polishing a ~400-word English passage consumes about 1,800 input tokens (including the system prompt) and 1,200 output tokens (the corrections JSON), for a per-polish cost of roughly $0.0006 — it would take about 1,600 polishes to spend one US dollar. Short emails cost less, and even 500+ word passages rarely exceed $0.001. Other models (Gemini, GLM, Kimi) are slightly pricier but in the same order of magnitude.",
    },
    {
      q: "How much cheaper is BYOK than a Grammarly subscription?",
      a: "Grammarly Pro costs $144/year ($12/month). The same $144 buys 200,000+ polishes on DeepSeek V4 Flash. A heavy user (English emails plus assignments every day, around 1,500–3,000 polishes/year) typically spends under $2/year on LLM tokens — less than 2% of Grammarly's annual price. Even a power user polishing 50 times a day would spend only ~$11/year.",
    },
    {
      q: "Which AI models are supported?",
      a: "Out of the box: DeepSeek, Kimi (Moonshot), GLM (Zhipu), and Google Gemini. You can also add any OpenAI-compatible endpoint as a custom provider, or any Gemini-compatible endpoint, in the settings panel.",
    },
    {
      q: "Is my data stored?",
      a: "No server-side storage. Your API key, text, and last 50 task snapshots live in your browser's localStorage. Clearing your browser data erases everything.",
    },
  ],
  footerLine:
    "100% open source · runs entirely in your browser · your API key and text never leave your device.",
  switchLang: { label: "中文", href: "/zh" },
};
