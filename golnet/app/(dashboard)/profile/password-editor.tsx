"use client";

import { useState } from "react";

export function PasswordEditor({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!hasPassword) return null;

  const handleSave = async () => {
    setError(null);
    if (next.length < 8) { setError("Nova senha deve ter pelo menos 8 caracteres"); return; }
    if (next !== confirm) { setError("As senhas não coincidem"); return; }
    setSaving(true);
    const res = await fetch("/api/profile/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setDone(true);
      setOpen(false);
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => setDone(false), 3000);
    } else {
      setError(data.error ?? "Erro ao alterar senha");
    }
  };

  if (!open) {
    return (
      <div className="flex items-center justify-between py-3 border-t border-zinc-800">
        <div>
          <p className="text-sm text-white font-medium">Senha</p>
          {done && <p className="text-xs text-green-400">✓ Senha alterada com sucesso</p>}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          Alterar senha
        </button>
      </div>
    );
  }

  return (
    <div className="py-3 border-t border-zinc-800">
      <p className="text-sm font-medium text-white mb-3">Alterar senha</p>
      <div className="flex flex-col gap-2">
        {[
          { label: "Senha atual", value: current, set: setCurrent },
          { label: "Nova senha", value: next, set: setNext },
          { label: "Confirmar nova senha", value: confirm, set: setConfirm },
        ].map(({ label, value, set }) => (
          <div key={label}>
            <label className="text-xs text-zinc-500 mb-1 block">{label}</label>
            <input
              type="password"
              value={value}
              onChange={(e) => set(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        ))}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 mt-1">
          <button
            onClick={handleSave}
            disabled={saving || !current || !next || !confirm}
            className="px-4 py-2 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          <button
            onClick={() => { setOpen(false); setError(null); setCurrent(""); setNext(""); setConfirm(""); }}
            className="px-4 py-2 border border-zinc-700 text-zinc-400 hover:text-white text-sm rounded-lg transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
