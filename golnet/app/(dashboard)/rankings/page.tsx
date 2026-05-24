import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RankingsClient } from "./rankings-client";

export const metadata = { title: "Ranking — PalpitaAí" };

async function getGlobalRanking() {
  const [allUsers, predPoints] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, username: true, image: true, plan: true, city: true, state: true },
    }),
    prisma.prediction.groupBy({
      by: ["userId"],
      _sum: { points: true, bonusPoints: true },
    }),
  ]);

  const pointsMap = Object.fromEntries(
    predPoints.map((p) => [p.userId, (p._sum.points ?? 0) + (p._sum.bonusPoints ?? 0)])
  );

  return allUsers
    .map((user) => ({ ...user, totalPoints: pointsMap[user.id] ?? 0 }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 100)
    .map((user, i) => ({ ...user, rank: i + 1 }));
}

async function getCityRanking(city: string, state: string) {
  const cityUsers = await prisma.user.findMany({
    where: { city, state },
    select: { id: true, name: true, username: true, image: true, plan: true, city: true, state: true },
  });

  if (cityUsers.length === 0) return [];

  const userIds = cityUsers.map((u) => u.id);
  const predPoints = await prisma.prediction.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _sum: { points: true, bonusPoints: true },
  });

  const pointsMap = Object.fromEntries(
    predPoints.map((p) => [p.userId, (p._sum.points ?? 0) + (p._sum.bonusPoints ?? 0)])
  );

  return cityUsers
    .map((user) => ({ ...user, totalPoints: pointsMap[user.id] ?? 0 }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((user, i) => ({ ...user, rank: i + 1 }));
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
