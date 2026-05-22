import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { teamLogo } from "@/lib/utils";

export const metadata = { title: "Dashboard — PalpitaAí" };

async function getData(userId: string) {
  const spTz = { timeZone: "America/Sao_Paulo" };
  const today = new Date().toLocaleDateString("en-CA", spTz);
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const [allPredictions, evaluatedPredictions, leagueCount, globalRank, upcomingMatches, existingPreds] =
    await Promise.all([
      prisma.prediction.count({ where: { userId } }),
      prisma.prediction.findMany({
        where: { userId, result: { not: null } },
        select: { points: true, bonusPoints: true, result: true },
      }),
      prisma.leagueMember.count({ where: { userId } }),
      // rank = users with strictly more points + 1
      prisma.leagueMember.groupBy({
        by: ["userId"],
        _sum: { totalPoints: true },
      }).then(async (all) => {
        const myPoints = all.find((m) => m.userId === userId)?._sum.totalPoints ?? 0;
        const above = all.filter((m) => (m._sum.totalPoints ?? 0) > myPoints).length;
        return above + 1;
      }),
      // Upcoming SCHEDULED matches in the next 48h
      prisma.match.findMany({
        where: {
          status: "SCHEDULED",
          startsAt: { gte: new Date(`${today}T00:00:00`), lte: in48h },
        },
        select: {
          id: true, homeTeam: true, awayTeam: true,
          homeTeamFlag: true, awayTeamFlag: true,
          startsAt: true, leagueName: true,
        },
        orderBy: { startsAt: "asc" },
        take: 20,
      }),
      prisma.prediction.findMany({
        where: { userId },
        select: { matchId: true },
      }),
    ]);

  const predictedIds = new Set(existingPreds.map((p) => p.matchId));
  const pending = upcomingMatches.filter((m) => !predictedIds.has(m.id)).slice(0, 5);

  const totalPoints = evaluatedPredictions.reduce((s, p) => s + p.points + p.bonusPoints, 0);
  const exactScores = evaluatedPredictions.filter((p) => p.result === "EXACT_SCORE").length;
  const accuracy = evaluatedPredictions.length > 0
    ? Math.round((evaluatedPredictions.filter((p) => p.result !== "WRONG").length / evaluatedPredictions.length) * 100)
    : 0;

  return { totalPoints, exactScores, accuracy, leagueCount, totalPredictions: allPredictions, globalRank, pending };
}

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const data = await getData(userId);

  const cards = [
    { label: "Posição global", value: data.globalRank > 0 ? `#${data.globalRank}` : "—", icon: "🏆" },
    { label: "Pontos totais", value: data.totalPoints, icon: "⭐" },
    { label: "Palpites feitos", value: data.totalPredictions, icon: "⚽" },
    { label: "Placares exatos", value: data.exactScores, icon: "🎯" },
    { label: "% de acertos", value: `${data.accuracy}%`, icon: "📈" },
  ];

  const formatTime = (d: Date | string) =>
    new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">
        Olá, {session?.user?.name?.split(" ")[0]} 👋
      </h1>
      <p className="text-zinc-400 mb-8">Bem-vindo ao PalpitaAí</p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {cards.map(({ label, value, icon }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-2xl mb-2">{icon}</div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-zinc-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Upcoming matches without prediction */}
      {data.pending.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl mb-8">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="font-semibold text-white">Jogos aguardando palpite</h2>
            <Link href="/predictions" className="text-xs text-green-400 hover:text-green-300 transition-colors">
              Ver todos →
            </Link>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {data.pending.map((m) => (
              <Link
                key={m.id}
                href="/predictions"
                className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/50 transition-colors group"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {m.homeTeamFlag && <img src={teamLogo(m.homeTeamFlag) ?? ""} alt="" className="w-5 h-5 object-contain shrink-0" />}
                  <span className="text-sm text-white truncate">{m.homeTeam}</span>
                  <span className="text-zinc-600 text-xs shrink-0">x</span>
                  {m.awayTeamFlag && <img src={teamLogo(m.awayTeamFlag) ?? ""} alt="" className="w-5 h-5 object-contain shrink-0" />}
                  <span className="text-sm text-white truncate">{m.awayTeam}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-zinc-500">{formatTime(m.startsAt)}</span>
                  <span className="text-xs text-green-400 opacity-0 group-hover:opacity-100 transition-opacity">Palpitar →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-4">Sistema de pontuação</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { pts: "10 pts", label: "Placar exato", color: "text-yellow-400" },
            { pts: "7 pts", label: "Resultado + saldo correto", color: "text-green-400" },
            { pts: "5 pts", label: "Acertar o vencedor", color: "text-blue-400" },
            { pts: "4 pts", label: "Acertar empate (sem placar exato)", color: "text-blue-300" },
            { pts: "+3 pts", label: "Bônus em jogos do mata-mata", color: "text-purple-400" },
            { pts: "0 pts", label: "Nenhum acerto", color: "text-zinc-500" },
          ].map(({ pts, label, color }) => (
            <div key={label} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-3 py-2">
              <span className={`font-bold w-14 shrink-0 ${color}`}>{pts}</span>
              <span className="text-sm text-zinc-300">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
