"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { teamLogo } from "@/lib/utils";
import { isPredictionLocked } from "@/lib/scoring";

type User = { id: string; name: string | null; username: string | null; image: string | null };
type Match = {
  id: string; homeTeam: string; awayTeam: string;
  homeTeamFlag: string | null; awayTeamFlag: string | null;
  homeScore: number | null; awayScore: number | null;
  startsAt: Date | string; status: string;
  leagueName: string | null; round: string | null;
};
type Prediction = {
  id: string; duelId: string; matchId: string; userId: string;
  homeScore: number; awayScore: number; points: number; bonusPoints: number;
  result: string | null;
  user: { id: string; name: string | null; username: string | null };
};
type Duel = {
  id: string; status: string; creatorId: string; inviteToken: string;
  expiresAt: Date | string;
  creator: User; opponent: User | null;
  winner: { id: string; name: string | null; username: string | null } | null;
  matches: { matchId: string; match: Match }[];
  predictions: Prediction[];
};

const statusLabel: Record<string, { label: string; color: string }> = {
  PENDING:  { label: "Aguardando aceite", color: "text-yellow-400" },
  ACTIVE:   { label: "Em andamento", color: "text-green-400" },
  FINISHED: { label: "Finalizado", color: "text-zinc-400" },
  DECLINED: { label: "Recusado", color: "text-red-400" },
  EXPIRED:  { label: "Expirado", color: "text-zinc-500" },
};

function Avatar({ user, size = 40 }: { user: User | null; size?: number }) {
  if (!user) return (
    <div style={{ width: size, height: size }} className="rounded-full bg-zinc-700 flex items-center justify-center text-zinc-500 text-sm">?</div>
  );
  return user.image ? (
    <Image src={user.image} alt="" width={size} height={size} className="rounded-full" />
  ) : (
    <div style={{ width: size, height: size }} className="rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white">
      {user.name?.[0] ?? "?"}
    </div>
  );
}

function ScoreInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <input
      type="number" min={0} max={20} value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-12 text-center bg-zinc-800 border border-zinc-700 rounded-lg py-1.5 text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-40"
    />
  );
}

const resultColor: Record<string, string> = {
  EXACT_SCORE:             "text-green-400",
  CORRECT_RESULT_AND_DIFF: "text-blue-400",
  CORRECT_WINNER:          "text-yellow-400",
  CORRECT_DRAW:            "text-yellow-400",
  WRONG:                   "text-red-400",
};
const resultLabel: Record<string, string> = {
  EXACT_SCORE:             "Placar exato",
  CORRECT_RESULT_AND_DIFF: "Diff certa",
  CORRECT_WINNER:          "Vencedor certo",
  CORRECT_DRAW:            "Empate certo",
  WRONG:                   "Errou",
};

export function DuelDetailClient({ duel, currentUserId, inviteUrl }: { duel: Duel; currentUserId: string; inviteUrl: string }) {
  const router = useRouter();
  const isParticipant = duel.creatorId === currentUserId || duel.opponent?.id === currentUserId;
  const isCreator = duel.creatorId === currentUserId;
  const s = statusLabel[duel.status] ?? statusLabel.EXPIRED;

  // Build prediction form state per match
  const myPreds = Object.fromEntries(
    duel.predictions
      .filter((p) => p.userId === currentUserId)
      .map((p) => [p.matchId, { home: String(p.homeScore), away: String(p.awayScore) }])
  );
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>(myPreds);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    const predictions = Object.entries(scores)
      .filter(([, v]) => v.home !== "" && v.away !== "")
      .map(([matchId, v]) => ({ matchId, homeScore: Number(v.home), awayScore: Number(v.away) }));

    const res = await fetch(`/api/duels/${duel.id}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predictions }),
    });
    setSaving(false);
    if (res.ok) {
      setSaveMsg("Palpites salvos!");
      setTimeout(() => { setSaveMsg(null); router.refresh(); }, 1500);
    } else {
      const data = await res.json();
      setSaveMsg(data.error ?? "Erro ao salvar");
    }
  };

  const handleAccept = async () => {
    setAccepting(true);
    await fetch(`/api/duels/${duel.id}/accept`, { method: "POST" });
    router.refresh();
  };

  const handleDecline = async () => {
    setDeclining(true);
    await fetch(`/api/duels/${duel.id}/decline`, { method: "POST" });
    router.refresh();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Total points per player
  const calcTotal = (uid: string) =>
    duel.predictions.filter((p) => p.userId === uid && p.result).reduce((s, p) => s + p.points + p.bonusPoints, 0);

  const creatorPoints = calcTotal(duel.creatorId);
  const opponentPoints = duel.opponent ? calcTotal(duel.opponent.id) : 0;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/x1")} className="text-zinc-400 hover:text-white transition-colors">←</button>
        <h1 className="text-xl font-bold text-white">Duelo X1</h1>
        <span className={`text-xs font-medium ml-auto ${s.color}`}>{s.label}</span>
      </div>

      {/* Players banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col items-center gap-2 flex-1">
            <Avatar user={duel.creator} size={48} />
            <p className="text-sm font-medium text-white text-center">{duel.creator.name ?? `@${duel.creator.username}`}</p>
            {duel.status === "FINISHED" && (
              <p className={`text-xl font-bold ${duel.winner?.id === duel.creatorId ? "text-green-400" : "text-zinc-500"}`}>{creatorPoints} pts</p>
            )}
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-black text-zinc-600">VS</span>
            {duel.status === "FINISHED" && duel.winner && (
              <span className="text-xs text-green-400 font-semibold">
                {duel.winner.id === currentUserId ? "Você venceu! 🏆" : `${duel.winner.name ?? duel.winner.username} venceu`}
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-2 flex-1">
            {duel.opponent ? (
              <>
                <Avatar user={duel.opponent} size={48} />
                <p className="text-sm font-medium text-white text-center">{duel.opponent.name ?? `@${duel.opponent.username}`}</p>
                {duel.status === "FINISHED" && (
                  <p className={`text-xl font-bold ${duel.winner?.id === duel.opponent.id ? "text-green-400" : "text-zinc-500"}`}>{opponentPoints} pts</p>
                )}
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-zinc-800 border-2 border-dashed border-zinc-600 flex items-center justify-center text-zinc-600 text-xl">?</div>
                <p className="text-xs text-zinc-500 text-center">Aguardando adversário</p>
              </>
            )}
          </div>
        </div>

        {/* Invite link (creator, PENDING) */}
        {isCreator && duel.status === "PENDING" && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 mb-2">Compartilhe o link do desafio:</p>
            <div className="flex gap-2">
              <input readOnly value={inviteUrl} className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-400 focus:outline-none" />
              <button onClick={copyLink} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-xs text-white rounded-lg transition-colors shrink-0">
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Accept / Decline (for invitee) */}
      {!isCreator && duel.status === "PENDING" && !duel.opponent && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-yellow-400 mb-3">Você foi desafiado para um X1!</p>
          <div className="flex gap-3">
            <button
              onClick={handleAccept} disabled={accepting}
              className="flex-1 py-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black text-sm font-semibold rounded-lg transition-colors"
            >
              {accepting ? "Aceitando..." : "Aceitar desafio ⚔️"}
            </button>
            <button
              onClick={handleDecline} disabled={declining}
              className="px-4 py-2 border border-zinc-700 text-zinc-400 hover:text-white text-sm rounded-lg transition-colors"
            >
              {declining ? "..." : "Recusar"}
            </button>
          </div>
        </div>
      )}

      {/* Matches + predictions */}
      <div className="space-y-4">
        {duel.matches.map(({ matchId, match }) => {
          const locked = isPredictionLocked(new Date(match.startsAt));
          const myPred = duel.predictions.find((p) => p.matchId === matchId && p.userId === currentUserId);
          const oppId = isCreator ? duel.opponent?.id : duel.creatorId;
          const oppPred = oppId ? duel.predictions.find((p) => p.matchId === matchId && p.userId === oppId) : null;
          const bothSubmitted = !!(myPred && oppPred);
          const isFinished = match.status === "FINISHED" || match.status === "POSTPONED";
          const showOpp = bothSubmitted || isFinished;

          const localScore = scores[matchId] ?? { home: "", away: "" };

          return (
            <div key={matchId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              {/* Match header */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-zinc-500">{match.leagueName} · {match.round}</span>
                <span className={`text-xs font-medium ${match.status === "LIVE" ? "text-red-400 animate-pulse" : match.status === "FINISHED" ? "text-zinc-500" : "text-zinc-400"}`}>
                  {match.status === "LIVE" ? "Ao vivo" : match.status === "FINISHED" ? "Encerrado" : new Date(match.startsAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {/* Teams + score */}
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="flex items-center gap-2 flex-1 justify-end">
                  {match.homeTeamFlag && <img src={teamLogo(match.homeTeamFlag) ?? ""} alt="" className="w-6 h-6 object-contain" />}
                  <span className="text-sm font-medium text-white text-right">{match.homeTeam}</span>
                </div>
                <div className="text-sm font-bold text-zinc-400 shrink-0 min-w-[48px] text-center">
                  {isFinished || match.status === "LIVE"
                    ? `${match.homeScore ?? 0} — ${match.awayScore ?? 0}`
                    : "x"}
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-sm font-medium text-white">{match.awayTeam}</span>
                  {match.awayTeamFlag && <img src={teamLogo(match.awayTeamFlag) ?? ""} alt="" className="w-6 h-6 object-contain" />}
                </div>
              </div>

              {/* Predictions side by side */}
              {isParticipant && (
                <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3">
                  {/* My prediction */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5">Seu palpite</p>
                    {locked || myPred ? (
                      <div className="flex items-center gap-1">
                        {myPred ? (
                          <>
                            <span className="text-sm font-bold text-white">{myPred.homeScore} — {myPred.awayScore}</span>
                            {myPred.result && (
                              <span className={`text-xs ml-1 ${resultColor[myPred.result] ?? ""}`}>
                                · {resultLabel[myPred.result] ?? ""} (+{myPred.points + myPred.bonusPoints})
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-zinc-600">Sem palpite</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <ScoreInput
                          value={localScore.home}
                          onChange={(v) => setScores((p) => ({ ...p, [matchId]: { ...p[matchId] ?? { home: "", away: "" }, home: v } }))}
                          disabled={false}
                        />
                        <span className="text-zinc-600">—</span>
                        <ScoreInput
                          value={localScore.away}
                          onChange={(v) => setScores((p) => ({ ...p, [matchId]: { ...p[matchId] ?? { home: "", away: "" }, away: v } }))}
                          disabled={false}
                        />
                      </div>
                    )}
                  </div>

                  {/* Opponent prediction */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5">
                      {duel.opponent ? (duel.opponent.name ?? `@${duel.opponent.username}`) : duel.creator.name ?? `@${duel.creator.username}`}
                    </p>
                    {showOpp && oppPred && oppPred.homeScore >= 0 ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold text-white">{oppPred.homeScore} — {oppPred.awayScore}</span>
                        {oppPred.result && (
                          <span className={`text-xs ml-1 ${resultColor[oppPred.result] ?? ""}`}>
                            · {resultLabel[oppPred.result] ?? ""} (+{oppPred.points + oppPred.bonusPoints})
                          </span>
                        )}
                      </div>
                    ) : oppPred ? (
                      <span className="text-xs text-zinc-500 italic">Palpite enviado — aguardando o seu</span>
                    ) : (
                      <span className="text-xs text-zinc-600">Ainda não palpitou</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save button */}
      {isParticipant && duel.status === "ACTIVE" && (
        <div className="mt-6 flex items-center gap-3 justify-end">
          {saveMsg && (
            <span className={`text-sm ${saveMsg.includes("alvo") ? "text-green-400" : "text-red-400"}`}>{saveMsg}</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? "Salvando..." : "Salvar palpites"}
          </button>
        </div>
      )}
    </div>
  );
}
