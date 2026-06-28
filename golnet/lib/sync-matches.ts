import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  fetchFixturesByIds,
  fetchLeagueFixtures,
  mapApiStatus,
  mapApiStage,
  extractGroup,
  regulationScore,
  guardStatusAgainstKickoff,
  extractGoals,
  type ApiFixture,
  type GoalEvent,
} from "@/lib/api-football";

// Skip hitting the external API again if we already refreshed within this window —
// keeps frequent client-side polling from hammering API-Football or racing itself.
const MIN_REFRESH_INTERVAL_MS = 20_000;

export type RefreshResult = { synced: number; warning?: string; skipped?: boolean };

// Fetches live/scheduled-today matches from API-Football and writes score/status updates
// to the DB. Idempotent and safe to call concurrently (from cron or from logged-in users'
// browsers) — it never touches predictions or points, only the source-of-truth match state.
export async function refreshMatchScores(): Promise<RefreshResult> {
  const spTz = { timeZone: "America/Sao_Paulo" };
  const today = new Date().toLocaleDateString("en-CA", spTz);
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", spTz);

  // Brasília has been a fixed UTC-3 offset since DST was abolished in 2019 — the explicit
  // offset is required here, otherwise the server's (UTC) local time shifts this window by
  // 3 hours and silently drops any match starting after ~21:00 BRT from the candidate set.
  const windowStart = new Date(`${yesterday}T00:00:00-03:00`);
  const windowEnd = new Date(`${today}T23:59:59-03:00`);

  const matchFilter: Prisma.MatchWhereInput = {
    externalId: { not: null },
    OR: [
      { status: { in: ["SCHEDULED", "LIVE"] }, startsAt: { gte: windowStart, lte: windowEnd } },
      { status: "LIVE" },
    ],
  };

  const { _max, _count } = await prisma.match.aggregate({
    where: matchFilter,
    _max: { lastSyncedAt: true },
    _count: true,
  });

  if (_count === 0) return { synced: 0 };
  if (_max.lastSyncedAt && Date.now() - _max.lastSyncedAt.getTime() < MIN_REFRESH_INTERVAL_MS) {
    return { synced: 0, skipped: true };
  }

  const dbMatches = await prisma.match.findMany({
    where: matchFilter,
    select: { id: true, externalId: true, lastSyncedAt: true, startsAt: true },
  });

  const externalIds = dbMatches.map((m) => Number(m.externalId));
  const batches: number[][] = [];
  for (let i = 0; i < externalIds.length; i += 20) batches.push(externalIds.slice(i, i + 20));

  const failedBatchIds: number[] = [];
  const fixtureArrays = await Promise.all(
    batches.map((b) =>
      fetchFixturesByIds(b).catch((e) => {
        failedBatchIds.push(...b);
        console.error("sync-matches: batch fetch failed for ids", b, e);
        return [];
      })
    )
  );
  const fixtures = fixtureArrays.flat();
  const warning = failedBatchIds.length > 0
    ? `Falha ao buscar fixtures da API para externalId(s): ${failedBatchIds.join(", ")}`
    : undefined;

  if (fixtures.length === 0) return { synced: 0, warning };

  const matchMap = Object.fromEntries(dbMatches.map((m) => [m.externalId!, m]));
  const freshGoals: Record<string, GoalEvent[]> = {};
  let synced = 0;

  await Promise.all(fixtures.map(async (fixture) => {
    const match = matchMap[String(fixture.fixture.id)];
    if (!match) return;

    const status = guardStatusAgainstKickoff(mapApiStatus(fixture.fixture.status.short), match.startsAt);
    const { home: homeScore, away: awayScore } = regulationScore(fixture, status);
    const goals = (status === "FINISHED" || status === "LIVE") ? extractGoals(fixture) : undefined;
    if (goals && goals.length > 0) freshGoals[match.id] = goals;

    await prisma.match.update({
      where: { id: match.id },
      data: {
        homeScore: homeScore ?? undefined,
        awayScore: awayScore ?? undefined,
        status,
        lastSyncedAt: new Date(),
        ...(goals && goals.length > 0 ? { goals } : {}),
      },
    });

    synced++;
  }));

  return { synced, warning };
}

// Creates or updates Match rows from freshly-fetched fixtures — the same upsert logic used
// by the admin "Reimportar" button, shared here so automatic discovery can reuse it.
export async function upsertFixtures(fixtures: ApiFixture[]): Promise<{ imported: number; updated: number }> {
  let imported = 0;
  let updated = 0;

  for (const fixture of fixtures) {
    const externalId = String(fixture.fixture.id);
    const startsAt = new Date(fixture.fixture.date);
    const status = guardStatusAgainstKickoff(mapApiStatus(fixture.fixture.status.short), startsAt);
    const stage = mapApiStage(fixture.league.round);
    const group = extractGroup(fixture.league.round);
    const isFinished = status === "FINISHED";
    const score = regulationScore(fixture, status);

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
      startsAt,
      status,
      stage,
      group,
      round: fixture.league.round,
      venue: fixture.fixture.venue.name,
      homeScore: isFinished ? (score.home ?? undefined) : undefined,
      awayScore: isFinished ? (score.away ?? undefined) : undefined,
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

  return { imported, updated };
}

// Tournament brackets (round of 32, round of 16, etc.) only get published by API-Football
// once the previous stage finishes — a one-time import at the start of a tournament misses
// every later round. This re-pulls the full fixture list for any league/season that still
// has a SCHEDULED or LIVE match, so newly-announced knockout rounds appear without requiring
// an admin to manually click "Reimportar" again.
export async function discoverNewFixtures(): Promise<{ imported: number; updated: number }> {
  const activeLeagues = await prisma.match.findMany({
    where: {
      externalId: { not: null },
      status: { in: ["SCHEDULED", "LIVE"] },
      leagueId: { not: null },
      leagueSeason: { not: null },
    },
    select: { leagueId: true, leagueSeason: true },
    distinct: ["leagueId", "leagueSeason"],
  });

  let imported = 0;
  let updated = 0;

  for (const { leagueId, leagueSeason } of activeLeagues) {
    if (leagueId == null || leagueSeason == null) continue;
    try {
      const fixtures = await fetchLeagueFixtures(leagueId, leagueSeason);
      const result = await upsertFixtures(fixtures);
      imported += result.imported;
      updated += result.updated;
    } catch (e) {
      console.error("discoverNewFixtures: failed for league", leagueId, leagueSeason, e);
    }
  }

  return { imported, updated };
}
