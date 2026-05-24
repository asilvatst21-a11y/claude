"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MatchCard } from "@/components/predictions/match-card";
import type { Match, Prediction } from "@/types";

type MatchWithPred = Match & { predictions: Prediction[] };

export function LeagueMatches({ leagueId }: { leagueId: string }) {
  const [matches, setMatches] = useState<MatchWithPred[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leagues/${leagueId}/matches`);
      const data = await res.json();
      if (Array.isArray(data)) setMatches(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="text-zinc-500 text-center py-10">Carregando jogos...</div>;
  }

  if (matches.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-zinc-500">
        <p className="text-3xl mb-3">⚽</p>
        <p>Nenhum jogo encontrado para esta liga.</p>
        <p className="text-sm mt-1">Configure uma competição ao criar a liga para ver os jogos aqui.</p>
      </div>
    );
  }

  // Group matches by date
  const grouped: Record<string, MatchWithPred[]> = {};
  for (const m of matches) {
    const dateKey = format(new Date(m.startsAt), "EEEE, dd/MM/yyyy", { locale: ptBR });
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(m);
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, dayMatches]) => (
        <div key={date}>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 capitalize">
            {date}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {dayMatches.map((match) => (
              <MatchCard key={match.id} match={match} onSaved={load} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
