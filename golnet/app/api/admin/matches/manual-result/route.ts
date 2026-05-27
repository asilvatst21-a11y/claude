import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculatePoints, pointsFromResult, type ScoringRules } from "@/lib/scoring";
import { isAdmin } from "@/lib/admin";

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json() as { matchId: string; homeScore: number; awayScore: number };
  const { matchId, homeScore, awayScore } = body;

  if (!matchId || homeScore == null || awayScore == null) {
    return NextResponse.json({ error: "matchId, homeScore e awayScore são obrigatórios" }, { status: 400 });
  }
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
    return NextResponse.json({ error: "Placar inválido" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Partida não encontrada" }, { status: 404 });

  const before = { status: match.status, homeScore: match.homeScore, awayScore: match.awayScore };

  await prisma.match.update({
    where: { id: matchId },
    data: { homeScore, awayScore, status: "FINISHED", lastSyncedAt: new Date() },
  });

  // Score all pending predictions (regular + duel)
  const [regularPreds, duelPreds] = await Promise.all([
    prisma.prediction.findMany({ where: { matchId, result: null } }),
    prisma.duelPrediction.findMany({ where: { matchId, result: null } }),
  ]);

  for (const pred of regularPreds) {
    const { result, points, bonusPoints } = calculatePoints({
      predHome: pred.homeScore,
      predAway: pred.awayScore,
      realHome: homeScore,
      realAway: awayScore,
      stage: match.stage,
    });

    const memberships = await prisma.leagueMember.findMany({
      where: { userId: pred.userId },
      include: {
        league: {
          select: {
            ptsExactScore: true,
            ptsCorrectDiff: true,
            ptsCorrectWinner: true,
            ptsCorrectDraw: true,
            ptsKnockoutBonus: true,
          },
        },
      },
    });

    await prisma.prediction.update({ where: { id: pred.id }, data: { result, points, bonusPoints } });

    for (const membership of memberships) {
      const rules: ScoringRules = membership.league;
      const leaguePoints = pointsFromResult(result, match.stage, rules);

      const round = match.round ?? "Fase de Grupos";
      await Promise.all([
        prisma.leagueMember.update({
          where: { id: membership.id },
          data: { totalPoints: { increment: leaguePoints } },
        }),
        prisma.roundRanking.upsert({
          where: { leagueId_userId_round: { leagueId: membership.leagueId, userId: pred.userId, round } },
          create: { leagueId: membership.leagueId, userId: pred.userId, round, points: leaguePoints },
          update: { points: { increment: leaguePoints } },
        }),
      ]);
    }
  }

  for (const dp of duelPreds) {
    const { result, points, bonusPoints } = calculatePoints({
      predHome: dp.homeScore,
      predAway: dp.awayScore,
      realHome: homeScore,
      realAway: awayScore,
      stage: match.stage,
    });
    await prisma.duelPrediction.update({ where: { id: dp.id }, data: { result, points, bonusPoints } });
  }

  return NextResponse.json({
    match: `${match.homeTeam} x ${match.awayTeam}`,
    before,
    after: { status: "FINISHED", homeScore, awayScore },
    regularPredsSc: regularPreds.length,
    duelPredsScored: duelPreds.length,
  });
}
