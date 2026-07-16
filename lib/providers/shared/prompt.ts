// lib/providers/shared/prompt.ts

export const CORRECTION_TYPES = [
  "grammar", "spelling", "punctuation", "formatting", "style", "clarity", "word-choice",
] as const;

/** The verbatim rule — the matching engine depends on this. Every prompt MUST include it. */
export const VERBATIM_RULE = `CRITICAL RULE: The "original" field of each correction MUST be a VERBATIM copy of the exact characters from the input — including any errors, and INCLUDING any whitespace or newline ("\\n") characters. Do NOT normalize whitespace, newlines, quotes, punctuation, or casing in "original": the frontend locates each correction by exact substring match, so any normalization will make it un-findable. Return corrections in the order they appear in the text.`;

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
If there is nothing to correct, return {"corrections": []}.`;

/** Coverage directive — push for thorough, diverse, comprehensive correction. */
export const COVERAGE_RULE = `Be thorough and comprehensive: review the ENTIRE text sentence by sentence and surface every real issue you can find, spanning ALL applicable types. Do NOT fixate on a single category of error, and do NOT stay silent on a genuine problem just because it is minor. At the same time, only flag real issues — skip trivial or purely-preferential substitutions that do not clearly improve the text.`;

/** Formatting / line-break rule — forceful, with an explicit newline example. */
export const FORMATTING_RULE = `FORMATTING / LINE BREAKS — check these carefully and FIX them (type "formatting"):
- A hard line break that splits a single sentence, clause, or word across two lines is usually inappropriate — flag it.
- A missing blank line where a new paragraph/topic starts, or an extra blank line mid-paragraph — flag it.
- Doubled spaces, stray trailing spaces, missing/inconsistent spacing after punctuation.
CRITICAL for these fixes: "original" MUST contain the LITERAL newline ("\\n") exactly as it appears in the input. For example, if the input has a sentence broken as:

  This sentence is
  broken mid-way.

return original = "is\\nbroken mid-way" (with a literal "\\n") and suggestion = "is broken mid-way". Do NOT replace the newline with a space inside "original", or the frontend's substring match will fail and the fix will be dropped.`;

export function reasonLanguageName(lang: "en" | "zh"): string {
  return lang === "zh" ? "Simplified Chinese (简体中文)" : "English";
}

export function assembleSystem(sharedFraming: string, reasonLanguage?: "en" | "zh"): string {
  const parts = [sharedFraming, COVERAGE_RULE, FORMATTING_RULE, SCHEMA_DESCRIPTION, VERBATIM_RULE];
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