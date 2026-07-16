// components/ModelSelect.tsx
"use client";
import { useMemo } from "react";
import { getPreset, buildModelOptions, type ModelOption, type ProviderPreset } from "@/lib/providers/shared/presets";

interface Props {
  keys: Record<ProviderPreset["id"], string>;
  /** current provider + model (effective selection) */
  provider: ProviderPreset["id"];
  model: string;
  onChange: (provider: ProviderPreset["id"], model: string) => void;
}

export function ModelSelect({ keys, provider, model, onChange }: Props) {
  const options = useMemo(() => buildModelOptions(keys), [keys]);

  const groups = useMemo(() => {
    const map = new Map<ProviderPreset["id"], string[]>();
    for (const o of options) {
      if (!map.has(o.provider)) map.set(o.provider, []);
      map.get(o.provider)!.push(o.model);
    }
    return map;
  }, [options]);

  const currentValue = `${provider}::${model}`;

  return (
    <div className="gp-modelselect">
      <span className="gp-modelselect-label">Model</span>
      <select
        className="gp-modelselect-input"
        value={options.some((o: ModelOption) => `${o.provider}::${o.model}` === currentValue) ? currentValue : ""}
        disabled={options.length === 0}
        onChange={(e) => {
          const [p, ...rest] = e.target.value.split("::");
          onChange(p as ProviderPreset["id"], rest.join("::"));
        }}
      >
        {options.length === 0 && <option value="">Configure a key in ⚙️</option>}
        {[...groups.entries()].map(([p, models]) => (
          <optgroup key={p} label={getPreset(p).label}>
            {models.map((m) => (
              <option key={m} value={`${p}::${m}`}>
                {m}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
