"use client";

import { useState } from "react";
import { BRAZIL_STATES, getCitiesByState } from "@/lib/cities";

const OTHER_CITY = "__other__";

export function CityEditor({ currentState, currentCity }: { currentState: string | null; currentCity: string | null }) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState(currentState ?? "");
  const [citySelect, setCitySelect] = useState(currentCity ?? "");
  const [customCity, setCustomCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const cities = getCitiesByState(state);
  const isOther = citySelect === OTHER_CITY;
  const finalCity = isOther ? customCity : citySelect;

  const handleStateChange = (uf: string) => {
    setState(uf);
    setCitySelect("");
    setCustomCity("");
  };

  const handleSave = async () => {
    if (!state || !finalCity) return;
    setSaving(true);
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, city: finalCity }),
    });
    setSaving(false);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const selectClass = "flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50";

  if (!editing) {
    return (
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-400">
          {currentCity && currentState
            ? <span>📍 {currentCity} — {currentState}</span>
            : <span className="text-zinc-500">Cidade não informada</span>
          }
          {saved && <span className="ml-2 text-green-400 text-xs">✓ Salvo</span>}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          {currentCity ? "Alterar cidade" : "Informar cidade"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <select
          className={selectClass}
          value={state}
          onChange={(e) => handleStateChange(e.target.value)}
        >
          <option value="">Estado</option>
          {BRAZIL_STATES.map((s) => (
            <option key={s.uf} value={s.uf}>{s.uf} — {s.name}</option>
          ))}
        </select>
        <select
          className={selectClass}
          value={citySelect}
          disabled={!state}
          onChange={(e) => { setCitySelect(e.target.value); setCustomCity(""); }}
        >
          <option value="">{state ? "Cidade" : "Selecione o estado"}</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          {state && <option value={OTHER_CITY}>Não encontrei minha cidade...</option>}
        </select>
      </div>

      {isOther && (
        <input
          type="text"
          placeholder="Digite o nome da sua cidade"
          value={customCity}
          onChange={(e) => setCustomCity(e.target.value)}
          className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          autoFocus
        />
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!state || !finalCity || saving}
          className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black text-sm font-semibold transition-colors"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button
          onClick={() => { setEditing(false); setState(currentState ?? ""); setCitySelect(currentCity ?? ""); setCustomCity(""); }}
          className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white text-sm transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
