// components/SettingsPanel.tsx
"use client";
import { useState } from "react";
import { PRESETS, type ProviderPreset } from "@/lib/providers/shared/presets";
import type { Settings, ProviderId } from "@/hooks/useSettings";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

const STANDARD = PRESETS.filter((p) => p.id !== "custom");

export function SettingsPanel({ settings, update }: Props) {
  const [open, setOpen] = useState(false);

  const setKey = (id: ProviderId, value: string) =>
    update({ keys: { ...settings.keys, [id]: value } });

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
          <div className="gp-settings-title">API Keys</div>

          {STANDARD.map((p: ProviderPreset) => (
            <div key={p.id} className="gp-key-row">
              <label className="gp-field-label">{p.label}</label>
              <input
                className="gp-input"
                type="password"
                placeholder={p.keyUrl ? `从 ${p.keyUrl} 获取` : "粘贴 API Key"}
                value={settings.keys[p.id]}
                onChange={(e) => setKey(p.id, e.target.value)}
              />
            </div>
          ))}

          <div className="gp-settings-divider" />
          <div className="gp-settings-title">Custom endpoint</div>
          <div className="gp-key-row">
            <label className="gp-field-label">Base URL</label>
            <input
              className="gp-input"
              placeholder="https://..."
              value={settings.customBaseURL}
              onChange={(e) => update({ customBaseURL: e.target.value })}
            />
          </div>
          <div className="gp-key-row">
            <label className="gp-field-label">Custom API Key</label>
            <input
              className="gp-input"
              type="password"
              placeholder="粘贴 API Key"
              value={settings.keys.custom}
              onChange={(e) => setKey("custom", e.target.value)}
            />
          </div>
          <div className="gp-key-row">
            <label className="gp-field-label">Custom Model</label>
            <input
              className="gp-input"
              placeholder="model name"
              value={settings.provider === "custom" ? settings.model : ""}
              onChange={(e) => update({ provider: "custom", model: e.target.value })}
            />
          </div>

          <div className="gp-settings-divider" />

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

          <label className="gp-checkbox-row">
            <input
              type="checkbox"
              checked={settings.rememberKey}
              onChange={(e) => update({ rememberKey: e.target.checked })}
            />
            记住 Keys（存到本机 localStorage）
          </label>
        </div>
      )}
    </div>
  );
}
