import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { DuelDetailClient } from "./duel-detail-client";

export default async function DuelPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const duel = await prisma.duel.findUnique({
    where: { id: params.id },
    include: {
      creator:  { select: { id: true, name: true, username: true, image: true, plan: true } },
      opponent: { select: { id: true, name: true, username: true, image: true, plan: true } },
      winner:   { select: { id: true, name: true, username: true } },
      matches: {
        include: {
          match: {
            select: {
              id: true, homeTeam: true, awayTeam: true, homeTeamFlag: true, awayTeamFlag: true,
              homeScore: true, awayScore: true, startsAt: true, status: true,
              leagueName: true, stage: true, round: true,
            },
          },
        },
        orderBy: { match: { startsAt: "asc" } },
      },
      predictions: {
        include: { user: { select: { id: true, name: true, username: true } } },
      },
    },
  });

  if (!duel) notFound();

  const isParticipant = duel.creatorId === userId || duel.opponentId === userId;

  // Guests can only view PENDING duels with no opponent (invite link flow)
  if (!isParticipant && !(duel.status === "PENDING" && !duel.opponentId)) {
    notFound();
  }

  // Mask predictions: hide if only one side submitted and match not finished
  const predictions = duel.predictions.map((p) => {
    const match = duel.matches.find((m) => m.matchId === p.matchId)?.match;
    const bothSubmitted = duel.predictions.filter((x) => x.matchId === p.matchId).length === 2;
    const isFinished = match?.status === "FINISHED" || match?.status === "POSTPONED";
    if (p.userId === userId || bothSubmitted || isFinished) return p;
    return { ...p, homeScore: -1, awayScore: -1, points: 0, bonusPoints: 0, result: null };
  });

  return (
    <DuelDetailClient
      duel={{ ...duel, predictions } as never}
      currentUserId={userId}
      inviteUrl={`${process.env.NEXTAUTH_URL ?? ""}/x1/${duel.id}`}
    />
  );
}
