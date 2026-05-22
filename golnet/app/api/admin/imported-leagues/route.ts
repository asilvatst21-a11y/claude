import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function GET() {
  const session = await auth();
  if (!session || !isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const rows = await prisma.match.groupBy({
    by: ["leagueId", "leagueName", "leagueSeason"],
    where: { leagueId: { not: null } },
    _count: { id: true },
    orderBy: [{ leagueName: "asc" }],
  });

  return NextResponse.json(
    rows.map((r) => ({
      leagueId:     r.leagueId,
      leagueName:   r.leagueName,
      leagueSeason: r.leagueSeason,
      matchCount:   r._count.id,
    }))
  );
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session || !isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { leagueId, season } = await req.json() as { leagueId: number; season: number };
  if (!leagueId) return NextResponse.json({ error: "leagueId obrigatório" }, { status: 400 });

  // Collect match IDs first
  const matches = await prisma.match.findMany({
    where: { leagueId, leagueSeason: season },
    select: { id: true },
  });
  const matchIds = matches.map((m) => m.id);

  if (matchIds.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  // Delete in order to respect FK constraints
  await prisma.duelPrediction.deleteMany({ where: { matchId: { in: matchIds } } });
  await prisma.duelMatch.deleteMany({ where: { matchId: { in: matchIds } } });
  // Predictions cascade from Match, so this covers them
  await prisma.match.deleteMany({ where: { id: { in: matchIds } } });

  return NextResponse.json({ deleted: matchIds.length });
}
