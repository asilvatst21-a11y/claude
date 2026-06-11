"use client";

import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { teamLogo } from "@/lib/utils";
import type { Match, Prediction } from "@/types";

type MatchWithPrediction = Match & { predictions: Prediction[] };

const resultBadge: Record<string, { bg: string; label: string }> = {
  EXACT_SCORE: { bg: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40", label: "Placar exato" },
  CORRECT_RESULT_AND_DIFF: { bg: "bg-green-500/20 text-green-400 border-green-500/40", label: "Resultado + saldo" },
  CORRECT_WINNER: { bg: "bg-blue-500/20 text-blue-400 border-blue-500/40", label: "Vencedor" },
  CORRECT_DRAW: { bg: "bg-blue-500/20 text-blue-400 border-blue-500/40", label: "Empate" },
  WRONG: { bg: "bg-red-500/20 text-red-400 border-red-500/40", label: "Errou" },
};

function MatchCard({ match }: { match: MatchWithPrediction }) {
  const pred = match.predictions[0];
  const badge = pred?.result ? resultBadge[pred.result] : null;
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";

  return (
    <div className={`bg-zinc-900 border rounded-xl p-4 flex flex-col gap-2 ${isLive ? "border-green-500/50" : "border-zinc-800"}`}>
      {/* Group label */}
      {match.group && (
        <div className="text-xs text-zinc-500">Grupo {match.group}</div>
      )}

      {/* Teams + score */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex flex-col items-center gap-1">
          {match.homeTeamFlag && (
            <img src={teamLogo(match.homeTeamFlag)} alt="" className="w-8 h-8 object-contain" />
          )}
          <span className="text-xs font-medium text-white text-center leading-tight">{match.homeTeam}</span>
        </div>

        <div className="flex flex-col items-center gap-0.5 shrink-0">
          {(isFinished || isLive) && match.homeScore !== null ? (
            <span className={`text-xl font-bold ${isLive ? "text-green-400" : "text-white"}`}>
              {match.homeScore} — {match.awayScore}
            </span>
          ) : (
            <span className="text-xs text-zinc-500 text-center">
              {format(new Date(match.startsAt), "dd/MM", { locale: ptBR })}<br />
              {format(new Date(match.startsAt), "HH:mm", { locale: ptBR })}
            </span>
          )}
          {isLive && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
              Ao vivo
            </span>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center gap-1">
          {match.awayTeamFlag && (
            <img src={teamLogo(match.awayTeamFlag)} alt="" className="w-8 h-8 object-contain" />
          )}
          <span className="text-xs font-medium text-white text-center leading-tight">{match.awayTeam}</span>
        </div>
      </div>

      {/* Prediction */}
      {pred && (
        <div className="border-t border-zinc-800 pt-2 flex items-center justify-between text-xs">
          <span className="text-zinc-400">Palpite: {pred.homeScore} × {pred.awayScore}</span>
          {badge ? (
            <span className={`px-1.5 py-0.5 rounded border font-medium ${badge.bg}`}>{badge.label}</span>
          ) : (
            <span className="text-zinc-600">Aguardando</span>
          )}
        </div>
      )}
    </div>
  );
}

function getCurrentRoundIndex(rounds: string[], byRound: Record<string, MatchWithPrediction[]>) {
  for (let i = 0; i < rounds.length; i++) {
    if (byRound[rounds[i]].some((m) => m.status === "LIVE")) return i;
  }
  for (let i = 0; i < rounds.length; i++) {
    if (byRound[rounds[i]].some((m) => m.status === "SCHEDULED")) return i;
  }
  return rounds.length - 1;
}

export function MatchesView({ leagueId, season }: { leagueId: number; season: number }) {
  const [matches, setMatches] = useState<MatchWithPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setSelectedRound(null);
    fetch(`/api/matches?leagueId=${leagueId}&season=${season}`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setMatches(d.filter((m) => m.stage === "GROUP")); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId, season]);

  const { rounds, byRound } = useMemo(() => {
    const map: Record<string, MatchWithPrediction[]> = {};
    for (const m of matches) {
      const key = m.round ?? format(new Date(m.startsAt), "dd/MM/yyyy", { locale: ptBR });
      if (!map[key]) map[key] = [];
      map[key].push(m);
    }
    const sorted = Object.keys(map).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
    return { rounds: sorted, byRound: map };
  }, [matches]);

  useEffect(() => {
    if (rounds.length === 0 || selectedRound) return;
    setSelectedRound(rounds[getCurrentRoundIndex(rounds, byRound)]);
  }, [rounds, byRound, selectedRound]);

  if (loading) return <div className="text-zinc-500 text-center py-16 animate-pulse">Carregando jogos...</div>;

  if (matches.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-20">
        <p className="text-4xl mb-4">⚽</p>
        <p>Nenhum jogo importado para esta competição.</p>
      </div>
    );
  }

  const currentIdx = selectedRound ? rounds.indexOf(selectedRound) : 0;
  const roundMatches = selectedRound ? (byRound[selectedRound] ?? []) : [];
  const allDone = roundMatches.every((m) => ["FINISHED", "CANCELLED", "POSTPONED"].includes(m.status));
  const hasLive = roundMatches.some((m) => m.status === "LIVE");
  const predicted = roundMatches.filter((m) => m.predictions.length > 0).length;

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
        <select
          value={selectedRound ?? ""}
          onChange={(e) => setSelectedRound(e.target.value)}
          className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          {rounds.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button
          onClick={() => currentIdx < rounds.length - 1 && setSelectedRound(rounds[currentIdx + 1])}
          disabled={currentIdx === rounds.length - 1}
          className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
        >
          →
        </button>
      </div>

      {/* Round status */}
      <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
        <span>
          {hasLive ? "🟢 Ao vivo" : allDone ? "✓ Encerrada" : "⏳ Aberta para palpites"}
        </span>
        <span>{predicted}/{roundMatches.length} palpites enviados</span>
      </div>

      {/* Match grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {roundMatches.map((m) => <MatchCard key={m.id} match={m} />)}
      </div>
    </div>
  );
}
