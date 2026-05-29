import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CopyInviteButton } from "./copy-invite-button";
import { LeagueTabs } from "./league-tabs";
import { ChampionWidget } from "./champion-widget";
import { DeleteLeagueButton } from "./delete-league-button";

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

  // If league has competition/team filter, recalculate standings from predictions
  let members = league?.members ?? [];
  if (league && (league.competitionName || league.teamFilter.length > 0)) {
    const matchWhere: Record<string, unknown> = {};
    if (league.competitionName) matchWhere.leagueName = league.competitionName;
    if (league.teamFilter.length > 0) {
      matchWhere.OR = [
        { homeTeam: { in: league.teamFilter } },
        { awayTeam: { in: league.teamFilter } },
      ];
    }
    const filteredMatches = await prisma.match.findMany({
      where: matchWhere,
      select: { id: true },
    });
    const matchIds = filteredMatches.map((m) => m.id);
    const memberUserIds = members.map((m) => m.userId);

    const predPoints = await prisma.prediction.groupBy({
      by: ["userId"],
      where: { matchId: { in: matchIds }, userId: { in: memberUserIds } },
      _sum: { points: true, bonusPoints: true },
    });
    const pointsMap = Object.fromEntries(
      predPoints.map((p) => [p.userId, (p._sum.points ?? 0) + (p._sum.bonusPoints ?? 0)])
    );

    members = [...members]
      .map((m) => ({ ...m, totalPoints: pointsMap[m.userId] ?? 0 }))
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }

  if (!league) notFound();

  const currentMember = members.find((m) => m.userId === userId);
  if (!currentMember) notFound();

  const isOwner = currentMember.role === "OWNER";
  const userPlan = userRecord?.plan ?? "FREE";

  const memberMap = new Map(members.map((m) => [m.userId, m.user]));

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
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white">{league.name}</h1>
            {league.description && (
              <p className="text-zinc-400 mt-1">{league.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-zinc-500">
                {league.visibility === "PRIVATE" ? "🔒 Privada" : "🌐 Pública"}
              </span>
              <span className="text-xs text-zinc-500">
                {members.length}{" "}
                {members.length === 1 ? "membro" : "membros"}
              </span>
              {league.competitionName && (
                <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">
                  🏟️ {league.competitionName}
                </span>
              )}
              {league.teamFilter.length > 0 && (
                <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">
                  🎯 {league.teamFilter.length} {league.teamFilter.length === 1 ? "seleção" : "seleções"}
                </span>
              )}
              <span className="text-xs text-zinc-500 bg-zinc-800 rounded px-2 py-0.5">
                {currentMember.role === "OWNER"
                  ? "Dono"
                  : currentMember.role === "ADMIN"
                  ? "Admin"
                  : "Membro"}
              </span>
            </div>
          </div>
          {isOwner && (
            <div className="ml-3 shrink-0 mt-1">
              <DeleteLeagueButton leagueId={params.id} leagueName={league.name} />
            </div>
          )}
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

      {league.championPredictionEnabled && (
        <ChampionWidget
          leagueId={params.id}
          currentUserId={userId}
          isOwner={isOwner}
          actualChampion={league.actualChampion}
          championPredictionPoints={league.championPredictionPoints}
          competitionName={league.competitionName}
        />
      )}

      {(league.competitionName || league.teamFilter.length > 0) && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 mb-4 flex items-start gap-3">
          <span className="text-blue-400 text-lg shrink-0">🎯</span>
          <div>
            <p className="text-sm text-blue-400 font-medium">Filtro ativo</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {league.competitionName && (
                <>Competição: <span className="text-white">{league.competitionName}</span></>
              )}
              {league.competitionName && league.teamFilter.length > 0 && " · "}
              {league.teamFilter.length > 0 && (
                <>Seleções: <span className="text-white">{league.teamFilter.join(", ")}</span></>
              )}
            </p>
          </div>
        </div>
      )}

      <LeagueTabs
        leagueId={params.id}
        members={members}
        roundGroups={roundGroups}
        userPlan={userPlan}
        userId={userId}
        scoring={{
          ptsExactScore: league.ptsExactScore,
          ptsCorrectDiff: league.ptsCorrectDiff,
          ptsCorrectWinner: league.ptsCorrectWinner,
          ptsCorrectDraw: league.ptsCorrectDraw,
          ptsKnockoutBonus: league.ptsKnockoutBonus,
          championPredictionEnabled: league.championPredictionEnabled,
          championPredictionPoints: league.championPredictionPoints,
          goalScorerEnabled: league.goalScorerEnabled,
          goalScorerPoints: league.goalScorerPoints,
        }}
      />
    </div>
  );
}
