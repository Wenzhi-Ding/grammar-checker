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

/**
 * The model's output could not be parsed into a PolishResult — either invalid
 * JSON or a schema mismatch. Distinct type so toPolishError can tell the user
 * this is a format failure (retry / stronger model), not a network problem.
 */
export class PolishParseError extends Error {
  readonly excerpt: string;
  constructor(raw: string, cause: unknown) {
    super("model output is not valid structured JSON");
    this.name = "PolishParseError";
    this.excerpt = raw.trim().slice(0, 200);
    this.cause = cause;
  }
}

export function parsePolishResult(raw: string): PolishResult {
  try {
    const json = JSON.parse(raw);
    return PolishResultSchema.parse(json) as PolishResult;
  } catch (err) {
    if (err instanceof PolishParseError) throw err;
    throw new PolishParseError(raw, err);
  }
}
