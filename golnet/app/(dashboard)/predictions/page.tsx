import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PredictionsView } from "./predictions-view";

export const metadata = { title: "Palpites — PalpitaAí" };

export default async function PredictionsPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const [allMatches, leagueCount, competitions] = await Promise.all([
    prisma.match.findMany({
      include: { predictions: { where: { userId }, take: 1 } },
      orderBy: { startsAt: "asc" },
    }),
    prisma.leagueMember.count({ where: { userId } }),
    prisma.match.findMany({
      where: { leagueId: { not: null } },
      select: { leagueId: true, leagueName: true, leagueSeason: true },
      distinct: ["leagueId", "leagueSeason"],
      orderBy: { leagueName: "asc" },
    }),
  ]);

  const availableCompetitions = competitions
    .filter((c) => c.leagueId && c.leagueName)
    .map((c) => ({ leagueId: c.leagueId!, leagueName: c.leagueName!, leagueSeason: c.leagueSeason }));

  return (
    <PredictionsView
      matches={allMatches}
      competitions={availableCompetitions}
      isInLeague={leagueCount > 0}
      userId={userId}
    />
  );
}
