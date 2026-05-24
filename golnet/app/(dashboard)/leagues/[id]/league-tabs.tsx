"use client";

import { useState } from "react";
import Link from "next/link";
import { LeagueMatches } from "./league-matches";

type Member = {
  id: string;
  userId: string;
  totalPoints: number;
  role: string;
  user: {
    id: string;
    name: string | null;
    username: string | null;
    image: string | null;
  };
};

type RoundGroup = {
  round: string;
  entries: {
    userId: string;
    name: string | null;
    image: string | null;
    username: string | null;
    points: number;
  }[];
};

interface LeagueTabsProps {
  leagueId: string;
  members: Member[];
  roundGroups: RoundGroup[];
  userPlan: string;
  userId: string;
}

const TABS = ["Jogos", "Ranking Geral", "Por Rodada", "H2H"] as const;
type Tab = (typeof TABS)[number];

export function LeagueTabs({
  leagueId,
  members,
  roundGroups,
  userPlan,
  userId,
}: LeagueTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Jogos");
  const isPro = userPlan !== "FREE";

  return (
    <>
      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-800 p-1 rounded-xl mb-6">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-zinc-900 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {tab === "Jogos" ? "⚽ Jogos" : tab}
            {(tab === "Por Rodada" || tab === "H2H") && " ⭐"}
          </button>
        ))}
      </div>

      {/* Tab: Jogos */}
      {activeTab === "Jogos" && <LeagueMatches leagueId={leagueId} />}

      {/* Tab: Ranking Geral */}
      {activeTab === "Ranking Geral" && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="font-semibold text-white">Ranking da Liga</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {members.map((member, index) => {
              const rank = index + 1;
              const isMe = member.userId === userId;
              return (
                <div
                  key={member.id}
                  className={`flex items-center gap-4 px-4 py-3 ${
                    isMe ? "bg-green-500/5" : ""
                  }`}
                >
                  <span
                    className={`w-7 text-center font-bold text-sm ${
                      rank === 1
                        ? "text-yellow-400"
                        : rank === 2
                        ? "text-zinc-300"
                        : rank === 3
                        ? "text-amber-600"
                        : "text-zinc-500"
                    }`}
                  >
                    {rank === 1
                      ? "🥇"
                      : rank === 2
                      ? "🥈"
                      : rank === 3
                      ? "🥉"
                      : rank}
                  </span>

                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {member.user.image ? (
                      <img
                        src={member.user.image}
                        alt=""
                        className="w-8 h-8 rounded-full shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                        {member.user.name?.[0] ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {member.user.name ?? "—"}
                        {isMe && (
                          <span className="ml-2 text-xs text-green-400">
                            (você)
                          </span>
                        )}
                      </p>
                      {member.user.username && (
                        <p className="text-xs text-zinc-500 truncate">
                          @{member.user.username}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="font-bold text-green-400 text-sm shrink-0">
                    {member.totalPoints} pts
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Por Rodada */}
      {activeTab === "Por Rodada" && (
        <>
          {!isPro ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
              <span className="text-5xl mb-4 block">🔒</span>
              <h2 className="text-xl font-bold text-white mb-2">
                Recurso exclusivo Pro
              </h2>
              <p className="text-zinc-400 mb-6">
                O ranking por rodada é um recurso exclusivo do plano Pro.
                Faça upgrade para ver os pontos de cada rodada.
              </p>
              <Link
                href="/pricing"
                className="inline-block px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors"
              >
                Fazer upgrade para Pro
              </Link>
            </div>
          ) : roundGroups.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-zinc-500">
              Nenhum dado de rodada disponível ainda.
            </div>
          ) : (
            <div className="space-y-4">
              {roundGroups.map((group) => (
                <div
                  key={group.round}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
                >
                  <div className="p-4 border-b border-zinc-800">
                    <h3 className="font-semibold text-white">
                      Rodada {group.round}
                    </h3>
                  </div>
                  <div className="divide-y divide-zinc-800">
                    {group.entries.map((entry, index) => {
                      const rank = index + 1;
                      const isMe = entry.userId === userId;
                      return (
                        <div
                          key={entry.userId}
                          className={`flex items-center gap-4 px-4 py-3 ${
                            isMe ? "bg-green-500/5" : ""
                          }`}
                        >
                          <span
                            className={`w-7 text-center font-bold text-sm ${
                              rank === 1
                                ? "text-yellow-400"
                                : rank === 2
                                ? "text-zinc-300"
                                : rank === 3
                                ? "text-amber-600"
                                : "text-zinc-500"
                            }`}
                          >
                            {rank === 1
                              ? "🥇"
                              : rank === 2
                              ? "🥈"
                              : rank === 3
                              ? "🥉"
                              : rank}
                          </span>

                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {entry.image ? (
                              <img
                                src={entry.image}
                                alt=""
                                className="w-8 h-8 rounded-full shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                                {entry.name?.[0] ?? "?"}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {entry.name ?? "—"}
                                {isMe && (
                                  <span className="ml-2 text-xs text-green-400">
                                    (você)
                                  </span>
                                )}
                              </p>
                              {entry.username && (
                                <p className="text-xs text-zinc-500 truncate">
                                  @{entry.username}
                                </p>
                              )}
                            </div>
                          </div>

                          <span className="font-bold text-green-400 text-sm shrink-0">
                            {entry.points} pts
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab: H2H */}
      {activeTab === "H2H" && (
        <>
          {!isPro ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
              <span className="text-5xl mb-4 block">🔒</span>
              <h2 className="text-xl font-bold text-white mb-2">
                Recurso exclusivo Pro
              </h2>
              <p className="text-zinc-400 mb-6">
                O confronto direto (H2H) é um recurso exclusivo do plano Pro.
                Faça upgrade para comparar seus palpites com qualquer membro da liga.
              </p>
              <Link
                href="/pricing"
                className="inline-block px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors"
              >
                Fazer upgrade para Pro
              </Link>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h2 className="font-semibold text-white">Confronto Direto</h2>
              </div>
              {members.filter((m) => m.userId !== userId).length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  Nenhum outro membro nesta liga ainda.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {members
                    .filter((m) => m.userId !== userId)
                    .map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-4 px-4 py-3"
                      >
                        {member.user.image ? (
                          <img
                            src={member.user.image}
                            alt=""
                            className="w-9 h-9 rounded-full shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                            {member.user.name?.[0] ?? "?"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {member.user.name ?? "—"}
                          </p>
                          {member.user.username && (
                            <p className="text-xs text-zinc-500">
                              @{member.user.username}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0 mr-3">
                          <p className="text-sm font-bold text-green-400">
                            {member.totalPoints} pts
                          </p>
                        </div>
                        <Link
                          href={`/leagues/${leagueId}/h2h?opponent=${member.userId}`}
                          className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
                        >
                          Duelar
                        </Link>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
