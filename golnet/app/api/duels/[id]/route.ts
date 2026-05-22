import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = session.user.id;

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

  if (!duel) return NextResponse.json({ error: "Duelo não encontrado" }, { status: 404 });
  if (duel.creatorId !== userId && duel.opponentId !== userId) {
    // Allow viewing via invite link only if PENDING with no opponent yet
    if (duel.status !== "PENDING" || duel.opponentId !== null) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  }

  // Only reveal predictions for a match if both players submitted — or match is finished
  const safePredict = duel.predictions.map((p) => {
    const match = duel.matches.find((m) => m.matchId === p.matchId)?.match;
    const bothSubmitted =
      duel.predictions.filter((x) => x.matchId === p.matchId).length === 2;
    const isFinished = match?.status === "FINISHED";
    if (p.userId === userId || bothSubmitted || isFinished) return p;
    return { ...p, homeScore: null, awayScore: null, points: null, bonusPoints: null, result: null };
  });

  return NextResponse.json({ ...duel, predictions: safePredict });
}
