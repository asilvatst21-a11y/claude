import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CopyInviteButton } from "./copy-invite-button";

export const metadata = { title: "Liga — GolNet" };

export default async function LeagueDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const league = await prisma.league.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, username: true, image: true } },
        },
        orderBy: { totalPoints: "desc" },
      },
    },
  });

  if (!league) notFound();

  const currentMember = league.members.find((m) => m.userId === userId);
  if (!currentMember) notFound();

  const isOwner = currentMember.role === "OWNER";

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

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="font-semibold text-white">Ranking da Liga</h2>
        </div>
        <div className="divide-y divide-zinc-800">
          {league.members.map((member, index) => {
            const rank = index + 1;
            const isMe = member.userId === userId;
            return (
              <div
                key={member.id}
                className={`flex items-center gap-4 px-4 py-3 ${
                  isMe ? "bg-green-500/5" : ""
                }`}
              >
                <span
                  className={`w-7 text-center font-bold text-sm ${
                    rank === 1
                      ? "text-yellow-400"
                      : rank === 2
                      ? "text-zinc-300"
                      : rank === 3
                      ? "text-amber-600"
                      : "text-zinc-500"
                  }`}
                >
                  {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
                </span>

                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {member.user.image ? (
                    <img
                      src={member.user.image}
                      alt=""
                      className="w-8 h-8 rounded-full shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {member.user.name?.[0] ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {member.user.name ?? "—"}
                      {isMe && (
                        <span className="ml-2 text-xs text-green-400">(você)</span>
                      )}
                    </p>
                    {member.user.username && (
                      <p className="text-xs text-zinc-500 truncate">
                        @{member.user.username}
                      </p>
                    )}
                  </div>
                </div>

                <span className="font-bold text-green-400 text-sm shrink-0">
                  {member.totalPoints} pts
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
