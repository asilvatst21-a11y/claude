import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const member = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: session.user.id, leagueId: params.id } },
  });

  if (!member || member.role !== "OWNER") {
    return NextResponse.json({ error: "Apenas o dono pode excluir a liga" }, { status: 403 });
  }

  await prisma.league.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
