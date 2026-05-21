import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CopyInviteButton } from "./copy-invite-button";
import { LeagueTabs } from "./league-tabs";

export const metadata = { title: "Liga — PalpitaAí" };

export default async function LeagueDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const [league, userRecord, roundRankingsRaw] = await Promise.all([
    prisma.league.findUnique({
      where: { id: params.id },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, username: true, image: true } },
          },
          orderBy: { totalPoints: "desc" },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    }),
    prisma.roundRanking.findMany({
      where: { leagueId: params.id },
      orderBy: { round: "asc" },
    }),
  ]);

  if (!league) notFound();

  const currentMember = league.members.find((m) => m.userId === userId);
  if (!currentMember) notFound();

  const isOwner = currentMember.role === "OWNER";
  const userPlan = userRecord?.plan ?? "FREE";

  // Build a lookup map of userId -> member user info
  const memberMap = new Map(
    league.members.map((m) => [m.userId, m.user])
  );

  // Group round rankings by round, sort entries by points desc
  const roundMap = new Map<
    string,
    { userId: string; name: string | null; image: string | null; username: string | null; points: number }[]
  >();

  for (const rr of roundRankingsRaw) {
    const user = memberMap.get(rr.userId);
    if (!roundMap.has(rr.round)) roundMap.set(rr.round, []);
    roundMap.get(rr.round)!.push({
      userId: rr.userId,
      name: user?.name ?? null,
      image: user?.image ?? null,
      username: user?.username ?? null,
      points: rr.points,
    });
  }

  // Sort rounds naturally and sort entries within each round by points desc
  const roundGroups = Array.from(roundMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([round, entries]) => ({
      round,
      entries: entries.sort((a, b) => b.points - a.points),
    }));

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-zinc-500 text-sm mb-2">
          <a href="/leagues" className="hover:text-white transition-colors">
            Minhas Ligas
          </a>
          <span>/</span>
          <span className="text-zinc-300">{league.name}</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{league.name}</h1>
            {league.description && (
              <p className="text-zinc-400 mt-1">{league.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-zinc-500">
                {league.visibility === "PRIVATE" ? "🔒 Privada" : "🌐 Pública"}
              </span>
              <span className="text-xs text-zinc-500">
                {league.members.length}{" "}
                {league.members.length === 1 ? "membro" : "membros"}
              </span>
              <span className="text-xs text-zinc-500 bg-zinc-800 rounded px-2 py-0.5">
                {currentMember.role === "OWNER"
                  ? "Dono"
                  : currentMember.role === "ADMIN"
                  ? "Admin"
                  : "Membro"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {isOwner && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-green-400 mb-2">
            Código de convite
          </p>
          <div className="flex items-center gap-3">
            <code className="flex-1 bg-zinc-900 rounded-lg px-3 py-2 text-white font-mono text-sm tracking-widest">
              {league.inviteCode}
            </code>
            <CopyInviteButton code={league.inviteCode} />
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Compartilhe este código para convidar pessoas para sua liga.
          </p>
        </div>
      )}

      <LeagueTabs
        leagueId={params.id}
        members={league.members}
        roundGroups={roundGroups}
        userPlan={userPlan}
        userId={userId}
      />
    </div>
  );
}
