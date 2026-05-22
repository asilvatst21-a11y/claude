import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { DuelCard } from "./duel-card";

export const metadata = { title: "X1 — PalpitaAí" };

export default async function X1Page() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  const isPro = user?.plan !== "FREE";

  const duels = await prisma.duel.findMany({
    where: { OR: [{ creatorId: userId }, { opponentId: userId }] },
    include: {
      creator:  { select: { id: true, name: true, username: true, image: true } },
      opponent: { select: { id: true, name: true, username: true, image: true } },
      winner:   { select: { id: true, name: true, username: true } },
      matches:  { include: { match: { select: { id: true, homeTeam: true, awayTeam: true, startsAt: true, status: true, leagueName: true } } } },
      predictions: { where: { userId }, select: { matchId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const received = duels.filter((d) => d.opponentId === userId && d.status === "PENDING");
  const active   = duels.filter((d) => d.status === "ACTIVE");
  const others   = duels.filter((d) => !["ACTIVE"].includes(d.status) || (d.status === "PENDING" && d.creatorId === userId));

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">X1 — Duelos</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Desafie outro usuário PRO em jogos específicos</p>
        </div>
        {isPro ? (
          <Link
            href="/x1/new"
            className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black text-sm font-semibold rounded-lg transition-colors"
          >
            + Novo desafio
          </Link>
        ) : (
          <Link
            href="/pricing"
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm rounded-lg hover:text-white transition-colors"
          >
            PRO para desafiar
          </Link>
        )}
      </div>

      {!isPro && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-xl shrink-0">⭐</span>
          <div>
            <p className="text-sm font-medium text-yellow-400">Recurso PRO</p>
            <p className="text-sm text-zinc-400 mt-0.5">
              Assine o plano PRO para criar e participar de duelos X1.{" "}
              <Link href="/pricing" className="text-green-400 hover:underline">Ver planos</Link>
            </p>
          </div>
        </div>
      )}

      {received.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />
            Desafios recebidos ({received.length})
          </h2>
          <div className="space-y-3">
            {received.map((d) => <DuelCard key={d.id} duel={d as never} currentUserId={userId} />)}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3">
            Em andamento ({active.length})
          </h2>
          <div className="space-y-3">
            {active.map((d) => <DuelCard key={d.id} duel={d as never} currentUserId={userId} />)}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Histórico</h2>
          <div className="space-y-3">
            {others.map((d) => <DuelCard key={d.id} duel={d as never} currentUserId={userId} />)}
          </div>
        </section>
      )}

      {duels.length === 0 && (
        <div className="text-center text-zinc-500 py-20">
          <p className="text-4xl mb-4">⚔️</p>
          <p className="text-lg">Nenhum duelo ainda.</p>
          {isPro && (
            <Link href="/x1/new" className="mt-4 inline-block text-green-400 hover:underline text-sm">
              Criar primeiro desafio
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
