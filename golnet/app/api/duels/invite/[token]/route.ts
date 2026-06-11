import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const duel = await prisma.duel.findUnique({
    where: { inviteToken: params.token },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      creatorId: true,
      opponentId: true,
      creator: { select: { id: true, name: true, username: true, image: true } },
      matches: {
        include: {
          match: {
            select: {
              id: true, homeTeam: true, awayTeam: true,
              homeTeamFlag: true, awayTeamFlag: true,
              startsAt: true, leagueName: true,
            },
          },
        },
        orderBy: { match: { startsAt: "asc" } },
      },
    },
  });

  if (!duel) return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });

  return NextResponse.json(duel);
}

export async function POST(_req: Request, { params }: { params: { token: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = session.user.id;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  if (user?.plan === "FREE") {
    return NextResponse.json({ error: "Recurso exclusivo para usuários PRO" }, { status: 403 });
  }

  const duel = await prisma.duel.findUnique({ where: { inviteToken: params.token } });
  if (!duel) return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
  if (duel.creatorId === userId) return NextResponse.json({ error: "Você não pode aceitar seu próprio duelo" }, { status: 400 });
  if (duel.status !== "PENDING") return NextResponse.json({ error: "Este convite não está mais disponível" }, { status: 400 });
  if (duel.expiresAt < new Date()) return NextResponse.json({ error: "Convite expirado" }, { status: 400 });

  const updated = await prisma.duel.update({
    where: { id: duel.id },
    data: { opponentId: userId, status: "ACTIVE" },
  });

  return NextResponse.json({ id: updated.id });
}
