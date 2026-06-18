import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFixturesByIds, mapApiStatus, extractGoals, type GoalEvent } from "@/lib/api-football";
import { calculatePoints } from "@/lib/scoring";
import { sendPushToUser } from "@/lib/push";
import { maybeGenerateRoundSummaries } from "@/lib/round-summary";

export const runtime = "nodejs";
export const maxDuration = 60;

const BEARER = process.env.CRON_SECRET;

function authorize(req: Request) {
  if (!BEARER) return false; // fail-closed when env var is absent
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${BEARER}`;
}

async function runSync(): Promise<{ synced: number }> {

  // Step 1: find matches that need syncing:
  // - SCHEDULED/LIVE within the 2-day SP window, OR
  // - any LIVE match regardless of date (catches stuck matches like this one)
  const spTz = { timeZone: "America/Sao_Paulo" };
  const today = new Date().toLocaleDateString("en-CA", spTz);
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", spTz);

  const windowStart = new Date(`${yesterday}T00:00:00`);
  const windowEnd   = new Date(`${today}T23:59:59`);

  let synced = 0;

  const dbMatches = await prisma.match.findMany({
    where: {
      externalId: { not: null },
      OR: [
        // Scheduled/live matches within today+yesterday window
        { status: { in: ["SCHEDULED", "LIVE"] }, startsAt: { gte: windowStart, lte: windowEnd } },
        // Any match still marked LIVE (stuck) — always re-check
        { status: "LIVE" },
      ],
    },
  });

  if (dbMatches.length === 0) return { synced: 0 };

  // Step 2: call API only for those specific IDs (batches of 20)
  const externalIds = dbMatches.map((m) => Number(m.externalId));
  const batches: number[][] = [];
  for (let i = 0; i < externalIds.length; i += 20) batches.push(externalIds.slice(i, i + 20));

  const fixtureArrays = await Promise.all(batches.map((b) => fetchFixturesByIds(b).catch(() => [])));
  const fixtures = fixtureArrays.flat();

  if (fixtures.length === 0) return { synced: 0 };

  const matchMap = Object.fromEntries(dbMatches.map((m) => [m.externalId!, m]));

  const finishedMatchIds: string[] = [];
  const freshGoals: Record<string, GoalEvent[]> = {};

  // Step 3: update all matches in parallel
  await Promise.all(fixtures.map(async (fixture) => {
    const match = matchMap[String(fixture.fixture.id)];
    if (!match) return;

    const status = mapApiStatus(fixture.fixture.status.short);
    const homeScore = fixture.goals.home;
    const awayScore = fixture.goals.away;
    const goals = (status === "FINISHED" || status === "LIVE") ? extractGoals(fixture) : undefined;
    if (goals && goals.length > 0) freshGoals[match.id] = goals;

    await prisma.match.update({
      where: { id: match.id },
      data: {
        homeScore: homeScore ?? undefined,
        awayScore: awayScore ?? undefined,
        status,
        lastSyncedAt: new Date(),
        ...(goals && goals.length > 0 ? { goals } : {}),
      },
    });

    synced++;
    if (status === "FINISHED" && homeScore !== null && awayScore !== null) {
      finishedMatchIds.push(match.id);
    }
  }));

  // Step 4: score predictions for finished matches
  if (finishedMatchIds.length > 0) {
    const matchById = Object.fromEntries(dbMatches.map((m) => [m.id, m]));

    const [regularPreds, duelPreds] = await Promise.all([
      prisma.prediction.findMany({ where: { matchId: { in: finishedMatchIds }, result: null } }),
      prisma.duelPrediction.findMany({ where: { matchId: { in: finishedMatchIds }, result: null } }),
    ]);

    await Promise.all(regularPreds.map(async (pred) => {
      const match = matchById[pred.matchId];
      if (!match || match.homeScore === null || match.awayScore === null) return;

      const { result, points, bonusPoints } = calculatePoints({
        predHome: pred.homeScore, predAway: pred.awayScore,
        realHome: match.homeScore, realAway: match.awayScore, stage: match.stage,
      });
      const total = points + bonusPoints;
      const round = match.round ?? "Fase de Grupos";

      const memberships = await prisma.leagueMember.findMany({
        where: { userId: pred.userId },
        select: { leagueId: true },
      });

      await Promise.all([
        prisma.prediction.update({
          where: { id: pred.id },
          data: { result, points, bonusPoints },
        }),
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
      const match = matchById[dp.matchId];
      if (!match || match.homeScore === null || match.awayScore === null) return;

      const { result, points, bonusPoints } = calculatePoints({
        predHome: dp.homeScore, predAway: dp.awayScore,
        realHome: match.homeScore, realAway: match.awayScore, stage: match.stage,
      });

      await prisma.duelPrediction.update({
        where: { id: dp.id },
        data: { result, points, bonusPoints },
      });
    }));

    // Finalize completed duels
    const affectedDuels = await prisma.duel.findMany({
      where: { status: "ACTIVE", matches: { some: { matchId: { in: finishedMatchIds } } } },
      include: {
        matches: { include: { match: { select: { id: true, status: true } } } },
        predictions: true,
      },
    });

    await Promise.all(affectedDuels.map(async (duel) => {
      const allDone = duel.matches.every((m) =>
        ["FINISHED", "POSTPONED", "CANCELLED"].includes(m.match.status)
      );
      if (!allDone) return;

      const sum = (uid: string) =>
        duel.predictions.filter((p) => p.userId === uid).reduce((s, p) => s + p.points + p.bonusPoints, 0);
      const creatorScore = sum(duel.creatorId);
      const opponentScore = duel.opponentId ? sum(duel.opponentId) : 0;
      const winnerId = creatorScore > opponentScore
        ? duel.creatorId
        : opponentScore > creatorScore
        ? duel.opponentId
        : null; // tie — no winner

      await prisma.duel.update({ where: { id: duel.id }, data: { status: "FINISHED", winnerId } });
    }));

    // Round summaries: generate banter recap once all matches in a round are done
    const affectedRounds = finishedMatchIds.map((id) => matchById[id]?.round ?? "Fase de Grupos");
    await maybeGenerateRoundSummaries(affectedRounds).catch(() => {});
  }

  // Notify users with predictions on matches starting in the next 15–30 min
  const now = new Date();
  const notifyFrom = new Date(now.getTime() + 15 * 60 * 1000);
  const notifyTo   = new Date(now.getTime() + 30 * 60 * 1000);

  const upcomingMatches = await prisma.match.findMany({
    where: { status: "SCHEDULED", startsAt: { gte: notifyFrom, lte: notifyTo } },
    select: { id: true, homeTeam: true, awayTeam: true },
  });

  if (upcomingMatches.length > 0) {
    const matchIds = upcomingMatches.map((m) => m.id);
    const preds = await prisma.prediction.findMany({
      where: { matchId: { in: matchIds } },
      select: { userId: true, matchId: true },
    });
    const matchById = Object.fromEntries(upcomingMatches.map((m) => [m.id, m]));
    await Promise.allSettled(preds.map((p) => {
      const m = matchById[p.matchId];
      if (!m) return Promise.resolve();
      return sendPushToUser(p.userId, {
        title: "Jogo começando em breve! ⏰",
        body: `${m.homeTeam} x ${m.awayTeam} — você tem um palpite registrado.`,
        url: "/predictions",
      });
    }));
  }

  return { synced };
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  let synced = 0;
  let error: string | undefined;

  try {
    const result = await runSync();
    synced = result.synced;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - start;

  await prisma.cronLog.create({ data: { trigger: "auto", synced, durationMs, error } }).catch(() => {});

  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ synced, at: new Date(), durationMs });
}
