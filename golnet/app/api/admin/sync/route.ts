import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchFixturesByDate, mapApiStatus } from "@/lib/api-football";
import { calculatePoints, pointsFromResult, type ScoringRules } from "@/lib/scoring";
import { isAdmin } from "@/lib/admin";

export async function POST() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
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
        // Calculate result using default rules (stored on Prediction for reference)
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

        // Update each league the user belongs to using that league's custom rules
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

        for (const membership of memberships) {
          const rules: ScoringRules = membership.league;
          const leaguePoints = pointsFromResult(result, match.stage, rules);

          await prisma.leagueMember.update({
            where: { id: membership.id },
            data: { totalPoints: { increment: leaguePoints } },
          });
        }
      }
    }

    synced++;
  }

  return NextResponse.json({ synced, at: new Date() });
}
