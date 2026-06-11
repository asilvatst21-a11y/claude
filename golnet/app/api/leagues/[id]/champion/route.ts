import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// GET — list all champion predictions for a league
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const member = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: session.user.id, leagueId: params.id } },
  });
  if (!member) return NextResponse.json({ error: "Não é membro" }, { status: 403 });

  const preds = await prisma.championPrediction.findMany({
    where: { leagueId: params.id },
    include: { user: { select: { id: true, name: true, username: true, image: true } } },
    orderBy: { updatedAt: "asc" },
  });

  return NextResponse.json(preds);
}

// POST — submit/update own champion prediction
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { team } = await req.json();
  if (!team || typeof team !== "string") return NextResponse.json({ error: "Time inválido" }, { status: 400 });

  const league = await prisma.league.findUnique({
    where: { id: params.id },
    select: { championPredictionEnabled: true, actualChampion: true },
  });
  if (!league?.championPredictionEnabled) return NextResponse.json({ error: "Liga não tem palpite de campeão" }, { status: 400 });
  if (league.actualChampion) return NextResponse.json({ error: "Campeão já definido, palpites encerrados" }, { status: 400 });

  const member = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: session.user.id, leagueId: params.id } },
  });
  if (!member) return NextResponse.json({ error: "Não é membro" }, { status: 403 });

  const pred = await prisma.championPrediction.upsert({
    where: { userId_leagueId: { userId: session.user.id, leagueId: params.id } },
    create: { userId: session.user.id, leagueId: params.id, team },
    update: { team },
    include: { user: { select: { id: true, name: true, username: true, image: true } } },
  });

  return NextResponse.json(pred);
}

// PATCH — owner sets the actual champion and awards points
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { champion } = await req.json();
  if (!champion || typeof champion !== "string") return NextResponse.json({ error: "Time inválido" }, { status: 400 });

  const owner = await prisma.leagueMember.findUnique({
    where: { userId_leagueId: { userId: session.user.id, leagueId: params.id } },
  });
  if (!owner || owner.role !== "OWNER") return NextResponse.json({ error: "Apenas o dono pode definir o campeão" }, { status: 403 });

  const league = await prisma.league.findUnique({
    where: { id: params.id },
    select: { actualChampion: true, championPredictionPoints: true },
  });
  if (league?.actualChampion) return NextResponse.json({ error: "Campeão já definido" }, { status: 400 });

  const pts = league?.championPredictionPoints ?? 20;

  // Find winners
  const winners = await prisma.championPrediction.findMany({
    where: { leagueId: params.id, team: champion },
  });

  await prisma.$transaction([
    // Set actual champion on league
    prisma.league.update({
      where: { id: params.id },
      data: { actualChampion: champion },
    }),
    // Award points to correct predictions
    ...winners.map((w) =>
      prisma.championPrediction.update({
        where: { id: w.id },
        data: { points: pts },
      })
    ),
    // Update leagueMember totalPoints
    ...winners.map((w) =>
      prisma.leagueMember.update({
        where: { userId_leagueId: { userId: w.userId, leagueId: params.id } },
        data: { totalPoints: { increment: pts } },
      })
    ),
  ]);

  return NextResponse.json({ ok: true, winners: winners.length, pts });
}
