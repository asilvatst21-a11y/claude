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

  const today = new Date().toISOString().split("T")[0];
  const fixtures = await fetchFixturesByDate(today).catch(() => []);

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
    }

    synced++;
  }

  return NextResponse.json({ synced, at: new Date() });
}
