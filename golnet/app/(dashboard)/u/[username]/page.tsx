import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { teamLogo } from "@/lib/utils";

export async function generateMetadata({ params }: { params: { username: string } }) {
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: { name: true, username: true },
  });
  return { title: user ? `${user.name ?? user.username} — PalpitaAí` : "Perfil — PalpitaAí" };
}

const resultColor: Record<string, string> = {
  EXACT_SCORE:             "text-yellow-400 bg-yellow-400/10",
  CORRECT_RESULT_AND_DIFF: "text-blue-400 bg-blue-400/10",
  CORRECT_WINNER:          "text-green-400 bg-green-400/10",
  CORRECT_DRAW:            "text-green-400 bg-green-400/10",
  WRONG:                   "text-zinc-500 bg-zinc-800",
};
const resultLabel: Record<string, string> = {
  EXACT_SCORE:             "Exato",
  CORRECT_RESULT_AND_DIFF: "Diff",
  CORRECT_WINNER:          "Vencedor",
  CORRECT_DRAW:            "Empate",
  WRONG:                   "Errou",
};

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  await auth(); // ensures logged in (dashboard layout already guards this)

  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: {
      id: true, name: true, username: true, image: true,
      bio: true, city: true, state: true, plan: true, createdAt: true,
    },
  });

  if (!user) notFound();

  const [predictions, achievements, leaguePoints] = await Promise.all([
    prisma.prediction.findMany({
      where: { userId: user.id, result: { not: null } },
      include: {
        match: {
          select: {
            homeTeam: true, awayTeam: true,
            homeTeamFlag: true, awayTeamFlag: true,
            homeScore: true, awayScore: true,
            startsAt: true, leagueName: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.userAchievement.findMany({
      where: { userId: user.id },
      include: { achievement: true },
      orderBy: { unlockedAt: "desc" },
    }),
    prisma.leagueMember.aggregate({
      where: { userId: user.id },
      _sum: { totalPoints: true },
    }),
  ]);

  const totalPoints = leaguePoints._sum.totalPoints ?? 0;
  const exactScores = predictions.filter((p) => p.result === "EXACT_SCORE").length;
  const accuracy = predictions.length > 0
    ? Math.round((predictions.filter((p) => p.result !== "WRONG").length / predictions.length) * 100)
    : 0;

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/rankings" className="text-zinc-400 hover:text-white transition-colors text-sm">← Ranking</Link>
      </div>

      {/* Header card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-5">
        <div className="flex items-center gap-4">
          {user.image ? (
            <Image src={user.image} alt="" width={64} height={64} className="rounded-full shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center text-2xl font-bold text-white shrink-0">
              {user.name?.[0] ?? "?"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-white truncate">{user.name}</h1>
              {user.plan === "PRO" && (
                <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-semibold">PRO ⭐</span>
              )}
            </div>
            {user.username && <p className="text-zinc-400 text-sm">@{user.username}</p>}
            <p className="text-zinc-600 text-xs mt-1">
              {user.city && user.state ? `${user.city} / ${user.state} · ` : ""}
              Membro desde {formatDate(user.createdAt)}
            </p>
          </div>
        </div>
        {user.bio && (
          <p className="text-zinc-300 text-sm bg-zinc-800 rounded-lg px-4 py-3 mt-4">{user.bio}</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Pontos", value: totalPoints, icon: "⭐" },
          { label: "Palpites", value: predictions.length, icon: "⚽" },
          { label: "Placares exatos", value: exactScores, icon: "🎯" },
          { label: "% acertos", value: `${accuracy}%`, icon: "📈" },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-xl font-bold text-white">{value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Achievements */}
      {achievements.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">Conquistas ({achievements.length})</h2>
          <div className="flex flex-wrap gap-2">
            {achievements.map((ua) => (
              <div
                key={ua.id}
                title={`${ua.achievement.name} — ${ua.achievement.description}`}
                className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1.5"
              >
                <span className="text-base leading-none">{ua.achievement.icon}</span>
                <span className="text-xs font-medium text-green-300">{ua.achievement.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prediction history */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-300">Últimos palpites</h2>
        </div>
        {predictions.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-10">Nenhum palpite avaliado ainda.</p>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {predictions.map((pred) => {
              const m = pred.match;
              const pts = pred.points + pred.bonusPoints;
              return (
                <div key={pred.id} className="flex items-center gap-3 px-4 py-3">
                  {/* Teams */}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {m.homeTeamFlag && (
                      <img src={teamLogo(m.homeTeamFlag) ?? ""} alt="" className="w-4 h-4 object-contain shrink-0" />
                    )}
                    <span className="text-xs text-zinc-300 truncate">{m.homeTeam}</span>
                    <span className="text-zinc-600 text-xs shrink-0">x</span>
                    {m.awayTeamFlag && (
                      <img src={teamLogo(m.awayTeamFlag) ?? ""} alt="" className="w-4 h-4 object-contain shrink-0" />
                    )}
                    <span className="text-xs text-zinc-300 truncate">{m.awayTeam}</span>
                  </div>

                  {/* Prediction vs real */}
                  <div className="text-xs text-zinc-400 shrink-0">
                    <span className="text-white font-medium">{pred.homeScore}–{pred.awayScore}</span>
                    <span className="text-zinc-600 mx-1">/</span>
                    <span>{m.homeScore ?? "?"}–{m.awayScore ?? "?"}</span>
                  </div>

                  {/* Result badge */}
                  {pred.result && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${resultColor[pred.result] ?? ""}`}>
                      {resultLabel[pred.result] ?? pred.result}
                      {pts > 0 && ` +${pts}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
