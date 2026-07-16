// lib/providers/shared/schema.ts

export type CorrectionType =
  | "grammar"
  | "spelling"
  | "punctuation"
  | "formatting"
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
  /** Language the LLM writes the `reason` field in (independent of the input text's language). */
  reasonLanguage?: "en" | "zh";
  /** User-provided extra instructions appended to the system prompt (never replaces hard rules). */
  customInstructions?: string;
}

export interface Provider {
  readonly id: string;
  polish(text: string, config: ProviderConfig): Promise<PolishResult>;
}
