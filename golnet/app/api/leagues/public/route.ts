import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const myMemberships = userId
    ? await prisma.leagueMember.findMany({ where: { userId }, select: { leagueId: true } })
    : [];
  const myLeagueIds = myMemberships.map((m) => m.leagueId);

  const myRequests = userId
    ? await prisma.leagueJoinRequest.findMany({
        where: { userId, status: "PENDING" },
        select: { leagueId: true },
      })
    : [];
  const pendingRequestLeagueIds = new Set(myRequests.map((r) => r.leagueId));

  const leagues = await prisma.league.findMany({
    where: { id: { notIn: myLeagueIds } },
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const result = leagues.map((l) => ({
    ...l,
    hasPendingRequest: pendingRequestLeagueIds.has(l.id),
  }));

  return NextResponse.json(result);
}
