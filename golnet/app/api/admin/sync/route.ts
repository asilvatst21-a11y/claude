import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchFixturesByDate, mapApiStatus } from "@/lib/api-football";
import { calculatePoints } from "@/lib/scoring";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];
  const fixtures = await fetchFixturesByDate(today);

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

    synced++;
  }

  return NextResponse.json({ synced, at: new Date() });
}
