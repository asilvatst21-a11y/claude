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
type SyncResult = { synced: number; at: string; durationMs?: number };
type MatchStats = { total: number; lastSyncedAt: string | null };
type MatchSyncResult = {
  match: string;
  before: { status: string; homeScore: number | null; awayScore: number | null };
  after:  { status: string; homeScore: number | null; awayScore: number | null };
  predsScored: boolean;
};
type CronLogEntry = { id: string; trigger: string; synced: number; durationMs: number; error: string | null; createdAt: string };
type ImportedLeague = { leagueId: number; leagueName: string | null; leagueSeason: number | null; matchCount: number };

type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  plan: string;
  image: string | null;
  createdAt: string;
};

type UsersData = { users: AdminUser[]; total: number };

const planBadgeColor: Record<string, string> = {
  FREE: "bg-zinc-700 text-zinc-300",
  PRO: "bg-green-500/20 text-green-400",
  ENTERPRISE: "bg-purple-500/20 text-purple-400",
};

const planBadgeLabel: Record<string, string> = {
  FREE: "Free",
  PRO: "Pro ⭐",
  ENTERPRISE: "Empresarial 🏢",
};

function UsersTab() {
  const [data, setData] = useState<UsersData | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const json = await res.json() as UsersData;
      setData(json);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }

  async function changePlan(userId: string, plan: string) {
    setUpdatingId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            users: prev.users.map((u) =>
              u.id === userId ? { ...u, plan } : u
            ),
          };
        });
      }
    } catch {
      // silently handle
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          {data && (
            <span className="text-sm text-zinc-400">
              Total: <span className="text-white font-semibold">{data.total}</span> usuários
            </span>
          )}
        </div>
        <button
          onClick={loadUsers}
          disabled={loading}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? "Carregando..." : data ? "Atualizar" : "Carregar Usuários"}
        </button>
      </div>

      {data && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left text-xs text-zinc-500 font-medium px-3 py-2">Usuário</th>
                <th className="text-left text-xs text-zinc-500 font-medium px-3 py-2">Email</th>
                <th className="text-left text-xs text-zinc-500 font-medium px-3 py-2">Plano</th>
                <th className="text-left text-xs text-zinc-500 font-medium px-3 py-2">Desde</th>
                <th className="text-left text-xs text-zinc-500 font-medium px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.id} className="border-b border-zinc-800/50">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {user.image ? (
                        <Image
                          src={user.image}
                          alt=""
                          width={28}
                          height={28}
                          className="rounded-full"
                          unoptimized
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white">
                          {user.name?.[0] ?? "?"}
                        </div>
                      )}
                      <div>
                        <div className="text-sm text-white">{user.name ?? "—"}</div>
                        {user.username && (
                          <div className="text-xs text-zinc-500">@{user.username}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-400">{user.email}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        planBadgeColor[user.plan] ?? planBadgeColor.FREE
                      }`}
                    >
                      {planBadgeLabel[user.plan] ?? user.plan}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-500">
                    {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={user.plan}
                      disabled={updatingId === user.id}
                      onChange={(e) => changePlan(user.id, e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
                    >
                      <option value="FREE">Free</option>
                      <option value="PRO">Pro</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatSyncAge(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

function ImportedLeaguesTab() {
  const [leagues, setLeagues] = useState<ImportedLeague[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/imported-leagues");
      setLeagues(await res.json());
    } finally { setLoading(false); }
  };

  const handleDelete = async (league: ImportedLeague) => {
    const key = `${league.leagueId}-${league.leagueSeason}`;
    setDeleting(key);
    setConfirm(null);
    try {
      const res = await fetch("/api/admin/imported-leagues", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: league.leagueId, season: league.leagueSeason }),
      });
      const data = await res.json();
      if (res.ok) {
        setLeagues((prev) => prev?.filter(
          (l) => !(l.leagueId === league.leagueId && l.leagueSeason === league.leagueSeason)
        ) ?? null);
        alert(`${data.deleted} partidas removidas.`);
      }
    } finally { setDeleting(null); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-zinc-400">Ligas com partidas importadas no banco</p>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors">
          {loading ? "Carregando..." : leagues ? "Atualizar" : "Carregar ligas"}
        </button>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 mb-4 text-xs text-yellow-400">
        ⚠️ Excluir uma liga remove todas as partidas, palpites e duelos associados. Os pontos já computados nos membros de liga <strong>não</strong> são revertidos.
      </div>

      {leagues && (
        <div className="space-y-2">
          {leagues.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-8">Nenhuma liga importada encontrada.</p>
          )}
          {leagues.map((league) => {
            const key = `${league.leagueId}-${league.leagueSeason}`;
            const isDeleting = deleting === key;
            const isConfirming = confirm === key;

            return (
              <div key={key} className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3">
                <div>
                  <span className="text-sm font-medium text-white">{league.leagueName ?? `Liga ${league.leagueId}`}</span>
                  <span className="text-xs text-zinc-500 ml-2">
                    Temporada {league.leagueSeason} · {league.matchCount} partidas
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isConfirming ? (
                    <>
                      <span className="text-xs text-red-400">Confirmar exclusão?</span>
                      <button
                        onClick={() => handleDelete(league)}
                        disabled={isDeleting}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        {isDeleting ? "Excluindo..." : "Sim, excluir"}
                      </button>
                      <button
                        onClick={() => setConfirm(null)}
                        className="px-3 py-1.5 border border-zinc-600 text-zinc-400 hover:text-white text-xs rounded-lg transition-colors"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirm(key)}
                      className="px-3 py-1.5 border border-red-800 text-red-400 hover:bg-red-950/40 text-xs font-medium rounded-lg transition-colors"
                    >
                      Excluir liga
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ForceResyncSection() {
  const [externalId, setExternalId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async () => {
    if (!externalId.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/sync/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId: externalId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro"); }
      else { setResult(data as MatchSyncResult); }
    } catch { setError("Erro de rede"); }
    finally { setLoading(false); }
  };

  const statusLabel = (s: string) => ({ SCHEDULED: "Agendado", LIVE: "Ao vivo", FINISHED: "Finalizado", POSTPONED: "Adiado", CANCELLED: "Cancelado" }[s] ?? s);

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-1">Re-sync por External ID</h2>
      <p className="text-sm text-zinc-400 mb-4">Força a atualização de uma partida específica da API. Pontua palpites se a partida mudar para FINISHED.</p>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Ex: 1535214"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handle()}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button
          onClick={handle}
          disabled={loading || !externalId.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? "Sincronizando..." : "Sincronizar"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>}
      {result && (
        <div className="bg-zinc-800 rounded-lg p-4 text-sm">
          <p className="font-semibold text-white mb-2">{result.match}</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Antes</p>
              <p className="text-zinc-300">{statusLabel(result.before.status)} · {result.before.homeScore ?? "?"} — {result.before.awayScore ?? "?"}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Depois</p>
              <p className={result.after.status !== result.before.status ? "text-green-400 font-semibold" : "text-zinc-300"}>
                {statusLabel(result.after.status)} · {result.after.homeScore ?? "?"} — {result.after.awayScore ?? "?"}
              </p>
            </div>
          </div>
          {result.predsScored && <p className="text-xs text-green-400 mt-2">✓ Palpites avaliados</p>}
        </div>
      )}
    </section>
  );
}

function LogsTab() {
  const [logs, setLogs] = useState<CronLogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/cron-logs");
      setLogs(await res.json());
    } finally { setLoading(false); }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-zinc-400">Últimas 50 execuções do cron de sincronização</p>
        <button onClick={load} disabled={loading} className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors">
          {loading ? "Carregando..." : logs ? "Atualizar" : "Carregar logs"}
        </button>
      </div>
      {logs && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left text-xs text-zinc-500 font-medium px-3 py-2">Horário</th>
                <th className="text-left text-xs text-zinc-500 font-medium px-3 py-2">Trigger</th>
                <th className="text-right text-xs text-zinc-500 font-medium px-3 py-2">Sincronizados</th>
                <th className="text-right text-xs text-zinc-500 font-medium px-3 py-2">Duração</th>
                <th className="text-left text-xs text-zinc-500 font-medium px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-zinc-800/50">
                  <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{fmt(log.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${log.trigger === "manual" ? "bg-blue-500/20 text-blue-400" : "bg-zinc-700 text-zinc-400"}`}>
                      {log.trigger}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-white font-medium">{log.synced}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-400">{log.durationMs < 1000 ? `${log.durationMs}ms` : `${(log.durationMs / 1000).toFixed(1)}s`}</td>
                  <td className="px-3 py-2.5">
                    {log.error
                      ? <span className="text-xs text-red-400 truncate max-w-[200px] block" title={log.error}>✗ {log.error}</span>
                      : <span className="text-xs text-green-400">✓ OK</span>
                    }
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="text-center text-zinc-500 py-8">Nenhum log ainda — aguarde a próxima execução do cron.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AdminPanel({ matchStats }: { matchStats: MatchStats }) {
  const currentYear = new Date().getFullYear();
  const [season, setSeason] = useState(currentYear);
  const [activeCountry, setActiveCountry] = useState("Brasil");
  const [activeTab, setActiveTab] = useState<"jogos" | "ligas" | "usuarios" | "logs">("jogos");
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
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-zinc-800 pb-0">
        <button
          onClick={() => setActiveTab("jogos")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "jogos"
              ? "border-green-500 text-green-400"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Jogos
        </button>
        <button
          onClick={() => setActiveTab("ligas")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "ligas"
              ? "border-green-500 text-green-400"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Ligas
        </button>
        <button
          onClick={() => setActiveTab("usuarios")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "usuarios"
              ? "border-green-500 text-green-400"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Usuários
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "logs"
              ? "border-green-500 text-green-400"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          Logs
        </button>
      </div>

      {activeTab === "jogos" && (
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
            <div className="flex items-start justify-between mb-2 gap-4">
              <h2 className="text-lg font-semibold text-white">Sincronizar Resultados</h2>
              {/* Last auto-sync badge */}
              <div className="flex flex-col items-end shrink-0">
                <span className="text-xs text-zinc-500 mb-0.5">Última sincronização automática</span>
                {matchStats.lastSyncedAt ? (
                  <span className={`text-sm font-semibold ${
                    Date.now() - new Date(matchStats.lastSyncedAt).getTime() > 10 * 60_000
                      ? "text-red-400"
                      : "text-green-400"
                  }`}>
                    {formatSyncAge(matchStats.lastSyncedAt)}
                    <span className="text-zinc-500 font-normal ml-1.5 text-xs">
                      ({new Date(matchStats.lastSyncedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-zinc-500">Nunca sincronizado</span>
                )}
              </div>
            </div>
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

          {/* Section 3: Force re-sync */}
          <ForceResyncSection />

          {/* Section 4: Stats */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Banco de Dados</h2>
            <div className="bg-zinc-800 rounded-lg px-4 py-3 inline-flex items-center gap-3">
              <span className="text-2xl font-bold text-green-400">{matchStats.total}</span>
              <span className="text-sm text-zinc-400">jogos importados</span>
            </div>
          </section>
        </div>
      )}

      {activeTab === "ligas" && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-5">Ligas Importadas</h2>
          <ImportedLeaguesTab />
        </section>
      )}

      {activeTab === "usuarios" && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-5">Gerenciar Usuários</h2>
          <UsersTab />
        </section>
      )}

      {activeTab === "logs" && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-5">Log do Cron</h2>
          <LogsTab />
        </section>
      )}
    </div>
  );
}
