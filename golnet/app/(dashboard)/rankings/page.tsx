import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Image from "next/image";

export const metadata = { title: "Ranking — PalpitaAí" };

export default async function RankingsPage() {
  const session = await auth();

  const members = await prisma.leagueMember.groupBy({
    by: ["userId"],
    _sum: { totalPoints: true },
    orderBy: { _sum: { totalPoints: "desc" } },
    take: 50,
  });

  const userIds = members.map((m) => m.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, username: true, image: true, plan: true },
  });
  const usersMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const ranking = members.map((m, i) => ({
    rank: i + 1,
    totalPoints: m._sum.totalPoints ?? 0,
    ...usersMap[m.userId],
  }));

  const myRank = ranking.findIndex((r) => r.id === session?.user?.id) + 1;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Ranking Geral</h1>
      <p className="text-zinc-400 mb-6">Copa do Mundo 2026 — Top 50 jogadores</p>

      {myRank > 0 && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-3 mb-6 flex items-center justify-between">
          <span className="text-green-400 font-medium">Sua posição</span>
          <span className="text-2xl font-bold text-white">#{myRank}</span>
        </div>
      )}

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
            {ranking.map((entry) => (
              <tr
                key={entry.id}
                className={`border-b border-zinc-800/50 ${entry.id === session?.user?.id ? "bg-green-500/5" : ""}`}
              >
                <td className="px-4 py-3 text-sm font-bold text-zinc-400 w-12">
                  {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `#${entry.rank}`}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {entry.image ? (
                      <Image src={entry.image} alt="" width={32} height={32} className="rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold">
                        {entry.name?.[0] ?? "?"}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-white">{entry.name}</span>
                        {entry.plan === "PRO" && <span title="Pro">⭐</span>}
                        {entry.plan === "ENTERPRISE" && <span title="Empresarial">🏢</span>}
                      </div>
                      {entry.username && <div className="text-xs text-zinc-500">@{entry.username}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-bold text-green-400">{entry.totalPoints}</span>
                </td>
              </tr>
            ))}
            {ranking.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-zinc-500 py-10 text-sm">
                  Nenhum palpite registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
