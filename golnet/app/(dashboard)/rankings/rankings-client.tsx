"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BRAZIL_STATES, getCitiesByState } from "@/lib/cities";

function ShareRankButton({ rank, points, scope }: { rank: number; points: number; scope: string }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
    const text = `${medal} Estou na posição ${rank}º ${scope} do PalpitaAí com ${points} pontos! 🎯⚽\nVeja o ranking: https://palpitai.vercel.app/rankings`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  return (
    <button
      onClick={handleShare}
      className="text-xs px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 transition-colors"
    >
      {copied ? "✓ Copiado!" : "📤 Compartilhar"}
    </button>
  );
}

type RankEntry = {
  id: string;
  rank: number;
  totalPoints: number;
  name?: string | null;
  username?: string | null;
  image?: string | null;
  plan?: string;
  city?: string | null;
  state?: string | null;
};

type CityStats = { city: string; state: string; count: number };

interface Props {
  ranking: RankEntry[];
  cityRanking: RankEntry[];
  cityStats: CityStats[];
  currentUserId: string;
  myRank: number;
  myCityRank: number;
  selectedCity: string;
  selectedState: string;
  userCity: string | null;
  userState: string | null;
}

function RankTable({ entries, currentUserId }: { entries: RankEntry[]; currentUserId: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3 w-12">#</th>
            <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Jogador</th>
            <th className="text-right text-xs text-zinc-500 font-medium px-4 py-3">Pontos</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className={`border-b border-zinc-800/50 ${entry.id === currentUserId ? "bg-green-500/5" : ""}`}
            >
              <td className="px-4 py-3 text-sm font-bold text-zinc-400 w-12">
                {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `#${entry.rank}`}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={entry.username ? `/u/${entry.username}` : "#"}
                  className="flex items-center gap-3 group"
                >
                  {entry.image ? (
                    <Image src={entry.image} alt="" width={32} height={32} className="rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white">
                      {entry.name?.[0] ?? "?"}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-white group-hover:text-green-400 transition-colors">{entry.name}</span>
                      {entry.plan === "PRO" && <span title="Pro">⭐</span>}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {entry.username && `@${entry.username}`}
                      {entry.city && entry.state && (
                        <span className="ml-1 text-zinc-600">· {entry.city}/{entry.state}</span>
                      )}
                    </div>
                  </div>
                </Link>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="text-sm font-bold text-green-400">{entry.totalPoints}</span>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={3} className="text-center text-zinc-500 py-10 text-sm">
                Nenhum jogador encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function RankingsClient({
  ranking, cityRanking, cityStats, currentUserId,
  myRank, myCityRank, selectedCity, selectedState, userCity, userState,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"global" | "cidade">("global");
  const [filterState, setFilterState] = useState(selectedState);
  const [filterCity, setFilterCity] = useState(selectedCity);

  const cities = getCitiesByState(filterState);

  const handleSearch = () => {
    if (filterState && filterCity) {
      router.push(`/rankings?state=${encodeURIComponent(filterState)}&city=${encodeURIComponent(filterCity)}`);
    }
  };

  const selectClass = "bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50";

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Ranking</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-6 w-fit">
        {(["global", "cidade"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? "bg-green-500/20 text-green-400" : "text-zinc-400 hover:text-white"
            }`}
          >
            {t === "global" ? "🌎 Geral" : "📍 Por Cidade"}
          </button>
        ))}
      </div>

      {tab === "global" && (
        <>
          {myRank > 0 && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-3 mb-6 flex items-center justify-between">
              <span className="text-green-400 font-medium">Sua posição global</span>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-white">#{myRank}</span>
                <ShareRankButton
                  rank={myRank}
                  points={ranking.find((r) => r.id === currentUserId)?.totalPoints ?? 0}
                  scope="no ranking geral"
                />
              </div>
            </div>
          )}
          <RankTable entries={ranking} currentUserId={currentUserId} />
        </>
      )}

      {tab === "cidade" && (
        <>
          {/* City selector */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
            <p className="text-sm text-zinc-400 mb-3">Selecione um estado e cidade para ver o ranking local:</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                className={selectClass}
                value={filterState}
                onChange={(e) => { setFilterState(e.target.value); setFilterCity(""); }}
              >
                <option value="">Estado</option>
                {BRAZIL_STATES.map((s) => (
                  <option key={s.uf} value={s.uf}>{s.uf} — {s.name}</option>
                ))}
              </select>
              <select
                className={selectClass}
                value={filterCity}
                disabled={!filterState}
                onChange={(e) => setFilterCity(e.target.value)}
              >
                <option value="">{filterState ? "Cidade" : "Selecione o estado"}</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                onClick={handleSearch}
                disabled={!filterState || !filterCity}
                className="px-5 py-2 rounded-lg bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-semibold transition-colors"
              >
                Ver ranking
              </button>
            </div>

            {/* Quick access: top cities with most users */}
            {cityStats.length > 0 && (
              <div className="mt-4 pt-4 border-t border-zinc-800">
                <p className="text-xs text-zinc-500 mb-2">Cidades com mais jogadores:</p>
                <div className="flex flex-wrap gap-2">
                  {cityStats.slice(0, 8).map((c) => (
                    <button
                      key={`${c.state}-${c.city}`}
                      onClick={() => {
                        setFilterState(c.state);
                        setFilterCity(c.city);
                        router.push(`/rankings?state=${encodeURIComponent(c.state)}&city=${encodeURIComponent(c.city)}`);
                      }}
                      className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-green-500/40 hover:text-green-400 transition-colors"
                    >
                      📍 {c.city}/{c.state} ({c.count})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* My city ranking */}
          {myCityRank > 0 && userCity && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-3 mb-6 flex items-center justify-between">
              <span className="text-green-400 font-medium">
                Sua posição em {userCity}/{userState}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-white">#{myCityRank}</span>
                <ShareRankButton
                  rank={myCityRank}
                  points={cityRanking.find((r) => r.id === currentUserId)?.totalPoints ?? 0}
                  scope={`em ${userCity}/${userState}`}
                />
              </div>
            </div>
          )}

          {selectedCity && selectedState && (
            <>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                📍 {selectedCity} — {selectedState}
              </h2>
              <RankTable entries={cityRanking} currentUserId={currentUserId} />
            </>
          )}

          {!selectedCity && (
            <div className="text-center text-zinc-500 py-16">
              <p className="text-4xl mb-4">📍</p>
              <p>Selecione uma cidade para ver o ranking local.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
