import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [member, league] = await Promise.all([
    prisma.leagueMember.findUnique({
      where: { userId_leagueId: { userId: session.user.id, leagueId: params.id } },
    }),
    prisma.league.findUnique({
      where: { id: params.id },
      select: { competitionName: true, teamFilter: true },
    }),
  ]);

  if (!member || !league) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const where: Record<string, unknown> = {};
  if (league.competitionName) where.leagueName = league.competitionName;
  if (league.teamFilter.length > 0) {
    where.OR = [
      { homeTeam: { in: league.teamFilter } },
      { awayTeam: { in: league.teamFilter } },
    ];
  }

  const matches = await prisma.match.findMany({
    where,
    include: {
      predictions: { where: { userId: session.user.id }, take: 1 },
    },
    orderBy: { startsAt: "asc" },
  });

  // For locked matches (LIVE/FINISHED), fetch other league members' predictions
  const lockedMatchIds = matches
    .filter((m) => m.status === "LIVE" || m.status === "FINISHED")
    .map((m) => m.id);

  let otherPredsByMatch: Record<string, { userId: string; name: string | null; username: string | null; image: string | null; homeScore: number; awayScore: number; result: string | null; points: number; bonusPoints: number }[]> = {};

  if (lockedMatchIds.length > 0) {
    const leagueMembers = await prisma.leagueMember.findMany({
      where: { leagueId: params.id, userId: { not: session.user.id } },
      include: { user: { select: { id: true, name: true, username: true, image: true } } },
    });
    const memberUserIds = leagueMembers.map((m) => m.userId);

    if (memberUserIds.length > 0) {
      const otherPreds = await prisma.prediction.findMany({
        where: { matchId: { in: lockedMatchIds }, userId: { in: memberUserIds } },
        select: {
          matchId: true,
          userId: true,
          homeScore: true,
          awayScore: true,
          result: true,
          points: true,
          bonusPoints: true,
        },
      });

      const userMap = Object.fromEntries(leagueMembers.map((m) => [m.userId, m.user]));

      for (const pred of otherPreds) {
        if (!otherPredsByMatch[pred.matchId]) otherPredsByMatch[pred.matchId] = [];
        const user = userMap[pred.userId];
        otherPredsByMatch[pred.matchId].push({
          userId: pred.userId,
          name: user?.name ?? null,
          username: user?.username ?? null,
          image: user?.image ?? null,
          homeScore: pred.homeScore,
          awayScore: pred.awayScore,
          result: pred.result,
          points: (pred.points ?? 0) + (pred.bonusPoints ?? 0),
          bonusPoints: pred.bonusPoints ?? 0,
        });
      }
    }
  }

  const result = matches.map((m) => ({
    ...m,
    otherPredictions: otherPredsByMatch[m.id] ?? [],
  }));

  return NextResponse.json(result);
}
