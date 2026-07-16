# Eval Harness + Custom Instructions — Design

Date: 2026-07-16
Status: approved

## Goal

Two features serving prompt-iteration workflow:

1. **Eval harness**: a CLI script that runs a fixed set of grammar test cases through the app's *real* prompt-assembly code using `deepseek-v4-flash`, then has `deepseek-v4-pro` judge each result against a reference answer, producing a 0–7 score and critique. After each prompt edit, one command gives a regression score.
2. **Custom instructions**: a user-editable "additional instructions" field in Settings, appended to the system prompt. Hard rules (SCHEMA / VERBATIM / FORMATTING / COVERAGE) always remain and cannot be overridden.

## Non-goals

- No in-app eval UI (CLI only).
- No strict span-level precision/recall scoring (judge-based scoring chosen instead).
- No full-prompt editing (only an appended custom-instructions field).
- Eval harness tests the openai-compatible adapter path only (DeepSeek); Gemini judging is out of scope.

## 1. Test cases — `eval/cases/`

Two files: `eval/cases/en.json`, `eval/cases/zh.json`. 20–30 cases total across both.

```json
{
  "id": "en-001",
  "language": "en",
  "input": "Me and him goes to school by bus everyday.",
  "reference": [
    "Me and him → subject-case error (He and I / correct order)",
    "goes → go",
    "everyday → every day"
  ],
  "notes": "optional free-text"
}
```

- `reference` is an array of **natural-language points**, not strict `Correction` objects — cheap to author by hand; the judge compares semantically.
- `notes` optional; may hold extra context for the judge (e.g. "author's informal tone is intentional").
- Coverage targets:
  - **English**: confused words (there/their, its/it's…), subject–verb agreement, articles, spelling typos, punctuation (comma splice, introductory comma, apostrophes), redundancy/wordiness, capitalization, mid-sentence line breaks (formatting, with literal `\n` in input).
  - **Chinese**: 错别字, 标点（全半角、顿号/逗号）, 语法, 格式（换行/空格）.
- Include 1–2 "clean text" cases (no errors) per language to catch over-correction; their `reference` is an empty array.

## 2. Runner — `eval/run.ts`

Run via `npm run eval` (tsx). Key properties:

- **Imports the app's real prompt code** (`assembleSystem` from `lib/providers/shared/prompt.ts`, en/zh framings) and the real `createOpenAICompatibleProvider` adapter. Editing any `lib/providers/**/prompt/*` file immediately changes what is evaluated — this is the core requirement.
- For each case: build the same messages the app builds (system = `assembleSystem(framing, reasonLanguage, customInstructions?)`, user = `assembleUser(input)`) → call `deepseek-v4-flash` via the adapter → pass result to the judge.
- API key: reads `DEEPSEEK_API_KEY` from `.env.local` (script parses the file itself — no dotenv dependency). Missing key → clear error message.
- CLI flags:
  - `--lang en|zh` — run one language only (default: both)
  - `--case <id>` — run a single case (repeatable)
  - `--test-model <m>` — default `deepseek-v4-flash`
  - `--judge-model <m>` — default `deepseek-v4-pro`
  - `--instructions "<text>"` — appended as custom instructions, so prompt-instruction variants can be tested without touching app code
- Concurrency: 3 cases in flight at a time (simple pool, no dependency).
- Output:
  - Console summary table: case id, score, #corrections, one-line weakness summary; plus mean score at the end.
  - Markdown report: `eval/reports/<timestamp>.md` — per case: input, model corrections (JSON), judge score + strengths/weaknesses/missed. Also appends a one-line JSON summary per run to `eval/reports/history.jsonl` so scores can be compared across prompt iterations.
  - `eval/reports/` added to `.gitignore`. `eval/cases/` committed.
- Exit code 0 regardless of scores (it is a report tool, not a gate).

## 3. Judge — `eval/judge.ts`

DeepSeek `deepseek-v4-pro` via a small dedicated chat-completions helper inside `eval/judge.ts` (the app adapter can't be reused here — its `polish()` hardcodes the correction prompt). `response_format: { type: "json_object" }`, temperature 0, same base URL `https://api.deepseek.com/v1` and same `DEEPSEEK_API_KEY`.

Judge prompt (English, static, lives in `eval/judge.ts`) receives: original text, reference points, the tested model's corrections JSON. Rubric embedded in the prompt:

- Baseline 5 = matches reference quality.
- Deduct: missed a real error listed in `reference`; a correction is wrong or introduces a new error; `original` is not verbatim (would fail frontend matching); over-editing that changes meaning/voice.
- Add (up to 7): caught real errors beyond the reference; suggestions clearly better than reference.
- Floor 0, ceiling 7. For clean-text cases (empty reference): 5 = correctly returned nothing (or only truly optional info-level polish); any harmful change deducts.

Judge outputs ONLY JSON:

```json
{ "score": 5, "strengths": ["…"], "weaknesses": ["…"], "missed": ["…"] }
```

Parse defensively: on unparseable judge output, record `score: null` and the raw text in the report, continue with other cases.

## 4. Custom instructions in Settings

- `Settings` (hooks/useSettings.ts): add `customInstructions: string`, default `""`. Additive field — the `{...DEFAULTS, ...parsed}` spread already handles old stored objects; no storage-key bump.
- `SettingsPanel.tsx`: a textarea labeled "Custom instructions (appended to the prompt)" below Reason language, bound to `settings.customInstructions`.
- `ProviderConfig` (shared/schema.ts): add `customInstructions?: string`.
- `assembleSystem(framing, reasonLanguage?, customInstructions?)`: when non-empty after trim, append as the final section: `ADDITIONAL INSTRUCTIONS FROM THE USER:\n<text>`.
- Both adapters pass `config.customInstructions` through to `assembleSystem`.
- `app/page.tsx`: include `customInstructions: settings.customInstructions` when building the `ProviderConfig`.
- AGENTS.md constraint preserved: SCHEMA_DESCRIPTION and VERBATIM_RULE are always included and always come from `lib/providers/shared/prompt.ts`; custom instructions can only add, never replace.

## Files touched / created

| File | Change |
|---|---|
| `eval/cases/en.json`, `eval/cases/zh.json` | new, 20–30 cases |
| `eval/judge.ts` | new, judge prompt + call + parse |
| `eval/run.ts` | new, CLI runner |
| `package.json` | add `"eval": "tsx eval/run.ts"` script + `tsx` devDependency |
| `.gitignore` | add `eval/reports/` |
| `lib/providers/shared/prompt.ts` | `assembleSystem` gains optional 3rd param |
| `lib/providers/shared/schema.ts` | `ProviderConfig.customInstructions?` |
| `lib/providers/openai-compatible/adapter.ts`, `lib/providers/gemini/adapter.ts` | pass through to `assembleSystem` |
| `hooks/useSettings.ts` | `Settings.customInstructions` + default |
| `components/SettingsPanel.tsx` | textarea |
| `app/page.tsx` | pass `customInstructions` into ProviderConfig |

## Error handling

- Missing `DEEPSEEK_API_KEY` → exit with a clear message before any calls.
- Tested-model call fails (HTTP error, timeout, unparseable JSON) → record score `null`, error text in report, continue.
- Judge fails / unparseable → score `null`, raw output in report, continue.
- Report writing failure → warn on console, still print the summary table.

## Testing

- Existing vitest suite must stay green (`npm test`).
- Add unit tests for `assembleSystem` with customInstructions (appended last; omitted when empty/whitespace).
- Manual verification: `npm run eval -- --case en-001` end-to-end against the real API.
- Pre-commit order: `npm run lint` → `npm run typecheck` → `npm run build`.
