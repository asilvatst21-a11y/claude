import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { teamLogo } from "@/lib/utils";
import { InviteAcceptButtons } from "./invite-accept-client";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const session = await auth();

  const duel = await prisma.duel.findUnique({
    where: { inviteToken: params.token },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      creatorId: true,
      opponentId: true,
      creator: { select: { id: true, name: true, username: true, image: true } },
      matches: {
        include: {
          match: {
            select: {
              id: true, homeTeam: true, awayTeam: true,
              homeTeamFlag: true, awayTeamFlag: true,
              startsAt: true, leagueName: true,
            },
          },
        },
        orderBy: { match: { startsAt: "asc" } },
      },
    },
  });

  if (!duel) notFound();

  const userId = session?.user?.id;
  const isCreator = userId === duel.creatorId;
  const isExpired = duel.expiresAt < new Date();

  // Creator visiting their own invite — redirect to duel page
  if (isCreator) redirect(`/x1/${duel.id}`);

  // Already accepted by someone else
  const unavailable = duel.status !== "PENDING" || duel.opponentId !== null || isExpired;

  const formatDate = (d: Date | string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
      " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const plan = userId
    ? (await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } }))?.plan
    : null;
  const isFree = plan === "FREE";

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-2xl font-bold text-white">
            <span className="text-green-400">Palpita</span>Aí
          </span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500/10 to-zinc-900 border-b border-zinc-800 p-6">
            <p className="text-xs text-green-400 font-semibold uppercase tracking-wider mb-2">Desafio X1 ⚔️</p>
            <div className="flex items-center gap-3">
              {duel.creator.image ? (
                <Image src={duel.creator.image} alt="" width={40} height={40} className="rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white">
                  {duel.creator.name?.[0] ?? "?"}
                </div>
              )}
              <div>
                <p className="text-white font-semibold">{duel.creator.name ?? `@${duel.creator.username}`}</p>
                <p className="text-xs text-zinc-500">te desafiou para um duelo!</p>
              </div>
            </div>
          </div>

          {/* Matches */}
          <div className="p-6">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
              {duel.matches.length} jogo{duel.matches.length !== 1 ? "s" : ""} no duelo
            </p>
            <div className="space-y-2 mb-6">
              {duel.matches.map(({ match }) => (
                <div key={match.id} className="flex items-center justify-between bg-zinc-800/50 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2 flex-1">
                    {match.homeTeamFlag && (
                      <img src={teamLogo(match.homeTeamFlag) ?? ""} alt="" className="w-4 h-4 object-contain" />
                    )}
                    <span className="text-xs text-white">{match.homeTeam}</span>
                    <span className="text-zinc-600 text-xs">x</span>
                    {match.awayTeamFlag && (
                      <img src={teamLogo(match.awayTeamFlag) ?? ""} alt="" className="w-4 h-4 object-contain" />
                    )}
                    <span className="text-xs text-white">{match.awayTeam}</span>
                  </div>
                  <span className="text-xs text-zinc-500 shrink-0 ml-2">{formatDate(match.startsAt)}</span>
                </div>
              ))}
            </div>

            {/* State-based CTA */}
            {unavailable ? (
              <div className="text-center py-2">
                <p className="text-sm text-zinc-400">
                  {isExpired ? "Este convite expirou." : "Este convite não está mais disponível."}
                </p>
                {session && (
                  <Link href="/x1" className="mt-3 inline-block text-sm text-green-400 hover:text-green-300">
                    Ver meus duelos →
                  </Link>
                )}
              </div>
            ) : !session ? (
              <div>
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(`/x1/invite/${params.token}`)}`}
                  className="block w-full py-3 bg-green-500 hover:bg-green-400 text-black text-sm font-bold rounded-xl text-center transition-colors"
                >
                  Entrar para aceitar ⚔️
                </Link>
                <p className="text-xs text-zinc-500 text-center mt-2">
                  Não tem conta?{" "}
                  <Link href={`/register?callbackUrl=${encodeURIComponent(`/x1/invite/${params.token}`)}`} className="text-green-400 hover:underline">
                    Criar agora
                  </Link>
                </p>
              </div>
            ) : isFree ? (
              <div className="text-center">
                <p className="text-sm text-zinc-400 mb-3">Você precisa do plano PRO para participar de duelos X1.</p>
                <Link
                  href="/pricing"
                  className="block w-full py-3 bg-green-500 hover:bg-green-400 text-black text-sm font-bold rounded-xl text-center transition-colors"
                >
                  Ver planos PRO
                </Link>
              </div>
            ) : (
              <InviteAcceptButtons token={params.token} duelId={duel.id} />
            )}
          </div>
        </div>

        {/* Expiry hint */}
        {!unavailable && (
          <p className="text-center text-xs text-zinc-600 mt-4">
            Convite válido até {formatDate(duel.expiresAt)}
          </p>
        )}
      </div>
    </div>
  );
}
