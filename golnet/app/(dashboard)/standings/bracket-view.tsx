"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { teamLogo } from "@/lib/utils";
import type { Match, Prediction } from "@/types";

type MatchWithPrediction = Match & { predictions: Prediction[] };

const KNOCKOUT_STAGES = [
  { stage: "ROUND_OF_32", label: "Rodada de 32", max: 16 },
  { stage: "ROUND_OF_16", label: "Oitavas", max: 8 },
  { stage: "QUARTER_FINAL", label: "Quartas", max: 4 },
  { stage: "SEMI_FINAL", label: "Semifinal", max: 2 },
  { stage: "FINAL", label: "Final", max: 1 },
];

const resultBadge: Record<string, { bg: string; label: string }> = {
  EXACT_SCORE: { bg: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40", label: "Placar exato" },
  CORRECT_RESULT_AND_DIFF: { bg: "bg-green-500/20 text-green-400 border-green-500/40", label: "Resultado + saldo" },
  CORRECT_WINNER: { bg: "bg-blue-500/20 text-blue-400 border-blue-500/40", label: "Vencedor" },
  CORRECT_DRAW: { bg: "bg-blue-500/20 text-blue-400 border-blue-500/40", label: "Empate" },
  WRONG: { bg: "bg-red-500/20 text-red-400 border-red-500/40", label: "Errou" },
};

function KnockoutCard({ match }: { match?: MatchWithPrediction }) {
  if (!match) {
    return (
      <div className="bg-zinc-900 border border-zinc-700/40 rounded-lg p-3 min-w-[180px] opacity-40">
        <div className="flex items-center gap-2 py-0.5">
          <div className="w-5 h-5 rounded bg-zinc-800 shrink-0" />
          <span className="text-zinc-600 text-xs">A definir</span>
        </div>
        <div className="flex items-center gap-2 py-0.5 mt-1">
          <div className="w-5 h-5 rounded bg-zinc-800 shrink-0" />
          <span className="text-zinc-600 text-xs">A definir</span>
        </div>
      </div>
    );
  }

  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";
  const pred = match.predictions[0];
  const badge = pred?.result ? resultBadge[pred.result] : null;

  const homeWon = isFinished && match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
  const awayWon = isFinished && match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore;

  return (
    <div className={`bg-zinc-900 border rounded-lg p-3 min-w-[180px] ${isLive ? "border-green-500/50" : "border-zinc-700"}`}>
      {/* Home */}
      <div className={`flex items-center gap-2 py-0.5 ${isFinished && homeWon ? "opacity-100" : isFinished ? "opacity-50" : ""}`}>
        {match.homeTeamFlag
          ? <img src={teamLogo(match.homeTeamFlag)} alt="" className="w-5 h-5 object-contain shrink-0" />
          : <div className="w-5 h-5 rounded bg-zinc-700 shrink-0" />
        }
        <span className={`text-xs font-medium flex-1 truncate ${homeWon ? "text-white" : "text-zinc-300"}`}>{match.homeTeam}</span>
        {(isFinished || isLive) && match.homeScore !== null && (
          <span className={`font-bold text-xs shrink-0 ${homeWon ? "text-white" : "text-zinc-400"}`}>{match.homeScore}</span>
        )}
      </div>

      {/* Away */}
      <div className={`flex items-center gap-2 py-0.5 mt-1 ${isFinished && awayWon ? "opacity-100" : isFinished ? "opacity-50" : ""}`}>
        {match.awayTeamFlag
          ? <img src={teamLogo(match.awayTeamFlag)} alt="" className="w-5 h-5 object-contain shrink-0" />
          : <div className="w-5 h-5 rounded bg-zinc-700 shrink-0" />
        }
        <span className={`text-xs font-medium flex-1 truncate ${awayWon ? "text-white" : "text-zinc-300"}`}>{match.awayTeam}</span>
        {(isFinished || isLive) && match.awayScore !== null && (
          <span className={`font-bold text-xs shrink-0 ${awayWon ? "text-white" : "text-zinc-400"}`}>{match.awayScore}</span>
        )}
      </div>

      {/* Date or live */}
      {!isFinished && (
        <div className={`text-xs mt-1.5 text-center ${isLive ? "text-green-400" : "text-zinc-500"}`}>
          {isLive ? "🟢 Ao vivo" : format(new Date(match.startsAt), "dd/MM HH:mm", { locale: ptBR })}
        </div>
      )}

      {/* Prediction */}
      {pred && (
        <div className="mt-1.5 pt-1.5 border-t border-zinc-800 flex items-center justify-between gap-1 text-xs">
          <span className="text-zinc-500">{pred.homeScore}–{pred.awayScore}</span>
          {badge && <span className={`px-1 py-0.5 rounded border font-medium ${badge.bg}`}>{badge.label}</span>}
        </div>
      )}
    </div>
  );
}

export function BracketView({ leagueId, season }: { leagueId: number; season: number }) {
  const [matches, setMatches] = useState<MatchWithPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/matches?leagueId=${leagueId}&season=${season}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setMatches(d.filter((m) => m.stage !== "GROUP"));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId, season]);

  if (loading) return <div className="text-zinc-500 text-center py-16 animate-pulse">Carregando chaveamento...</div>;

  const stageMap = new Map<string, MatchWithPrediction[]>();
  for (const { stage } of KNOCKOUT_STAGES) {
    stageMap.set(stage, matches.filter((m) => m.stage === stage));
  }

  // Show all stages up to and including the last one with matches; fill rest with TBD
  const lastWithMatches = [...KNOCKOUT_STAGES].reverse().findIndex(({ stage }) => (stageMap.get(stage) ?? []).length > 0);
  const visibleStages = lastWithMatches === -1
    ? KNOCKOUT_STAGES
    : KNOCKOUT_STAGES.slice(0, KNOCKOUT_STAGES.length - lastWithMatches);

  return (
    <div>
      {matches.length === 0 && (
        <div className="text-center text-zinc-500 py-16 bg-zinc-900 border border-zinc-800 rounded-xl">
          <p className="text-4xl mb-3">⏳</p>
          <p className="text-zinc-300 font-medium">Mata-mata ainda não definido</p>
          <p className="text-sm mt-1">O chaveamento será preenchido conforme as seleções se classificam.</p>
        </div>
      )}

      {matches.length > 0 && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {visibleStages.map(({ stage, label, max }) => {
              const sm = stageMap.get(stage) ?? [];
              const slots = Array.from({ length: max }, (_, i) => sm[i]);
              return (
                <div key={stage} className="flex flex-col" style={{ minWidth: 190 }}>
                  <div className="text-center mb-3">
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">{label}</span>
                    <div className="text-xs text-zinc-600 mt-0.5">{sm.length}/{max} definidos</div>
                  </div>
                  <div className="flex flex-col gap-2 justify-around flex-1">
                    {slots.map((match, i) => (
                      <KnockoutCard key={match?.id ?? i} match={match} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
