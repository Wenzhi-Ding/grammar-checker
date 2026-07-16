# Grammar Checker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vercel-deployed, BYOK Grammarly-style grammar polisher where users paste text, click Polish, and see inline per-span suggestions they can accept/reject.

**Architecture:** Next.js (App Router) + TypeScript. A `Provider` interface (2 adapters: `openai-compatible`, `gemini`) returns structured `Correction[]`. A pure `pinSpans()` matcher (exact `indexOf` → diff-match-patch fuzzy → drop) pins each correction to a span. The frontend renders a textarea + overlay, applies accepts via O(n) offset-delta adjustment (no re-matching). Direct browser calls auto-fallback to a stateless route handler on CORS failure.

**Tech Stack:** Next.js 15 (App Router), TypeScript (strict), Vitest, React Testing Library, zod, diff-match-patch.

**Spec:** [`docs/superpowers/specs/2026-07-15-grammar-polisher-design.md`](../specs/2026-07-15-grammar-polisher-design.md) — read before starting.

**Note on git:** Task 1 runs `create-next-app`, which initializes git. Commit steps assume git exists from Task 1 onward. The pre-existing `AGENTS.md` and `docs/` get committed in Task 1.

---

## File Structure

```
lib/providers/
  shared/schema.ts        Types: Correction, PolishResult, PinnedCorrection, ProviderConfig, Provider
  shared/match.ts         pinSpans() three-tier matcher + overlap removal   ← highest test priority
  shared/offsets.ts       applyAccept() offset-delta adjustment
  shared/lang.ts          detect(text): "en" | "zh"
  shared/prompt.ts        shared structured-output instruction + verbatim rule
  shared/parse.ts         parseAndValidate(): JSON.parse + zod + one repair retry
  shared/http.ts          callWithFallback(): direct → auto proxy on TypeError
  shared/presets.ts       provider registry (DeepSeek/Kimi/GLM/Gemini/Custom)
  shared/index.ts         getProvider(config): Provider factory
  openai-compatible/adapter.ts   openai-compatible Provider impl
  openai-compatible/prompt/en.ts English prompt framing
  openai-compatible/prompt/zh.ts Chinese prompt framing
  gemini/adapter.ts              gemini Provider impl
  gemini/prompt/en.ts            English prompt framing
  gemini/prompt/zh.ts            Chinese prompt framing
app/
  page.tsx                Editor + overlay + highlights + suggestion cards
  layout.tsx              Root layout (create-next-app default, minor edits)
  api/polish/route.ts     Stateless CORS-fallback proxy
components/
  Editor.tsx              textarea + overlay sync
  HighlightOverlay.tsx    renders <mark> highlights
  SuggestionCard.tsx      accept/reject popover
  SettingsPanel.tsx       provider/key/model/baseURL/lang config
  ProviderSelect.tsx      provider dropdown
hooks/
  usePolish.ts            orchestrate polish flow + error state
  useSettings.ts          localStorage settings
tests/
  providers/shared/match.test.ts
  providers/shared/offsets.test.ts
  providers/shared/lang.test.ts
  providers/shared/parse.test.ts
  providers/shared/prompt.test.ts
  providers/shared/http.test.ts
  providers/shared/presets.test.ts
  providers/openai-compatible/adapter.test.ts
  providers/gemini/adapter.test.ts
```

---

## Task 1: Scaffold Next.js project + tooling

**Files:**
- Create: project scaffold via `create-next-app`
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Preserve: `AGENTS.md`, `docs/` (pre-existing)

- [ ] **Step 1: Scaffold Next.js in the current directory**

Run from `C:\Users\wenzh\Dropbox\Code\grammar`:

```bash
npx create-next-app@latest . --typescript --app --eslint --tailwind --src-dir=false --import-alias "@/*" --use-npm
```

If it warns about non-empty directory, choose to proceed — `AGENTS.md` and `docs/` do not conflict with Next.js files. If it refuses, temporarily move `AGENTS.md` and `docs/` aside, scaffold, then move them back.

- [ ] **Step 2: Verify pre-existing files survived**

Run: `Test-Path AGENTS.md, docs/superpowers/specs/2026-07-15-grammar-polisher-design.md`
Expected: both `True`.

- [ ] **Step 3: Install runtime dependencies**

```bash
npm install zod diff-match-patch
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @types/diff-match-patch
```

- [ ] **Step 4: Add `typecheck` script and test scripts**

Edit `package.json` `scripts`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 6: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 7: Verify toolchain**

```bash
npm run typecheck
npm run test
```

Expected: typecheck passes (no output); test run reports "No test files found" (0 tests, not an error).

- [ ] **Step 8: Add `.gitignore` entries for local-only state**

Append to `.gitignore`:

```
# local-only
.env*.local
.superpowers/
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + vitest tooling"
```

---

## Task 2: Shared schema (central contract)

**Files:**
- Create: `lib/providers/shared/schema.ts`

- [ ] **Step 1: Write the schema module**

```ts
// lib/providers/shared/schema.ts

export type CorrectionType =
  | "grammar"
  | "spelling"
  | "punctuation"
  | "style"
  | "clarity"
  | "word-choice";

export type Severity = "info" | "minor" | "major";

/** A correction as returned by the LLM. `original` MUST be a verbatim substring. */
export interface Correction {
  original: string;
  suggestion: string;
  type: CorrectionType;
  reason: string;
  severity?: Severity;
}

export interface PolishResult {
  corrections: Correction[];
}

/** A correction with its matched span. start/end are -1 when unmatched. */
export interface PinnedCorrection extends Correction {
  id: string;
  start: number;
  end: number;
  matchTier: 1 | 2 | 3;
  state: "pending" | "accepted" | "rejected" | "superseded";
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  language?: "en" | "zh" | "auto";
}

export interface Provider {
  readonly id: string;
  polish(text: string, config: ProviderConfig): Promise<PolishResult>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/providers/shared/schema.ts
git commit -m "feat: add central Correction/Provider schema"
```

---

## Task 3: Matching engine — Tier 1 exact `indexOf`

**Files:**
- Create: `lib/providers/shared/match.ts`
- Test: `tests/providers/shared/match.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/providers/shared/match.test.ts
import { describe, it, expect } from "vitest";
import { pinSpans } from "@/lib/providers/shared/match";
import type { Correction } from "@/lib/providers/shared/schema";

const c = (original: string, suggestion = "X", severity: Correction["severity"] = "minor"): Correction => ({
  original,
  suggestion,
  type: "grammar",
  reason: "r",
  severity,
});

describe("pinSpans Tier 1 (exact indexOf)", () => {
  it("pins an exact substring", () => {
    const text = "the quick brown fox";
    const out = pinSpans(text, [c("quick")]);
    expect(out[0].start).toBe(4);
    expect(out[0].end).toBe(9);
    expect(out[0].matchTier).toBe(1);
    expect(out[0].state).toBe("pending");
  });

  it("disambiguates repeated phrases by document order (sequential cursor)", () => {
    const text = "the cat and the cat";
    const out = pinSpans(text, [c("cat"), c("cat")]);
    expect(out[0].start).toBe(4);
    expect(out[1].start).toBe(16);
  });

  it("leaves unmatched as -1 with tier 3", () => {
    const text = "hello world";
    const out = pinSpans(text, [c("missing")]);
    expect(out[0].start).toBe(-1);
    expect(out[0].end).toBe(-1);
    expect(out[0].matchTier).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- match`
Expected: FAIL — `pinSpans` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/providers/shared/match.ts
import { diff_match_patch } from "diff-match-patch";
import type { Correction, PinnedCorrection } from "./schema";

const dmp = new diff_match_patch();

export const MATCH_THRESHOLD = 0.5;
export const MATCH_DISTANCE = 1000;

let idCounter = 0;
const nextId = () => `c${++idCounter}`;

function pinOne(text: string, original: string, cursor: number): { start: number; end: number; tier: 1 | 2 | 3 } {
  // Tier 1: exact indexOf from cursor
  const exact = text.indexOf(original, cursor);
  if (exact >= 0) {
    return { start: exact, end: exact + original.length, tier: 1 };
  }
  // Tier 2/3 stubbed for later tasks; for now return unmatched.
  return { start: -1, end: -1, tier: 3 };
}

export function pinSpans(text: string, corrections: Correction[]): PinnedCorrection[] {
  let cursor = 0;
  return corrections.map((correction) => {
    const { start, end, tier } = pinOne(text, correction.original, cursor);
    if (tier === 1) cursor = end;
    return { ...correction, id: nextId(), start, end, matchTier: tier, state: "pending" as const };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- match`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/match.ts tests/providers/shared/match.test.ts
git commit -m "feat(match): Tier 1 exact indexOf with sequential cursor"
```

---

## Task 4: Matching engine — Tier 2 diff-match-patch fuzzy fallback

**Files:**
- Modify: `lib/providers/shared/match.ts`
- Test: `tests/providers/shared/match.test.ts` (append)

- [ ] **Step 1: Append failing tests for Tier 2**

Append to `tests/providers/shared/match.test.ts`:

```ts
describe("pinSpans Tier 2 (dmp fuzzy fallback)", () => {
  it("recovers when LLM collapsed whitespace", () => {
    // input has double space; LLM "normalized" original to single space
    const text = "the  quick brown fox";
    const out = pinSpans(text, [c("the quick")]);
    expect(out[0].matchTier).toBe(2);
    expect(out[0].start).toBe(0);
    expect(out[0].end).toBeGreaterThanOrEqual(9);
  });

  it("recovers when LLM swapped smart quotes for straight", () => {
    const text = "she said \u201Chello\u201D there";
    const out = pinSpans(text, [c('she said "hello"')]);
    expect(out[0].matchTier).toBe(2);
    expect(out[0].start).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- match`
Expected: FAIL — the two Tier 2 tests fail (currently tier 3, start -1).

- [ ] **Step 3: Implement Tier 2 in `pinOne`**

Replace the `pinOne` function body in `lib/providers/shared/match.ts`:

```ts
function pinOne(text: string, original: string, cursor: number): { start: number; end: number; tier: 1 | 2 | 3 } {
  // Tier 1: exact indexOf from cursor
  const exact = text.indexOf(original, cursor);
  if (exact >= 0) {
    return { start: exact, end: exact + original.length, tier: 1 };
  }

  // Tier 2: diff-match-patch fuzzy locator
  const idx = dmp.match_main(text, original, cursor);
  if (idx >= 0) {
    // Infer the matched length by diffing a window around idx vs original.
    const windowLen = Math.ceil(original.length * 1.3) + 4;
    const window = text.slice(idx, idx + windowLen);
    const diffs = dmp.diff_main(original, window);
    dmp.diff_cleanupSemantic(diffs);
    // matched length = sum of (text-side) lengths while diffs stay "close"
    let consumed = 0;
    for (const [op, str] of diffs) {
      if (op === 0) consumed += str.length;
      else if (op === 1) consumed += str.length; // insertion in window counts as matched region
      else if (op === -1) {
        // deletion from original: stop adjusting; original had extra chars not in window
        break;
      }
      if (consumed >= original.length) break;
    }
    const end = idx + Math.max(consumed, original.length);
    return { start: idx, end, tier: 2 };
  }

  return { start: -1, end: -1, tier: 3 };
}
```

Also set the dmp thresholds once after constructing `dmp` (top of file):

```ts
const dmp = new diff_match_patch();
dmp.Match_Threshold = MATCH_THRESHOLD;
dmp.Match_Distance = MATCH_DISTANCE;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- match`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/match.ts tests/providers/shared/match.test.ts
git commit -m "feat(match): Tier 2 diff-match-patch fuzzy fallback"
```

---

## Task 5: Matching engine — false-positive guardrail

**Files:**
- Modify: `lib/providers/shared/match.ts`
- Test: `tests/providers/shared/match.test.ts` (append)

The guardrail: if a Tier 2 match's similarity to `original` is too low, downgrade to Tier 3 (drop) — pinning to the wrong place is worse than dropping.

- [ ] **Step 1: Append failing test**

Append to `tests/providers/shared/match.test.ts`:

```ts
describe("pinSpans Tier 2 guardrail", () => {
  it("downgrades a low-similarity fuzzy match to tier 3", () => {
    // "completely unrelated phrase" won't fuzzy-match anything real with high similarity
    const text = "the quick brown fox jumps over the lazy dog";
    const out = pinSpans(text, [c("zzzzz qqqq unrelated gibberish phrase here")]);
    expect(out[0].matchTier).toBe(3);
    expect(out[0].start).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- match`
Expected: FAIL — currently Tier 2 accepts a bad match.

- [ ] **Step 3: Add similarity check**

In `lib/providers/shared/match.ts`, add a helper and call it in the Tier 2 branch before returning:

```ts
function similarity(a: string, b: string): number {
  const diffs = dmp.diff_main(a, b);
  dmp.diff_cleanupSemantic(diffs);
  const equal = diffs.filter(([op]) => op === 0).reduce((n, [, s]) => n + s.length, 0);
  const maxLen = Math.max(a.length, b.length, 1);
  return equal / maxLen;
}
```

In `pinOne`, change the Tier 2 block to validate before accepting:

```ts
  // Tier 2: diff-match-patch fuzzy locator
  const idx = dmp.match_main(text, original, cursor);
  if (idx >= 0) {
    const windowLen = Math.ceil(original.length * 1.3) + 4;
    const window = text.slice(idx, idx + windowLen);
    // Guardrail: require high similarity, else drop (wrong pin is worse than no pin).
    if (similarity(original, window.slice(0, original.length + 2)) < MATCH_THRESHOLD) {
      return { start: -1, end: -1, tier: 3 };
    }
    const diffs = dmp.diff_main(original, window);
    dmp.diff_cleanupSemantic(diffs);
    let consumed = 0;
    for (const [op, str] of diffs) {
      if (op === 0) consumed += str.length;
      else if (op === 1) consumed += str.length;
      else if (op === -1) break;
      if (consumed >= original.length) break;
    }
    const end = idx + Math.max(consumed, original.length);
    return { start: idx, end, tier: 2 };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- match`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/match.ts tests/providers/shared/match.test.ts
git commit -m "feat(match): false-positive guardrail on Tier 2"
```

---

## Task 6: Matching engine — overlap removal

**Files:**
- Modify: `lib/providers/shared/match.ts`
- Test: `tests/providers/shared/match.test.ts` (append)

- [ ] **Step 1: Append failing test**

Append to `tests/providers/shared/match.test.ts`:

```ts
describe("pinSpans overlap removal", () => {
  it("drops the lower-priority of two overlapping spans (keeps higher severity)", () => {
    const text = "the quick brown fox";
    // both target overlapping region; "quick brown" major wins over "quick" minor
    const out = pinSpans(text, [c("quick", "X", "minor"), c("quick brown", "Y", "major")]);
    const kept = out.filter((p) => p.state !== "superseded");
    const sup = out.filter((p) => p.state === "superseded");
    expect(kept).toHaveLength(1);
    expect(kept[0].original).toBe("quick brown");
    expect(sup).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- match`
Expected: FAIL — no overlap logic yet.

- [ ] **Step 3: Add overlap removal after pinning**

In `pinSpans`, after building the array, add overlap removal. Replace the function body:

```ts
const SEVERITY_WEIGHT: Record<NonNullable<Correction["severity"]>, number> = { major: 3, minor: 2, info: 1 };

function removeOverlaps(pinned: PinnedCorrection[]): PinnedCorrection[] {
  const valid = pinned.filter((p) => p.start >= 0);
  // higher priority first: severity desc, then longer, then earlier start
  valid.sort((a, b) => {
    const sa = SEVERITY_WEIGHT[a.severity ?? "minor"];
    const sb = SEVERITY_WEIGHT[b.severity ?? "minor"];
    if (sb !== sa) return sb - sa;
    const lenB = b.end - b.start;
    const lenA = a.end - a.start;
    if (lenB !== lenA) return lenB - lenA;
    return a.start - b.start;
  });
  const claimed: Array<[number, number]> = [];
  for (const p of valid) {
    const overlaps = claimed.some(([s, e]) => p.start < e && p.end > s);
    if (overlaps) p.state = "superseded";
    else claimed.push([p.start, p.end]);
  }
  return pinned;
}

export function pinSpans(text: string, corrections: Correction[]): PinnedCorrection[] {
  let cursor = 0;
  const pinned = corrections.map((correction) => {
    const { start, end, tier } = pinOne(text, correction.original, cursor);
    if (tier === 1) cursor = end;
    return { ...correction, id: nextId(), start, end, matchTier: tier, state: "pending" as const };
  });
  return removeOverlaps(pinned);
}
```

- [ ] **Step 4: Run all match tests**

Run: `npm test -- match`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/match.ts tests/providers/shared/match.test.ts
git commit -m "feat(match): overlap removal, keep highest priority"
```

---

## Task 7: Offset-delta adjustment (`applyAccept`)

**Files:**
- Create: `lib/providers/shared/offsets.ts`
- Test: `tests/providers/shared/offsets.test.ts`

This is the pure logic from spec §8.3. Depends on §6's non-overlap guarantee.

- [ ] **Step 1: Write the failing test**

```ts
// tests/providers/shared/offsets.test.ts
import { describe, it, expect } from "vitest";
import { applyAccept } from "@/lib/providers/shared/offsets";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";

const mk = (id: string, start: number, end: number, state: PinnedCorrection["state"] = "pending"): PinnedCorrection => ({
  id, start, end, state,
  original: "o", suggestion: "s", type: "grammar", reason: "r", severity: "minor", matchTier: 1 as const,
});

describe("applyAccept", () => {
  it("applies the edit and shifts later offsets by delta", () => {
    const text = "ABCDE";
    const suggestions = [mk("1", 1, 2), mk("2", 3, 4)];
    const { text: newText, suggestions: newSugs } = applyAccept(text, suggestions, "1");
    expect(newText).toBe("AsCDE");            // replaced B (pos 1) with "s"
    expect(newSugs[1].start).toBe(3);          // unchanged (was after, delta=0: "s".length(1) - 1 = 0)
    expect(newSugs[0].state).toBe("accepted");
  });

  it("shifts later offsets when suggestion length differs", () => {
    const text = "ABCDE";
    const suggestions = [mk("1", 0, 1), mk("2", 3, 4)]; // replace A with "XYZ" (len 3): delta = +2
    const { text: newText, suggestions: newSugs } = applyAccept(text, suggestions, "1", "XYZ");
    expect(newText).toBe("XYZBCDE");
    expect(newSugs[1].start).toBe(5);          // was 3, +2
    expect(newSugs[1].end).toBe(6);
  });

  it("does not shift earlier offsets", () => {
    const text = "ABCDE";
    const suggestions = [mk("1", 0, 1), mk("2", 3, 4)];
    const { suggestions: newSugs } = applyAccept(text, suggestions, "2");
    expect(newSugs[0].start).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- offsets`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/providers/shared/offsets.ts
import type { PinnedCorrection } from "./schema";

export function applyAccept(
  text: string,
  suggestions: PinnedCorrection[],
  id: string,
  replacementOverride?: string,
): { text: string; suggestions: PinnedCorrection[] } {
  const target = suggestions.find((s) => s.id === id);
  if (!target) return { text, suggestions };

  const replacement = replacementOverride ?? target.suggestion;
  const delta = replacement.length - (target.end - target.start);
  const newText = text.slice(0, target.start) + replacement + text.slice(target.end);

  const newSugs = suggestions.map((s) => {
    if (s.id === id) return { ...s, state: "accepted" as const };
    if (s.start >= target.end) return { ...s, start: s.start + delta, end: s.end + delta };
    return s;
  });

  return { text: newText, suggestions: newSugs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- offsets`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/offsets.ts tests/providers/shared/offsets.test.ts
git commit -m "feat(offsets): applyAccept O(n) offset-delta adjustment"
```

---

## Task 8: Language detection

**Files:**
- Create: `lib/providers/shared/lang.ts`
- Test: `tests/providers/shared/lang.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/providers/shared/lang.test.ts
import { describe, it, expect } from "vitest";
import { detect } from "@/lib/providers/shared/lang";

describe("detect", () => {
  it("returns zh for predominantly CJK text", () => {
    expect(detect("今天天气很好，我们一起去公园散步。")).toBe("zh");
  });
  it("returns en for ASCII text", () => {
    expect(detect("The quick brown fox jumps.")).toBe("en");
  });
  it("returns zh when CJK ratio exceeds threshold even with mixed text", () => {
    expect(detect("我今天 ate an apple")).toBe("zh");
  });
  it("returns en for short or empty input", () => {
    expect(detect("")).toBe("en");
    expect(detect("hi")).toBe("en");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lang`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/providers/shared/lang.ts

const CJK = /[\u3400-\u9FFF\uF900-\uFAFF]/g;

export function detect(text: string): "en" | "zh" {
  if (!text) return "en";
  const cjk = (text.match(CJK) ?? []).length;
  const ratio = cjk / text.length;
  // even modest CJK density means Chinese (english with a few CJK chars is rare)
  return ratio > 0.15 ? "zh" : "en";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lang`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/lang.ts tests/providers/shared/lang.test.ts
git commit -m "feat(lang): CJK-ratio language detection"
```

---

## Task 9: Shared prompt assembly + zod schema

**Files:**
- Create: `lib/providers/shared/prompt.ts`
- Create: `lib/providers/shared/parse.ts`
- Test: `tests/providers/shared/parse.test.ts`

- [ ] **Step 1: Write `parse.ts` with zod**

```ts
// lib/providers/shared/parse.ts
import { z } from "zod";
import type { PolishResult } from "./schema";

const CorrectionSchema = z.object({
  original: z.string().min(1),
  suggestion: z.string(),
  type: z.enum(["grammar", "spelling", "punctuation", "style", "clarity", "word-choice"]),
  reason: z.string(),
  severity: z.enum(["info", "minor", "major"]).optional(),
});

const PolishResultSchema = z.object({
  corrections: z.array(CorrectionSchema),
});

export function parsePolishResult(raw: string): PolishResult {
  const json = JSON.parse(raw);
  return PolishResultSchema.parse(json) as PolishResult;
}

export function isValidPolishResult(raw: string): boolean {
  try {
    parsePolishResult(raw);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Write the shared prompt module**

```ts
// lib/providers/shared/prompt.ts

export const CORRECTION_TYPES = [
  "grammar", "spelling", "punctuation", "style", "clarity", "word-choice",
] as const;

/** The verbatim rule — the matching engine depends on this. Every prompt MUST include it. */
export const VERBATIM_RULE = `CRITICAL RULE: The "original" field of each correction MUST be a VERBATIM copy of the exact characters from the input, including any errors. Do NOT normalize whitespace, quotes, punctuation, or casing in "original". The frontend locates each correction by exact substring match. Return corrections in the order they appear in the text.`;

export const SCHEMA_DESCRIPTION = `Return ONLY a JSON object of this exact shape (no prose, no markdown fences):
{
  "corrections": [
    {
      "original": "<verbatim substring of the input>",
      "suggestion": "<replacement, or empty string to delete>",
      "type": "grammar" | "spelling" | "punctuation" | "style" | "clarity" | "word-choice",
      "reason": "<one short sentence explaining the change>",
      "severity": "info" | "minor" | "major"
    }
  ]
}
If there is nothing to correct, return {"corrections": []}.`;

export function assembleSystem(sharedFraming: string): string {
  return [sharedFraming, SCHEMA_DESCRIPTION, VERBATIM_RULE].join("\n\n");
}

export function assembleUser(text: string): string {
  return `Text to polish:\n\n${text}`;
}
```

- [ ] **Step 3: Write the failing test for `parsePolishResult`**

```ts
// tests/providers/shared/parse.test.ts
import { describe, it, expect } from "vitest";
import { parsePolishResult } from "@/lib/providers/shared/parse";

describe("parsePolishResult", () => {
  it("parses valid JSON", () => {
    const raw = JSON.stringify({
      corrections: [{ original: "teh", suggestion: "the", type: "spelling", reason: "typo", severity: "minor" }],
    });
    const out = parsePolishResult(raw);
    expect(out.corrections).toHaveLength(1);
    expect(out.corrections[0].type).toBe("spelling");
  });

  it("throws on invalid type enum", () => {
    const raw = JSON.stringify({ corrections: [{ original: "a", suggestion: "b", type: "bogus", reason: "r" }] });
    expect(() => parsePolishResult(raw)).toThrow();
  });

  it("accepts empty corrections array", () => {
    const out = parsePolishResult('{"corrections":[]}');
    expect(out.corrections).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- parse`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/prompt.ts lib/providers/shared/parse.ts tests/providers/shared/parse.test.ts
git commit -m "feat(prompt): shared structured-output instruction + zod parse"
```

---

## Task 10: Provider prompts (English + Chinese framing)

**Files:**
- Create: `lib/providers/openai-compatible/prompt/en.ts`
- Create: `lib/providers/openai-compatible/prompt/zh.ts`
- Create: `lib/providers/gemini/prompt/en.ts`
- Create: `lib/providers/gemini/prompt/zh.ts`

These are the language-specific framing from spec §6. They differ only in framing text, not adapter mechanics, so all four share structure. Gemini's framing is identical to openai-compatible's (the adapter difference is in how the schema is enforced, not the framing).

- [ ] **Step 1: Write English framing (shared text, used by both adapters)**

```ts
// lib/providers/openai-compatible/prompt/en.ts
export const ENGLISH_FRAMING = `You are an expert English proofreader and editor. Find grammar, spelling, punctuation, word-choice, clarity, and style issues in the user's text. Preserve the author's meaning and voice; do not over-rewrite or make purely stylistic substitutions. Mark clear errors as "major", minor improvements as "minor", and optional polish as "info".`;
```

- [ ] **Step 2: Write Chinese framing**

```ts
// lib/providers/openai-compatible/prompt/zh.ts
export const CHINESE_FRAMING = `你是一位专业的中文润色编辑。找出用户文本中的表达冗余、口语化（需改为书面语）、用词不当、中文标点不规范、语序不当、清晰度等问题。汉字没有"拼写错误"，请弱化 grammar/spelling 类建议，主攻 style/clarity/word-choice。务必保留原意，不要过度重写，不要给出无意义的风格替换。明确错误标 "major"，小改进标 "minor"，可选润色标 "info"。`;
```

- [ ] **Step 3: Re-export from gemini prompt dirs (same framing)**

```ts
// lib/providers/gemini/prompt/en.ts
export { ENGLISH_FRAMING } from "@/lib/providers/openai-compatible/prompt/en";
```

```ts
// lib/providers/gemini/prompt/zh.ts
export { CHINESE_FRAMING } from "@/lib/providers/openai-compatible/prompt/zh";
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add lib/providers/openai-compatible/prompt lib/providers/gemini/prompt
git commit -m "feat(prompt): English + Chinese framing for both adapters"
```

---

## Task 11: Provider registry (presets)

**Files:**
- Create: `lib/providers/shared/presets.ts`
- Test: `tests/providers/shared/presets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/providers/shared/presets.test.ts
import { describe, it, expect } from "vitest";
import { PRESETS, getPreset } from "@/lib/providers/shared/presets";

describe("provider presets", () => {
  it("includes the five supported presets", () => {
    expect(PRESETS.map((p) => p.id).sort()).toEqual(["custom", "deepseek", "gemini", "glm", "kimi"]);
  });
  it("deepseek uses openai-compatible adapter and correct baseURL", () => {
    const p = getPreset("deepseek");
    expect(p.adapter).toBe("openai-compatible");
    expect(p.baseURL).toBe("https://api.deepseek.com/v1");
    expect(p.defaultModel).toBe("deepseek-v4-pro");
  });
  it("gemini uses gemini adapter", () => {
    expect(getPreset("gemini").adapter).toBe("gemini");
  });
  it("custom has empty baseURL/model", () => {
    const p = getPreset("custom");
    expect(p.baseURL).toBe("");
    expect(p.defaultModel).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- presets`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/providers/shared/presets.ts

export type AdapterKind = "openai-compatible" | "gemini";

export interface ProviderPreset {
  id: "deepseek" | "kimi" | "glm" | "gemini" | "custom";
  label: string;
  adapter: AdapterKind;
  baseURL: string;        // "" for gemini (uses SDK default) and custom (user fills)
  defaultModel: string;
  keyUrl: string;         // where to obtain an API key
}

export const PRESETS: ProviderPreset[] = [
  { id: "deepseek", label: "DeepSeek",  adapter: "openai-compatible", baseURL: "https://api.deepseek.com/v1",          defaultModel: "deepseek-v4-pro",  keyUrl: "https://platform.deepseek.com" },
  { id: "kimi",     label: "Kimi (Moonshot)", adapter: "openai-compatible", baseURL: "https://api.moonshot.cn/v1",       defaultModel: "kimi-k2.7-code",   keyUrl: "https://platform.moonshot.cn" },
  { id: "glm",      label: "GLM (智谱)", adapter: "openai-compatible", baseURL: "https://open.bigmodel.cn/api/paas/v4", defaultModel: "glm-5.2",          keyUrl: "https://open.bigmodel.cn" },
  { id: "gemini",   label: "Gemini",    adapter: "gemini",            baseURL: "",                                      defaultModel: "gemini-3.5-flash", keyUrl: "https://ai.google.dev" },
  { id: "custom",   label: "Custom",    adapter: "openai-compatible", baseURL: "",                                      defaultModel: "",                 keyUrl: "" },
];

export function getPreset(id: ProviderPreset["id"]): ProviderPreset {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown provider preset: ${id}`);
  return p;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- presets`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/presets.ts tests/providers/shared/presets.test.ts
git commit -m "feat(presets): provider registry for 5 presets"
```

---

## Task 12: HTTP wrapper — direct + auto proxy fallback

**Files:**
- Create: `lib/providers/shared/http.ts`
- Test: `tests/providers/shared/http.test.ts`

The wrapper tries a direct browser fetch; on a `TypeError` (CORS/network opaque failure, NOT an HTTP status) it retries once through `/api/polish`, passing the key in the body.

- [ ] **Step 1: Write the failing test**

```ts
// tests/providers/shared/http.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { callWithFallback } from "@/lib/providers/shared/http";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("callWithFallback", () => {
  it("returns the direct response when direct succeeds", async () => {
    const direct = vi.fn().mockResolvedValue({ ok: true, body: "direct-result" });
    const out = await callWithFallback(direct, { proxyBody: { provider: "x", payload: {} } });
    expect(out.body).toBe("direct-result");
  });

  it("falls back to proxy on TypeError (CORS/network)", async () => {
    const direct = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const proxyFetch = vi.fn().mockResolvedValue({ ok: true, body: "proxy-result" });
    const out = await callWithFallback(direct, { proxyBody: { provider: "x", payload: { apiKey: "k" } } }, proxyFetch);
    expect(direct).toHaveBeenCalledTimes(1);
    expect(proxyFetch).toHaveBeenCalledTimes(1);
    expect(out.body).toBe("proxy-result");
  });

  it("does NOT fall back on a normal Error with HTTP status (non-CORS)", async () => {
    const err = Object.assign(new Error("unauthorized"), { status: 401 });
    const direct = vi.fn().mockRejectedValue(err);
    const proxyFetch = vi.fn();
    await expect(
      callWithFallback(direct, { proxyBody: { provider: "x", payload: {} } }, proxyFetch),
    ).rejects.toThrow("unauthorized");
    expect(proxyFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- http`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/providers/shared/http.ts

export interface DirectResponse<T = unknown> {
  ok: boolean;
  status: number;
  body: T;
}

export interface ProxyBody {
  provider: string;
  payload: Record<string, unknown> & { apiKey?: string };
}

/**
 * Run `direct()`. On a TypeError (browser CORS/network opaque failure — distinct
 * from an HTTP status), retry once through the stateless /api/polish route.
 * `proxyFetch` is injectable for tests; defaults to global fetch.
 */
export async function callWithFallback<T = unknown>(
  direct: () => Promise<DirectResponse<T>>,
  opts: { proxyBody: ProxyBody },
  proxyFetch?: (url: string, init: RequestInit) => Promise<Response>,
): Promise<DirectResponse<T>> {
  try {
    return await direct();
  } catch (err) {
    const isCorsOrNetwork = err instanceof TypeError;
    if (!isCorsOrNetwork) throw err;
    const fetcher = proxyFetch ?? globalThis.fetch;
    const res = await fetcher("/api/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts.proxyBody),
    });
    const body = (await res.json()) as T;
    return { ok: res.ok, status: res.status, body };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- http`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/shared/http.ts tests/providers/shared/http.test.ts
git commit -m "feat(http): direct call + auto proxy fallback on CORS TypeError"
```

---

## Task 13: openai-compatible adapter

**Files:**
- Create: `lib/providers/openai-compatible/adapter.ts`
- Test: `tests/providers/openai-compatible/adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/providers/openai-compatible/adapter.test.ts
import { describe, it, expect, vi } from "vitest";
import { createOpenAICompatibleProvider } from "@/lib/providers/openai-compatible/adapter";

function mockFetch(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

describe("openai-compatible adapter", () => {
  it("posts to {baseURL}/chat/completions with json_object response_format", async () => {
    const fetcher = mockFetch(JSON.stringify({ corrections: [] }));
    const provider = createOpenAICompatibleProvider({ id: "deepseek", fetchImpl: fetcher });
    await provider.polish("hello", { apiKey: "k", model: "deepseek-v4-pro", baseURL: "https://api.deepseek.com/v1", language: "en" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.model).toBe("deepseek-v4-pro");
    expect((init as RequestInit).headers.Authorization).toBe("Bearer k");
  });

  it("returns parsed corrections", async () => {
    const content = JSON.stringify({ corrections: [{ original: "teh", suggestion: "the", type: "spelling", reason: "typo", severity: "minor" }] });
    const provider = createOpenAICompatibleProvider({ id: "deepseek", fetchImpl: mockFetch(content) });
    const out = await provider.polish("teh", { apiKey: "k", model: "m", baseURL: "https://api.deepseek.com/v1", language: "en" });
    expect(out.corrections).toHaveLength(1);
    expect(out.corrections[0].suggestion).toBe("the");
  });

  it("selects Chinese framing when language is zh", async () => {
    const fetcher = mockFetch(JSON.stringify({ corrections: [] }));
    const provider = createOpenAICompatibleProvider({ id: "glm", fetchImpl: fetcher });
    await provider.polish("你好", { apiKey: "k", model: "glm-5.2", baseURL: "https://open.bigmodel.cn/api/paas/v4", language: "zh" });
    const body = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages[0].content).toContain("中文润色");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- openai-compatible/adapter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/providers/openai-compatible/adapter.ts
import type { Provider, ProviderConfig, PolishResult } from "../shared/schema";
import { detect } from "../shared/lang";
import { assembleSystem, assembleUser } from "../shared/prompt";
import { parsePolishResult } from "../shared/parse";
import { ENGLISH_FRAMING } from "./prompt/en";
import { CHINESE_FRAMING } from "./prompt/zh";

interface AdapterOpts {
  id: string;
  fetchImpl?: typeof fetch;
}

export function createOpenAICompatibleProvider({ id, fetchImpl }: AdapterOpts): Provider {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  return {
    id,
    async polish(text: string, config: ProviderConfig): Promise<PolishResult> {
      const lang = config.language && config.language !== "auto" ? config.language : detect(text);
      const framing = lang === "zh" ? CHINESE_FRAMING : ENGLISH_FRAMING;
      const baseURL = (config.baseURL ?? "").replace(/\/$/, "");

      const messages = [
        { role: "system", content: assembleSystem(framing) },
        { role: "user", content: assembleUser(text) },
      ];

      const res = await fetchFn(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        const err = new Error(`provider ${id} returned ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content ?? "";
      return parsePolishResult(content);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- openai-compatible/adapter`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/openai-compatible/adapter.ts tests/providers/openai-compatible/adapter.test.ts
git commit -m "feat(adapter): openai-compatible provider (JSON mode)"
```

---

## Task 14: gemini adapter

**Files:**
- Create: `lib/providers/gemini/adapter.ts`
- Test: `tests/providers/gemini/adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/providers/gemini/adapter.test.ts
import { describe, it, expect, vi } from "vitest";
import { createGeminiProvider } from "@/lib/providers/gemini/adapter";

function mockFetch(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: content }] } }] }),
  });
}

describe("gemini adapter", () => {
  it("calls generateContent with responseSchema + responseMimeType", async () => {
    const fetcher = mockFetch(JSON.stringify({ corrections: [] }));
    const provider = createGeminiProvider({ fetchImpl: fetcher });
    await provider.polish("hi", { apiKey: "k", model: "gemini-3.5-flash", language: "en" });
    const [url] = fetcher.mock.calls[0];
    expect(String(url)).toContain("generateContent");
    expect(String(url)).toContain("key=k");
  });

  it("returns parsed corrections", async () => {
    const content = JSON.stringify({ corrections: [{ original: "teh", suggestion: "the", type: "spelling", reason: "typo" }] });
    const provider = createGeminiProvider({ fetchImpl: mockFetch(content) });
    const out = await provider.polish("teh", { apiKey: "k", model: "m", language: "en" });
    expect(out.corrections[0].suggestion).toBe("the");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- gemini/adapter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/providers/gemini/adapter.ts
import type { Provider, ProviderConfig, PolishResult } from "../shared/schema";
import { detect } from "../shared/lang";
import { assembleSystem, assembleUser, CORRECTION_TYPES } from "../shared/prompt";
import { parsePolishResult } from "../shared/parse";
import { ENGLISH_FRAMING } from "./prompt/en";
import { CHINESE_FRAMING } from "./prompt/zh";

const responseSchema = {
  type: "object",
  properties: {
    corrections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          original: { type: "string" },
          suggestion: { type: "string" },
          type: { type: "string", enum: [...CORRECTION_TYPES] },
          reason: { type: "string" },
          severity: { type: "string", enum: ["info", "minor", "major"] },
        },
        required: ["original", "suggestion", "type", "reason"],
        propertyOrdering: ["original", "suggestion", "type", "reason", "severity"],
      },
    },
  },
  required: ["corrections"],
};

interface AdapterOpts {
  fetchImpl?: typeof fetch;
}

export function createGeminiProvider({ fetchImpl }: AdapterOpts = {}): Provider {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  return {
    id: "gemini",
    async polish(text: string, config: ProviderConfig): Promise<PolishResult> {
      const lang = config.language && config.language !== "auto" ? config.language : detect(text);
      const framing = lang === "zh" ? CHINESE_FRAMING : ENGLISH_FRAMING;
      const model = config.model || "gemini-3.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

      const res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: assembleSystem(framing) }] },
          contents: [{ role: "user", parts: [{ text: assembleUser(text) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.2,
          },
        }),
      });

      if (!res.ok) {
        const err = new Error(`gemini returned ${res.status}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const content: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return parsePolishResult(content);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- gemini/adapter`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/providers/gemini/adapter.ts tests/providers/gemini/adapter.test.ts
git commit -m "feat(adapter): gemini provider (responseSchema)"
```

---

## Task 15: Provider factory

**Files:**
- Create: `lib/providers/shared/index.ts`

- [ ] **Step 1: Implement the factory**

```ts
// lib/providers/shared/index.ts
import type { Provider } from "./schema";
import { getPreset, type ProviderPreset } from "./presets";
import { createOpenAICompatibleProvider } from "../openai-compatible/adapter";
import { createGeminiProvider } from "../gemini/adapter";

export function getProvider(presetId: ProviderPreset["id"]): Provider {
  const preset = getPreset(presetId);
  if (preset.adapter === "gemini") return createGeminiProvider();
  return createOpenAICompatibleProvider({ id: preset.id });
}

export { PRESETS, getPreset } from "./presets";
export type { ProviderPreset, AdapterKind } from "./presets";
export * from "./schema";
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add lib/providers/shared/index.ts
git commit -m "feat(providers): getProvider factory + re-exports"
```

---

## Task 16: Stateless proxy route handler

**Files:**
- Create: `app/api/polish/route.ts`

This route is the CORS-fallback proxy. It receives `{provider, payload}` (payload includes `apiKey` in the body, not headers, to avoid Vercel logging it), relays to the provider with `Authorization`, returns the body, stores nothing.

- [ ] **Step 1: Implement the route**

```ts
// app/api/polish/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getPreset } from "@/lib/providers/shared/presets";

export const runtime = "nodejs";
// Stateless: no caching, no persistence.
export const dynamic = "force-dynamic";

interface ProxyRequest {
  provider: string;
  payload: {
    apiKey?: string;
    model?: string;
    baseURL?: string;
    text?: string;
    language?: "en" | "zh" | "auto";
  };
}

export async function POST(req: NextRequest) {
  let body: ProxyRequest;
  try {
    body = (await req.json()) as ProxyRequest;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const { provider, payload } = body;
  if (!provider || !payload?.apiKey) {
    return NextResponse.json({ error: "missing provider or apiKey" }, { status: 400 });
  }

  const preset = getPreset(provider as ReturnType<typeof getPreset>["id"]);
  const baseURL = (payload.baseURL || preset.baseURL).replace(/\/$/, "");

  // Build the upstream request according to adapter kind.
  if (preset.adapter === "gemini") {
    const model = payload.model || preset.defaultModel;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(payload.apiKey)}`;
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.body ?? {}),
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  }

  // openai-compatible
  const url = `${baseURL}/chat/completions`;
  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.apiKey}`,
    },
    body: JSON.stringify(payload.body ?? {}),
  });
  return NextResponse.json(await upstream.json(), { status: upstream.status });
}
```

> **Note:** This route must NEVER `console.log` the payload (it contains `apiKey`). It relays and returns; nothing is stored.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass (build compiles the route).

- [ ] **Step 3: Commit**

```bash
git add app/api/polish/route.ts
git commit -m "feat(api): stateless CORS-fallback proxy route"
```

---

## Task 17: Settings hook (`useSettings`)

**Files:**
- Create: `hooks/useSettings.ts`

- [ ] **Step 1: Implement**

```ts
// hooks/useSettings.ts
"use client";
import { useEffect, useState, useCallback } from "react";
import { PRESETS, getPreset, type ProviderPreset } from "@/lib/providers/shared/presets";

export interface Settings {
  presetId: ProviderPreset["id"];
  apiKey: string;
  model: string;
  baseURL: string;
  language: "en" | "zh" | "auto";
  rememberKey: boolean;
}

const STORAGE_KEY = "grammar-polisher.settings.v1";
const STORAGE_KEY_NOSECRET = "grammar-polisher.settings.v1.nosecret"; // when rememberKey=false

const DEFAULTS: Settings = {
  presetId: "deepseek",
  apiKey: "",
  model: "deepseek-v4-pro",
  baseURL: "https://api.deepseek.com/v1",
  language: "auto",
  rememberKey: false,
};

function load(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY_NOSECRET);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const base = { ...DEFAULTS, ...parsed };
    if (!base.rememberKey) base.apiKey = ""; // never persist key unless opted in
    return base;
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    setSettings(load());
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // when switching preset, refill model/baseURL defaults if user hadn't customized
      if (patch.presetId && patch.presetId !== prev.presetId) {
        const p = getPreset(patch.presetId);
        next.model = p.defaultModel;
        next.baseURL = p.baseURL;
      }
      try {
        const { apiKey, ...rest } = next;
        const toStore = next.rememberKey ? next : rest;
        window.localStorage.setItem(next.rememberKey ? STORAGE_KEY : STORAGE_KEY_NOSECRET, JSON.stringify(toStore));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  return { settings, update };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add hooks/useSettings.ts
git commit -m "feat(hooks): useSettings with opt-in key persistence"
```

---

## Task 18: Polish hook (`usePolish`)

**Files:**
- Create: `hooks/usePolish.ts`

Orchestrates: pick provider via factory, call with auto-fallback, normalize errors to `PolishError`.

- [ ] **Step 1: Implement**

```ts
// hooks/usePolish.ts
"use client";
import { useState, useCallback } from "react";
import { getProvider } from "@/lib/providers/shared";
import type { PolishResult, ProviderConfig } from "@/lib/providers/shared/schema";
import type { ProviderPreset } from "@/lib/providers/shared/presets";

export type PolishErrorKind = "no-key" | "auth" | "network" | "schema" | "rate-limit" | "timeout" | "empty";
export interface PolishError { kind: PolishErrorKind; message: string; retryable: boolean }

export type PolishStatus = "idle" | "loading" | "done" | "error";

function toPolishError(err: unknown): PolishError {
  const e = err as Error & { status?: number };
  if (e?.status === 401 || e?.status === 403) return { kind: "auth", message: "API Key 无效或无权限", retryable: false };
  if (e?.status === 429) return { kind: "rate-limit", message: "请求过于频繁，稍后重试", retryable: true };
  if (err instanceof TypeError) return { kind: "network", message: "网络错误，无法连接（已尝试代理兜底）", retryable: true };
  if (err instanceof SyntaxError) return { kind: "schema", message: "模型返回格式异常，请重试或换模型", retryable: true };
  return { kind: "network", message: e?.message ?? "未知错误", retryable: true };
}

export function usePolish() {
  const [status, setStatus] = useState<PolishStatus>("idle");
  const [result, setResult] = useState<PolishResult | null>(null);
  const [error, setError] = useState<PolishError | null>(null);

  const polish = useCallback(
    async (
      text: string,
      opts: { presetId: ProviderPreset["id"]; config: ProviderConfig },
    ) => {
      if (!opts.config.apiKey) {
        setStatus("error");
        setError({ kind: "no-key", message: "请先在设置里填写 API Key", retryable: false });
        return;
      }
      setStatus("loading");
      setError(null);
      try {
        const provider = getProvider(opts.presetId);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        try {
          const res = await provider.polish(text, opts.config);
          setResult(res);
          setStatus("done");
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setError({ kind: "timeout", message: "请求超时（>30s）", retryable: true });
        } else {
          setError(toPolishError(err));
        }
        setStatus("error");
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, polish, reset };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add hooks/usePolish.ts
git commit -m "feat(hooks): usePolish orchestration + error normalization"
```

---

## Task 19: Editor — textarea + overlay sync

**Files:**
- Create: `components/Editor.tsx`

The overlay is a div behind a transparent-text textarea. Both share identical font metrics. This component owns text + renders pending/accepted highlights via `HighlightOverlay` (Task 20). Accept/reject wired in Task 21.

- [ ] **Step 1: Implement**

```tsx
// components/Editor.tsx
"use client";
import { useRef, useEffect, type ChangeEvent } from "react";
import { HighlightOverlay } from "./HighlightOverlay";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";

interface EditorProps {
  text: string;
  onChange: (t: string) => void;
  suggestions: PinnedCorrection[];
  readOnly: boolean;
  activeId: string | null;
  onPick: (id: string | null) => void;
}

export function Editor({ text, onChange, suggestions, readOnly, activeId, onPick }: EditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and overlay.
  useEffect(() => {
    const ta = taRef.current;
    const ov = overlayRef.current;
    if (!ta || !ov) return;
    const onScroll = () => {
      ov.scrollTop = ta.scrollTop;
      ov.scrollLeft = ta.scrollLeft;
    };
    ta.addEventListener("scroll", onScroll, { passive: true });
    return () => ta.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative w-full">
      <div
        ref={overlayRef}
        className="absolute inset-0 overflow-auto whitespace-pre-wrap break-words px-4 py-3 pointer-events-none"
        aria-hidden
      >
        <HighlightOverlay text={text} suggestions={suggestions} activeId={activeId} onPick={onPick} />
      </div>
      <textarea
        ref={taRef}
        className="relative w-full min-h-[20rem] resize-y bg-transparent px-4 py-3 outline-none"
        style={{ color: "transparent", caretColor: "currentColor" }}
        value={text}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes (HighlightOverlay referenced; created next task — typecheck may complain only if strict about missing module; if it fails, create a stub `HighlightOverlay` first. We create it in Task 20 immediately.)

- [ ] **Step 3: Commit (after Task 20 compiles together)**

Commit together with Task 20.

---

## Task 20: HighlightOverlay component

**Files:**
- Create: `components/HighlightOverlay.tsx`

Renders the text sliced by suggestion spans as `<mark>` elements. Clicking a mark selects it (onPick).

- [ ] **Step 1: Implement**

```tsx
// components/HighlightOverlay.tsx
"use client";
import { Fragment } from "react";
import type { PinnedCorrection, CorrectionType } from "@/lib/providers/shared/schema";

interface OverlayProps {
  text: string;
  suggestions: PinnedCorrection[];
  activeId: string | null;
  onPick: (id: string | null) => void;
}

const TYPE_COLOR: Record<CorrectionType, string> = {
  grammar: "red",
  spelling: "red",
  punctuation: "red",
  style: "blue",
  "word-choice": "blue",
  clarity: "purple",
};

export function HighlightOverlay({ text, suggestions, activeId, onPick }: OverlayProps) {
  // Only render pending suggestions; sort by start.
  const marks = suggestions
    .filter((s) => s.state === "pending" && s.start >= 0)
    .sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue; // skip overlaps defensively
    if (m.start > cursor) nodes.push(<Fragment key={`t-${cursor}`}>{text.slice(cursor, m.start)}</Fragment>);
    const color = TYPE_COLOR[m.type];
    const weight = m.severity === "major" ? 3 : 2;
    nodes.push(
      <mark
        key={m.id}
        data-id={m.id}
        className="cursor-pointer rounded-sm"
        style={{
          textDecoration: "underline",
          textDecorationColor: color,
          textDecorationThickness: weight,
          textUnderlineOffset: 3,
          backgroundColor: activeId === m.id ? "rgba(255,235,59,0.35)" : "transparent",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onPick(activeId === m.id ? null : m.id);
        }}
      >
        {text.slice(m.start, m.end)}
      </mark>,
    );
    cursor = m.end;
  }
  if (cursor < text.length) nodes.push(<Fragment key={`t-end`}>{text.slice(cursor)}</Fragment>);

  return (
    <div
      className="whitespace-pre-wrap break-words"
      onClick={() => onPick(null)}
    >
      {nodes}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit (with Task 19)**

```bash
git add components/Editor.tsx components/HighlightOverlay.tsx
git commit -m "feat(ui): editor textarea + overlay highlight rendering"
```

---

## Task 21: SuggestionCard + accept/reject wiring

**Files:**
- Create: `components/SuggestionCard.tsx`

Shows reason + suggestion + Accept/Reject for the active suggestion.

- [ ] **Step 1: Implement**

```tsx
// components/SuggestionCard.tsx
"use client";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";

interface CardProps {
  suggestion: PinnedCorrection;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export function SuggestionCard({ suggestion, onAccept, onReject }: CardProps) {
  const { original, suggestion: repl, type, reason, severity, id } = suggestion;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-600">{type}</span>
        {severity && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-600">{severity}</span>
        )}
      </div>
      <div className="mb-2 font-mono text-sm">
        <span className="text-red-500 line-through">{original}</span>
        {repl && (
          <>
            {" → "}
            <span className="text-green-600">{repl}</span>
          </>
        )}
      </div>
      <p className="mb-3 text-sm text-gray-700">{reason}</p>
      <div className="flex gap-2">
        <button
          onClick={() => onAccept(id)}
          className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700"
        >
          Accept
        </button>
        <button
          onClick={() => onReject(id)}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add components/SuggestionCard.tsx
git commit -m "feat(ui): suggestion card with accept/reject"
```

---

## Task 22: Settings panel

**Files:**
- Create: `components/SettingsPanel.tsx`
- Create: `components/ProviderSelect.tsx`

- [ ] **Step 1: Implement ProviderSelect**

```tsx
// components/ProviderSelect.tsx
"use client";
import { PRESETS, type ProviderPreset } from "@/lib/providers/shared/presets";

interface Props {
  value: ProviderPreset["id"];
  onChange: (id: ProviderPreset["id"]) => void;
}

export function ProviderSelect({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ProviderPreset["id"])}
      className="rounded border border-gray-300 px-2 py-1"
    >
      {PRESETS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Implement SettingsPanel**

```tsx
// components/SettingsPanel.tsx
"use client";
import { useState } from "react";
import { ProviderSelect } from "./ProviderSelect";
import { getPreset } from "@/lib/providers/shared/presets";
import type { Settings } from "@/hooks/useSettings";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export function SettingsPanel({ settings, update }: Props) {
  const [open, setOpen] = useState(false);
  const preset = getPreset(settings.presetId);
  const isCustom = settings.presetId === "custom";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-gray-300 px-3 py-1 text-sm"
        aria-label="Settings"
      >
        ⚙️
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Provider</label>
          <ProviderSelect value={settings.presetId} onChange={(id) => update({ presetId: id })} />

          {isCustom && (
            <>
              <label className="mt-3 block text-xs font-semibold uppercase text-gray-500">Base URL</label>
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="https://..."
                value={settings.baseURL}
                onChange={(e) => update({ baseURL: e.target.value })}
              />
            </>
          )}

          <label className="mt-3 block text-xs font-semibold uppercase text-gray-500">API Key</label>
          <input
            type="password"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder={preset.keyUrl ? `从 ${preset.keyUrl} 获取` : "粘贴 API Key"}
            value={settings.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={settings.rememberKey}
              onChange={(e) => update({ rememberKey: e.target.checked })}
            />
            记住 Key（存到本机 localStorage）
          </label>

          <label className="mt-3 block text-xs font-semibold uppercase text-gray-500">Model</label>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
          />

          <label className="mt-3 block text-xs font-semibold uppercase text-gray-500">Language</label>
          <select
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={settings.language}
            onChange={(e) => update({ language: e.target.value as Settings["language"] })}
          >
            <option value="auto">Auto</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add components/SettingsPanel.tsx components/ProviderSelect.tsx
git commit -m "feat(ui): settings panel + provider select"
```

---

## Task 23: Wire the page (editor + polish + state machine)

**Files:**
- Modify: `app/page.tsx`

Ties everything together: text state, pinned suggestions, accept/reject with offset recompute, accept-all, copy result, error display, "unmatched" panel.

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
// app/page.tsx
"use client";
import { useState, useMemo, useCallback } from "react";
import { Editor } from "@/components/Editor";
import { SuggestionCard } from "@/components/SuggestionCard";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useSettings } from "@/hooks/useSettings";
import { usePolish } from "@/hooks/usePolish";
import { pinSpans } from "@/lib/providers/shared/match";
import { applyAccept } from "@/lib/providers/shared/offsets";
import type { PinnedCorrection } from "@/lib/providers/shared/schema";

export default function Home() {
  const { settings, update } = useSettings();
  const { status, result, error, polish, reset } = usePolish();

  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<PinnedCorrection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pinned = useMemo(
    () => (result ? pinSpans(text, result.corrections) : []),
    // pin when a fresh result arrives; text here is the pre-accept snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result],
  );

  // Initialize suggestions when a result comes back.
  const onPolish = useCallback(async () => {
    await polish(text, {
      presetId: settings.presetId,
      config: {
        apiKey: settings.apiKey,
        model: settings.model,
        baseURL: settings.baseURL || undefined,
        language: settings.language,
      },
    });
  }, [text, settings, polish]);

  // Apply pinned suggestions once a result is available.
  useMemo(() => {
    if (status === "done" && result && pinned.length) {
      setSuggestions(pinned);
    } else if (status === "done" && result) {
      setSuggestions([]);
    }
  }, [status, result, pinned]);

  const handleAccept = useCallback(
    (id: string) => {
      setSuggestions((prev) => {
        const { text: newText, suggestions: newSugs } = applyAccept(text, prev, id);
        setText(newText);
        return newSugs;
      });
      setActiveId(null);
    },
    [text],
  );

  const handleReject = useCallback((id: string) => {
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, state: "rejected" as const } : s)));
    setActiveId(null);
  }, []);

  const handleAcceptAll = useCallback(() => {
    setSuggestions((prev) => {
      let t = text;
      let sugs = prev;
      const pending = sugs.filter((x) => x.state === "pending").sort((a, b) => a.start - b.start);
      for (const p of pending) {
        const r = applyAccept(t, sugs, p.id);
        t = r.text;
        sugs = r.suggestions;
      }
      setText(t);
      return sugs;
    });
  }, [text]);

  const pendingCount = suggestions.filter((s) => s.state === "pending").length;
  const unmatched = suggestions.filter((s) => s.matchTier === 3);
  const active = suggestions.find((s) => s.id === activeId) ?? null;
  const inReview = status === "done";

  const copyResult = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Grammar Checker</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{settings.presetId}</span>
          <SettingsPanel settings={settings} update={update} />
        </div>
      </header>

      <Editor
        text={text}
        onChange={setText}
        suggestions={suggestions}
        readOnly={inReview}
        activeId={activeId}
        onPick={setActiveId}
      />

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{text.length} chars</span>
        <div className="flex gap-2">
          {inReview ? (
            <>
              <button onClick={handleAcceptAll} disabled={pendingCount === 0} className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-40">
                Accept all ({pendingCount})
              </button>
              <button onClick={copyResult} className="rounded border border-gray-300 px-3 py-1 text-sm">
                {copied ? "Copied!" : "Copy result"}
              </button>
              <button onClick={() => { reset(); setSuggestions([]); }} className="rounded border border-gray-300 px-3 py-1 text-sm">
                Clear
              </button>
            </>
          ) : (
            <button
              onClick={onPolish}
              disabled={status === "loading" || !settings.apiKey || !text}
              className="rounded bg-blue-600 px-4 py-1 text-sm text-white disabled:opacity-40"
            >
              {status === "loading" ? "Polishing…" : "Polish"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error.message}
          {error.retryable && (
            <button onClick={onPolish} className="ml-2 underline">重试</button>
          )}
        </div>
      )}

      {inReview && result && result.corrections.length === 0 && (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          未发现可润色之处。
        </div>
      )}

      {active && <SuggestionCard suggestion={active} onAccept={handleAccept} onReject={handleReject} />}

      {unmatched.length > 0 && (
        <details className="rounded border border-gray-200 p-3 text-sm">
          <summary className="cursor-pointer text-gray-600">{unmatched.length} 条无法定位（仅参考）</summary>
          <ul className="mt-2 space-y-1">
            {unmatched.map((u) => (
              <li key={u.id}>
                <span className="font-mono text-red-500">{u.original}</span>
                {u.suggestion && <> → <span className="font-mono text-green-600">{u.suggestion}</span></>}
                <span className="text-gray-500"> — {u.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(ui): wire editor + polish + accept/reject state machine"
```

---

## Task 24: Verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full pre-commit suite in order**

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: lint clean, typecheck passes, all tests pass, build succeeds.

- [ ] **Step 2: Manual smoke test (EN)**

```bash
npm run dev
```
- Open `http://localhost:3000`, configure a real DeepSeek/GLM/Gemini key in ⚙️.
- Paste: `"She dont know what your doing, becouse the team have went home."`
- Click Polish. Expect ~4+ highlights. Accept one, verify text updates; Accept all, verify all applied; Copy result.

- [ ] **Step 3: Manual smoke test (ZH)**

- Paste: `"这个方案我觉得吧，可能会有一些潜在的风险存在，我们需要进一步的来进行讨论。"`
- Click Polish. Expect style/clarity suggestions. Verify reasons render.

- [ ] **Step 4: Manual smoke test (Kimi — proxy fallback)**

- Configure a Kimi key, paste any text, click Polish.
- Open DevTools Network: expect a failed direct call to `api.moonshot.cn` (CORS) followed by a successful `/api/polish` call. Verify results render.

- [ ] **Step 5: Record results in README**

Add a short "如何验证 / How to verify" section to `README.md` summarizing the smoke tests above.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: add how-to-verify smoke tests"
```

---

## Self-Review (run after writing this plan)

- **Spec coverage:** §2 scope → Tasks 1,16,23. §3 presets → Task 11. §3.1 auto-fallback → Task 12. §4 schema → Task 2. §5 structured output → Tasks 9,13,14. §6 prompts → Tasks 8,9,10. §7 matcher → Tasks 3–6. §8 frontend → Tasks 17–23. §9 errors/BYOK → Tasks 12,16,18. §10 testing → interleaved TDD + Task 24.
- **Placeholder scan:** none — every code step shows complete code.
- **Type consistency:** `PinnedCorrection` shape (id/start/end/matchTier/state) consistent across match.ts, offsets.ts, overlay, card, page. `ProviderConfig`, `Provider`, `Settings`, `PolishError` signatures consistent across modules.
