import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchLeagueFixtures } from "@/lib/api-football";
import { upsertFixtures } from "@/lib/sync-matches";
import { isAdmin } from "@/lib/admin";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json() as {
    leagueId: number;
    season: number;
    leagueName: string;
  };

  const { leagueId, season } = body;

  let fixtures = await fetchLeagueFixtures(leagueId, season);
  let usedSeason = season;

  // API-Football uses the start year of the season (e.g. 2025 for 2025-26).
  // If nothing is found with the given year, retry with the previous year.
  if (fixtures.length === 0) {
    fixtures = await fetchLeagueFixtures(leagueId, season - 1);
    usedSeason = season - 1;
  }

  if (fixtures.length === 0) {
    return NextResponse.json({ imported: 0, updated: 0, error: `Nenhum jogo encontrado para temporada ${season} ou ${season - 1}` });
  }

  const { imported, updated } = await upsertFixtures(fixtures);

  return NextResponse.json({ imported, updated, season: usedSeason });
}
