import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Head to Head — PalpitaAí" };

interface Props {
  params: { id: string };
  searchParams: { opponent?: string };
}

export default async function H2HPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const leagueId = params.id;
  const opponentId = searchParams.opponent;

  // Check user plan
  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  if (userRecord?.plan === "FREE") {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10">
          <span className="text-5xl mb-4 block">🔒</span>
          <h1 className="text-2xl font-bold text-white mb-2">
            Recurso exclusivo Pro
          </h1>
          <p className="text-zinc-400 mb-6">
            O confronto direto (H2H) é um recurso exclusivo do plano Pro.
            Faça upgrade para comparar seus palpites com qualquer membro da liga.
          </p>
          <Link
            href="/pricing"
            className="inline-block px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors"
          >
            Fazer upgrade para Pro
          </Link>
        </div>
      </div>
    );
  }

  // Load league with members
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, image: true, username: true } },
        },
        orderBy: { totalPoints: "desc" },
      },
    },
  });

  if (!league) redirect("/leagues");

  const isMember = league.members.some((m) => m.userId === userId);
  if (!isMember) redirect("/leagues");

  const otherMembers = league.members.filter((m) => m.userId !== userId);

  // If no opponent selected, show member list
  if (!opponentId) {
    return (
      <div className="max-w-2xl">
        <div className="mb-6 flex items-center gap-2 text-zinc-500 text-sm">
          <Link href="/leagues" className="hover:text-white transition-colors">
            Minhas Ligas
          </Link>
          <span>/</span>
          <Link href={`/leagues/${leagueId}`} className="hover:text-white transition-colors">
            {league.name}
          </Link>
          <span>/</span>
          <span className="text-zinc-300">H2H</span>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          Confronto Direto <span className="text-green-400">H2H</span>
        </h1>
        <p className="text-zinc-400 mb-8">
          Escolha um adversário para comparar seus palpites.
        </p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="font-semibold text-white">Membros da liga</h2>
          </div>
          {otherMembers.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              Nenhum outro membro nesta liga ainda.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {otherMembers.map((member) => (
                <Link
                  key={member.id}
                  href={`/leagues/${leagueId}/h2h?opponent=${member.userId}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-800/50 transition-colors"
                >
                  {member.user.image ? (
                    <img
                      src={member.user.image}
                      alt=""
                      className="w-9 h-9 rounded-full shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {member.user.name?.[0] ?? "?"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {member.user.name ?? "—"}
                    </p>
                    {member.user.username && (
                      <p className="text-xs text-zinc-500">@{member.user.username}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-green-400">
                      {member.totalPoints} pts
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Opponent selected — load comparison data
  const opponentMember = league.members.find((m) => m.userId === opponentId);
  if (!opponentMember) redirect(`/leagues/${leagueId}/h2h`);

  const myMember = league.members.find((m) => m.userId === userId)!;

  const [myPreds, theirPreds] = await Promise.all([
    prisma.prediction.findMany({
      where: { userId, match: { status: "FINISHED" } },
      include: { match: true },
    }),
    prisma.prediction.findMany({
      where: { userId: opponentId, match: { status: "FINISHED" } },
      include: { match: true },
    }),
  ]);

  // Build a map of matchId -> my prediction
  const myPredMap = new Map(myPreds.map((p) => [p.matchId, p]));
  const theirPredMap = new Map(theirPreds.map((p) => [p.matchId, p]));

  // Find shared matches (both predicted)
  const sharedMatchIds = myPreds
    .filter((p) => theirPredMap.has(p.matchId))
    .map((p) => p.matchId);

  type ComparisonRow = {
    matchId: string;
    matchName: string;
    actualScore: string;
    myPred: string;
    theirPred: string;
    myPoints: number;
    theirPoints: number;
  };

  const rows: ComparisonRow[] = sharedMatchIds.map((matchId) => {
    const mine = myPredMap.get(matchId)!;
    const theirs = theirPredMap.get(matchId)!;
    const match = mine.match;
    return {
      matchId,
      matchName: `${match.homeTeam} vs ${match.awayTeam}`,
      actualScore:
        match.homeScore !== null && match.awayScore !== null
          ? `${match.homeScore}–${match.awayScore}`
          : "—",
      myPred: `${mine.homeScore}–${mine.awayScore}`,
      theirPred: `${theirs.homeScore}–${theirs.awayScore}`,
      myPoints: mine.points + mine.bonusPoints,
      theirPoints: theirs.points + theirs.bonusPoints,
    };
  });

  const totalMyPoints = rows.reduce((s, r) => s + r.myPoints, 0);
  const totalTheirPoints = rows.reduce((s, r) => s + r.theirPoints, 0);
  const myWins = rows.filter((r) => r.myPoints > r.theirPoints).length;
  const theirWins = rows.filter((r) => r.theirPoints > r.myPoints).length;
  const draws = rows.filter((r) => r.myPoints === r.theirPoints).length;

  const total = myWins + theirWins + draws;
  const myWinPct = total > 0 ? Math.round((myWins / total) * 100) : 50;

  return (
    <div className="max-w-3xl">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-zinc-500 text-sm">
        <Link href="/leagues" className="hover:text-white transition-colors">
          Minhas Ligas
        </Link>
        <span>/</span>
        <Link href={`/leagues/${leagueId}`} className="hover:text-white transition-colors">
          {league.name}
        </Link>
        <span>/</span>
        <Link href={`/leagues/${leagueId}/h2h`} className="hover:text-white transition-colors">
          H2H
        </Link>
        <span>/</span>
        <span className="text-zinc-300">{opponentMember.user.name}</span>
      </div>

      <h1 className="text-2xl font-bold text-white mb-6">
        Confronto Direto <span className="text-green-400">H2H</span>
      </h1>

      {/* Players header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between gap-4">
          {/* Me */}
          <div className="flex flex-col items-center gap-2 flex-1">
            {myMember.user.image ? (
              <img src={myMember.user.image} alt="" className="w-14 h-14 rounded-full ring-2 ring-green-500" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center text-xl font-bold text-white ring-2 ring-green-500">
                {myMember.user.name?.[0] ?? "?"}
              </div>
            )}
            <p className="text-sm font-semibold text-white text-center truncate max-w-[120px]">
              {myMember.user.name ?? "Você"}
              <span className="block text-xs text-green-400">(você)</span>
            </p>
            <p className="text-3xl font-bold text-green-400">{totalMyPoints}</p>
            <p className="text-xs text-zinc-500">pontos no H2H</p>
          </div>

          {/* VS */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <span className="text-2xl font-black text-zinc-600">VS</span>
            <span className="text-xs text-zinc-500">{sharedMatchIds.length} jogos</span>
          </div>

          {/* Opponent */}
          <div className="flex flex-col items-center gap-2 flex-1">
            {opponentMember.user.image ? (
              <img src={opponentMember.user.image} alt="" className="w-14 h-14 rounded-full ring-2 ring-zinc-600" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center text-xl font-bold text-white ring-2 ring-zinc-600">
                {opponentMember.user.name?.[0] ?? "?"}
              </div>
            )}
            <p className="text-sm font-semibold text-white text-center truncate max-w-[120px]">
              {opponentMember.user.name ?? "—"}
            </p>
            <p className="text-3xl font-bold text-zinc-300">{totalTheirPoints}</p>
            <p className="text-xs text-zinc-500">pontos no H2H</p>
          </div>
        </div>

        {/* Record bar */}
        <div className="mt-6">
          <div className="flex justify-between text-xs text-zinc-400 mb-1">
            <span className="text-green-400 font-semibold">{myWins}V</span>
            <span>{draws}E</span>
            <span className="text-red-400 font-semibold">{theirWins}D</span>
          </div>
          <div className="h-3 rounded-full bg-zinc-800 overflow-hidden flex">
            {myWins > 0 && (
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${myWinPct}%` }}
              />
            )}
            {draws > 0 && (
              <div
                className="h-full bg-zinc-500 transition-all"
                style={{ width: `${total > 0 ? Math.round((draws / total) * 100) : 0}%` }}
              />
            )}
            {theirWins > 0 && (
              <div
                className="h-full bg-red-500 transition-all flex-1"
              />
            )}
          </div>
          <p className="text-center text-xs text-zinc-500 mt-1">
            {myWins} vitórias &bull; {draws} empates &bull; {theirWins} derrotas
          </p>
        </div>
      </div>

      {/* Per-match table */}
      {rows.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center text-zinc-500">
          Nenhum jogo em comum com palpites até agora.
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="font-semibold text-white">Comparação por jogo</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-3 text-zinc-500 font-medium">Jogo</th>
                  <th className="text-center px-3 py-3 text-zinc-500 font-medium">Resultado</th>
                  <th className="text-center px-3 py-3 text-green-400 font-medium">Meu palpite</th>
                  <th className="text-center px-3 py-3 text-zinc-500 font-medium">Palpite deles</th>
                  <th className="text-center px-3 py-3 text-green-400 font-medium">Meus pts</th>
                  <th className="text-center px-3 py-3 text-zinc-500 font-medium">Pts deles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {rows.map((row) => {
                  const iWon = row.myPoints > row.theirPoints;
                  const theyWon = row.theirPoints > row.myPoints;
                  return (
                    <tr
                      key={row.matchId}
                      className={`${iWon ? "bg-green-500/5" : theyWon ? "bg-red-500/5" : ""}`}
                    >
                      <td className="px-4 py-3 text-white font-medium truncate max-w-[160px]">
                        {row.matchName}
                      </td>
                      <td className="px-3 py-3 text-center text-zinc-300 font-mono">
                        {row.actualScore}
                      </td>
                      <td className="px-3 py-3 text-center text-green-400 font-mono font-semibold">
                        {row.myPred}
                      </td>
                      <td className="px-3 py-3 text-center text-zinc-400 font-mono">
                        {row.theirPred}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-bold ${iWon ? "text-green-400" : "text-zinc-400"}`}>
                          {row.myPoints}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-bold ${theyWon ? "text-red-400" : "text-zinc-500"}`}>
                          {row.theirPoints}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Link
          href={`/leagues/${leagueId}/h2h`}
          className="text-sm text-zinc-500 hover:text-white transition-colors"
        >
          &larr; Escolher outro adversário
        </Link>
      </div>
    </div>
  );
}
