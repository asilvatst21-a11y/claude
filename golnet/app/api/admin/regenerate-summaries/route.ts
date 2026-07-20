import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { maybeGenerateRoundSummaries, maybeGenerateChampionshipSummaries } from "@/lib/round-summary";

export async function POST() {
  const session = await auth();
  if (!session || !isAdmin(session.user?.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const [deletedRound, deletedChamp] = await Promise.all([
    prisma.roundSummary.deleteMany({}),
    prisma.championshipSummary.deleteMany({}),
  ]);

  const allRounds = await prisma.match.findMany({
    where: { externalId: { not: null } },
    select: { round: true },
    distinct: ["round"],
  });
  await maybeGenerateRoundSummaries(allRounds.map((m) => m.round ?? "Fase de Grupos"), { notify: false });
  await maybeGenerateChampionshipSummaries();

  const [regenerated, championship] = await Promise.all([
    prisma.roundSummary.count(),
    prisma.championshipSummary.count(),
  ]);

  return NextResponse.json({ deleted: deletedRound.count + deletedChamp.count, regenerated, championship });
}
