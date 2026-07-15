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
