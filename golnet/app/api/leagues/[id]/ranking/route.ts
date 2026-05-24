import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const membership = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: session.user.id, leagueId: params.id } },
  });
  if (!membership) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const members = await prisma.leagueMember.findMany({
    where: { leagueId: params.id },
    include: { user: { select: { id: true, name: true, username: true, image: true } } },
    orderBy: { totalPoints: "desc" },
  });

  const ranking = members.map((m, i) => ({
    rank: i + 1,
    userId: m.userId,
    name: m.user.name,
    username: m.user.username,
    image: m.user.image,
    totalPoints: m.totalPoints,
  }));

  return NextResponse.json(ranking);
}
