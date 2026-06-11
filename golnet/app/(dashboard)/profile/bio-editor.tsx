"use client";

import { useState } from "react";

const MAX = 200;

export function BioEditor({ currentBio }: { currentBio: string | null }) {
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(currentBio ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio: bio.trim() }),
    });
    setSaving(false);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="text-sm text-zinc-400 flex-1">
          {bio.trim()
            ? <span className="text-zinc-300">{bio}</span>
            : <span className="text-zinc-500 italic">Sem bio</span>
          }
          {saved && <span className="ml-2 text-green-400 text-xs">✓ Salvo</span>}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors shrink-0"
        >
          {bio.trim() ? "Editar bio" : "Adicionar bio"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="relative">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, MAX))}
          rows={3}
          placeholder="Conte um pouco sobre você..."
          autoFocus
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
        />
        <span className={`absolute bottom-2 right-3 text-xs ${bio.length >= MAX ? "text-red-400" : "text-zinc-600"}`}>
          {bio.length}/{MAX}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black text-sm font-semibold transition-colors"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button
          onClick={() => { setEditing(false); setBio(currentBio ?? ""); }}
          className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white text-sm transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
