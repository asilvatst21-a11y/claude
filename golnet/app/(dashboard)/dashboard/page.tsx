import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Dashboard — PalpitaAí" };

async function getStats(userId: string) {
  const [predictions, leagueCount] = await Promise.all([
    prisma.prediction.findMany({
      where: { userId, result: { not: null } },
      select: { points: true, bonusPoints: true, result: true },
    }),
    prisma.leagueMember.count({ where: { userId } }),
  ]);

  const totalPoints = predictions.reduce((s: number, p) => s + p.points + p.bonusPoints, 0);
  const exactScores = predictions.filter((p) => p.result === "EXACT_SCORE").length;
  const accuracy = predictions.length > 0
    ? Math.round((predictions.filter((p) => p.result !== "WRONG").length / predictions.length) * 100)
    : 0;

  return { totalPoints, exactScores, accuracy, leagueCount, totalPredictions: predictions.length };
}

export default async function DashboardPage() {
  const session = await auth();
  const stats = await getStats(session?.user?.id ?? "");

  const cards = [
    { label: "Pontos totais", value: stats.totalPoints, icon: "⭐" },
    { label: "Palpites feitos", value: stats.totalPredictions, icon: "⚽" },
    { label: "Placares exatos", value: stats.exactScores, icon: "🎯" },
    { label: "% de acertos", value: `${stats.accuracy}%`, icon: "📈" },
    { label: "Ligas", value: stats.leagueCount, icon: "🏆" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">
        Olá, {session?.user?.name?.split(" ")[0]} 👋
      </h1>
      <p className="text-zinc-400 mb-8">Bem-vindo ao PalpitaAí — Copa do Mundo 2026</p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
        {cards.map(({ label, value, icon }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-2xl mb-2">{icon}</div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-zinc-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

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
