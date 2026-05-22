import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/plans";

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

  // Plan enforcement: check total leagues limit
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });

  const planConfig = getUserPlan(user?.plan ?? "FREE");

  if (planConfig.maxLeagues !== Infinity) {
    const memberCount = await prisma.leagueMember.count({
      where: { userId: session.user.id },
    });

    if (memberCount >= planConfig.maxLeagues) {
      return NextResponse.json(
        {
          error: "Limite do plano Free atingido",
          message: `Você já está em ${memberCount} liga(s). Faça upgrade para participar de mais ligas.`,
          upgrade: true,
        },
        { status: 403 }
      );
    }
  }

  await prisma.leagueMember.create({
    data: { userId: session.user.id, leagueId: league.id, role: "MEMBER" },
  });

  return NextResponse.json(league);
}
