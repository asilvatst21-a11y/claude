"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { MatchCard } from "@/components/predictions/match-card";

type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamFlag: string | null;
  awayTeamFlag: string | null;
  homeScore: number | null;
  awayScore: number | null;
  startsAt: Date;
  status: string;
  stage: string;
  group: string | null;
  round: string | null;
  venue: string | null;
  leagueId: number | null;
  predictions?: { homeScore: number; awayScore: number; points: number; bonusPoints: number; result: string | null }[];
};

type Competition = { leagueId: number; leagueName: string; leagueSeason: number | null };

interface PredictionsViewProps {
  matches: Match[];
  competitions: Competition[];
  isInLeague: boolean;
  userId: string;
}

const COMP_STORAGE_KEY = "predictions_last_comp_id";

function pickDefaultComp(competitions: Competition[], matches: Match[]): Competition | null {
  if (competitions.length === 0) return null;
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;

  // 1. Prefer competition with a LIVE match
  const withLive = competitions.find((c) =>
    matches.some((m) => m.leagueId === c.leagueId && m.status === "LIVE")
  );
  if (withLive) return withLive;

  // 2. Prefer competition with a match that started within the last 2h but not yet synced
  const withOngoing = competitions.find((c) =>
    matches.some((m) => {
      if (m.leagueId !== c.leagueId || m.status !== "SCHEDULED") return false;
      const t = new Date(m.startsAt).getTime();
      return t <= now && now - t <= TWO_HOURS;
    })
  );
  if (withOngoing) return withOngoing;

  // 3. Prefer competition with the nearest upcoming match
  let best: Competition | null = null;
  let bestTime = Infinity;

  for (const comp of competitions) {
    const nearest = matches
      .filter((m) => m.leagueId === comp.leagueId && m.status === "SCHEDULED")
      .reduce((min, m) => {
        const t = new Date(m.startsAt).getTime();
        return t > now && t < min ? t : min;
      }, Infinity);

    if (nearest < bestTime) {
      bestTime = nearest;
      best = comp;
    }
  }

  if (best) return best;

  // 4. Prefer competition with the most recently started match (all finished)
  let mostRecent: Competition | null = null;
  let mostRecentTime = -Infinity;

  for (const comp of competitions) {
    const recent = matches
      .filter((m) => m.leagueId === comp.leagueId)
      .reduce((max, m) => {
        const t = new Date(m.startsAt).getTime();
        return t <= now && t > max ? t : max;
      }, -Infinity);

    if (recent > mostRecentTime) {
      mostRecentTime = recent;
      mostRecent = comp;
    }
  }

  return mostRecent ?? competitions[0];
}

export function PredictionsView({ matches, competitions, isInLeague }: PredictionsViewProps) {
  const defaultComp = pickDefaultComp(competitions, matches);
  const [selectedComp, setSelectedComp] = useState<Competition | null>(defaultComp);

  const compMatches = selectedComp
    ? matches.filter((m) => m.leagueId === selectedComp.leagueId)
    : matches;

  const allStages = Array.from(new Set(compMatches.map((m) => m.stage).filter(Boolean))) as string[];
  const defaultStage =
    allStages.find((s) => compMatches.some((m) => m.stage === s && (m.status === "SCHEDULED" || m.status === "LIVE"))) ??
    allStages[0] ?? null;
  const [selectedStage, setSelectedStage] = useState<string | null>(defaultStage);

  const stageMatches = selectedStage && allStages.length > 1
    ? compMatches.filter((m) => m.stage === selectedStage)
    : compMatches;

  const allRounds = Array.from(new Set(stageMatches.map((m) => m.round).filter(Boolean))) as string[];

  const defaultRound =
    allRounds.find((r) => stageMatches.some((m) => m.round === r && (m.status === "SCHEDULED" || m.status === "LIVE"))) ??
    allRounds[allRounds.length - 1] ??
    null;

  const [selectedRound, setSelectedRound] = useState<string | null>(defaultRound);

  // Reset stage and round when competition changes
  const handleCompChange = (comp: Competition | null) => {
    setSelectedComp(comp);
    if (comp) {
      try { localStorage.setItem(COMP_STORAGE_KEY, String(comp.leagueId)); } catch { /* ignore */ }
    }
    const newMatches = comp ? matches.filter((m) => m.leagueId === comp.leagueId) : matches;
    const newStages = Array.from(new Set(newMatches.map((m) => m.stage).filter(Boolean))) as string[];
    const newStage =
      newStages.find((s) => newMatches.some((m) => m.stage === s && (m.status === "SCHEDULED" || m.status === "LIVE"))) ??
      newStages[0] ?? null;
    setSelectedStage(newStage);
    const afterStage = newStage && newStages.length > 1 ? newMatches.filter((m) => m.stage === newStage) : newMatches;
    const newRounds = Array.from(new Set(afterStage.map((m) => m.round).filter(Boolean))) as string[];
    const newDefault =
      newRounds.find((r) => afterStage.some((m) => m.round === r && (m.status === "SCHEDULED" || m.status === "LIVE"))) ??
      newRounds[newRounds.length - 1] ?? null;
    setSelectedRound(newDefault);
  };

  const handleStageChange = (stage: string) => {
    setSelectedStage(stage);
    const afterStage = stageMatches.filter((m) => m.stage === stage);
    const newRounds = Array.from(new Set(afterStage.map((m) => m.round).filter(Boolean))) as string[];
    const newDefault =
      newRounds.find((r) => afterStage.some((m) => m.round === r && (m.status === "SCHEDULED" || m.status === "LIVE"))) ??
      newRounds[newRounds.length - 1] ?? null;
    setSelectedRound(newDefault);
  };

  // Restore last selected competition from localStorage after hydration
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COMP_STORAGE_KEY);
      if (!stored) return;
      const id = Number(stored);
      const comp = competitions.find((c) => c.leagueId === id);
      if (comp && comp.leagueId !== defaultComp?.leagueId) {
        handleCompChange(comp);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roundMatches = selectedRound ? stageMatches.filter((m) => m.round === selectedRound) : stageMatches;
  const currentIndex = allRounds.indexOf(selectedRound ?? "");
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allRounds.length - 1;

  const liveMatches = roundMatches.filter((m) => m.status === "LIVE");
  const upcoming = roundMatches.filter((m) => m.status === "SCHEDULED");
  const finished = roundMatches.filter((m) => m.status === "FINISHED" || m.status === "POSTPONED" || m.status === "CANCELLED");

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-4">Palpites</h1>

      {/* Banner: not in a league */}
      {!isInLeague && (
        <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
          <span className="text-xl shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-medium text-yellow-400">Você não está em nenhuma liga</p>
            <p className="text-sm text-zinc-400 mt-0.5">
              Seus palpites não contam em nenhum ranking enquanto você não entrar em uma liga.{" "}
              <Link href="/leagues" className="text-green-400 hover:underline">
                Criar ou entrar em uma liga
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Competition selector */}
      {competitions.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {competitions.map((c) => (
            <button
              key={`${c.leagueId}-${c.leagueSeason}`}
              onClick={() => handleCompChange(c)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                selectedComp?.leagueId === c.leagueId && selectedComp?.leagueSeason === c.leagueSeason
                  ? "bg-green-500/20 border-green-500/40 text-green-400"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {c.leagueName}
            </button>
          ))}
        </div>
      )}

      {/* Stage/phase selector (Copa do Mundo phases: Group Stage, Round of 16, etc.) */}
      {allStages.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {allStages.map((s) => (
            <button
              key={s}
              onClick={() => handleStageChange(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                selectedStage === s
                  ? "bg-green-500/20 border-green-500/40 text-green-400"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Round selector */}
      {allRounds.length > 1 && (
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedRound(allRounds[currentIndex - 1])}
            disabled={!hasPrev}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ‹
          </button>
          <select
            value={selectedRound ?? ""}
            onChange={(e) => setSelectedRound(e.target.value || null)}
            className="flex-1 max-w-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {allRounds.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button
            onClick={() => setSelectedRound(allRounds[currentIndex + 1])}
            disabled={!hasNext}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ›
          </button>
        </div>
      )}

      {matches.length === 0 && (
        <div className="text-center text-zinc-500 py-20">
          <p className="text-4xl mb-4">⚽</p>
          <p className="text-lg">Nenhum jogo cadastrado ainda.</p>
        </div>
      )}

      {liveMatches.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block" />
            Ao vivo ({liveMatches.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveMatches.map((m) => <MatchCard key={m.id} match={m as never}  />)}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Próximos jogos ({upcoming.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((m) => <MatchCard key={m.id} match={m as never}  />)}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Encerrados ({finished.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {finished.map((m) => <MatchCard key={m.id} match={m as never}  />)}
          </div>
        </section>
      )}

      {roundMatches.length === 0 && matches.length > 0 && (
        <div className="text-center text-zinc-500 py-20">
          <p className="text-lg">Nenhum jogo nesta rodada.</p>
        </div>
      )}
    </div>
  );
}
