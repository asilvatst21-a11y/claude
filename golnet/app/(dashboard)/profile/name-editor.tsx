"use client";

import { useState } from "react";

const MAX = 50;

export function NameEditor({ currentName }: { currentName: string | null }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setSaving(false);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-xl font-bold text-white">{name || "—"}</h2>
        {saved && <span className="text-green-400 text-xs">✓ Salvo</span>}
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-2 py-1 transition-colors"
        >
          Editar nome
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, MAX))}
          autoFocus
          placeholder="Seu nome"
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 w-48"
        />
        <span className={`absolute -bottom-4 right-0 text-xs ${name.length >= MAX ? "text-red-400" : "text-zinc-600"}`}>
          {name.length}/{MAX}
        </span>
      </div>
      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black text-xs font-semibold transition-colors"
      >
        {saving ? "..." : "Salvar"}
      </button>
      <button
        onClick={() => { setEditing(false); setName(currentName ?? ""); }}
        className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white text-xs transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}
