import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchLiveMatches, fetchFinishedMatches } from "@/lib/api-football";
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

  const [live, finished] = await Promise.all([
    fetchLiveMatches().catch(() => []),
    fetchFinishedMatches().catch(() => []),
  ]);

  const all = [...live, ...finished];

  for (const fixture of all) {
    const match = await prisma.match.findUnique({
      where: { externalId: String(fixture.fixture.id) },
    });
    if (!match) continue;

    const isFinished = fixture.fixture.status.short === "FT";
    const homeScore = fixture.goals.home;
    const awayScore = fixture.goals.away;

    await prisma.match.update({
      where: { id: match.id },
      data: {
        homeScore: homeScore ?? undefined,
        awayScore: awayScore ?? undefined,
        status: isFinished ? "FINISHED" : "LIVE",
        lastSyncedAt: new Date(),
      },
    });

    if (isFinished && homeScore !== null && awayScore !== null) {
      const predictions = await prisma.prediction.findMany({
        where: { matchId: match.id, result: null },
      });

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
      }
    }
  }

  return NextResponse.json({ synced: all.length, at: new Date() });
}
