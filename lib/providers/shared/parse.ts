// lib/providers/shared/parse.ts
import { z } from "zod";
import type { PolishResult } from "./schema";

const CorrectionSchema = z.object({
  original: z.string().min(1),
  suggestion: z.string(),
  type: z.enum(["grammar", "spelling", "punctuation", "formatting", "style", "clarity", "word-choice"]),
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
