"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MatchCard } from "@/components/predictions/match-card";
import { OtherPredictionsList } from "@/components/predictions/other-predictions-list";
import type { Match, Prediction, OtherPrediction } from "@/types";

type MatchWithPred = Match & { predictions: Prediction[]; otherPredictions: OtherPrediction[] };

function getCurrentRoundIndex(rounds: string[], matchesByRound: Record<string, MatchWithPred[]>): number {
  // Priority 1: round with a LIVE match
  for (let i = 0; i < rounds.length; i++) {
    if (matchesByRound[rounds[i]].some((m) => m.status === "LIVE")) return i;
  }
  // Priority 2: round with the earliest SCHEDULED match
  for (let i = 0; i < rounds.length; i++) {
    if (matchesByRound[rounds[i]].some((m) => m.status === "SCHEDULED")) return i;
  }
  // Fallback: last round
  return rounds.length - 1;
}

export function LeagueMatches({ leagueId }: { leagueId: string }) {
  const [matches, setMatches] = useState<MatchWithPred[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leagues/${leagueId}/matches`);
      const data = await res.json();
      if (Array.isArray(data)) setMatches(data.map((m: MatchWithPred) => ({ ...m, otherPredictions: m.otherPredictions ?? [] })));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => { load(); }, [load]);

  // Group by round (null round → use date as key)
  const { rounds, matchesByRound } = useMemo(() => {
    const byRound: Record<string, MatchWithPred[]> = {};
    for (const m of matches) {
      const key = m.round ?? format(new Date(m.startsAt), "dd/MM/yyyy", { locale: ptBR });
      if (!byRound[key]) byRound[key] = [];
      byRound[key].push(m);
    }
    // Sort rounds: try natural sort (Rodada 1, Rodada 2…), fallback to insertion order
    const sorted = Object.keys(byRound).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
    return { rounds: sorted, matchesByRound: byRound };
  }, [matches]);

  // Set default round on first load
  useEffect(() => {
    if (rounds.length === 0 || selectedRound) return;
    const idx = getCurrentRoundIndex(rounds, matchesByRound);
    setSelectedRound(rounds[idx]);
  }, [rounds, matchesByRound, selectedRound]);

  if (loading) {
    return <div className="text-zinc-500 text-center py-10">Carregando jogos...</div>;
  }

  if (matches.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-zinc-500">
        <p className="text-3xl mb-3">⚽</p>
        <p>Nenhum jogo encontrado para esta liga.</p>
        <p className="text-sm mt-1 text-zinc-600">Configure uma competição ao criar a liga para ver os jogos aqui.</p>
      </div>
    );
  }

  const currentIdx = selectedRound ? rounds.indexOf(selectedRound) : 0;
  const pastRounds = rounds.filter((r) =>
    matchesByRound[r].every((m) => m.status === "FINISHED" || m.status === "CANCELLED" || m.status === "POSTPONED")
  );
  const activeRounds = rounds.filter((r) => !pastRounds.includes(r));

  const roundMatches = selectedRound ? (matchesByRound[selectedRound] ?? []) : [];

  return (
    <div className="space-y-4">
      {/* Round navigator */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => currentIdx > 0 && setSelectedRound(rounds[currentIdx - 1])}
          disabled={currentIdx === 0}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
        >
          ←
        </button>

        <div className="flex-1">
          <select
            value={selectedRound ?? ""}
            onChange={(e) => setSelectedRound(e.target.value)}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {activeRounds.length > 0 && (
              <optgroup label="Rodadas abertas">
                {activeRounds.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </optgroup>
            )}
            {pastRounds.length > 0 && (
              <optgroup label="Histórico">
                {pastRounds.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <button
          onClick={() => currentIdx < rounds.length - 1 && setSelectedRound(rounds[currentIdx + 1])}
          disabled={currentIdx === rounds.length - 1}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
        >
          →
        </button>
      </div>

      {/* Round status badge */}
      {selectedRound && (() => {
        const ms = matchesByRound[selectedRound];
        const hasLive = ms.some((m) => m.status === "LIVE");
        const allDone = ms.every((m) => ["FINISHED", "CANCELLED", "POSTPONED"].includes(m.status));
        const hasPending = ms.some((m) => m.status === "SCHEDULED");
        const predicted = ms.filter((m) => m.predictions.length > 0).length;
        return (
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>
              {hasLive ? "🟢 Ao vivo" : allDone ? "✓ Encerrada" : hasPending ? "⏳ Aberta para palpites" : ""}
            </span>
            <span>
              {predicted}/{ms.length} palpites enviados
            </span>
          </div>
        );
      })()}

      {/* Match cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {roundMatches.map((match) => (
          <div key={match.id} className="flex flex-col gap-2">
            <MatchCard match={match} onSaved={load} />
            {(match.status === "LIVE" || match.status === "FINISHED") && match.otherPredictions.length > 0 && (
              <OtherPredictionsList predictions={match.otherPredictions} />
            )}
          </div>
        ))}
      </div>

      {/* History summary */}
      {pastRounds.length > 0 && !pastRounds.includes(selectedRound ?? "") && (
        <div className="border-t border-zinc-800 pt-4">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-2"
          >
            <span>{showHistory ? "▲" : "▼"}</span>
            Histórico ({pastRounds.length} rodada{pastRounds.length > 1 ? "s" : ""} encerrada{pastRounds.length > 1 ? "s" : ""})
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              {pastRounds.map((r) => {
                const ms = matchesByRound[r];
                const pts = ms.reduce((sum, m) => {
                  const pred = m.predictions[0];
                  return sum + (pred ? (pred.points ?? 0) + (pred.bonusPoints ?? 0) : 0);
                }, 0);
                return (
                  <button
                    key={r}
                    onClick={() => setSelectedRound(r)}
                    className="w-full flex items-center justify-between bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl px-4 py-3 text-sm transition-colors"
                  >
                    <span className="text-zinc-300">{r}</span>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span>{ms.length} jogo{ms.length > 1 ? "s" : ""}</span>
                      {pts > 0 && <span className="text-green-400 font-semibold">+{pts} pts</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
