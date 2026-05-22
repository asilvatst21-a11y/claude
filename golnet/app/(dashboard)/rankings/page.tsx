import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RankingsClient } from "./rankings-client";

export const metadata = { title: "Ranking — PalpitaAí" };

async function getGlobalRanking() {
  const predPoints = await prisma.prediction.groupBy({
    by: ["userId"],
    _sum: { points: true, bonusPoints: true },
    _count: { id: true },
    orderBy: [{ _sum: { points: "desc" } }, { _sum: { bonusPoints: "desc" } }],
    take: 50,
  });

  const userIds = predPoints.map((p) => p.userId);
  if (userIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, username: true, image: true, plan: true, city: true, state: true },
  });
  const usersMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return predPoints
    .filter((p) => usersMap[p.userId])
    .map((p, i) => ({
      rank: i + 1,
      totalPoints: (p._sum.points ?? 0) + (p._sum.bonusPoints ?? 0),
      ...usersMap[p.userId],
    }));
}

async function getCityRanking(city: string, state: string) {
  const cityUsers = await prisma.user.findMany({
    where: { city, state },
    select: { id: true, name: true, username: true, image: true, plan: true, city: true, state: true },
  });

  if (cityUsers.length === 0) return [];

  const userIds = cityUsers.map((u) => u.id);
  const members = await prisma.leagueMember.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _sum: { totalPoints: true },
    orderBy: { _sum: { totalPoints: "desc" } },
  });

  const usersMap = Object.fromEntries(cityUsers.map((u) => [u.id, u]));

  return members.map((m, i) => ({
    rank: i + 1,
    totalPoints: m._sum.totalPoints ?? 0,
    ...usersMap[m.userId],
  }));
}

async function getCityStats() {
  const usersWithCity = await prisma.user.findMany({
    where: { city: { not: null }, state: { not: null } },
    select: { city: true, state: true },
  });

  const map: Record<string, { city: string; state: string; count: number }> = {};
  for (const u of usersWithCity) {
    const key = `${u.state}-${u.city}`;
    if (!map[key]) map[key] = { city: u.city!, state: u.state!, count: 0 };
    map[key].count++;
  }

  return Object.values(map).sort((a, b) => b.count - a.count);
}

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: { city?: string; state?: string };
}) {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const currentUser = await prisma.user.findUnique({
    where: { id: userId || "none" },
    select: { city: true, state: true },
  });

  const selectedCity = searchParams.city ?? currentUser?.city ?? "";
  const selectedState = searchParams.state ?? currentUser?.state ?? "";

  const [ranking, cityRanking, cityStats] = await Promise.all([
    getGlobalRanking(),
    selectedCity && selectedState ? getCityRanking(selectedCity, selectedState) : Promise.resolve([]),
    getCityStats(),
  ]);

  const myRank = ranking.findIndex((r) => r.id === userId) + 1;
  const myCityRank = cityRanking.findIndex((r) => r.id === userId) + 1;

  return (
    <RankingsClient
      ranking={ranking}
      cityRanking={cityRanking}
      cityStats={cityStats}
      currentUserId={userId}
      myRank={myRank}
      myCityRank={myCityRank}
      selectedCity={selectedCity}
      selectedState={selectedState}
      userCity={currentUser?.city ?? null}
      userState={currentUser?.state ?? null}
    />
  );
}
