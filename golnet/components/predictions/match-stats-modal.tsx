"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Fixture = {
  fixture: { id: number; date: string };
  teams: {
    home: { id: number; name: string; logo: string; winner?: boolean | null };
    away: { id: number; name: string; logo: string; winner?: boolean | null };
  };
  goals: { home: number | null; away: number | null };
};

type StatsData = {
  h2h: Fixture[];
  homeLast: Fixture[];
  awayLast: Fixture[];
};

interface Props {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamFlag: string | null;
  awayTeamFlag: string | null;
  onClose: () => void;
}

function FormBadge({ fixture, teamId }: { fixture: Fixture; teamId: number }) {
  const isHome = fixture.teams.home.id === teamId;
  const won = isHome ? fixture.teams.home.winner : fixture.teams.away.winner;
  const lost = isHome ? fixture.teams.away.winner : fixture.teams.home.winner;

  const bg = won ? "bg-green-500" : lost ? "bg-red-500" : "bg-zinc-500";
  const label = won ? "V" : lost ? "D" : "E";

  return (
    <span className={`w-6 h-6 rounded-full ${bg} flex items-center justify-center text-white text-xs font-bold`}>
      {label}
    </span>
  );
}

function FixtureRow({ fixture, highlightId }: { fixture: Fixture; highlightId?: number }) {
  const homeWon = fixture.teams.home.winner;
  const awayWon = fixture.teams.away.winner;

  return (
    <div className="flex items-center gap-2 py-2 border-b border-zinc-800 last:border-0">
      <span className="text-xs text-zinc-500 w-16 shrink-0">
        {format(new Date(fixture.fixture.date), "dd/MM/yy", { locale: ptBR })}
      </span>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <img src={fixture.teams.home.logo} alt="" className="w-5 h-5 object-contain shrink-0" />
        <span className={`text-xs truncate ${highlightId === fixture.teams.home.id ? "text-white font-semibold" : "text-zinc-400"}`}>
          {fixture.teams.home.name}
        </span>
      </div>
      <span className={`text-sm font-bold shrink-0 px-2 ${homeWon ? "text-green-400" : awayWon ? "text-red-400" : "text-zinc-400"}`}>
        {fixture.goals.home ?? "-"} x {fixture.goals.away ?? "-"}
      </span>
      <div className="flex-1 flex items-center gap-2 min-w-0 justify-end">
        <span className={`text-xs truncate ${highlightId === fixture.teams.away.id ? "text-white font-semibold" : "text-zinc-400"}`}>
          {fixture.teams.away.name}
        </span>
        <img src={fixture.teams.away.logo} alt="" className="w-5 h-5 object-contain shrink-0" />
      </div>
    </div>
  );
}

export function MatchStatsModal({ matchId, homeTeam, awayTeam, homeTeamFlag, awayTeamFlag, onClose }: Props) {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"h2h" | "home" | "away">("h2h");

  useEffect(() => {
    fetch(`/api/matches/${matchId}/stats`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Erro ao carregar estatísticas"))
      .finally(() => setLoading(false));
  }, [matchId]);

  const homeId = data?.homeLast[0]
    ? (data.homeLast[0].teams.home.name === homeTeam
        ? data.homeLast[0].teams.home.id
        : data.homeLast[0].teams.away.id)
    : undefined;

  const awayId = data?.awayLast[0]
    ? (data.awayLast[0].teams.home.name === awayTeam
        ? data.awayLast[0].teams.home.id
        : data.awayLast[0].teams.away.id)
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            {homeTeamFlag && <img src={homeTeamFlag} alt="" className="w-7 h-7 object-contain" />}
            <span className="text-sm font-semibold text-white">{homeTeam}</span>
            <span className="text-zinc-500 text-xs">vs</span>
            <span className="text-sm font-semibold text-white">{awayTeam}</span>
            {awayTeamFlag && <img src={awayTeamFlag} alt="" className="w-7 h-7 object-contain" />}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          {([
            { key: "h2h", label: "Confrontos diretos" },
            { key: "home", label: homeTeam.split(" ")[0] },
            { key: "away", label: awayTeam.split(" ")[0] },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === key
                  ? "text-green-400 border-b-2 border-green-400"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="text-center text-zinc-500 py-10">Carregando...</div>
          )}
          {error && (
            <div className="text-center text-zinc-500 py-10 text-sm">{error}</div>
          )}
          {data && !loading && (
            <>
              {tab === "h2h" && (
                <div>
                  {data.h2h.length === 0 ? (
                    <p className="text-zinc-500 text-sm text-center py-6">Nenhum confronto direto encontrado.</p>
                  ) : (
                    <>
                      {/* H2H summary */}
                      {homeId && awayId && (
                        <div className="flex justify-around mb-4 bg-zinc-800 rounded-xl p-3">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-400">
                              {data.h2h.filter((f) => f.teams.home.id === homeId ? f.teams.home.winner : f.teams.away.winner).length}
                            </div>
                            <div className="text-xs text-zinc-400">{homeTeam.split(" ")[0]}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-zinc-400">
                              {data.h2h.filter((f) => !f.teams.home.winner && !f.teams.away.winner).length}
                            </div>
                            <div className="text-xs text-zinc-400">Empates</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-400">
                              {data.h2h.filter((f) => f.teams.home.id === awayId ? f.teams.home.winner : f.teams.away.winner).length}
                            </div>
                            <div className="text-xs text-zinc-400">{awayTeam.split(" ")[0]}</div>
                          </div>
                        </div>
                      )}
                      {data.h2h.map((f) => <FixtureRow key={f.fixture.id} fixture={f} />)}
                    </>
                  )}
                </div>
              )}

              {tab === "home" && (
                <div>
                  {homeId && (
                    <div className="flex gap-1 mb-3">
                      {data.homeLast.map((f) => <FormBadge key={f.fixture.id} fixture={f} teamId={homeId} />)}
                    </div>
                  )}
                  {data.homeLast.length === 0
                    ? <p className="text-zinc-500 text-sm text-center py-6">Sem jogos recentes.</p>
                    : data.homeLast.map((f) => <FixtureRow key={f.fixture.id} fixture={f} highlightId={homeId} />)
                  }
                </div>
              )}

              {tab === "away" && (
                <div>
                  {awayId && (
                    <div className="flex gap-1 mb-3">
                      {data.awayLast.map((f) => <FormBadge key={f.fixture.id} fixture={f} teamId={awayId} />)}
                    </div>
                  )}
                  {data.awayLast.length === 0
                    ? <p className="text-zinc-500 text-sm text-center py-6">Sem jogos recentes.</p>
                    : data.awayLast.map((f) => <FixtureRow key={f.fixture.id} fixture={f} highlightId={awayId} />)
                  }
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
