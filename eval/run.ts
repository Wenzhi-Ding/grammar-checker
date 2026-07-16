// eval/run.ts
// Eval harness: run grammar test cases through the app's REAL prompt-assembly +
// openai-compatible adapter (deepseek-v4-flash by default), then have deepseek-v4-pro
// judge each result against the case's reference points (score 0–7).
//
// Usage:
//   npm run eval -- [--lang en|zh] [--case <id>]... [--test-model m] [--judge-model m] [--instructions "text"]
//
// Requires DEEPSEEK_API_KEY in the environment or in .env.local.

import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { createOpenAICompatibleProvider } from "../lib/providers/openai-compatible/adapter";
import type { Correction } from "../lib/providers/shared/schema";
import { callJudge, type JudgeResult } from "./judge";

interface EvalCase {
  id: string;
  language: "en" | "zh";
  input: string;
  reference: string[];
  notes?: string;
}

interface Flags {
  lang?: "en" | "zh";
  cases: string[];
  testModel: string;
  judgeModel: string;
  instructions?: string;
}

interface CaseOutcome {
  c: EvalCase;
  corrections: Correction[] | null;
  error?: string;
  nonVerbatim: number;
  judge: JudgeResult | null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { cases: [], testModel: "deepseek-v4-flash", judgeModel: "deepseek-v4-pro" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--lang") flags.lang = next() as "en" | "zh";
    else if (a === "--case") flags.cases.push(next());
    else if (a === "--test-model") flags.testModel = next();
    else if (a === "--judge-model") flags.judgeModel = next();
    else if (a === "--instructions") flags.instructions = next();
    else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return flags;
}

function loadApiKey(): string {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const env = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* fall through to the error below */
  }
  console.error("Missing DEEPSEEK_API_KEY. Put it in .env.local or the environment.");
  process.exit(1);
}

function loadCases(flags: Flags): EvalCase[] {
  const files = flags.lang ? [`${flags.lang}.json`] : ["en.json", "zh.json"];
  let cases: EvalCase[] = [];
  for (const f of files) {
    const raw = JSON.parse(readFileSync(path.join(__dirname, "cases", f), "utf8")) as EvalCase[];
    cases = cases.concat(raw);
  }
  if (flags.cases.length) {
    const wanted = new Set(flags.cases);
    cases = cases.filter((c) => wanted.has(c.id));
    if (!cases.length) {
      console.error(`No cases matched: ${flags.cases.join(", ")}`);
      process.exit(2);
    }
  }
  return cases;
}

/** Minimal concurrency pool. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

function countNonVerbatim(input: string, corrections: Correction[]): number {
  return corrections.filter((c) => !input.includes(c.original)).length;
}

async function runOne(c: EvalCase, flags: Flags, apiKey: string): Promise<CaseOutcome> {
  const provider = createOpenAICompatibleProvider({ id: "deepseek" });
  let corrections: Correction[] | null = null;
  let error: string | undefined;
  try {
    const result = await provider.polish(c.input, {
      apiKey,
      model: flags.testModel,
      baseURL: "https://api.deepseek.com/v1",
      language: c.language,
      reasonLanguage: "zh",
      customInstructions: flags.instructions,
    });
    corrections = result.corrections;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    return { c, corrections: null, error, nonVerbatim: 0, judge: null };
  }
  let judge: JudgeResult | null = null;
  try {
    judge = await callJudge({
      apiKey,
      model: flags.judgeModel,
      original: c.input,
      reference: c.reference,
      corrections,
    });
  } catch (e) {
    error = `judge: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { c, corrections, error, nonVerbatim: countNonVerbatim(c.input, corrections), judge };
}

function renderReport(outcomes: CaseOutcome[], flags: Flags, mean: number | null): string {
  const header: (string | null)[] = [
    `# Eval report — ${new Date().toISOString()}`,
    "",
    `- test model: \`${flags.testModel}\``,
    `- judge model: \`${flags.judgeModel}\``,
    flags.instructions ? `- custom instructions: ${flags.instructions}` : null,
    `- cases: ${outcomes.length}`,
    `- mean score: ${mean === null ? "n/a" : mean.toFixed(2)}`,
    "",
  ];
  const lines: string[] = header.filter((x): x is string => x !== null);
  for (const o of outcomes) {
    lines.push(`## ${o.c.id} — score: ${o.judge?.score ?? "n/a"}`);
    lines.push("");
    lines.push("**Input**");
    lines.push("```");
    lines.push(o.c.input);
    lines.push("```");
    lines.push(`**Reference**: ${o.c.reference.length ? o.c.reference.join("；") : "（干净文本，无参考答案）"}`);
    if (o.c.notes) lines.push(`**Notes**: ${o.c.notes}`);
    if (o.error) lines.push(`**Error**: ${o.error}`);
    if (o.corrections) {
      lines.push(`**Corrections** (${o.corrections.length}, non-verbatim: ${o.nonVerbatim})`);
      lines.push("```json");
      lines.push(JSON.stringify(o.corrections, null, 2));
      lines.push("```");
    }
    if (o.judge) {
      if (o.judge.strengths.length) lines.push(`**做得好**: ${o.judge.strengths.join("；")}`);
      if (o.judge.weaknesses.length) lines.push(`**不足**: ${o.judge.weaknesses.join("；")}`);
      if (o.judge.missed.length) lines.push(`**漏改**: ${o.judge.missed.join("；")}`);
      if (o.judge.raw) {
        lines.push("**Judge raw output**:");
        lines.push("```");
        lines.push(o.judge.raw);
        lines.push("```");
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const apiKey = loadApiKey();
  const cases = loadCases(flags);
  console.log(`Running ${cases.length} case(s): test=${flags.testModel}, judge=${flags.judgeModel}`);

  const outcomes = await pool(cases, 3, (c) =>
    runOne(c, flags, apiKey).then((o) => {
      console.log(`${o.c.id}: ${o.judge?.score ?? "n/a"}${o.error ? ` (error: ${o.error})` : ""}`);
      return o;
    }),
  );

  const scored = outcomes.filter((o) => o.judge?.score != null);
  const mean = scored.length
    ? scored.reduce((s, o) => s + (o.judge!.score as number), 0) / scored.length
    : null;
  const nonVerbatim = outcomes.reduce((s, o) => s + o.nonVerbatim, 0);

  console.log("\n=== Summary ===");
  for (const o of outcomes) {
    const w = o.judge?.weaknesses[0] ?? o.error ?? "";
    console.log(`${o.c.id.padEnd(8)} score=${String(o.judge?.score ?? "n/a").padEnd(4)} corrections=${o.corrections?.length ?? "-"} nonVerbatim=${o.nonVerbatim} ${w}`);
  }
  console.log(`mean=${mean === null ? "n/a" : mean.toFixed(2)} over ${scored.length}/${outcomes.length} scored cases; non-verbatim spans: ${nonVerbatim}`);

  const dir = path.join(__dirname, "reports");
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  try {
    writeFileSync(path.join(dir, `${ts}.md`), renderReport(outcomes, flags, mean));
    appendFileSync(
      path.join(dir, "history.jsonl"),
      JSON.stringify({
        ts: new Date().toISOString(),
        testModel: flags.testModel,
        judgeModel: flags.judgeModel,
        instructions: flags.instructions ?? null,
        cases: outcomes.length,
        scored: scored.length,
        mean,
        nonVerbatim,
      }) + "\n",
    );
    console.log(`Report written to eval/reports/${ts}.md`);
  } catch (e) {
    console.warn(`Could not write report: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
