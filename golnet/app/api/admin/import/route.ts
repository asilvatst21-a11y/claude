import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchLeagueFixtures,
  mapApiStatus,
  mapApiStage,
  extractGroup,
} from "@/lib/api-football";
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

  let imported = 0;
  let updated = 0;

  for (const fixture of fixtures) {
    const externalId = String(fixture.fixture.id);
    const status = mapApiStatus(fixture.fixture.status.short);
    const stage = mapApiStage(fixture.league.round);
    const group = extractGroup(fixture.league.round);
    const isFinished = status === "FINISHED";

    const data = {
      leagueId: fixture.league.id,
      leagueName: fixture.league.name,
      leagueSeason: fixture.league.season,
      homeTeam: fixture.teams.home.name,
      awayTeam: fixture.teams.away.name,
      homeTeamId: fixture.teams.home.id,
      awayTeamId: fixture.teams.away.id,
      homeTeamFlag: fixture.teams.home.logo,
      awayTeamFlag: fixture.teams.away.logo,
      startsAt: new Date(fixture.fixture.date),
      status,
      stage,
      group,
      round: fixture.league.round,
      venue: fixture.fixture.venue.name,
      homeScore: isFinished ? (fixture.goals.home ?? undefined) : undefined,
      awayScore: isFinished ? (fixture.goals.away ?? undefined) : undefined,
      lastSyncedAt: new Date(),
    };

    const existing = await prisma.match.findUnique({ where: { externalId } });

    if (existing) {
      await prisma.match.update({ where: { externalId }, data });
      updated++;
    } else {
      await prisma.match.create({ data: { externalId, ...data } });
      imported++;
    }
  }

  return NextResponse.json({ imported, updated, season: usedSeason });
}
