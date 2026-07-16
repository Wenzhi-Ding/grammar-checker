// components/SettingsPanel.tsx
"use client";
import { useState } from "react";
import { newCustomProvider, type ProviderEntry, type AdapterKind } from "@/lib/providers/shared/presets";
import { SettingsIcon } from "@/components/Icons";
import type { Settings } from "@/hooks/useSettings";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export function SettingsPanel({ settings, update }: Props) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string>(settings.selectedProviderId);

  const editing = settings.providers.find((p) => p.id === editId) ?? settings.providers[0];

  const patchProvider = (id: string, patch: Partial<ProviderEntry>) =>
    update({ providers: settings.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  const addCustom = () => {
    const p = newCustomProvider();
    update({ providers: [...settings.providers, p] });
    setEditId(p.id);
  };

  const removeProvider = (id: string) => {
    const remaining = settings.providers.filter((p) => p.id !== id);
    update({ providers: remaining });
    if (editId === id) setEditId(remaining[0]?.id ?? "");
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="gp-icon-btn"
        aria-label="Settings"
        title="Settings"
      >
        <SettingsIcon />
      </button>
      {open && (
        <div className="gp-settings">
          <div className="gp-settings-row">
            <select className="gp-select" value={editId} onChange={(e) => setEditId(e.target.value)}>
              {settings.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {!p.builtin ? " (custom)" : ""}
                </option>
              ))}
            </select>
            <button className="gp-btn-mini" onClick={addCustom} title="Add a custom provider">
              + Add
            </button>
            {editing && !editing.builtin && (
              <button className="gp-btn-mini gp-btn-danger" onClick={() => removeProvider(editing.id)} title="Delete">
                ✕
              </button>
            )}
          </div>

          {!editing?.builtin && (
            <>
              <label className="gp-field-label">Name</label>
              <input
                className="gp-input"
                value={editing.label}
                onChange={(e) => patchProvider(editing.id, { label: e.target.value })}
              />
              <label className="gp-field-label">API type</label>
              <select
                className="gp-select"
                value={editing.adapter}
                onChange={(e) => patchProvider(editing.id, { adapter: e.target.value as AdapterKind })}
              >
                <option value="openai-compatible">OpenAI-compatible</option>
                <option value="gemini">Gemini</option>
              </select>
            </>
          )}

          <label className="gp-field-label">
            Base URL{editing?.adapter === "gemini" ? " (n/a for Gemini)" : ""}
          </label>
          <input
            className="gp-input"
            value={editing?.baseURL ?? ""}
            disabled={editing?.adapter === "gemini"}
            placeholder="https://..."
            onChange={(e) => patchProvider(editing.id, { baseURL: e.target.value })}
          />

          <label className="gp-field-label">API Key</label>
          <input
            className="gp-input"
            type="password"
            value={editing?.apiKey ?? ""}
            placeholder={editing?.keyUrl ? `从 ${editing.keyUrl} 获取` : "粘贴 API Key"}
            onChange={(e) => patchProvider(editing.id, { apiKey: e.target.value })}
          />

          <label className="gp-field-label">Models (one per line)</label>
          <textarea
            className="gp-input gp-models-area"
            value={editing?.models.join("\n") ?? ""}
            onChange={(e) =>
              patchProvider(editing.id, {
                models: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
              })
            }
          />

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
        </div>
      )}
    </div>
  );
}
