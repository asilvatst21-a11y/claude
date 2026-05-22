import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFixturesByDate, mapApiStatus } from "@/lib/api-football";
import { calculatePoints } from "@/lib/scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

const BEARER = process.env.CRON_SECRET;

function authorize(req: Request) {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${BEARER}`;
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use São Paulo timezone so late-night matches (after 21h local = midnight UTC) are found
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const [todayFixtures, yesterdayFixtures] = await Promise.all([
    fetchFixturesByDate(today).catch(() => []),
    fetchFixturesByDate(yesterday).catch(() => []),
  ]);
  const fixtures = [...todayFixtures, ...yesterdayFixtures];

  let synced = 0;

  for (const fixture of fixtures) {
    const match = await prisma.match.findUnique({
      where: { externalId: String(fixture.fixture.id) },
    });
    if (!match) continue;

    const status = mapApiStatus(fixture.fixture.status.short);
    const homeScore = fixture.goals.home;
    const awayScore = fixture.goals.away;

    await prisma.match.update({
      where: { id: match.id },
      data: {
        homeScore: homeScore ?? undefined,
        awayScore: awayScore ?? undefined,
        status,
        lastSyncedAt: new Date(),
      },
    });

    if (status === "FINISHED" && homeScore !== null && awayScore !== null) {
      const predictions = await prisma.prediction.findMany({
        where: { matchId: match.id, result: null },
      });

      const round = match.round ?? "Fase de Grupos";

      for (const pred of predictions) {
        const { result, points, bonusPoints } = calculatePoints({
          predHome: pred.homeScore,
          predAway: pred.awayScore,
          realHome: homeScore,
          realAway: awayScore,
          stage: match.stage,
        });

        await prisma.prediction.update({
          where: { id: pred.id },
          data: { result, points, bonusPoints },
        });

        await prisma.leagueMember.updateMany({
          where: { userId: pred.userId },
          data: { totalPoints: { increment: points + bonusPoints } },
        });

        const total = points + bonusPoints;

        const memberships = await prisma.leagueMember.findMany({
          where: { userId: pred.userId },
          select: { leagueId: true },
        });

        for (const { leagueId } of memberships) {
          await prisma.roundRanking.upsert({
            where: { leagueId_userId_round: { leagueId, userId: pred.userId, round } },
            create: { leagueId, userId: pred.userId, round, points: total },
            update: { points: { increment: total } },
          });
        }
      }

      // Calculate duel predictions for this match
      const duelPreds = await prisma.duelPrediction.findMany({
        where: { matchId: match.id, result: null },
      });
      for (const dp of duelPreds) {
        const { result, points, bonusPoints } = calculatePoints({
          predHome: dp.homeScore, predAway: dp.awayScore,
          realHome: homeScore, realAway: awayScore, stage: match.stage,
        });
        await prisma.duelPrediction.update({
          where: { id: dp.id },
          data: { result, points, bonusPoints },
        });
      }

      // Check if all matches in any duel are finished → determine winner
      const affectedDuels = await prisma.duel.findMany({
        where: { status: "ACTIVE", matches: { some: { matchId: match.id } } },
        include: {
          matches: { include: { match: { select: { status: true } } } },
          predictions: true,
        },
      });

      for (const duel of affectedDuels) {
        const allDone = duel.matches.every((m) => m.match.status === "FINISHED" || m.match.status === "POSTPONED" || m.match.status === "CANCELLED");
        if (!allDone) continue;

        const sumPoints = (uid: string) =>
          duel.predictions.filter((p) => p.userId === uid).reduce((s, p) => s + p.points + p.bonusPoints, 0);

        const creatorPts = sumPoints(duel.creatorId);
        const opponentPts = duel.opponentId ? sumPoints(duel.opponentId) : 0;
        const winnerId = creatorPts >= opponentPts ? duel.creatorId : duel.opponentId;

        await prisma.duel.update({
          where: { id: duel.id },
          data: { status: "FINISHED", winnerId },
        });
      }
    }

    synced++;
  }

  return NextResponse.json({ synced, at: new Date() });
}
