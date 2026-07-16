// lib/providers/shared/prompt.ts

export const CORRECTION_TYPES = [
  "grammar", "spelling", "punctuation", "formatting", "style", "clarity", "word-choice",
] as const;

/** The verbatim rule — the matching engine depends on this. Every prompt MUST include it. */
export const VERBATIM_RULE = `CRITICAL RULE: The "original" field of each correction MUST be a VERBATIM copy of the exact characters from the input, including any errors and any whitespace/newline characters. Do NOT normalize whitespace, quotes, punctuation, or casing in "original". The frontend locates each correction by exact substring match. Return corrections in the order they appear in the text.`;

export const SCHEMA_DESCRIPTION = `Return ONLY a JSON object of this exact shape (no prose, no markdown fences):
{
  "corrections": [
    {
      "original": "<verbatim substring of the input>",
      "suggestion": "<replacement, or empty string to delete>",
      "type": "grammar" | "spelling" | "punctuation" | "formatting" | "style" | "clarity" | "word-choice",
      "reason": "<one short sentence explaining the change>",
      "severity": "info" | "minor" | "major"
    }
  ]
}
If there is nothing to correct, return {"corrections": []}.

The "formatting" type covers whitespace/line-layout issues: an inappropriate line break (a word, clause, or quote broken mid-way across a line), a missing or extra blank line between paragraphs, doubled spaces, or stray whitespace. For such fixes, "original" must contain the exact whitespace/newline characters to be replaced.`;

/** Coverage directive — push for thorough, diverse, comprehensive correction. */
export const COVERAGE_RULE = `Be thorough and comprehensive: review the ENTIRE text sentence by sentence and surface every real issue you can find, spanning ALL applicable types. Do NOT fixate on a single category of error, and do NOT stay silent on a genuine problem just because it is minor. At the same time, only flag real issues — skip trivial or purely-preferential substitutions that do not clearly improve the text.`;

export function reasonLanguageName(lang: "en" | "zh"): string {
  return lang === "zh" ? "Simplified Chinese (简体中文)" : "English";
}

export function assembleSystem(sharedFraming: string, reasonLanguage?: "en" | "zh"): string {
  const parts = [sharedFraming, COVERAGE_RULE, SCHEMA_DESCRIPTION, VERBATIM_RULE];
  if (reasonLanguage) {
    // Decouple explanation language from the input text's language:
    // correct the text in its own language, but write reasons in the user's chosen language.
    parts.push(
      `Write every "reason" field in ${reasonLanguageName(reasonLanguage)}, regardless of the input text's language. The corrections themselves must still match the input text's language.`,
    );
  }
  return parts.join("\n\n");
}

export function assembleUser(text: string): string {
  return `Text to polish:\n\n${text}`;
}
