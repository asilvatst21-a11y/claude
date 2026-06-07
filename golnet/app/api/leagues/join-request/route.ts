import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { leagueId } = await req.json();
  if (!leagueId) return NextResponse.json({ error: "Liga inválida" }, { status: 400 });

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return NextResponse.json({ error: "Liga não encontrada" }, { status: 404 });
  if (league.visibility !== "PRIVATE") return NextResponse.json({ error: "Liga pública — entre diretamente" }, { status: 400 });

  const alreadyMember = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: session.user.id, leagueId } },
  });
  if (alreadyMember) return NextResponse.json({ error: "Você já é membro desta liga" }, { status: 409 });

  await prisma.leagueJoinRequest.upsert({
    where: { userId_leagueId: { userId: session.user.id, leagueId } },
    update: { status: "PENDING" },
    create: { userId: session.user.id, leagueId, status: "PENDING" },
  });

  return NextResponse.json({ ok: true });
}
