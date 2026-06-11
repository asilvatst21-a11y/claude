import { prisma } from "@/lib/prisma";
import { StandingsView } from "./standings-view";

export const metadata = { title: "Classificação — PalpitaAí" };

export default async function StandingsPage() {
  const leagues = await prisma.match.findMany({
    where: { leagueId: { not: null } },
    select: { leagueId: true, leagueName: true, leagueSeason: true },
    distinct: ["leagueId", "leagueSeason"],
    orderBy: { leagueName: "asc" },
  });

  const available = leagues
    .filter((l) => l.leagueId && l.leagueName && l.leagueSeason)
    .map((l) => ({
      leagueId: l.leagueId!,
      leagueName: l.leagueName!,
      leagueSeason: l.leagueSeason!,
    }));

  return <StandingsView leagues={available} />;
}
