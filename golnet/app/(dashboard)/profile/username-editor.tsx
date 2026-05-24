"use client";

import { useState } from "react";

const MAX = 20;
const VALID = /^[a-zA-Z0-9_]+$/;

export function UsernameEditor({ currentUsername }: { currentUsername: string | null }) {
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(currentUsername ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) { setError("Mínimo 3 caracteres"); return; }
    if (!VALID.test(trimmed)) { setError("Apenas letras, números e _"); return; }

    setSaving(true);
    setError(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: trimmed }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Erro ao salvar");
      return;
    }

    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-zinc-400 text-sm">@{username || "—"}</p>
        {saved && <span className="text-green-400 text-xs">✓ Salvo</span>}
        <button
          onClick={() => { setEditing(true); setError(null); }}
          className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-2 py-1 transition-colors"
        >
          Trocar @username
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">@</span>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.slice(0, MAX));
              setError(null);
            }}
            autoFocus
            placeholder="username"
            className="bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 w-48"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !username.trim()}
          className="px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black text-xs font-semibold transition-colors"
        >
          {saving ? "..." : "Salvar"}
        </button>
        <button
          onClick={() => { setEditing(false); setUsername(currentUsername ?? ""); setError(null); }}
          className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white text-xs transition-colors"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
