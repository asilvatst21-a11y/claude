"use client";

import { useState, useEffect } from "react";
import { teamLogo } from "@/lib/utils";

type League = { leagueId: number; leagueName: string; leagueSeason: number };

type Standing = {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  group: string;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  form: string;
};

function FormDot({ char }: { char: string }) {
  const color =
    char === "W" ? "bg-green-500" : char === "D" ? "bg-zinc-500" : "bg-red-500";
  return <span className={`w-4 h-4 rounded-full ${color} inline-block`} title={char === "W" ? "Vitória" : char === "D" ? "Empate" : "Derrota"} />;
}

function StandingsTable({ standings, title }: { standings: Standing[]; title?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
      {title && (
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="font-semibold text-white text-sm">{title}</h3>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500">
              <th className="text-left px-4 py-2 w-8">#</th>
              <th className="text-left px-4 py-2">Time</th>
              <th className="text-center px-2 py-2">J</th>
              <th className="text-center px-2 py-2">V</th>
              <th className="text-center px-2 py-2">E</th>
              <th className="text-center px-2 py-2">D</th>
              <th className="text-center px-2 py-2">GP</th>
              <th className="text-center px-2 py-2">GC</th>
              <th className="text-center px-2 py-2">SG</th>
              <th className="text-center px-3 py-2 text-white font-semibold">Pts</th>
              <th className="text-center px-3 py-2 hidden sm:table-cell">Forma</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, i) => (
              <tr
                key={row.team.id}
                className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${
                  i < 4 ? "border-l-2 border-l-green-500" :
                  i < 6 ? "border-l-2 border-l-blue-500" :
                  i >= standings.length - 4 ? "border-l-2 border-l-red-500" : ""
                }`}
              >
                <td className="px-4 py-2.5 text-zinc-400 font-medium">{row.rank}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <img src={teamLogo(row.team.logo)} alt="" className="w-5 h-5 object-contain shrink-0" />
                    <span className="text-white font-medium truncate max-w-[120px]">{row.team.name}</span>
                  </div>
                </td>
                <td className="text-center px-2 py-2.5 text-zinc-400">{row.all.played}</td>
                <td className="text-center px-2 py-2.5 text-green-400">{row.all.win}</td>
                <td className="text-center px-2 py-2.5 text-zinc-400">{row.all.draw}</td>
                <td className="text-center px-2 py-2.5 text-red-400">{row.all.lose}</td>
                <td className="text-center px-2 py-2.5 text-zinc-400">{row.all.goals.for}</td>
                <td className="text-center px-2 py-2.5 text-zinc-400">{row.all.goals.against}</td>
                <td className={`text-center px-2 py-2.5 font-medium ${row.goalsDiff > 0 ? "text-green-400" : row.goalsDiff < 0 ? "text-red-400" : "text-zinc-400"}`}>
                  {row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}
                </td>
                <td className="text-center px-3 py-2.5 font-bold text-white">{row.points}</td>
                <td className="text-center px-3 py-2.5 hidden sm:table-cell">
                  <div className="flex gap-0.5 justify-center">
                    {row.form?.split("").slice(-5).map((c, i) => <FormDot key={i} char={c} />)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StandingsView({ leagues }: { leagues: League[] }) {
  const [selected, setSelected] = useState<League | null>(leagues[0] ?? null);
  const [standings, setStandings] = useState<Standing[][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    fetch(`/api/standings?leagueId=${selected.leagueId}&season=${selected.leagueSeason}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setStandings(d.standings ?? []);
      })
      .catch(() => setError("Erro ao carregar classificação."))
      .finally(() => setLoading(false));
  }, [selected]);

  if (leagues.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-6">Classificação</h1>
        <div className="text-center text-zinc-500 py-20">
          <p className="text-4xl mb-4">📊</p>
          <p className="text-lg">Nenhuma competição importada ainda.</p>
          <p className="text-sm mt-2">Importe jogos no painel Admin para ver a classificação.</p>
        </div>
      </div>
    );
  }

  const isMultiGroup = standings.length > 1;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-white">Classificação</h1>

        <select
          value={selected ? `${selected.leagueId}-${selected.leagueSeason}` : ""}
          onChange={(e) => {
            const [lid, season] = e.target.value.split("-").map(Number);
            const league = leagues.find((l) => l.leagueId === lid && l.leagueSeason === season);
            if (league) setSelected(league);
          }}
          className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500 max-w-xs"
        >
          {leagues.map((l) => (
            <option key={`${l.leagueId}-${l.leagueSeason}`} value={`${l.leagueId}-${l.leagueSeason}`}>
              {l.leagueName} — {l.leagueSeason}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="text-center text-zinc-500 py-20">
          <p className="text-4xl mb-4 animate-pulse">📊</p>
          <p>Carregando classificação...</p>
        </div>
      )}

      {error && !loading && (
        <div className="text-center text-zinc-500 py-20">
          <p className="text-4xl mb-4">⚠️</p>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && standings.length > 0 && (
        <>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mb-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Classificação (ex: Libertadores)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Pré-classificação</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Rebaixamento</span>
          </div>

          {isMultiGroup
            ? standings.map((group, i) => (
                <StandingsTable
                  key={i}
                  standings={group}
                  title={group[0]?.group ? `Grupo ${group[0].group}` : undefined}
                />
              ))
            : <StandingsTable standings={standings[0]} />
          }
        </>
      )}

      {!loading && !error && standings.length === 0 && !loading && (
        <div className="text-center text-zinc-500 py-20">
          <p className="text-4xl mb-4">📊</p>
          <p>Classificação não disponível para esta competição.</p>
        </div>
      )}
    </div>
  );
}
