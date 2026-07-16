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

export function reasonLanguageName(lang: "en" | "zh"): string {
  return lang === "zh" ? "Simplified Chinese (简体中文)" : "English";
}

export function assembleSystem(sharedFraming: string, reasonLanguage?: "en" | "zh"): string {
  const parts = [sharedFraming, SCHEMA_DESCRIPTION, VERBATIM_RULE];
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
