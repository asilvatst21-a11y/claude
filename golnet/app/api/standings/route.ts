import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchStandings } from "@/lib/api-football";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leagueId = Number(searchParams.get("leagueId"));
  const season = Number(searchParams.get("season"));

  if (!leagueId || !season) {
    return NextResponse.json({ error: "leagueId e season são obrigatórios" }, { status: 400 });
  }

  const standings = await fetchStandings(leagueId, season);
  return NextResponse.json({ standings });
}

export async function GET_LEAGUES(req: Request) {
  const leagues = await prisma.match.findMany({
    where: { leagueId: { not: null } },
    select: { leagueId: true, leagueName: true, leagueSeason: true },
    distinct: ["leagueId", "leagueSeason"],
    orderBy: { leagueName: "asc" },
  });
  return NextResponse.json(leagues);
}
