"use client";

import { useState } from "react";
import Image from "next/image";

type League = {
  id: number;
  name: string;
  logo: string;
};

type Country = {
  flag: string;
  name: string;
  leagues: League[];
};

const LEAGUES_BY_COUNTRY: Country[] = [
  {
    flag: "🌍",
    name: "Internacional",
    leagues: [
      { id: 1,   name: "Copa do Mundo FIFA",         logo: "https://media.api-sports.io/football/leagues/1.png" },
      { id: 2,   name: "UEFA Champions League",       logo: "https://media.api-sports.io/football/leagues/2.png" },
      { id: 3,   name: "UEFA Europa League",          logo: "https://media.api-sports.io/football/leagues/3.png" },
      { id: 848, name: "UEFA Conference League",      logo: "https://media.api-sports.io/football/leagues/848.png" },
      { id: 13,  name: "Copa Libertadores",           logo: "https://media.api-sports.io/football/leagues/13.png" },
      { id: 11,  name: "Copa Sul-Americana",          logo: "https://media.api-sports.io/football/leagues/11.png" },
    ],
  },
  {
    flag: "🇧🇷",
    name: "Brasil",
    leagues: [
      { id: 71,  name: "Brasileirão Série A",         logo: "https://media.api-sports.io/football/leagues/71.png" },
      { id: 72,  name: "Brasileirão Série B",         logo: "https://media.api-sports.io/football/leagues/72.png" },
      { id: 73,  name: "Copa do Brasil",              logo: "https://media.api-sports.io/football/leagues/73.png" },
    ],
  },
  {
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    name: "Inglaterra",
    leagues: [
      { id: 39,  name: "Premier League",              logo: "https://media.api-sports.io/football/leagues/39.png" },
      { id: 40,  name: "Championship",                logo: "https://media.api-sports.io/football/leagues/40.png" },
      { id: 45,  name: "FA Cup",                      logo: "https://media.api-sports.io/football/leagues/45.png" },
    ],
  },
  {
    flag: "🇪🇸",
    name: "Espanha",
    leagues: [
      { id: 140, name: "La Liga",                     logo: "https://media.api-sports.io/football/leagues/140.png" },
      { id: 143, name: "Copa del Rey",                logo: "https://media.api-sports.io/football/leagues/143.png" },
    ],
  },
  {
    flag: "🇩🇪",
    name: "Alemanha",
    leagues: [
      { id: 78,  name: "Bundesliga",                  logo: "https://media.api-sports.io/football/leagues/78.png" },
      { id: 81,  name: "DFB Pokal",                   logo: "https://media.api-sports.io/football/leagues/81.png" },
    ],
  },
  {
    flag: "🇮🇹",
    name: "Itália",
    leagues: [
      { id: 135, name: "Serie A",                     logo: "https://media.api-sports.io/football/leagues/135.png" },
      { id: 137, name: "Coppa Italia",                logo: "https://media.api-sports.io/football/leagues/137.png" },
    ],
  },
  {
    flag: "🇫🇷",
    name: "França",
    leagues: [
      { id: 61,  name: "Ligue 1",                     logo: "https://media.api-sports.io/football/leagues/61.png" },
      { id: 66,  name: "Coupe de France",             logo: "https://media.api-sports.io/football/leagues/66.png" },
    ],
  },
  {
    flag: "🇵🇹",
    name: "Portugal",
    leagues: [
      { id: 94,  name: "Primeira Liga",               logo: "https://media.api-sports.io/football/leagues/94.png" },
    ],
  },
  {
    flag: "🇦🇷",
    name: "Argentina",
    leagues: [
      { id: 128, name: "Liga Profesional",            logo: "https://media.api-sports.io/football/leagues/128.png" },
    ],
  },
  {
    flag: "🇺🇸",
    name: "Estados Unidos",
    leagues: [
      { id: 253, name: "MLS",                         logo: "https://media.api-sports.io/football/leagues/253.png" },
    ],
  },
];

type ImportResult = { imported: number; updated: number };
type SyncResult = { synced: number; at: string };
type MatchStats = { total: number };

export function AdminPanel({ matchStats }: { matchStats: MatchStats }) {
  const currentYear = new Date().getFullYear();
  const [season, setSeason] = useState(currentYear);
  const [activeCountry, setActiveCountry] = useState("Brasil");
  const [importingId, setImportingId] = useState<number | null>(null);
  const [importResults, setImportResults] = useState<Record<number, ImportResult>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  async function handleImport(league: League) {
    setImportingId(league.id);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: league.id, season, leagueName: league.name }),
      });
      const data = await res.json() as ImportResult;
      setImportResults((prev) => ({ ...prev, [league.id]: data }));
    } catch {
      // silently handle
    } finally {
      setImportingId(null);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = await res.json() as SyncResult;
      setSyncResult(data);
    } catch {
      // silently handle
    } finally {
      setSyncing(false);
    }
  }

  const selected = LEAGUES_BY_COUNTRY.find((c) => c.name === activeCountry);

  return (
    <div className="space-y-8">
      {/* Section 1: Import by Country */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Importar Jogos</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">Temporada:</span>
            <input
              type="number"
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
              className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Country tabs */}
        <div className="flex flex-wrap gap-2 mb-5">
          {LEAGUES_BY_COUNTRY.map((country) => (
            <button
              key={country.name}
              onClick={() => setActiveCountry(country.name)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeCountry === country.name
                  ? "bg-green-500/20 text-green-400 border border-green-500/40"
                  : "bg-zinc-800 text-zinc-400 hover:text-white border border-transparent"
              }`}
            >
              {country.flag} {country.name}
            </button>
          ))}
        </div>

        {/* Leagues of selected country */}
        {selected && (
          <ul className="space-y-2">
            {selected.leagues.map((league) => {
              const result = importResults[league.id];
              const isImporting = importingId === league.id;

              return (
                <li
                  key={league.id}
                  className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <Image
                      src={league.logo}
                      alt={league.name}
                      width={28}
                      height={28}
                      className="rounded"
                      unoptimized
                    />
                    <span className="text-sm font-medium text-white">{league.name}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    {result && (
                      <span className="text-xs text-green-400">
                        {result.imported} importados · {result.updated} atualizados
                      </span>
                    )}
                    <button
                      onClick={() => handleImport(league)}
                      disabled={isImporting}
                      className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded-lg transition-colors min-w-[90px]"
                    >
                      {isImporting ? "Importando..." : result ? "Reimportar" : "Importar"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Section 2: Sync */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Sincronizar Resultados</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Atualiza os placares dos jogos de hoje que já estão no banco.
        </p>
        <div className="flex items-center gap-4">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {syncing ? "Sincronizando..." : "Sincronizar agora"}
          </button>
          {syncResult && (
            <span className="text-sm text-green-400">
              {syncResult.synced} jogos sincronizados
              {syncResult.at && (
                <span className="text-zinc-500 ml-2">
                  — {new Date(syncResult.at).toLocaleTimeString("pt-BR")}
                </span>
              )}
            </span>
          )}
        </div>
      </section>

      {/* Section 3: Stats */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Banco de Dados</h2>
        <div className="bg-zinc-800 rounded-lg px-4 py-3 inline-flex items-center gap-3">
          <span className="text-2xl font-bold text-green-400">{matchStats.total}</span>
          <span className="text-sm text-zinc-400">jogos importados</span>
        </div>
      </section>
    </div>
  );
}
