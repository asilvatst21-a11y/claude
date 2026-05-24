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

function GroupMatchCard({ match }: { match: MatchWithPrediction }) {
  const pred = match.predictions[0];
  const badge = pred?.result ? resultBadge[pred.result] : null;
  const isFinished = match.status === "FINISHED";

  return (
    <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3 text-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          {match.homeTeamFlag && (
            <img src={teamLogo(match.homeTeamFlag)} alt="" className="w-5 h-5 object-contain shrink-0" />
          )}
          <span className="text-white font-medium truncate">{match.homeTeam}</span>
        </div>
        <div className="shrink-0 text-center min-w-[60px]">
          {isFinished && match.homeScore !== null && match.awayScore !== null ? (
            <span className="text-white font-bold">{match.homeScore}–{match.awayScore}</span>
          ) : (
            <span className="text-zinc-500 text-xs">{format(new Date(match.startsAt), "dd/MM HH:mm", { locale: ptBR })}</span>
          )}
        </div>
        <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
          <span className="text-white font-medium truncate text-right">{match.awayTeam}</span>
          {match.awayTeamFlag && (
            <img src={teamLogo(match.awayTeamFlag)} alt="" className="w-5 h-5 object-contain shrink-0" />
          )}
        </div>
      </div>
      {(pred || badge) && (
        <div className="flex items-center justify-between">
          {pred ? (
            <span className="text-xs text-zinc-400">Palpite: {pred.homeScore}–{pred.awayScore}</span>
          ) : <span />}
          {badge ? (
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${badge.bg}`}>{badge.label}</span>
          ) : pred ? (
            <span className="text-xs px-1.5 py-0.5 rounded border bg-zinc-700/50 text-zinc-400 border-zinc-600">Aguardando</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function KnockoutCard({ match }: { match?: MatchWithPrediction }) {
  if (!match) {
    return (
      <div className="bg-zinc-900 border border-zinc-700/40 rounded-lg p-3 min-w-[190px] opacity-40">
        <div className="text-zinc-500 text-xs text-center py-1">A definir</div>
      </div>
    );
  }
  const isFinished = match.status === "FINISHED";
  const pred = match.predictions[0];
  const badge = pred?.result ? resultBadge[pred.result] : null;

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm min-w-[190px]">
      <div className="flex items-center gap-2 mb-1">
        {match.homeTeamFlag && <img src={teamLogo(match.homeTeamFlag)} alt="" className="w-5 h-5 object-contain shrink-0" />}
        <span className="text-white text-xs font-medium flex-1 truncate">{match.homeTeam}</span>
        {isFinished && match.homeScore !== null && <span className="text-white font-bold text-xs">{match.homeScore}</span>}
      </div>
      <div className="flex items-center gap-2">
        {match.awayTeamFlag && <img src={teamLogo(match.awayTeamFlag)} alt="" className="w-5 h-5 object-contain shrink-0" />}
        <span className="text-white text-xs font-medium flex-1 truncate">{match.awayTeam}</span>
        {isFinished && match.awayScore !== null && <span className="text-white font-bold text-xs">{match.awayScore}</span>}
      </div>
      {!isFinished && (
        <div className="text-zinc-500 text-xs mt-1 text-center">
          {format(new Date(match.startsAt), "dd/MM HH:mm", { locale: ptBR })}
        </div>
      )}
      {pred && (
        <div className="mt-1 pt-1 border-t border-zinc-700 text-xs flex items-center justify-between gap-1">
          <span className="text-zinc-400">Palpite: {pred.homeScore}–{pred.awayScore}</span>
          {badge && <span className={`px-1 py-0.5 rounded border font-medium text-xs ${badge.bg}`}>{badge.label}</span>}
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
      .then((d) => { if (Array.isArray(d)) setMatches(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId, season]);

  if (loading) {
    return <div className="text-zinc-500 text-center py-16 animate-pulse">Carregando jogos...</div>;
  }

  const groupMatches = matches.filter((m) => m.stage === "GROUP");
  const knockoutMatches = matches.filter((m) => m.stage !== "GROUP");

  const groupLetters = Array.from(
    new Set(groupMatches.map((m) => m.group).filter((g): g is string => !!g))
  ).sort();

  const groupMap = new Map<string, MatchWithPrediction[]>();
  for (const letter of groupLetters) {
    groupMap.set(letter, groupMatches.filter((m) => m.group === letter));
  }

  const stageMap = new Map<string, MatchWithPrediction[]>();
  for (const { stage } of KNOCKOUT_STAGES) {
    stageMap.set(stage, knockoutMatches.filter((m) => m.stage === stage));
  }

  const activeKnockout = KNOCKOUT_STAGES.filter(({ stage }) => (stageMap.get(stage) ?? []).length > 0);

  if (matches.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-20">
        <p className="text-5xl mb-4">🏆</p>
        <p className="text-lg font-medium text-white">Nenhum jogo cadastrado ainda.</p>
        <p className="text-sm mt-2">Os jogos aparecerão aqui quando forem importados pelo admin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Fase de Grupos */}
      {groupLetters.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <span>⚽</span> Fase de Grupos
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {groupLetters.map((letter) => {
              const gm = groupMap.get(letter) ?? [];
              return (
                <div key={letter} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-sm font-bold">
                      {letter}
                    </span>
                    <span className="text-white font-semibold text-sm">Grupo {letter}</span>
                    <span className="text-zinc-500 text-xs ml-auto">{gm.length} jogos</span>
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    {gm.map((m) => <GroupMatchCard key={m.id} match={m} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Mata-mata */}
      {activeKnockout.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <span>🏆</span> Mata-mata
          </h3>
          <div className="flex gap-5 overflow-x-auto pb-4">
            {activeKnockout.map(({ stage, label, max }) => {
              const sm = stageMap.get(stage) ?? [];
              const slots = Array.from({ length: max }, (_, i) => sm[i]);
              return (
                <div key={stage} className="flex flex-col shrink-0" style={{ minWidth: 200 }}>
                  <h4 className="text-xs font-semibold text-zinc-400 mb-3 text-center uppercase tracking-wide">{label}</h4>
                  <div className="flex flex-col gap-2">
                    {slots.map((match, i) => <KnockoutCard key={match?.id ?? i} match={match} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {groupLetters.length > 0 && activeKnockout.length === 0 && (
        <div className="text-center text-zinc-500 py-10 bg-zinc-900 border border-zinc-800 rounded-xl">
          <p className="text-3xl mb-3">⏳</p>
          <p className="text-zinc-300 font-medium text-sm">Mata-mata ainda não definido</p>
        </div>
      )}
    </div>
  );
}
