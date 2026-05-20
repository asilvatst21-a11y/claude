"use client";

import { useState } from "react";
import Image from "next/image";

type LeagueResult = {
  league: { id: number; name: string; logo: string };
  country: { name: string };
};

type ImportResult = { imported: number; updated: number };
type SyncResult = { synced: number; at: string };

type MatchStats = {
  total: number;
  leagues: { homeTeam: string; _count: { _all: number } }[];
};

export function AdminPanel({ matchStats }: { matchStats: MatchStats }) {
  const currentYear = new Date().getFullYear();

  // Section 1: Import league
  const [searchQuery, setSearchQuery] = useState("");
  const [season, setSeason] = useState(currentYear);
  const [searchResults, setSearchResults] = useState<LeagueResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [importingId, setImportingId] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<{ id: number; result: ImportResult } | null>(null);

  // Section 2: Sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    setImportResult(null);
    try {
      const res = await fetch(
        `/api/admin/leagues?q=${encodeURIComponent(searchQuery)}&season=${season}`
      );
      const data = await res.json() as LeagueResult[];
      setSearchResults(data);
    } catch {
      // silently handle error
    } finally {
      setSearching(false);
    }
  }

  async function handleImport(league: LeagueResult) {
    setImportingId(league.league.id);
    setImportResult(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId: league.league.id,
          season,
          leagueName: league.league.name,
        }),
      });
      const data = await res.json() as ImportResult;
      setImportResult({ id: league.league.id, result: data });
    } catch {
      // silently handle error
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
      // silently handle error
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Section 1: Import League */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Importar Liga</h2>

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Ex: Brasileirao, Champions League..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="number"
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
            className="w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {searching ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {searchResults.length > 0 && (
          <ul className="space-y-2">
            {searchResults.map((item) => (
              <li
                key={item.league.id}
                className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {item.league.logo && (
                    <Image
                      src={item.league.logo}
                      alt={item.league.name}
                      width={28}
                      height={28}
                      className="rounded"
                      unoptimized
                    />
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">{item.league.name}</p>
                    <p className="text-xs text-zinc-400">{item.country.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {importResult?.id === item.league.id && (
                    <span className="text-xs text-green-400">
                      {importResult.result.imported} importados, {importResult.result.updated} atualizados
                    </span>
                  )}
                  <button
                    onClick={() => handleImport(item)}
                    disabled={importingId === item.league.id}
                    className="px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {importingId === item.league.id ? "Importando..." : "Importar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!searching && searchResults.length === 0 && searchQuery && (
          <p className="text-sm text-zinc-500">Nenhuma liga encontrada. Tente outro termo.</p>
        )}
      </section>

      {/* Section 2: Sync Results */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Sincronizar Resultados</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Atualiza os placares dos jogos de hoje que já estão no banco de dados.
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

      {/* Section 3: Imported Leagues Stats */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Ligas Importadas</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Total de jogos no banco:{" "}
          <span className="text-white font-semibold">{matchStats.total}</span>
        </p>
      </section>
    </div>
  );
}
