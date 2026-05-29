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

type LeagueScoring = {
  ptsExactScore: number;
  ptsCorrectDiff: number;
  ptsCorrectWinner: number;
  ptsCorrectDraw: number;
  ptsKnockoutBonus: number;
  championPredictionEnabled: boolean;
  championPredictionPoints: number;
  goalScorerEnabled: boolean;
  goalScorerPoints: number;
};

interface LeagueTabsProps {
  leagueId: string;
  members: Member[];
  roundGroups: RoundGroup[];
  userPlan: string;
  userId: string;
  scoring: LeagueScoring;
}

const TABS = ["Jogos", "Ranking", "Rodadas", "H2H", "Regras"] as const;
type Tab = (typeof TABS)[number];

export function LeagueTabs({
  leagueId,
  members,
  roundGroups,
  userPlan,
  userId,
  scoring,
}: LeagueTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("Jogos");
  const isPro = userPlan !== "FREE";

  const hasBonus =
    scoring.ptsKnockoutBonus > 0 ||
    scoring.championPredictionEnabled ||
    scoring.goalScorerEnabled;

  const mainScoring = [
    {
      icon: "🎯",
      label: "Placar exato",
      desc: "Acertou o placar correto (ex: 2-1 → 2-1)",
      pts: scoring.ptsExactScore,
      color: "text-green-400",
    },
    {
      icon: "✅",
      label: "Placar parcial",
      desc: "Vencedor + diferença de gols certa (ex: 2-0 → 3-0)",
      pts: scoring.ptsCorrectDiff,
      color: "text-blue-400",
    },
    {
      icon: "🏆",
      label: "Vencedor",
      desc: "Acertou apenas o time que ganhou",
      pts: scoring.ptsCorrectWinner,
      color: "text-zinc-300",
    },
    {
      icon: "🤝",
      label: "Empate",
      desc: "Acertou que o jogo terminaria empatado",
      pts: scoring.ptsCorrectDraw,
      color: "text-zinc-300",
    },
  ];

  return (
    <>
      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-800 p-1 rounded-xl mb-6">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab
                ? "bg-zinc-900 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {tab === "Jogos" && "⚽ Jogos"}
            {tab === "Ranking" && "Ranking"}
            {tab === "Rodadas" && <>Rodadas{" "}⭐</>}
            {tab === "H2H" && <>H2H{" "}⭐</>}
            {tab === "Regras" && "📋 Regras"}
          </button>
        ))}
      </div>

      {/* Tab: Jogos */}
      {activeTab === "Jogos" && <LeagueMatches leagueId={leagueId} />}

      {/* Tab: Ranking */}
      {activeTab === "Ranking" && (
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
                  className={`flex items-center gap-4 px-4 py-3 ${isMe ? "bg-green-500/5" : ""}`}
                >
                  <span
                    className={`w-7 text-center font-bold text-sm ${
                      rank === 1 ? "text-yellow-400" : rank === 2 ? "text-zinc-300" : rank === 3 ? "text-amber-600" : "text-zinc-500"
                    }`}
                  >
                    {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
                  </span>

                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {member.user.image ? (
                      <img src={member.user.image} alt="" className="w-8 h-8 rounded-full shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                        {member.user.name?.[0] ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {member.user.name ?? "—"}
                        {isMe && <span className="ml-2 text-xs text-green-400">(você)</span>}
                      </p>
                      {member.user.username && (
                        <p className="text-xs text-zinc-500 truncate">@{member.user.username}</p>
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

      {/* Tab: Rodadas */}
      {activeTab === "Rodadas" && (
        <>
          {!isPro ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
              <span className="text-5xl mb-4 block">🔒</span>
              <h2 className="text-xl font-bold text-white mb-2">Recurso exclusivo Pro</h2>
              <p className="text-zinc-400 mb-6">
                O ranking por rodada é um recurso exclusivo do plano Pro.
                Faça upgrade para ver os pontos de cada rodada.
              </p>
              <Link href="/pricing" className="inline-block px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors">
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
                <div key={group.round} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-zinc-800">
                    <h3 className="font-semibold text-white">Rodada {group.round}</h3>
                  </div>
                  <div className="divide-y divide-zinc-800">
                    {group.entries.map((entry, index) => {
                      const rank = index + 1;
                      const isMe = entry.userId === userId;
                      return (
                        <div
                          key={entry.userId}
                          className={`flex items-center gap-4 px-4 py-3 ${isMe ? "bg-green-500/5" : ""}`}
                        >
                          <span
                            className={`w-7 text-center font-bold text-sm ${
                              rank === 1 ? "text-yellow-400" : rank === 2 ? "text-zinc-300" : rank === 3 ? "text-amber-600" : "text-zinc-500"
                            }`}
                          >
                            {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
                          </span>

                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {entry.image ? (
                              <img src={entry.image} alt="" className="w-8 h-8 rounded-full shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                                {entry.name?.[0] ?? "?"}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {entry.name ?? "—"}
                                {isMe && <span className="ml-2 text-xs text-green-400">(você)</span>}
                              </p>
                              {entry.username && (
                                <p className="text-xs text-zinc-500 truncate">@{entry.username}</p>
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
              <h2 className="text-xl font-bold text-white mb-2">Recurso exclusivo Pro</h2>
              <p className="text-zinc-400 mb-6">
                O confronto direto (H2H) é um recurso exclusivo do plano Pro.
                Faça upgrade para comparar seus palpites com qualquer membro da liga.
              </p>
              <Link href="/pricing" className="inline-block px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors">
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
                      <div key={member.id} className="flex items-center gap-4 px-4 py-3">
                        {member.user.image ? (
                          <img src={member.user.image} alt="" className="w-9 h-9 rounded-full shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                            {member.user.name?.[0] ?? "?"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{member.user.name ?? "—"}</p>
                          {member.user.username && (
                            <p className="text-xs text-zinc-500">@{member.user.username}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 mr-3">
                          <p className="text-sm font-bold text-green-400">{member.totalPoints} pts</p>
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

      {/* Tab: Regras */}
      {activeTab === "Regras" && (
        <div className="space-y-4">
          {/* Main scoring table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <h2 className="font-semibold text-white">Pontuação por palpite</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Quanto você ganha por cada tipo de acerto</p>
            </div>
            <div className="divide-y divide-zinc-800">
              {mainScoring.map(({ icon, label, desc, pts, color }) => (
                <div key={label} className="flex items-center gap-4 px-4 py-3.5">
                  <span className="text-2xl shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xl font-bold ${color}`}>{pts}</span>
                    <span className="text-zinc-500 text-xs ml-1">pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bonus section */}
          {hasBonus && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-zinc-800">
                <h2 className="font-semibold text-white">⚡ Bônus especiais</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Pontos extras configurados nesta liga</p>
              </div>
              <div className="divide-y divide-zinc-800">
                {scoring.ptsKnockoutBonus > 0 && (
                  <div className="flex items-center gap-4 px-4 py-3.5">
                    <span className="text-2xl shrink-0">⚡</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">Fase mata-mata</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Bônus adicional por acerto em jogos eliminatórios (oitavas, quartas, semi, final)
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xl font-bold text-yellow-400">+{scoring.ptsKnockoutBonus}</span>
                      <span className="text-zinc-500 text-xs ml-1">pts</span>
                    </div>
                  </div>
                )}
                {scoring.championPredictionEnabled && (
                  <div className="flex items-center gap-4 px-4 py-3.5">
                    <span className="text-2xl shrink-0">🏅</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">Campeão do torneio</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Pontos pelo palpite correto do campeão — creditados ao final do torneio
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xl font-bold text-yellow-400">{scoring.championPredictionPoints}</span>
                      <span className="text-zinc-500 text-xs ml-1">pts</span>
                    </div>
                  </div>
                )}
                {scoring.goalScorerEnabled && (
                  <div className="flex items-center gap-4 px-4 py-3.5">
                    <span className="text-2xl shrink-0">⚽</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">Artilheiro da partida</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Bônus por acertar o artilheiro de cada jogo
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xl font-bold text-yellow-400">+{scoring.goalScorerPoints}</span>
                      <span className="text-zinc-500 text-xs ml-1">pts</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Visual example */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800">
              <h2 className="font-semibold text-white">💡 Exemplo prático</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Resultado real: <span className="text-white font-semibold">Brasil 2 × 0 Argentina</span>
              </p>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                { palpite: "2 × 0", tipo: "Placar exato", pts: scoring.ptsExactScore, icon: "🎯", color: "text-green-400", bg: "bg-green-500/5" },
                { palpite: "3 × 0", tipo: "Placar parcial (vencedor + diff)", pts: scoring.ptsCorrectDiff, icon: "✅", color: "text-blue-400", bg: "" },
                { palpite: "1 × 0", tipo: "Vencedor certo", pts: scoring.ptsCorrectWinner, icon: "🏆", color: "text-zinc-300", bg: "" },
                { palpite: "0 × 0", tipo: "Errou tudo", pts: 0, icon: "❌", color: "text-red-400", bg: "" },
              ].map(({ palpite, tipo, pts, icon, color, bg }) => (
                <div key={palpite} className={`flex items-center gap-3 px-4 py-3 ${bg}`}>
                  <span className="text-lg shrink-0">{icon}</span>
                  <span className="font-mono text-white bg-zinc-800 px-2 py-0.5 rounded text-xs shrink-0">
                    {palpite}
                  </span>
                  <span className="text-zinc-400 text-xs flex-1">{tipo}</span>
                  <span className={`font-bold text-sm shrink-0 ${color}`}>
                    {pts > 0 ? `${pts} pts` : "0 pts"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Zero points note */}
          <p className="text-xs text-zinc-600 text-center px-2">
            Palpites não enviados não contam pontos. Errar o vencedor também resulta em 0 pts.
          </p>
        </div>
      )}
    </>
  );
}
