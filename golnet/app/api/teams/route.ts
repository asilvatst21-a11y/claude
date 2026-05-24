import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const [homeTeams, awayTeams] = await Promise.all([
    prisma.match.findMany({ select: { homeTeam: true }, distinct: ["homeTeam"] }),
    prisma.match.findMany({ select: { awayTeam: true }, distinct: ["awayTeam"] }),
  ]);

  const teams = Array.from(
    new Set([...homeTeams.map((m) => m.homeTeam), ...awayTeams.map((m) => m.awayTeam)])
  ).sort((a, b) => a.localeCompare(b, "pt"));

  return NextResponse.json(teams);
}
