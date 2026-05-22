"use client";

import { useState } from "react";
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

function pickDefaultComp(competitions: Competition[], matches: Match[]): Competition | null {
  if (competitions.length === 0) return null;

  // 1. Prefer competition with a LIVE match
  const withLive = competitions.find((c) =>
    matches.some((m) => m.leagueId === c.leagueId && m.status === "LIVE")
  );
  if (withLive) return withLive;

  // 2. Prefer competition with the nearest upcoming match
  const now = Date.now();
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

  return best ?? competitions[0];
}

export function PredictionsView({ matches, competitions, isInLeague }: PredictionsViewProps) {
  const defaultComp = pickDefaultComp(competitions, matches);
  const [selectedComp, setSelectedComp] = useState<Competition | null>(defaultComp);

  const compMatches = selectedComp
    ? matches.filter((m) => m.leagueId === selectedComp.leagueId)
    : matches;

  const allRounds = Array.from(new Set(compMatches.map((m) => m.round).filter(Boolean))) as string[];

  const defaultRound =
    allRounds.find((r) => compMatches.some((m) => m.round === r && (m.status === "SCHEDULED" || m.status === "LIVE"))) ??
    allRounds[allRounds.length - 1] ??
    null;

  const [selectedRound, setSelectedRound] = useState<string | null>(defaultRound);

  // Reset round when competition changes
  const handleCompChange = (comp: Competition | null) => {
    setSelectedComp(comp);
    const newMatches = comp ? matches.filter((m) => m.leagueId === comp.leagueId) : matches;
    const newRounds = Array.from(new Set(newMatches.map((m) => m.round).filter(Boolean))) as string[];
    const newDefault =
      newRounds.find((r) => newMatches.some((m) => m.round === r && (m.status === "SCHEDULED" || m.status === "LIVE"))) ??
      newRounds[newRounds.length - 1] ??
      null;
    setSelectedRound(newDefault);
  };

  const roundMatches = selectedRound ? compMatches.filter((m) => m.round === selectedRound) : compMatches;
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
            {liveMatches.map((m) => <MatchCard key={m.id} match={m as never} />)}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Próximos jogos ({upcoming.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((m) => <MatchCard key={m.id} match={m as never} />)}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Encerrados ({finished.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {finished.map((m) => <MatchCard key={m.id} match={m as never} />)}
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
