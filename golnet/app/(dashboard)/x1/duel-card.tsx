"use client";

import Link from "next/link";
import Image from "next/image";

type User = { id: string; name: string | null; username: string | null; image: string | null };
type Match = { id: string; homeTeam: string; awayTeam: string; startsAt: Date | string; status: string; leagueName: string | null };
type Duel = {
  id: string;
  status: string;
  expiresAt: Date | string;
  creatorId: string;
  creator: User;
  opponent: User | null;
  winner: { id: string; name: string | null; username: string | null } | null;
  matches: { match: Match }[];
  predictions: { matchId: string }[];
};

const statusLabel: Record<string, { label: string; color: string }> = {
  PENDING:  { label: "Aguardando", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" },
  ACTIVE:   { label: "Em andamento", color: "text-green-400 bg-green-400/10 border-green-400/30" },
  FINISHED: { label: "Finalizado", color: "text-zinc-400 bg-zinc-800 border-zinc-700" },
  DECLINED: { label: "Recusado", color: "text-red-400 bg-red-400/10 border-red-400/30" },
  EXPIRED:  { label: "Expirado", color: "text-zinc-500 bg-zinc-800 border-zinc-700" },
};

function Avatar({ user }: { user: User | null }) {
  if (!user) return <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-500 text-xs">?</div>;
  return user.image ? (
    <Image src={user.image} alt="" width={32} height={32} className="rounded-full" />
  ) : (
    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white">
      {user.name?.[0] ?? "?"}
    </div>
  );
}

export function DuelCard({ duel, currentUserId }: { duel: Duel; currentUserId: string }) {
  const s = statusLabel[duel.status] ?? statusLabel.EXPIRED;
  const isCreator = duel.creatorId === currentUserId;
  const me = isCreator ? duel.creator : duel.opponent ?? duel.creator;
  const them = isCreator ? duel.opponent : duel.creator;
  const myPredictions = duel.predictions.length;
  const totalMatches = duel.matches.length;

  return (
    <Link
      href={`/x1/${duel.id}`}
      className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Players */}
        <div className="flex items-center gap-2 min-w-0">
          <Avatar user={me} />
          <span className="text-zinc-500 text-sm font-bold shrink-0">VS</span>
          <Avatar user={them} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {them ? (them.name ?? `@${them.username}`) : "Aguardando adversário"}
            </p>
            <p className="text-xs text-zinc-500">{totalMatches} jogo{totalMatches !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Status + progress */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${s.color}`}>
            {s.label}
          </span>
          {duel.status === "ACTIVE" && (
            <span className="text-xs text-zinc-500">
              {myPredictions}/{totalMatches} palpites
            </span>
          )}
          {duel.status === "FINISHED" && duel.winner && (
            <span className={`text-xs font-medium ${duel.winner.id === currentUserId ? "text-green-400" : "text-zinc-400"}`}>
              {duel.winner.id === currentUserId ? "Você venceu!" : `${duel.winner.name ?? duel.winner.username} venceu`}
            </span>
          )}
        </div>
      </div>

      {/* Match list preview */}
      <div className="mt-3 flex flex-wrap gap-1">
        {duel.matches.slice(0, 3).map(({ match }) => (
          <span key={match.id} className="text-xs bg-zinc-800 text-zinc-400 rounded px-2 py-0.5">
            {match.homeTeam} x {match.awayTeam}
          </span>
        ))}
        {duel.matches.length > 3 && (
          <span className="text-xs text-zinc-500">+{duel.matches.length - 3} mais</span>
        )}
      </div>
    </Link>
  );
}
