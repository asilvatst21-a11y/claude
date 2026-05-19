import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { inviteCode } = await req.json();
  if (!inviteCode) {
    return NextResponse.json({ error: "Código inválido" }, { status: 400 });
  }

  const league = await prisma.league.findUnique({ where: { inviteCode } });
  if (!league) {
    return NextResponse.json({ error: "Liga não encontrada" }, { status: 404 });
  }

  const existing = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: session.user.id, leagueId: league.id } },
  });
  if (existing) {
    return NextResponse.json({ error: "Você já é membro desta liga" }, { status: 409 });
  }

  await prisma.leagueMember.create({
    data: { userId: session.user.id, leagueId: league.id, role: "MEMBER" },
  });

  return NextResponse.json(league);
}
