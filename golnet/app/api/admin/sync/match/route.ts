import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchFixturesByIds, mapApiStatus, regulationScore, guardStatusAgainstKickoff } from "@/lib/api-football";
import { calculatePoints } from "@/lib/scoring";
import { isAdmin } from "@/lib/admin";

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { externalId } = await req.json() as { externalId: string };
  if (!externalId) return NextResponse.json({ error: "externalId obrigatório" }, { status: 400 });

  const match = await prisma.match.findUnique({
    where: { externalId: String(externalId) },
    select: { id: true, homeTeam: true, awayTeam: true, status: true, homeScore: true, awayScore: true, stage: true, round: true, startsAt: true },
  });
  if (!match) return NextResponse.json({ error: `Partida com externalId ${externalId} não encontrada no banco` }, { status: 404 });

  const fixtures = await fetchFixturesByIds([Number(externalId)]);
  if (!fixtures.length) return NextResponse.json({ error: "Fixture não encontrada na API" }, { status: 404 });

  const fixture = fixtures[0];
  const newStatus = guardStatusAgainstKickoff(mapApiStatus(fixture.fixture.status.short), match.startsAt);
  const { home: homeScore, away: awayScore } = regulationScore(fixture, newStatus);

  const before = { status: match.status, homeScore: match.homeScore, awayScore: match.awayScore };

  await prisma.match.update({
    where: { id: match.id },
    data: {
      homeScore: homeScore ?? undefined,
      awayScore: awayScore ?? undefined,
      status: newStatus,
      lastSyncedAt: new Date(),
    },
  });

  // Score predictions if match just became FINISHED
  if (newStatus === "FINISHED" && homeScore !== null && awayScore !== null) {
    const [regularPreds, duelPreds] = await Promise.all([
      prisma.prediction.findMany({ where: { matchId: match.id, result: null } }),
      prisma.duelPrediction.findMany({ where: { matchId: match.id, result: null } }),
    ]);

    await Promise.all(regularPreds.map(async (pred) => {
      const { result, points, bonusPoints } = calculatePoints({
        predHome: pred.homeScore, predAway: pred.awayScore,
        realHome: homeScore, realAway: awayScore, stage: match.stage,
      });
      const total = points + bonusPoints;
      const round = match.round ?? "Fase de Grupos";
      const memberships = await prisma.leagueMember.findMany({ where: { userId: pred.userId }, select: { leagueId: true } });

      await Promise.all([
        prisma.prediction.update({ where: { id: pred.id }, data: { result, points, bonusPoints } }),
        prisma.leagueMember.updateMany({ where: { userId: pred.userId }, data: { totalPoints: { increment: total } } }),
        ...memberships.map((m) =>
          prisma.roundRanking.upsert({
            where: { leagueId_userId_round: { leagueId: m.leagueId, userId: pred.userId, round } },
            create: { leagueId: m.leagueId, userId: pred.userId, round, points: total },
            update: { points: { increment: total } },
          })
        ),
      ]);
    }));

    await Promise.all(duelPreds.map(async (dp) => {
      const { result, points, bonusPoints } = calculatePoints({
        predHome: dp.homeScore, predAway: dp.awayScore,
        realHome: homeScore, realAway: awayScore, stage: match.stage,
      });
      await prisma.duelPrediction.update({ where: { id: dp.id }, data: { result, points, bonusPoints } });
    }));
  }

  return NextResponse.json({
    match: `${match.homeTeam} x ${match.awayTeam}`,
    before,
    after: { status: newStatus, homeScore, awayScore },
    predsScored: newStatus === "FINISHED" ? true : false,
  });
}
