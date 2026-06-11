import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/plans";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const { inviteCode, leagueId } = body;

  if (!inviteCode && !leagueId) {
    return NextResponse.json({ error: "Código ou ID inválido" }, { status: 400 });
  }

  const league = inviteCode
    ? await prisma.league.findUnique({ where: { inviteCode } })
    : await prisma.league.findUnique({ where: { id: leagueId } });

  if (!league) {
    return NextResponse.json({ error: "Liga não encontrada" }, { status: 404 });
  }

  // Direct join by ID only allowed for public leagues
  if (!inviteCode && league.visibility !== "PUBLIC") {
    return NextResponse.json({ error: "Liga privada — use o código de convite" }, { status: 403 });
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
