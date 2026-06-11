import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { JoinLeagueButton } from "./join-league-button";

export const metadata = { title: "Entrar na Liga — PalpitaAí" };

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const code = typeof searchParams.c === "string" ? searchParams.c : undefined;
  if (!code) notFound();

  const league = await prisma.league.findUnique({
    where: { inviteCode: code },
    include: { _count: { select: { members: true } } },
  });

  if (!league) notFound();

  const session = await auth();
  const userId = session?.user?.id;

  const isMember = userId
    ? !!(await prisma.leagueMember.findUnique({
        where: { userId_leagueId: { userId, leagueId: league.id } },
      }))
    : false;

  const callbackUrl = encodeURIComponent(`/entrar?c=${code}`);

  return (
    <main className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-3xl font-extrabold text-white">
              <span className="text-green-400">Palpita</span>Aí
            </span>
          </Link>
        </div>

        {/* League card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-4">
          <p className="text-xs text-zinc-500 mb-3 font-medium uppercase tracking-wide">
            🏆 Convite para liga
          </p>

          <h1 className="text-2xl font-bold text-white mb-1">{league.name}</h1>

          {league.description && (
            <p className="text-zinc-400 text-sm mb-3">{league.description}</p>
          )}

          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>{league.visibility === "PRIVATE" ? "🔒 Privada" : "🌐 Pública"}</span>
            <span>·</span>
            <span>
              {league._count.members}{" "}
              {league._count.members === 1 ? "membro" : "membros"}
            </span>
            {league.competitionName && (
              <>
                <span>·</span>
                <span>🏟️ {league.competitionName}</span>
              </>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="space-y-3">
          {!userId && (
            <>
              <Link
                href={`/login?callbackUrl=${callbackUrl}`}
                className="flex items-center justify-center w-full py-3.5 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors text-base"
              >
                Fazer login para entrar na liga
              </Link>
              <Link
                href={`/register?callbackUrl=${callbackUrl}`}
                className="flex items-center justify-center w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl transition-colors text-base"
              >
                Criar conta grátis
              </Link>
            </>
          )}

          {userId && isMember && (
            <Link
              href={`/leagues/${league.id}`}
              className="flex items-center justify-center w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold rounded-xl transition-colors"
            >
              Você já é membro — Ver liga →
            </Link>
          )}

          {userId && !isMember && (
            <JoinLeagueButton leagueId={league.id} inviteCode={code} />
          )}
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          PalpitaAí · Bolão de palpites
        </p>
      </div>
    </main>
  );
}
