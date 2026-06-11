/**
 * Fix duels that ended in a tie but were incorrectly assigned a winner.
 * A tied duel has equal total points for both players — winnerId should be null.
 *
 * Run with: npx tsx scripts/fix-tied-duels.ts
 */

import { prisma } from "../lib/prisma";

async function main() {
  const finishedDuels = await prisma.duel.findMany({
    where: { status: "FINISHED", winnerId: { not: null } },
    include: { predictions: true },
  });

  console.log(`Checking ${finishedDuels.length} finished duels with a winner set...`);

  const tied: string[] = [];

  for (const duel of finishedDuels) {
    if (!duel.opponentId) continue;

    const sum = (uid: string) =>
      duel.predictions
        .filter((p) => p.userId === uid)
        .reduce((s, p) => s + p.points + p.bonusPoints, 0);

    const creatorScore = sum(duel.creatorId);
    const opponentScore = sum(duel.opponentId);

    if (creatorScore === opponentScore) {
      tied.push(duel.id);
      console.log(
        `  TIED duel ${duel.id}: ${creatorScore} vs ${opponentScore} pts — clearing winnerId`
      );
    }
  }

  if (tied.length === 0) {
    console.log("No tied duels found with incorrect winner. Nothing to fix.");
    return;
  }

  const { count } = await prisma.duel.updateMany({
    where: { id: { in: tied } },
    data: { winnerId: null },
  });

  console.log(`\nFixed ${count} duel(s). ✅`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
