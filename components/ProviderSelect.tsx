// components/ProviderSelect.tsx
"use client";
import { PRESETS, type ProviderPreset } from "@/lib/providers/shared/presets";

interface Props {
  value: ProviderPreset["id"];
  onChange: (id: ProviderPreset["id"]) => void;
}

export function ProviderSelect({ value, onChange }: Props) {
  return (
    <select
      className="gp-select"
      value={value}
      onChange={(e) => onChange(e.target.value as ProviderPreset["id"])}
    >
      {PRESETS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
