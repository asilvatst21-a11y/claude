import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  // Get IDs of leagues the user already belongs to
  const myMemberships = userId
    ? await prisma.leagueMember.findMany({
        where: { userId },
        select: { leagueId: true },
      })
    : [];
  const myLeagueIds = myMemberships.map((m) => m.leagueId);

  const leagues = await prisma.league.findMany({
    where: {
      visibility: "PUBLIC",
      id: { notIn: myLeagueIds },
    },
    include: {
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json(leagues);
}
