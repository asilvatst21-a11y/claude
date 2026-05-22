import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchHeadToHead, fetchTeamLastMatches } from "@/lib/api-football";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const match = await prisma.match.findUnique({ where: { id: params.id } });

  if (!match) return NextResponse.json({ error: "Jogo não encontrado" }, { status: 404 });
  if (!match.homeTeamId || !match.awayTeamId) {
    return NextResponse.json({ error: "IDs dos times não disponíveis. Reimporte os jogos." }, { status: 422 });
  }

  const [h2h, homeLast, awayLast] = await Promise.all([
    fetchHeadToHead(match.homeTeamId, match.awayTeamId, 5),
    fetchTeamLastMatches(match.homeTeamId, 5),
    fetchTeamLastMatches(match.awayTeamId, 5),
  ]);

  return NextResponse.json({ h2h, homeLast, awayLast });
}
