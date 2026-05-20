import { prisma } from "@/lib/prisma";

const ACHIEVEMENT_DEFINITIONS = [
  {
    type: "FIRST_PREDICTION" as const,
    name: "Primeiro Palpite",
    description: "Fez seu primeiro palpite no PalpitaAí.",
    icon: "🎯",
  },
  {
    type: "EXACT_SCORE_3X" as const,
    name: "Artilheiro",
    description: "Acertou o placar exato em 3 jogos.",
    icon: "🎖️",
  },
  {
    type: "SHARP_SHOOTER" as const,
    name: "Atirador de Elite",
    description: "Acertou o resultado de 10 jogos (não WRONG).",
    icon: "🏹",
  },
  {
    type: "PERFECT_ROUND" as const,
    name: "Rodada Perfeita",
    description: "Acertou todos os palpites em uma rodada.",
    icon: "⭐",
  },
  {
    type: "LEAGUE_CHAMPION" as const,
    name: "Campeão de Liga",
    description: "Terminou em primeiro lugar em uma liga.",
    icon: "🏆",
  },
] as const;

export async function seedAchievements() {
  const count = await prisma.achievement.count();
  if (count > 0) return;

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    await prisma.achievement.upsert({
      where: { type: def.type },
      create: def,
      update: {},
    });
  }
}

async function unlockAchievement(userId: string, type: typeof ACHIEVEMENT_DEFINITIONS[number]["type"]) {
  const achievement = await prisma.achievement.findUnique({ where: { type } });
  if (!achievement) return;

  await prisma.userAchievement.upsert({
    where: { userId_achievementId: { userId, achievementId: achievement.id } },
    create: { userId, achievementId: achievement.id },
    update: {},
  });
}

export async function checkAndUnlockAchievements(userId: string) {
  // Seed achievements table if empty
  await seedAchievements();

  const predictions = await prisma.prediction.findMany({
    where: { userId },
    select: { result: true },
  });

  // FIRST_PREDICTION: has at least 1 prediction
  if (predictions.length >= 1) {
    await unlockAchievement(userId, "FIRST_PREDICTION");
  }

  // EXACT_SCORE_3X: at least 3 exact score results
  const exactScores = predictions.filter((p) => p.result === "EXACT_SCORE").length;
  if (exactScores >= 3) {
    await unlockAchievement(userId, "EXACT_SCORE_3X");
  }

  // SHARP_SHOOTER: at least 10 correct predictions (not WRONG and not null)
  const correct = predictions.filter(
    (p) => p.result !== null && p.result !== "WRONG"
  ).length;
  if (correct >= 10) {
    await unlockAchievement(userId, "SHARP_SHOOTER");
  }
}
