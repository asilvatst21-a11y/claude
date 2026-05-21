import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PredictionsView } from "./predictions-view";

export const metadata = { title: "Palpites — PalpitaAí" };

export default async function PredictionsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const matches = await prisma.match.findMany({
    include: {
      predictions: { where: { userId }, take: 1 },
    },
    orderBy: { startsAt: "asc" },
  });

  // Get all unique rounds in order
  const allRounds = Array.from(new Set(matches.map((m) => m.round).filter(Boolean))) as string[];

  // Current round = first round with at least one SCHEDULED or LIVE match
  const currentRound =
    allRounds.find((r) => matches.some((m) => m.round === r && (m.status === "SCHEDULED" || m.status === "LIVE"))) ??
    allRounds[allRounds.length - 1] ??
    null;

  return (
    <PredictionsView
      matches={matches}
      allRounds={allRounds}
      currentRound={currentRound}
      userId={userId}
    />
  );
}
