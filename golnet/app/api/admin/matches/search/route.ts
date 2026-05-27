import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { homeTeam: { contains: q, mode: "insensitive" } },
        { awayTeam: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { startsAt: "desc" },
    take: 20,
    select: {
      id: true,
      externalId: true,
      homeTeam: true,
      awayTeam: true,
      homeScore: true,
      awayScore: true,
      status: true,
      startsAt: true,
      leagueName: true,
      round: true,
    },
  });

  return NextResponse.json(matches);
}
