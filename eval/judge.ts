// eval/judge.ts
// Judge: deepseek-v4-pro grades the tested model's corrections against reference points.
// Uses a direct chat-completions call (the app adapter hardcodes the correction prompt,
// so it cannot be reused for judging).

export interface JudgeResult {
  /** 0–7, or null when the judge output could not be parsed. */
  score: number | null;
  strengths: string[];
  weaknesses: string[];
  missed: string[];
  /** Raw judge output, only set when parsing failed. */
  raw?: string;
}

const JUDGE_SYSTEM = `You are a strict but fair grading judge for a grammar-correction system. You will receive a JSON object with:
1. "original": the ORIGINAL text (may contain errors).
2. "reference": what a human editor expects to be fixed (an empty array means the text is clean and should NOT be changed).
3. "corrections": the SYSTEM's corrections as a JSON array (each: original, suggestion, type, reason).

Grade the system's output on a 0–7 scale:
- 5 = baseline: it fixes essentially what the reference lists, with verbatim "original" spans and sensible suggestions.
- Deduct for: missing a real error from the reference (-1 each); a correction that is wrong, harmful, or changes the author's meaning (-1 to -2); an "original" span that is NOT a verbatim substring of the input text (-1 each — such fixes cannot be applied); flagging non-errors / over-editing (-1).
- Add above 5 (max 7) for: catching real errors beyond the reference (+0.5 to +1 each); suggestions clearly better than the reference (+1).
- Clean-text cases (empty reference): 5 = returned no corrections (or only clearly optional, non-harmful polish); any harmful or unnecessary change deducts.
- Clamp: minimum 0, maximum 7. Multiples of 0.5 allowed.

Return ONLY a JSON object (no prose, no markdown fences):
{"score": <number 0-7>, "strengths": ["..."], "weaknesses": ["..."], "missed": ["<reference point that was missed>"]}
Write strengths/weaknesses/missed in Simplified Chinese, one short point per item.`;

/** Parse judge output defensively; never throws. */
export function parseJudgeOutput(text: string): JudgeResult {
  const fail = (): JudgeResult => ({ score: null, strengths: [], weaknesses: [], missed: [], raw: text });
  // Extract the first {...} block (tolerates fences / surrounding prose).
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return fail();
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return fail();
  }
  const obj = parsed as Record<string, unknown>;
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  let score: number | null = null;
  if (typeof obj.score === "number" && Number.isFinite(obj.score)) {
    score = Math.min(7, Math.max(0, obj.score));
  }
  return {
    score,
    strengths: asStringArray(obj.strengths),
    weaknesses: asStringArray(obj.weaknesses),
    missed: asStringArray(obj.missed),
  };
}

export async function callJudge(opts: {
  apiKey: string;
  model: string;
  original: string;
  reference: string[];
  corrections: unknown;
  fetchImpl?: typeof fetch;
}): Promise<JudgeResult> {
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const res = await fetchFn("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            original: opts.original,
            reference: opts.reference,
            corrections: opts.corrections,
          }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  if (!res.ok) {
    const err = new Error(`judge returned ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return parseJudgeOutput(data.choices?.[0]?.message?.content ?? "");
}
