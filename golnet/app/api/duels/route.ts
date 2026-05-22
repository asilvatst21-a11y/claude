import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  matchIds: z.array(z.string()).min(1).max(10),
  opponentId: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = session.user.id;

  const duels = await prisma.duel.findMany({
    where: { OR: [{ creatorId: userId }, { opponentId: userId }] },
    include: {
      creator: { select: { id: true, name: true, username: true, image: true } },
      opponent: { select: { id: true, name: true, username: true, image: true } },
      winner:   { select: { id: true, name: true, username: true } },
      matches:  { include: { match: { select: { id: true, homeTeam: true, awayTeam: true, startsAt: true, status: true, leagueName: true } } } },
      predictions: { where: { userId }, select: { matchId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(duels);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = session.user.id;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  if (user?.plan === "FREE") return NextResponse.json({ error: "Recurso exclusivo para usuários PRO" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { matchIds, opponentId } = parsed.data;

  if (opponentId) {
    if (opponentId === userId) return NextResponse.json({ error: "Você não pode desafiar a si mesmo" }, { status: 400 });
    const opponent = await prisma.user.findUnique({ where: { id: opponentId }, select: { plan: true } });
    if (!opponent) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    if (opponent.plan === "FREE") return NextResponse.json({ error: "O adversário precisa ser PRO para participar" }, { status: 400 });
  }

  const matches = await prisma.match.findMany({ where: { id: { in: matchIds } }, select: { id: true } });
  if (matches.length !== matchIds.length) return NextResponse.json({ error: "Um ou mais jogos não encontrados" }, { status: 400 });

  const duel = await prisma.duel.create({
    data: {
      creatorId: userId,
      opponentId: opponentId ?? null,
      status: opponentId ? "PENDING" : "PENDING",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      matches: { create: matchIds.map((matchId) => ({ matchId })) },
    },
  });

  return NextResponse.json(duel, { status: 201 });
}
