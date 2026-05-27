import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchSquad } from "@/lib/api-football";

const POS_ORDER: Record<string, number> = { F: 0, M: 1, D: 2, G: 3 };

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const match = await prisma.match.findUnique({
      where: { id: params.id },
      select: { homeTeamId: true, awayTeamId: true },
    });

    if (!match?.homeTeamId || !match?.awayTeamId) {
      return NextResponse.json({ home: [], away: [] });
    }

    const [homeSquad, awaySquad] = await Promise.all([
      fetchSquad(match.homeTeamId),
      fetchSquad(match.awayTeamId),
    ]);

    const sortAndName = (squad: typeof homeSquad) =>
      [...squad]
        .sort((a, b) => (POS_ORDER[a.pos] ?? 4) - (POS_ORDER[b.pos] ?? 4))
        .map((p) => p.name);

    return NextResponse.json({ home: sortAndName(homeSquad), away: sortAndName(awaySquad) });
  } catch {
    return NextResponse.json({ home: [], away: [] });
  }
}
