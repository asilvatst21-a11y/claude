import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const leagues = await prisma.match.findMany({
    where: { leagueId: { not: null } },
    select: { leagueId: true, leagueName: true, leagueSeason: true },
    distinct: ["leagueId", "leagueSeason"],
    orderBy: { leagueName: "asc" },
  });
  return NextResponse.json(leagues);
}
