import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/plans";

const createSchema = z.object({
  name: z.string().min(3).max(60),
  description: z.string().max(200).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
  ptsExactScore: z.number().int().min(1).max(100).optional(),
  ptsCorrectDiff: z.number().int().min(0).max(100).optional(),
  ptsCorrectWinner: z.number().int().min(0).max(100).optional(),
  ptsCorrectDraw: z.number().int().min(0).max(100).optional(),
  competitionName: z.string().optional(),
  teamFilter: z.array(z.string()).optional(),
  championPredictionEnabled: z.boolean().optional(),
  championPredictionPoints: z.number().int().min(1).max(500).optional(),
  goalScorerEnabled: z.boolean().optional(),
  goalScorerPoints: z.number().int().min(1).max(100).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const leagues = await prisma.leagueMember.findMany({
    where: { userId: session.user.id },
    include: {
      league: {
        include: {
          _count: { select: { members: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return NextResponse.json(leagues.map((m) => ({ ...m.league, role: m.role, totalPoints: m.totalPoints })));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Plan enforcement: check owned leagues limit
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });

  const planConfig = getUserPlan(user?.plan ?? "FREE");

  if (planConfig.maxOwnedLeagues !== Infinity) {
    const ownedCount = await prisma.leagueMember.count({
      where: { userId: session.user.id, role: "OWNER" },
    });

    if (ownedCount >= planConfig.maxOwnedLeagues) {
      return NextResponse.json(
        {
          error: "Limite do plano Free atingido",
          message: `Você já criou ${ownedCount} liga(s). Faça upgrade para criar mais.`,
          upgrade: true,
        },
        { status: 403 }
      );
    }
  }

  const isPro = ["PRO", "ENTERPRISE"].includes(user?.plan ?? "FREE");
  const {
    ptsExactScore, ptsCorrectDiff, ptsCorrectWinner, ptsCorrectDraw,
    competitionName, teamFilter, championPredictionEnabled, championPredictionPoints,
    goalScorerEnabled, goalScorerPoints,
    ...baseData
  } = parsed.data;

  try {
    const league = await prisma.league.create({
      data: {
        ...baseData,
        competitionName: competitionName ?? null,
        teamFilter: teamFilter ?? [],
        championPredictionEnabled: championPredictionEnabled ?? false,
        championPredictionPoints: championPredictionPoints ?? 20,
        goalScorerEnabled: goalScorerEnabled ?? false,
        goalScorerPoints: goalScorerPoints ?? 5,
        ...(isPro && {
          ptsExactScore: ptsExactScore ?? 10,
          ptsCorrectDiff: ptsCorrectDiff ?? 7,
          ptsCorrectWinner: ptsCorrectWinner ?? 5,
          ptsCorrectDraw: ptsCorrectDraw ?? 4,
        }),
        members: {
          create: { userId: session.user.id, role: "OWNER" },
        },
      },
    });
    return NextResponse.json(league, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("League create error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
