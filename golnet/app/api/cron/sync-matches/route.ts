import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshMatchScores } from "@/lib/sync-matches";
import { calculatePoints, PREDICTION_LOCK_MINUTES } from "@/lib/scoring";
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

async function runSync(): Promise<{ synced: number; warning?: string }> {
  const { synced, warning } = await refreshMatchScores();

  // Score predictions for any finished match that hasn't been scored yet — derived
  // straight from "result: null", not from this run's freshly-fetched fixtures, so a
  // match scored by a client-triggered refresh (or a previous run) is always caught up.
  const [regularPreds, duelPreds] = await Promise.all([
    prisma.prediction.findMany({
      where: { result: null, match: { status: "FINISHED", homeScore: { not: null }, awayScore: { not: null }, startsAt: { lte: new Date() } } },
      include: { match: { select: { homeScore: true, awayScore: true, stage: true, round: true } } },
    }),
    prisma.duelPrediction.findMany({
      where: { result: null, match: { status: "FINISHED", homeScore: { not: null }, awayScore: { not: null }, startsAt: { lte: new Date() } } },
      include: { match: { select: { homeScore: true, awayScore: true, stage: true } } },
    }),
  ]);

  if (regularPreds.length > 0 || duelPreds.length > 0) {
    await Promise.all(regularPreds.map(async (pred) => {
      const match = pred.match;
      if (match.homeScore === null || match.awayScore === null) return;

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
      const match = dp.match;
      if (match.homeScore === null || match.awayScore === null) return;

      const { result, points, bonusPoints } = calculatePoints({
        predHome: dp.homeScore, predAway: dp.awayScore,
        realHome: match.homeScore, realAway: match.awayScore, stage: match.stage,
      });

      await prisma.duelPrediction.update({
        where: { id: dp.id },
        data: { result, points, bonusPoints },
      });
    }));

    // Finalize any active duel whose matches are all done now
    const affectedDuels = await prisma.duel.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        creatorId: true,
        opponentId: true,
        matches: { select: { match: { select: { status: true } } } },
        predictions: { select: { userId: true, points: true, bonusPoints: true } },
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
  }

  // Round summaries: catch up on every known round, not just ones that just finished —
  // this also covers rounds that completed before this feature was deployed.
  const allRounds = await prisma.match.findMany({
    where: { externalId: { not: null } },
    select: { round: true },
    distinct: ["round"],
  });
  await maybeGenerateRoundSummaries(allRounds.map((m) => m.round ?? "Fase de Grupos")).catch(() => {});

  await sendLockReminders();

  return { synced, warning };
}

const REMINDERS = [
  { minutes: 30, field: "reminder30SentAt", title: "⏰ Faltam 30 minutos!", body: (h: string, a: string) => `Ainda dá tempo de palpitar em ${h} x ${a} antes do palpite fechar.` },
  { minutes: 10, field: "reminder10SentAt", title: "⏳ Faltam 10 minutos!", body: (h: string, a: string) => `Corre lá: o palpite de ${h} x ${a} fecha em 10 minutos.` },
  { minutes: 5,  field: "reminder5SentAt",  title: "🚨 Últimos 5 minutos!", body: (h: string, a: string) => `É agora ou nunca: o palpite de ${h} x ${a} tranca em 5 minutos.` },
] as const;

// Notify users who haven't predicted yet, as the prediction lock for a match approaches.
// Each tier (30/10/5 min before lock) fires once per match — tracked via reminder*SentAt
// columns — since this runs every 5 min via cron and would otherwise repeat.
async function sendLockReminders() {
  const now = new Date();

  const candidates = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startsAt: { gte: now },
      OR: [{ reminder30SentAt: null }, { reminder10SentAt: null }, { reminder5SentAt: null }],
    },
    select: {
      id: true, homeTeam: true, awayTeam: true, startsAt: true,
      reminder30SentAt: true, reminder10SentAt: true, reminder5SentAt: true,
    },
  });

  const subscribedUserIds = await prisma.pushSubscription.findMany({
    select: { userId: true },
    distinct: ["userId"],
  }).then((rows) => rows.map((r) => r.userId));
  if (subscribedUserIds.length === 0) return;

  for (const match of candidates) {
    const lockAt = new Date(match.startsAt.getTime() - PREDICTION_LOCK_MINUTES * 60 * 1000);

    for (const reminder of REMINDERS) {
      if (match[reminder.field]) continue;
      const reminderAt = new Date(lockAt.getTime() - reminder.minutes * 60 * 1000);
      if (now < reminderAt || now >= lockAt) continue;

      const predicted = await prisma.prediction.findMany({
        where: { matchId: match.id, userId: { in: subscribedUserIds } },
        select: { userId: true },
      });
      const predictedSet = new Set(predicted.map((p) => p.userId));
      const targets = subscribedUserIds.filter((id) => !predictedSet.has(id));

      await Promise.allSettled(
        targets.map((userId) =>
          sendPushToUser(userId, {
            title: reminder.title,
            body: reminder.body(match.homeTeam, match.awayTeam),
            url: "/predictions",
          })
        )
      );

      await prisma.match.update({ where: { id: match.id }, data: { [reminder.field]: now } });
    }
  }
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  let synced = 0;
  let fatalError: string | undefined;
  let warning: string | undefined;

  try {
    const result = await runSync();
    synced = result.synced;
    warning = result.warning;
  } catch (e) {
    fatalError = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - start;

  await prisma.cronLog.create({ data: { trigger: "auto", synced, durationMs, error: fatalError ?? warning } }).catch(() => {});

  if (fatalError) return NextResponse.json({ error: fatalError }, { status: 500 });
  return NextResponse.json({ synced, warning, at: new Date(), durationMs });
}
