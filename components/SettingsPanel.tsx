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
        className="rounded border border-gray-300 px-3 py-1 text-sm"
        aria-label="Settings"
      >
        ⚙️
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Provider</label>
          <ProviderSelect value={settings.presetId} onChange={(id) => update({ presetId: id })} />

          {isCustom && (
            <>
              <label className="mt-3 block text-xs font-semibold uppercase text-gray-500">Base URL</label>
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="https://..."
                value={settings.baseURL}
                onChange={(e) => update({ baseURL: e.target.value })}
              />
            </>
          )}

          <label className="mt-3 block text-xs font-semibold uppercase text-gray-500">API Key</label>
          <input
            type="password"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder={preset.keyUrl ? `从 ${preset.keyUrl} 获取` : "粘贴 API Key"}
            value={settings.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={settings.rememberKey}
              onChange={(e) => update({ rememberKey: e.target.checked })}
            />
            记住 Key（存到本机 localStorage）
          </label>

          <label className="mt-3 block text-xs font-semibold uppercase text-gray-500">Model</label>
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
          />

          <label className="mt-3 block text-xs font-semibold uppercase text-gray-500">Language</label>
          <select
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={settings.language}
            onChange={(e) => update({ language: e.target.value as Settings["language"] })}
          >
            <option value="auto">Auto</option>
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
      )}
    </div>
  );
}
