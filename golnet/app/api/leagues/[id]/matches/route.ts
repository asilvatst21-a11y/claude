import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [member, league] = await Promise.all([
    prisma.leagueMember.findUnique({
      where: { userId_leagueId: { userId: session.user.id, leagueId: params.id } },
    }),
    prisma.league.findUnique({
      where: { id: params.id },
      select: { competitionName: true, teamFilter: true },
    }),
  ]);

  if (!member || !league) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const where: Record<string, unknown> = {};
  if (league.competitionName) where.leagueName = league.competitionName;
  if (league.teamFilter.length > 0) {
    where.OR = [
      { homeTeam: { in: league.teamFilter } },
      { awayTeam: { in: league.teamFilter } },
    ];
  }

  const matches = await prisma.match.findMany({
    where,
    include: {
      predictions: { where: { userId: session.user.id }, take: 1 },
    },
    orderBy: { startsAt: "asc" },
  });

  return NextResponse.json(matches);
}
