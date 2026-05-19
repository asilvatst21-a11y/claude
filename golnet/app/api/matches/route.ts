import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const group = searchParams.get("group");
  const status = searchParams.get("status");

  const matches = await prisma.match.findMany({
    where: {
      ...(stage ? { stage: stage as never } : {}),
      ...(group ? { group } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: {
      predictions: {
        where: { userId: session.user.id },
        take: 1,
      },
    },
    orderBy: { startsAt: "asc" },
  });

  return NextResponse.json(matches);
}
