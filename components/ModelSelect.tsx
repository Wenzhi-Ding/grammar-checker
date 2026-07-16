// components/ModelSelect.tsx
"use client";
import { useMemo } from "react";
import { buildModelOptions, type ProviderEntry } from "@/lib/providers/shared/presets";

interface Props {
  providers: ProviderEntry[];
  /** active provider + model (effective selection) */
  providerId: string;
  model: string;
  onChange: (providerId: string, model: string) => void;
}

export function ModelSelect({ providers, providerId, model, onChange }: Props) {
  const options = useMemo(() => buildModelOptions(providers), [providers]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; models: string[] }>();
    for (const o of options) {
      const key = o.provider.id;
      if (!map.has(key)) map.set(key, { label: o.provider.label, models: [] });
      map.get(key)!.models.push(o.model);
    }
    return map;
  }, [options]);

  const currentValue = `${providerId}::${model}`;
  const valueMatches = options.some((o) => `${o.provider.id}::${o.model}` === currentValue);

  return (
    <div className="gp-modelselect">
      <span className="gp-modelselect-label">Model</span>
      <select
        className="gp-modelselect-input"
        value={valueMatches ? currentValue : ""}
        disabled={options.length === 0}
        onChange={(e) => {
          const [pid, ...rest] = e.target.value.split("::");
          onChange(pid, rest.join("::"));
        }}
      >
        {options.length === 0 && <option value="">Configure a key in ⚙️</option>}
        {[...groups.entries()].map(([pid, g]) => (
          <optgroup key={pid} label={g.label}>
            {g.models.map((m) => (
              <option key={m} value={`${pid}::${m}`}>
                {m}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
