import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPredictionLocked } from "@/lib/scoring";

const schema = z.object({
  predictions: z.array(z.object({
    matchId: z.string(),
    homeScore: z.number().int().min(0),
    awayScore: z.number().int().min(0),
  })).min(1),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = session.user.id;

  const duel = await prisma.duel.findUnique({
    where: { id: params.id },
    include: { matches: { include: { match: true } } },
  });

  if (!duel) return NextResponse.json({ error: "Duelo não encontrado" }, { status: 404 });
  if (duel.status !== "ACTIVE") return NextResponse.json({ error: "Duelo não está ativo" }, { status: 400 });
  if (duel.creatorId !== userId && duel.opponentId !== userId) {
    return NextResponse.json({ error: "Você não faz parte deste duelo" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const duelMatchIds = new Set(duel.matches.map((m) => m.matchId));
  const matchMap = Object.fromEntries(duel.matches.map((m) => [m.matchId, m.match]));

  const errors: string[] = [];
  for (const pred of parsed.data.predictions) {
    if (!duelMatchIds.has(pred.matchId)) {
      errors.push(`Jogo ${pred.matchId} não faz parte deste duelo`);
      continue;
    }
    const match = matchMap[pred.matchId];
    if (isPredictionLocked(match.startsAt)) {
      errors.push(`Palpites encerrados para ${match.homeTeam} x ${match.awayTeam} (5 min antes do início)`);
    }
  }
  if (errors.length > 0) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });

  await Promise.all(parsed.data.predictions.map((pred) =>
    prisma.duelPrediction.upsert({
      where: { duelId_matchId_userId: { duelId: params.id, matchId: pred.matchId, userId } },
      create: { duelId: params.id, matchId: pred.matchId, userId, homeScore: pred.homeScore, awayScore: pred.awayScore },
      update: { homeScore: pred.homeScore, awayScore: pred.awayScore },
    })
  ));

  return NextResponse.json({ ok: true });
}
