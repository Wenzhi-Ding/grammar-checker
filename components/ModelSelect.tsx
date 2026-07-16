// components/ModelSelect.tsx
"use client";
import { type ProviderPreset } from "@/lib/providers/shared/presets";

const SUGGESTED: Record<ProviderPreset["id"], string[]> = {
  deepseek: ["deepseek-v4-pro", "deepseek-v4", "deepseek-reasoner"],
  kimi: ["kimi-k2.7-code", "moonshot-v1-8k", "moonshot-v1-32k"],
  glm: ["glm-5.2", "glm-4-flash", "glm-4"],
  gemini: ["gemini-3.5-flash", "gemini-3.5-pro", "gemini-2.5-flash"],
  custom: [],
};

interface Props {
  presetId: ProviderPreset["id"];
  model: string;
  onChange: (model: string) => void;
}

export function ModelSelect({ presetId, model, onChange }: Props) {
  const listId = `gp-models-${presetId}`;
  return (
    <div className="gp-modelselect">
      <span className="gp-modelselect-label">Model</span>
      <input
        className="gp-modelselect-input"
        list={listId}
        value={model}
        placeholder="model name"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {SUGGESTED[presetId].map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}
