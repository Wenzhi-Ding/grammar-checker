// lib/providers/shared/lang.ts

const CJK = /[\u3400-\u9FFF\uF900-\uFAFF]/g;

export function detect(text: string): "en" | "zh" {
  if (!text) return "en";
  const cjk = (text.match(CJK) ?? []).length;
  const ratio = cjk / text.length;
  return ratio > 0.15 ? "zh" : "en";
}
