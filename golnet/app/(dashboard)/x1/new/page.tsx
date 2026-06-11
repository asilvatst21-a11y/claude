import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { NewDuelClient } from "./new-duel-client";

export const metadata = { title: "Novo Duelo X1 — PalpitaAí" };

export default async function NewDuelPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { plan: true } });
  if (user?.plan === "FREE") redirect("/pricing");

  const matches = await prisma.match.findMany({
    where: { status: { in: ["SCHEDULED", "LIVE"] } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true, homeTeam: true, awayTeam: true, homeTeamFlag: true, awayTeamFlag: true,
      startsAt: true, status: true, leagueName: true, round: true,
    },
    take: 200,
  });

  return <NewDuelClient matches={matches} />;
}
