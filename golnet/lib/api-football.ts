import type { MatchStatus, MatchStage } from "@prisma/client";

const BASE_URL = "https://v3.football.api-sports.io";
const API_KEY = process.env.API_FOOTBALL_KEY ?? "";

export type ApiFixture = {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
    venue: { name: string };
  };
  teams: {
    home: { id: number; name: string; logo: string; winner?: boolean | null };
    away: { id: number; name: string; logo: string; winner?: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  league: { round: string };
};

type ApiLeagueResult = {
  league: { id: number; name: string; logo: string };
  country: { name: string };
};

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-rapidapi-key": API_KEY, "x-apisports-key": API_KEY },
    next: { revalidate: 120 },
  });
  if (!res.ok) throw new Error(`API-Football error: ${res.status}`);
  const json = await res.json();
  return json.response as T;
}

export async function fetchLiveMatches(leagueId = 1, season = 2026): Promise<ApiFixture[]> {
  return apiFetch<ApiFixture[]>(`/fixtures?league=${leagueId}&season=${season}&live=all`);
}

export async function fetchFinishedMatches(
  leagueId = 1,
  season = 2026
): Promise<ApiFixture[]> {
  return apiFetch<ApiFixture[]>(
    `/fixtures?league=${leagueId}&season=${season}&status=FT`
  );
}

export async function fetchFixtureById(fixtureId: number): Promise<ApiFixture[]> {
  return apiFetch<ApiFixture[]>(`/fixtures?id=${fixtureId}`);
}

export async function searchLeagues(query: string): Promise<ApiLeagueResult[]> {
  return apiFetch<ApiLeagueResult[]>(`/leagues?search=${encodeURIComponent(query)}`);
}

export async function fetchLeagueFixtures(
  leagueId: number,
  season: number
): Promise<ApiFixture[]> {
  return apiFetch<ApiFixture[]>(`/fixtures?league=${leagueId}&season=${season}`);
}

export async function fetchFixturesByDate(date: string): Promise<ApiFixture[]> {
  return apiFetch<ApiFixture[]>(`/fixtures?date=${date}`);
}

export function mapApiStatus(short: string): MatchStatus {
  switch (short) {
    case "NS":
      return "SCHEDULED";
    case "1H":
    case "HT":
    case "2H":
    case "ET":
    case "P":
      return "LIVE";
    case "FT":
    case "AET":
    case "PEN":
      return "FINISHED";
    case "PST":
      return "POSTPONED";
    case "CANC":
      return "CANCELLED";
    default:
      return "SCHEDULED";
  }
}

export function mapApiStage(round: string): MatchStage {
  if (round.includes("Group Stage")) return "GROUP";
  if (round.includes("Round of 16") || round.includes("1/8-finals")) return "ROUND_OF_16";
  if (round.includes("Quarter-finals")) return "QUARTER_FINAL";
  if (round.includes("Semi-finals")) return "SEMI_FINAL";
  if (round.includes("3rd Place Final")) return "THIRD_PLACE";
  if (round.includes("Final")) return "FINAL";
  return "GROUP";
}

export async function fetchHeadToHead(homeId: number, awayId: number, last = 5): Promise<ApiFixture[]> {
  return apiFetch<ApiFixture[]>(`/fixtures/headtohead?h2h=${homeId}-${awayId}&last=${last}`);
}

export async function fetchTeamLastMatches(teamId: number, last = 5): Promise<ApiFixture[]> {
  return apiFetch<ApiFixture[]>(`/fixtures?team=${teamId}&last=${last}`);
}

export function extractGroup(round: string): string | null {
  const match = round.match(/Group\s+([A-Z])/i);
  return match ? match[1].toUpperCase() : null;
}
