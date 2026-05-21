"use client";

import { useState } from "react";
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
  predictions?: { homeScore: number; awayScore: number; points: number; bonusPoints: number; result: string | null }[];
};

interface PredictionsViewProps {
  matches: Match[];
  allRounds: string[];
  currentRound: string | null;
  userId: string;
}

export function PredictionsView({ matches, allRounds, currentRound }: PredictionsViewProps) {
  const [selectedRound, setSelectedRound] = useState<string | null>(currentRound);

  const roundMatches = selectedRound
    ? matches.filter((m) => m.round === selectedRound)
    : matches;

  const liveMatches = roundMatches.filter((m) => m.status === "LIVE");
  const upcoming = roundMatches.filter((m) => m.status === "SCHEDULED");
  const finished = roundMatches.filter((m) => m.status === "FINISHED" || m.status === "POSTPONED" || m.status === "CANCELLED");

  const currentIndex = allRounds.indexOf(selectedRound ?? "");
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allRounds.length - 1;

  if (matches.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-6">Palpites</h1>
        <div className="text-center text-zinc-500 py-20">
          <p className="text-4xl mb-4">⚽</p>
          <p className="text-lg">Nenhum jogo cadastrado ainda.</p>
          <p className="text-sm mt-2">Os jogos aparecerão aqui quando forem importados.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Palpites</h1>

      {/* Round selector */}
      {allRounds.length > 0 && (
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
              <option key={r} value={r}>
                {r}
              </option>
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

      {/* Live matches */}
      {liveMatches.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse inline-block" />
            Ao vivo ({liveMatches.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveMatches.map((m) => (
              <MatchCard key={m.id} match={m as never} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Próximos jogos ({upcoming.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {upcoming.map((m) => (
              <MatchCard key={m.id} match={m as never} />
            ))}
          </div>
        </section>
      )}

      {/* Finished */}
      {finished.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Encerrados ({finished.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {finished.map((m) => (
              <MatchCard key={m.id} match={m as never} />
            ))}
          </div>
        </section>
      )}

      {roundMatches.length === 0 && selectedRound && (
        <div className="text-center text-zinc-500 py-20">
          <p className="text-lg">Nenhum jogo nesta rodada.</p>
        </div>
      )}
    </div>
  );
}
