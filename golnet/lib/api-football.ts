const BASE_URL = "https://v3.football.api-sports.io";
const API_KEY = process.env.API_FOOTBALL_KEY ?? "";

type ApiFixture = {
  fixture: { id: number; date: string; status: { short: string }; venue: { name: string } };
  teams: {
    home: { name: string; logo: string };
    away: { name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
  league: { round: string };
};

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-apisports-key": API_KEY },
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
