import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.match.findMany({
    where: { leagueName: { not: null } },
    select: { leagueName: true, leagueId: true },
    distinct: ["leagueName"],
    orderBy: { leagueName: "asc" },
  });

  const competitions = rows
    .filter((r) => r.leagueName)
    .map((r) => ({ name: r.leagueName as string, leagueId: r.leagueId }));

  return NextResponse.json(competitions);
}
