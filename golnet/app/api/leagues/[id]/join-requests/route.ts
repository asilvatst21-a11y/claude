import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

interface Params { params: { id: string } }

async function requireAdmin(leagueId: string, userId: string) {
  const member = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });
  return member?.role === "OWNER" || member?.role === "ADMIN";
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const isAdmin = await requireAdmin(params.id, session.user.id);
  if (!isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const requests = await prisma.leagueJoinRequest.findMany({
    where: { leagueId: params.id, status: "PENDING" },
    include: { user: { select: { id: true, name: true, username: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(requests);
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const isAdmin = await requireAdmin(params.id, session.user.id);
  if (!isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { requestId, action } = await req.json();
  if (!requestId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const request = await prisma.leagueJoinRequest.findUnique({ where: { id: requestId } });
  if (!request || request.leagueId !== params.id) {
    return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 });
  }

  if (action === "approve") {
    await prisma.$transaction([
      prisma.leagueJoinRequest.update({ where: { id: requestId }, data: { status: "APPROVED" } }),
      prisma.leagueMember.create({
        data: { userId: request.userId, leagueId: params.id, role: "MEMBER" },
      }),
    ]);
  } else {
    await prisma.leagueJoinRequest.update({ where: { id: requestId }, data: { status: "REJECTED" } });
  }

  return NextResponse.json({ ok: true });
}
