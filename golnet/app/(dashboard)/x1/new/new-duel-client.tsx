"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { teamLogo } from "@/lib/utils";

type Match = {
  id: string; homeTeam: string; awayTeam: string;
  homeTeamFlag: string | null; awayTeamFlag: string | null;
  startsAt: Date | string; status: string;
  leagueName: string | null; round: string | null;
};

type UserResult = { id: string; name: string | null; username: string | null; image: string | null; plan: string };

export function NewDuelClient({ matches }: { matches: Match[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [opponent, setOpponent] = useState<UserResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allLeagues = Array.from(new Set(matches.map((m) => m.leagueName ?? "Outros")));
  const [filterLeague, setFilterLeague] = useState<string | null>(allLeagues.length === 1 ? allLeagues[0] : null);

  const leagueMatches = filterLeague ? matches.filter((m) => (m.leagueName ?? "Outros") === filterLeague) : matches;
  const allRounds = Array.from(new Set(leagueMatches.map((m) => m.round).filter(Boolean))) as string[];
  const [filterRound, setFilterRound] = useState<string | null>(null);

  const visibleMatches = filterRound ? leagueMatches.filter((m) => m.round === filterRound) : leagueMatches;

  // Group visible matches by league
  const grouped = visibleMatches.reduce<Record<string, Match[]>>((acc, m) => {
    const key = m.leagueName ?? "Outros";
    (acc[key] ??= []).push(m);
    return acc;
  }, {});

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleSearch = (q: string) => {
    setSearchQ(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (q.length < 2) { setSearchResults([]); return; }
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        setSearchResults(await res.json());
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleCreate = async () => {
    if (selectedIds.size === 0 || !opponent) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/duels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchIds: Array.from(selectedIds), opponentId: opponent.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao criar duelo"); return; }
      router.push(`/x1/${data.id}`);
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (d: Date | string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
      " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white transition-colors">←</button>
        <h1 className="text-2xl font-bold text-white">Novo desafio X1</h1>
      </div>

      {/* Steps indicator */}
      <div className="flex gap-2 mb-8">
        {[1, 2].map((s) => (
          <div key={s} className={`flex items-center gap-2 text-sm font-medium ${step === s ? "text-green-400" : step > s ? "text-zinc-400" : "text-zinc-600"}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === s ? "bg-green-500 text-black" : step > s ? "bg-zinc-700 text-zinc-300" : "bg-zinc-800 text-zinc-600"}`}>
              {s}
            </span>
            {s === 1 ? "Selecionar jogos" : "Escolher adversário"}
            {s < 2 && <span className="text-zinc-700 ml-2">→</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Select matches */}
      {step === 1 && (
        <div>
          <p className="text-sm text-zinc-400 mb-4">
            Selecione os jogos do duelo ({selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""})
          </p>

          {/* League filter */}
          {allLeagues.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={() => { setFilterLeague(null); setFilterRound(null); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!filterLeague ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}
              >
                Todas
              </button>
              {allLeagues.map((l) => (
                <button key={l} onClick={() => { setFilterLeague(l); setFilterRound(null); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filterLeague === l ? "bg-green-500/20 border-green-500/40 text-green-400" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}

          {/* Round filter */}
          {allRounds.length > 1 && (
            <div className="mb-4">
              <select
                value={filterRound ?? ""}
                onChange={(e) => setFilterRound(e.target.value || null)}
                className="w-full max-w-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Todas as rodadas</option>
                {allRounds.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-6">
            {Object.entries(grouped).map(([league, leagueMatches]) => (
              <div key={league}>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{league}</h3>
                <div className="space-y-2">
                  {leagueMatches.map((m) => {
                    const selected = selectedIds.has(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggle(m.id)}
                        className={`w-full flex items-center justify-between bg-zinc-900 border rounded-xl px-4 py-3 transition-colors text-left ${
                          selected ? "border-green-500/50 bg-green-500/5" : "border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-green-500 border-green-500" : "border-zinc-600"}`}>
                            {selected && <span className="text-black text-xs font-bold">✓</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {m.homeTeamFlag && <img src={teamLogo(m.homeTeamFlag) ?? ""} alt="" className="w-5 h-5 object-contain" />}
                            <span className="text-sm text-white">{m.homeTeam}</span>
                            <span className="text-zinc-600 text-xs">x</span>
                            {m.awayTeamFlag && <img src={teamLogo(m.awayTeamFlag) ?? ""} alt="" className="w-5 h-5 object-contain" />}
                            <span className="text-sm text-white">{m.awayTeam}</span>
                          </div>
                        </div>
                        <span className="text-xs text-zinc-500 shrink-0 ml-2">{formatDate(m.startsAt)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={selectedIds.size === 0}
              className="px-6 py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold rounded-lg transition-colors"
            >
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Select opponent */}
      {step === 2 && (
        <div>
          <div className="mb-4">
            <p className="text-sm text-zinc-400 mb-3">Busque o adversário pelo username (apenas usuários PRO)</p>
            <input
              type="text"
              placeholder="Buscar por nome ou @username..."
              value={searchQ}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
          </div>

          {searching && <p className="text-sm text-zinc-500 mb-3">Buscando...</p>}

          {searchResults.length > 0 && !opponent && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-4">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => { setOpponent(u); setSearchResults([]); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors text-left border-b border-zinc-800/50 last:border-0"
                >
                  {u.image ? (
                    <Image src={u.image} alt="" width={36} height={36} className="rounded-full" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white">
                      {u.name?.[0] ?? "?"}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{u.name}</p>
                    {u.username && <p className="text-xs text-zinc-500">@{u.username} · ⭐ PRO</p>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {opponent && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {opponent.image ? (
                  <Image src={opponent.image} alt="" width={36} height={36} className="rounded-full" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white">
                    {opponent.name?.[0] ?? "?"}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-white">{opponent.name}</p>
                  {opponent.username && <p className="text-xs text-zinc-500">@{opponent.username}</p>}
                </div>
              </div>
              <button onClick={() => setOpponent(null)} className="text-zinc-500 hover:text-white text-xs transition-colors">
                Trocar
              </button>
            </div>
          )}

          {/* Summary */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Resumo do duelo</p>
            <p className="text-sm text-zinc-300">{selectedIds.size} jogo{selectedIds.size !== 1 ? "s" : ""} selecionado{selectedIds.size !== 1 ? "s" : ""}</p>
            <p className="text-sm text-zinc-300">Adversário: {opponent ? (opponent.name ?? `@${opponent.username}`) : "—"}</p>
            <p className="text-xs text-zinc-500 mt-2">O convite expira em 48 horas. Palpites se fecham 3 min antes de cada jogo.</p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2 mb-4">{error}</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-4 py-2.5 border border-zinc-700 text-zinc-400 hover:text-white text-sm rounded-lg transition-colors">
              ← Voltar
            </button>
            <button
              onClick={handleCreate}
              disabled={!opponent || creating}
              className="flex-1 py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold rounded-lg transition-colors"
            >
              {creating ? "Criando..." : "Enviar desafio ⚔️"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
