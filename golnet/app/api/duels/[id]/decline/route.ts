import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = session.user.id;

  const duel = await prisma.duel.findUnique({ where: { id: params.id } });
  if (!duel) return NextResponse.json({ error: "Duelo não encontrado" }, { status: 404 });
  if (duel.status !== "PENDING") return NextResponse.json({ error: "Este duelo não está mais disponível" }, { status: 400 });
  if (duel.creatorId === userId) return NextResponse.json({ error: "Você não pode recusar seu próprio duelo" }, { status: 400 });
  if (duel.opponentId && duel.opponentId !== userId) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const updated = await prisma.duel.update({
    where: { id: params.id },
    data: { status: "DECLINED" },
  });

  return NextResponse.json(updated);
}
