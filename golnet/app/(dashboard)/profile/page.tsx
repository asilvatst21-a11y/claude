import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { seedAchievements } from "@/lib/achievements";

export const metadata = { title: "Perfil — GolNet" };

export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  // Ensure achievement definitions exist
  await seedAchievements();

  const [user, userAchievements, allAchievements] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        username: true,
        email: true,
        image: true,
        country: true,
        bio: true,
        createdAt: true,
        _count: { select: { predictions: true, leagueMembers: true } },
      },
    }),
    prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
    }),
    prisma.achievement.findMany(),
  ]);

  const predictions = await prisma.prediction.findMany({
    where: { userId, result: { not: null } },
    select: { points: true, bonusPoints: true, result: true },
  });

  const totalPoints = predictions.reduce((s, p) => s + p.points + p.bonusPoints, 0);
  const exactScores = predictions.filter((p) => p.result === "EXACT_SCORE").length;
  const accuracy =
    predictions.length > 0
      ? Math.round(
          (predictions.filter((p) => p.result !== "WRONG").length / predictions.length) * 100
        )
      : 0;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Meu Perfil</h1>

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
            {user?.username && (
              <p className="text-zinc-400 text-sm">@{user.username}</p>
            )}
            <p className="text-zinc-500 text-xs mt-1">{user?.email}</p>
          </div>
        </div>

        {user?.bio && (
          <p className="text-zinc-300 text-sm bg-zinc-800 rounded-lg px-4 py-3 mb-4">
            {user.bio}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm text-zinc-400">
          {user?.country && (
            <div>
              <span className="text-zinc-500">País: </span>
              {user.country}
            </div>
          )}
          <div>
            <span className="text-zinc-500">Membro desde: </span>
            {user?.createdAt
              ? new Date(user.createdAt).toLocaleDateString("pt-BR")
              : "-"}
          </div>
        </div>
      </div>

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

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="font-semibold text-white mb-4">
          Conquistas{" "}
          <span className="text-sm font-normal text-zinc-500">
            ({userAchievements.length}/{allAchievements.length})
          </span>
        </h3>
        {allAchievements.length === 0 ? (
          <p className="text-sm text-zinc-500">Faça palpites para desbloquear conquistas. 🏅</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allAchievements.map((achievement) => {
              const unlocked = userAchievements.find(
                (ua) => ua.achievementId === achievement.id
              );
              return (
                <div
                  key={achievement.id}
                  className={`rounded-xl p-4 border text-center transition-all ${
                    unlocked
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-zinc-800/50 border-zinc-700 opacity-50"
                  }`}
                >
                  <div className="text-3xl mb-2">{achievement.icon}</div>
                  <p className="text-sm font-semibold text-white">
                    {achievement.name}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    {achievement.description}
                  </p>
                  {unlocked && (
                    <p className="text-xs text-green-400 mt-2">
                      Desbloqueada em{" "}
                      {new Date(unlocked.unlockedAt).toLocaleDateString("pt-BR")}
                    </p>
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
