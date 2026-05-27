import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPredictionLocked } from "@/lib/scoring";
import { checkAndUnlockAchievements } from "@/lib/achievements";

const schema = z.object({
  matchId: z.string(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  goalScorerPrediction: z.string().max(80).optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");

  const where = { userId: session.user.id, ...(matchId ? { matchId } : {}) };
  const predictions = await prisma.prediction.findMany({
    where,
    include: { match: true },
    orderBy: { match: { startsAt: "asc" } },
  });

  return NextResponse.json(predictions);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { matchId, homeScore, awayScore, goalScorerPrediction } = parsed.data;

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });

  if (isPredictionLocked(match.startsAt)) {
    return NextResponse.json({ error: "Palpites encerrados para este jogo" }, { status: 403 });
  }

  const prediction = await prisma.prediction.upsert({
    where: { userId_matchId: { userId: session.user.id, matchId } },
    create: { userId: session.user.id, matchId, homeScore, awayScore, goalScorerPrediction: goalScorerPrediction ?? null },
    update: { homeScore, awayScore, goalScorerPrediction: goalScorerPrediction ?? null },
  });

  // Check and unlock achievements after saving prediction (fire-and-forget)
  checkAndUnlockAchievements(session.user.id).catch(console.error);

  return NextResponse.json(prediction);
}
