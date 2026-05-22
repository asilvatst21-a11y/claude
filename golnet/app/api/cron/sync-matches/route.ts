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

  const spTz = { timeZone: "America/Sao_Paulo" };
  const today = new Date().toLocaleDateString("en-CA", spTz);
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", spTz);

  // Fetch both dates in parallel
  const [todayFixtures, yesterdayFixtures] = await Promise.all([
    fetchFixturesByDate(today).catch(() => []),
    fetchFixturesByDate(yesterday).catch(() => []),
  ]);

  // Only keep yesterday's fixtures that are still LIVE or unfinished
  const filteredYesterday = yesterdayFixtures.filter((f) => {
    const s = f.fixture.status.short;
    return s === "1H" || s === "HT" || s === "2H" || s === "ET" || s === "P" || s === "BT";
  });

  const fixtures = [...todayFixtures, ...filteredYesterday];
  if (fixtures.length === 0) return NextResponse.json({ synced: 0, at: new Date() });

  // Batch-fetch all relevant matches from DB in one query
  const externalIds = fixtures.map((f) => String(f.fixture.id));
  const dbMatches = await prisma.match.findMany({
    where: { externalId: { in: externalIds } },
  });
  const matchMap = Object.fromEntries(dbMatches.map((m) => [m.externalId!, m]));

  let synced = 0;
  const finishedMatchIds: string[] = [];

  // Update all matches in parallel batches of 5
  const chunks = [];
  for (let i = 0; i < fixtures.length; i += 5) chunks.push(fixtures.slice(i, i + 5));

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (fixture) => {
      const match = matchMap[String(fixture.fixture.id)];
      if (!match) return;

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

      synced++;

      if (status === "FINISHED" && homeScore !== null && awayScore !== null) {
        finishedMatchIds.push(match.id);
      }
    }));
  }

  // Process finished matches: calculate points for regular + duel predictions
  if (finishedMatchIds.length > 0) {
    // Batch-fetch all unscored predictions for finished matches
    const [regularPreds, duelPreds] = await Promise.all([
      prisma.prediction.findMany({ where: { matchId: { in: finishedMatchIds }, result: null } }),
      prisma.duelPrediction.findMany({ where: { matchId: { in: finishedMatchIds }, result: null } }),
    ]);

    const matchById = Object.fromEntries(dbMatches.map((m) => [m.id, m]));

    // Score regular predictions
    await Promise.all(regularPreds.map(async (pred) => {
      const match = matchById[pred.matchId];
      if (!match || match.homeScore === null || match.awayScore === null) return;

      const { result, points, bonusPoints } = calculatePoints({
        predHome: pred.homeScore, predAway: pred.awayScore,
        realHome: match.homeScore, realAway: match.awayScore, stage: match.stage,
      });

      const round = match.round ?? "Fase de Grupos";
      const total = points + bonusPoints;

      await prisma.prediction.update({ where: { id: pred.id }, data: { result, points, bonusPoints } });

      const memberships = await prisma.leagueMember.findMany({
        where: { userId: pred.userId }, select: { id: true, leagueId: true },
      });

      await Promise.all([
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

    // Score duel predictions
    await Promise.all(duelPreds.map(async (dp) => {
      const match = matchById[dp.matchId];
      if (!match || match.homeScore === null || match.awayScore === null) return;

      const { result, points, bonusPoints } = calculatePoints({
        predHome: dp.homeScore, predAway: dp.awayScore,
        realHome: match.homeScore, realAway: match.awayScore, stage: match.stage,
      });

      await prisma.duelPrediction.update({ where: { id: dp.id }, data: { result, points, bonusPoints } });
    }));

    // Check duels that might be fully finished
    const affectedDuels = await prisma.duel.findMany({
      where: { status: "ACTIVE", matches: { some: { matchId: { in: finishedMatchIds } } } },
      include: {
        matches: { include: { match: { select: { id: true, status: true } } } },
        predictions: true,
      },
    });

    await Promise.all(affectedDuels.map(async (duel) => {
      const allDone = duel.matches.every((m) =>
        m.match.status === "FINISHED" || m.match.status === "POSTPONED" || m.match.status === "CANCELLED"
      );
      if (!allDone) return;

      const sum = (uid: string) =>
        duel.predictions.filter((p) => p.userId === uid).reduce((s, p) => s + p.points + p.bonusPoints, 0);

      const creatorPts = sum(duel.creatorId);
      const opponentPts = duel.opponentId ? sum(duel.opponentId) : 0;
      const winnerId = creatorPts >= opponentPts ? duel.creatorId : duel.opponentId;

      await prisma.duel.update({ where: { id: duel.id }, data: { status: "FINISHED", winnerId } });
    }));
  }

  return NextResponse.json({ synced, at: new Date() });
}
