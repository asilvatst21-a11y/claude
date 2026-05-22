import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { seedAchievements } from "@/lib/achievements";
import { CityEditor } from "./city-editor";
import { BioEditor } from "./bio-editor";
import { ProfileVisibilityToggle } from "./profile-visibility-toggle";
import { teamLogo } from "@/lib/utils";

export const metadata = { title: "Perfil — PalpitaAí" };

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

export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  await seedAchievements();

  const [user, userAchievements, allAchievements, predHistory, duels] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true, username: true, email: true, image: true,
        country: true, bio: true, state: true, city: true,
        profilePublic: true, createdAt: true,
        _count: { select: { predictions: true, leagueMembers: true } },
      },
    }),
    prisma.userAchievement.findMany({ where: { userId }, include: { achievement: true } }),
    prisma.achievement.findMany(),
    prisma.prediction.findMany({
      where: { userId, result: { not: null } },
      include: {
        match: {
          select: {
            homeTeam: true, awayTeam: true,
            homeTeamFlag: true, awayTeamFlag: true,
            homeScore: true, awayScore: true, leagueName: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.duel.findMany({
      where: { OR: [{ creatorId: userId }, { opponentId: userId }], status: "FINISHED" },
      select: { winnerId: true },
    }),
  ]);

  const evaluated = predHistory;
  const totalPoints = evaluated.reduce((s, p) => s + p.points + p.bonusPoints, 0);
  const exactScores = evaluated.filter((p) => p.result === "EXACT_SCORE").length;
  const accuracy = evaluated.length > 0
    ? Math.round((evaluated.filter((p) => p.result !== "WRONG").length / evaluated.length) * 100)
    : 0;

  const duelWins = duels.filter((d) => d.winnerId === userId).length;
  const duelLosses = duels.length - duelWins;
  const duelWinrate = duels.length > 0 ? Math.round((duelWins / duels.length) * 100) : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Meu Perfil</h1>

      {/* Info card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          {user?.image ? (
            <img src={user.image} alt="" className="w-16 h-16 rounded-full" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center text-2xl font-bold text-white">
              {user?.name?.[0] ?? "?"}
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-white">{user?.name}</h2>
            {user?.username && <p className="text-zinc-400 text-sm">@{user.username}</p>}
            <p className="text-zinc-500 text-xs mt-1">{user?.email}</p>
          </div>
        </div>

        <BioEditor currentBio={user?.bio ?? null} />

        <div className="grid grid-cols-2 gap-3 text-sm text-zinc-400 mb-4">
          {user?.city && user?.state && (
            <div><span className="text-zinc-500">Cidade: </span>{user.city} / {user.state}</div>
          )}
          <div>
            <span className="text-zinc-500">Membro desde: </span>
            {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("pt-BR") : "-"}
          </div>
        </div>

        <CityEditor currentState={user?.state ?? null} currentCity={user?.city ?? null} />
        <ProfileVisibilityToggle initial={user?.profilePublic ?? true} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Pontos totais", value: totalPoints, icon: "⭐" },
          { label: "Palpites", value: user?._count.predictions ?? 0, icon: "⚽" },
          { label: "Placares exatos", value: exactScores, icon: "🎯" },
          { label: "% acertos", value: `${accuracy}%`, icon: "📈" },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-xl font-bold text-white">{value}</div>
            <div className="text-xs text-zinc-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* X1 stats */}
      {duels.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">X1 Duelos ⚔️</h3>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{duelWins}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Vitórias</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">{duelLosses}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Derrotas</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{duels.length}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Total</p>
            </div>
            {duelWinrate !== null && (
              <div className="ml-auto text-right">
                <p className="text-2xl font-bold text-yellow-400">{duelWinrate}%</p>
                <p className="text-xs text-zinc-500 mt-0.5">Winrate</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Achievements */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <h3 className="font-semibold text-white mb-4">
          Conquistas{" "}
          <span className="text-sm font-normal text-zinc-500">({userAchievements.length}/{allAchievements.length})</span>
        </h3>
        {allAchievements.length === 0 ? (
          <p className="text-sm text-zinc-500">Faça palpites para desbloquear conquistas. 🏅</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allAchievements.map((achievement) => {
              const unlocked = userAchievements.find((ua) => ua.achievementId === achievement.id);
              return (
                <div
                  key={achievement.id}
                  className={`rounded-xl p-4 border text-center transition-all ${
                    unlocked ? "bg-green-500/10 border-green-500/30" : "bg-zinc-800/50 border-zinc-700 opacity-50"
                  }`}
                >
                  <div className="text-3xl mb-2">{achievement.icon}</div>
                  <p className="text-sm font-semibold text-white">{achievement.name}</p>
                  <p className="text-xs text-zinc-400 mt-1">{achievement.description}</p>
                  {unlocked && (
                    <p className="text-xs text-green-400 mt-2">
                      Desbloqueada em {new Date(unlocked.unlockedAt).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Prediction history */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h3 className="font-semibold text-white">Últimos palpites avaliados</h3>
        </div>
        {predHistory.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-10">Nenhum palpite avaliado ainda.</p>
        ) : (
          <div className="divide-y divide-zinc-800/50">
            {predHistory.map((pred) => {
              const m = pred.match;
              const pts = pred.points + pred.bonusPoints;
              return (
                <div key={pred.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {m.homeTeamFlag && <img src={teamLogo(m.homeTeamFlag) ?? ""} alt="" className="w-4 h-4 object-contain shrink-0" />}
                    <span className="text-xs text-zinc-300 truncate">{m.homeTeam}</span>
                    <span className="text-zinc-600 text-xs shrink-0">x</span>
                    {m.awayTeamFlag && <img src={teamLogo(m.awayTeamFlag) ?? ""} alt="" className="w-4 h-4 object-contain shrink-0" />}
                    <span className="text-xs text-zinc-300 truncate">{m.awayTeam}</span>
                  </div>
                  <div className="text-xs text-zinc-400 shrink-0">
                    <span className="text-white font-medium">{pred.homeScore}–{pred.awayScore}</span>
                    <span className="text-zinc-600 mx-1">/</span>
                    <span>{m.homeScore ?? "?"}–{m.awayScore ?? "?"}</span>
                  </div>
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
