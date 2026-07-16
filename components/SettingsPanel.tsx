// components/SettingsPanel.tsx
"use client";
import { useState } from "react";
import { ProviderSelect } from "./ProviderSelect";
import { getPreset } from "@/lib/providers/shared/presets";
import type { Settings } from "@/hooks/useSettings";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export function SettingsPanel({ settings, update }: Props) {
  const [open, setOpen] = useState(false);
  const preset = getPreset(settings.presetId);
  const isCustom = settings.presetId === "custom";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="gp-icon-btn"
        aria-label="Settings"
        title="Settings"
      >
        ⚙️
      </button>
      {open && (
        <div className="gp-settings">
          <label className="gp-field-label">Provider</label>
          <ProviderSelect value={settings.presetId} onChange={(id) => update({ presetId: id })} />

          {isCustom && (
            <>
              <label className="gp-field-label">Base URL</label>
              <input
                className="gp-input"
                placeholder="https://..."
                value={settings.baseURL}
                onChange={(e) => update({ baseURL: e.target.value })}
              />
            </>
          )}

          <label className="gp-field-label">API Key</label>
          <input
            className="gp-input"
            type="password"
            placeholder={preset.keyUrl ? `从 ${preset.keyUrl} 获取` : "粘贴 API Key"}
            value={settings.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
          />
          <label className="gp-checkbox-row">
            <input
              type="checkbox"
              checked={settings.rememberKey}
              onChange={(e) => update({ rememberKey: e.target.checked })}
            />
            记住 Key（存到本机 localStorage）
          </label>

          <label className="gp-field-label">Model</label>
          <input
            className="gp-input"
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
          />

          <label className="gp-field-label">Language (text)</label>
          <select
            className="gp-select"
            value={settings.language}
            onChange={(e) => update({ language: e.target.value as Settings["language"] })}
          >
            <option value="auto">Auto</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>

          <label className="gp-field-label">Reason language</label>
          <select
            className="gp-select"
            value={settings.reasonLanguage}
            onChange={(e) => update({ reasonLanguage: e.target.value as Settings["reasonLanguage"] })}
          >
            <option value="auto">Auto (browser)</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
      )}
    </div>
  );
}
