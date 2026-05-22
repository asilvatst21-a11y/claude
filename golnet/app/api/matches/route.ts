import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { MatchStage, MatchStatus } from "@prisma/client";

const VALID_STAGES = new Set<string>(["GROUP","ROUND_OF_16","QUARTER_FINAL","SEMI_FINAL","THIRD_PLACE","FINAL"]);
const VALID_STATUSES = new Set<string>(["SCHEDULED","LIVE","FINISHED","POSTPONED","CANCELLED"]);

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const stageParam  = searchParams.get("stage");
  const groupParam  = searchParams.get("group");
  const statusParam = searchParams.get("status");

  const stage  = stageParam  && VALID_STAGES.has(stageParam)   ? stageParam  as MatchStage  : undefined;
  const status = statusParam && VALID_STATUSES.has(statusParam) ? statusParam as MatchStatus : undefined;

  const matches = await prisma.match.findMany({
    where: {
      ...(stage  ? { stage }  : {}),
      ...(groupParam ? { group: groupParam } : {}),
      ...(status ? { status } : {}),
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
