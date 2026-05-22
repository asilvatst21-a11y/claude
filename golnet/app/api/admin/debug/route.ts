import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const API_KEY = process.env.API_FOOTBALL_KEY ?? "";
  const { searchParams } = new URL(req.url);
  const fixtureId = searchParams.get("fixture") ?? "1535214";

  const res = await fetch(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`, {
    headers: { "x-rapidapi-key": API_KEY, "x-apisports-key": API_KEY },
    cache: "no-store",
  });

  const json = await res.json();
  const fixture = json.response?.[0];

  return NextResponse.json({
    apiStatus: res.status,
    fixture: fixture ? {
      id: fixture.fixture.id,
      status: fixture.fixture.status,
      goals: fixture.goals,
      teams: { home: fixture.teams.home.name, away: fixture.teams.away.name },
    } : null,
    raw: json.response?.slice(0, 1),
  });
}
