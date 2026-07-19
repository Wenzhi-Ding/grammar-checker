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

/** Markup / formula preservation rule — LaTeX and Markdown markers must survive correction. */
export const MARKUP_PRESERVATION_RULE = `MARKUP / FORMULA PRESERVATION — the input may contain LaTeX (e.g. "$...$", "$$...$$", "\\(...\\)", "\\[...\\]", "\\alpha", "\\beta", "\\cite{smith2020}", "\\ref{fig1}", "\\section{Intro}", "\\textbf{...}", "\\begin{equation}...\\end{equation}") or Markdown syntax (e.g. "**bold**", "*italic*", "_underline_", "# headings", "[link](url)", \`inline code\`, \`\`\`code blocks\`\`\`, "> blockquote", list markers "-", "*", "1."). You MUST preserve every such marker verbatim:
- Do NOT rewrite, "fix", expand, or translate LaTeX commands, math environments, citation keys, label names, or Macro names. "\\cite{smith2020}" stays "\\cite{smith2020}"; "$x = y$" stays "$x = y$".
- Do NOT strip, add, or alter Markdown marker characters. "**important**" stays "**important**"; a heading keeps its leading "#".
- In "original" and "suggestion", include the surrounding markup characters EXACTLY as they appear, so the frontend's substring match works and the rendered structure is unchanged. For example, to fix the prose inside "**this are** wrong", return original = "**this are**" and suggestion = "**these are**" — the "**" is preserved on both sides.
- Treat the content inside math environments ("$...$", "$$...$$", "\\(...\\)", "\\[...\\]") and inside inline/code blocks (\`...\`, \`\`\`...\`\`\`) as UNTOUCHABLE: do NOT grammar-correct, reword, or "translate" anything inside them. Only correct the natural-language prose around the markup.
- If a LaTeX/Markdown structural element (e.g. a "\\section{...}" title or link text inside "[...](url)") contains a genuine prose error, you may correct the prose inside it, but keep the surrounding command/markup characters byte-for-byte.`;

export function reasonLanguageName(lang: "en" | "zh"): string {
  return lang === "zh" ? "Simplified Chinese (简体中文)" : "English";
}

export function assembleSystem(
  sharedFraming: string,
  reasonLanguage?: "en" | "zh",
  customInstructions?: string,
): string {
  const parts = [sharedFraming, COVERAGE_RULE, FORMATTING_RULE, MARKUP_PRESERVATION_RULE, SCHEMA_DESCRIPTION, VERBATIM_RULE];
  if (reasonLanguage) {
    // Decouple explanation language from the input text's language:
    // correct the text in its own language, but write reasons in the user's chosen language.
    parts.push(
      `Write every "reason" field in ${reasonLanguageName(reasonLanguage)}, regardless of the input text's language. The corrections themselves must still match the input text's language.`,
    );
  }
  const extra = customInstructions?.trim();
  if (extra) {
    // Appended LAST, after all hard rules (schema/verbatim are contractual and always stay).
    parts.push(`ADDITIONAL INSTRUCTIONS FROM THE USER:\n${extra}`);
  }
  return parts.join("\n\n");
}

export function assembleUser(text: string): string {
  return `Text to polish:\n\n${text}`;
}