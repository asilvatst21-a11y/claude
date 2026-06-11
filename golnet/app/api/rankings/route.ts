import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 50;
  const skip = (page - 1) * limit;

  const [members, total] = await Promise.all([
    prisma.leagueMember.groupBy({
      by: ["userId"],
      _sum: { totalPoints: true },
      orderBy: { _sum: { totalPoints: "desc" } },
      skip,
      take: limit,
    }),
    prisma.user.count(),
  ]);

  const userIds = members.map((m) => m.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, username: true, image: true },
  });

  const usersMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const ranking = members.map((m, i) => ({
    rank: skip + i + 1,
    ...usersMap[m.userId],
    totalPoints: m._sum.totalPoints ?? 0,
  }));

  return NextResponse.json({ ranking, total, page, pages: Math.ceil(total / limit) });
}
