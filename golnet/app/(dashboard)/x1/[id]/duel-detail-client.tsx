"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { teamLogo } from "@/lib/utils";
import { isPredictionLocked } from "@/lib/scoring";
import { X1WinnerCard } from "@/components/x1-winner-card";

const KNOCKOUT_STAGES = new Set(["ROUND_OF_16", "QUARTER_FINAL", "SEMI_FINAL", "THIRD_PLACE", "FINAL"]);
const BONUS = 3;

function calcLivePoints(pred: { homeScore: number; awayScore: number }, match: Match): { result: string; points: number; bonusPoints: number } | null {
  if (match.homeScore === null || match.awayScore === null) return null;
  const isKnockout = KNOCKOUT_STAGES.has(match.stage ?? "");
  const bonus = isKnockout ? BONUS : 0;
  const ph = pred.homeScore, pa = pred.awayScore;
  const rh = match.homeScore, ra = match.awayScore;
  if (ph === rh && pa === ra) return { result: "EXACT_SCORE", points: 10, bonusPoints: bonus };
  const pd = ph - pa, rd = rh - ra;
  if (Math.sign(pd) === Math.sign(rd) && pd === rd) return { result: "CORRECT_RESULT_AND_DIFF", points: 7, bonusPoints: bonus };
  if (Math.sign(pd) !== 0 && Math.sign(pd) === Math.sign(rd)) return { result: "CORRECT_WINNER", points: 5, bonusPoints: bonus };
  if (Math.sign(pd) === 0 && Math.sign(rd) === 0) return { result: "CORRECT_DRAW", points: 4, bonusPoints: bonus };
  return { result: "WRONG", points: 0, bonusPoints: 0 };
}

type User = { id: string; name: string | null; username: string | null; image: string | null };
type Match = {
  id: string; homeTeam: string; awayTeam: string;
  homeTeamFlag: string | null; awayTeamFlag: string | null;
  homeScore: number | null; awayScore: number | null;
  startsAt: Date | string; status: string; stage: string | null;
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
  const [editingMatchIds, setEditingMatchIds] = useState<Set<string>>(new Set());
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);
  const [matchErrors, setMatchErrors] = useState<Record<string, string>>({});
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSaveMatch = async (matchId: string) => {
    const score = scores[matchId];
    if (!score || score.home === "" || score.away === "") return;
    setSavingMatchId(matchId);
    setMatchErrors((e) => ({ ...e, [matchId]: "" }));
    const res = await fetch(`/api/duels/${duel.id}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        predictions: [{ matchId, homeScore: Number(score.home), awayScore: Number(score.away) }],
      }),
    });
    setSavingMatchId(null);
    if (res.ok) {
      setEditingMatchIds((prev) => { const next = new Set(prev); next.delete(matchId); return next; });
      router.refresh();
    } else {
      const data = await res.json();
      setMatchErrors((e) => ({ ...e, [matchId]: data.error ?? "Erro ao salvar" }));
    }
  };

  const startEdit = (matchId: string, pred: { homeScore: number; awayScore: number }) => {
    setScores((p) => ({ ...p, [matchId]: { home: String(pred.homeScore), away: String(pred.awayScore) } }));
    setEditingMatchIds((prev) => new Set(prev).add(matchId));
  };

  const cancelEdit = (matchId: string, pred: { homeScore: number; awayScore: number }) => {
    setScores((p) => ({ ...p, [matchId]: { home: String(pred.homeScore), away: String(pred.awayScore) } }));
    setEditingMatchIds((prev) => { const next = new Set(prev); next.delete(matchId); return next; });
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

  // Total points per player — use cron result when available, fall back to live calculation
  const calcTotal = (uid: string) =>
    duel.predictions
      .filter((p) => p.userId === uid)
      .reduce((s, p) => {
        if (p.result) return s + p.points + p.bonusPoints;
        const match = duel.matches.find((m) => m.matchId === p.matchId)?.match;
        if (!match || (match.status !== "FINISHED" && match.status !== "POSTPONED")) return s;
        const live = calcLivePoints(p, match);
        return s + (live ? live.points + live.bonusPoints : 0);
      }, 0);

  const creatorPoints = calcTotal(duel.creatorId);
  const opponentPoints = duel.opponent ? calcTotal(duel.opponent.id) : 0;
  const totalPoints = creatorPoints + opponentPoints;
  const creatorPct = totalPoints > 0 ? Math.round((creatorPoints / totalPoints) * 100) : 50;

  const isActive = duel.status === "ACTIVE";
  const isFinished = duel.status === "FINISHED";
  const showScore = (isActive || isFinished) && duel.opponent;
  const creatorLeading = creatorPoints > opponentPoints;
  const opponentLeading = opponentPoints > creatorPoints;
  const tied = creatorPoints === opponentPoints;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/x1")} className="text-zinc-400 hover:text-white transition-colors">←</button>
        <h1 className="text-xl font-bold text-white">Duelo X1</h1>
        <span className={`text-xs font-medium ml-auto ${s.color}`}>{s.label}</span>
      </div>

      {/* Winner zoação card */}
      {duel.status === "FINISHED" && duel.winner && duel.opponent && (
        <X1WinnerCard
          winnerName={duel.winner.name ?? duel.winner.username ?? "Vencedor"}
          loserName={(duel.winner.id === duel.creatorId ? duel.opponent : duel.creator).name ?? "Perdedor"}
          winnerPoints={duel.winner.id === duel.creatorId ? creatorPoints : opponentPoints}
          loserPoints={duel.winner.id === duel.creatorId ? opponentPoints : creatorPoints}
          isCurrentUserWinner={duel.winner.id === currentUserId}
        />
      )}

      {/* Players banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between gap-4">
          {/* Creator */}
          <div className="flex flex-col items-center gap-2 flex-1">
            {duel.creator.username ? (
              <Link href={`/u/${duel.creator.username}`}><Avatar user={duel.creator} size={48} /></Link>
            ) : (
              <Avatar user={duel.creator} size={48} />
            )}
            <p className="text-sm font-medium text-white text-center">
              {duel.creator.username ? (
                <Link href={`/u/${duel.creator.username}`} className="hover:text-green-400 transition-colors">
                  {duel.creator.name ?? `@${duel.creator.username}`}
                </Link>
              ) : (duel.creator.name ?? "—")}
            </p>
            {showScore && (
              <p className={`text-2xl font-black ${
                isFinished
                  ? duel.winner?.id === duel.creatorId ? "text-green-400" : "text-zinc-500"
                  : creatorLeading ? "text-green-400" : "text-zinc-300"
              }`}>
                {creatorPoints}
                <span className="text-xs font-normal text-zinc-500 ml-1">pts</span>
              </p>
            )}
            {isActive && creatorLeading && (
              <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full font-semibold">🔥 Na frente</span>
            )}
          </div>

          {/* Center */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <span className="text-2xl font-black text-zinc-600">VS</span>
            {isFinished && duel.winner && (
              <span className="text-xs text-green-400 font-semibold text-center">
                {duel.winner.id === currentUserId ? "Você venceu! 🏆" : `${duel.winner.name ?? duel.winner.username} venceu`}
              </span>
            )}
            {isActive && tied && showScore && (
              <span className="text-[10px] text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full font-semibold">Empate</span>
            )}
          </div>

          {/* Opponent */}
          <div className="flex flex-col items-center gap-2 flex-1">
            {duel.opponent ? (
              <>
                {duel.opponent.username ? (
                  <Link href={`/u/${duel.opponent.username}`}><Avatar user={duel.opponent} size={48} /></Link>
                ) : (
                  <Avatar user={duel.opponent} size={48} />
                )}
                <p className="text-sm font-medium text-white text-center">
                  {duel.opponent.username ? (
                    <Link href={`/u/${duel.opponent.username}`} className="hover:text-green-400 transition-colors">
                      {duel.opponent.name ?? `@${duel.opponent.username}`}
                    </Link>
                  ) : (duel.opponent.name ?? "—")}
                </p>
                {showScore && (
                  <p className={`text-2xl font-black ${
                    isFinished
                      ? duel.winner?.id === duel.opponent.id ? "text-green-400" : "text-zinc-500"
                      : opponentLeading ? "text-green-400" : "text-zinc-300"
                  }`}>
                    {opponentPoints}
                    <span className="text-xs font-normal text-zinc-500 ml-1">pts</span>
                  </p>
                )}
                {isActive && opponentLeading && (
                  <span className="text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full font-semibold">🔥 Na frente</span>
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

        {/* Progress bar — visible during active and finished */}
        {showScore && totalPoints > 0 && (
          <div className="mt-4">
            <div className="flex h-2 rounded-full overflow-hidden bg-zinc-700">
              <div
                className="bg-green-500 transition-all duration-500"
                style={{ width: `${creatorPct}%` }}
              />
              <div className="bg-zinc-600 flex-1" />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
              <span>{duel.creator.name?.split(" ")[0]}: {creatorPct}%</span>
              <span>{duel.opponent?.name?.split(" ")[0]}: {100 - creatorPct}%</span>
            </div>
          </div>
        )}

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
      {!isCreator && duel.status === "PENDING" && (!duel.opponent || duel.opponent.id === currentUserId) && (
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
          const isFinished = match.status === "FINISHED" || match.status === "POSTPONED";
          // Só revela palpite do adversário após o travamento (5min antes) ou fim do jogo
          const showOpp = locked || isFinished;

          const localScore = scores[matchId] ?? { home: "", away: "" };

          const isKnockout = KNOCKOUT_STAGES.has(match.stage ?? "");
          const liveMyPts  = myPred  && !myPred.result  ? calcLivePoints(myPred,  match) : null;
          const liveOppPts = oppPred && !oppPred.result ? calcLivePoints(oppPred, match) : null;

          const myEffective  = myPred?.result  ? { result: myPred.result,  pts: myPred.points  + myPred.bonusPoints  } : liveMyPts  ? { result: liveMyPts.result,  pts: liveMyPts.points  + liveMyPts.bonusPoints  } : null;
          const oppEffective = oppPred?.result ? { result: oppPred.result, pts: oppPred.points + oppPred.bonusPoints } : liveOppPts ? { result: liveOppPts.result, pts: liveOppPts.points + liveOppPts.bonusPoints } : null;

          return (
            <div key={matchId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              {/* Match header */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">{match.leagueName} · {match.round}</span>
                <div className="flex items-center gap-2">
                  {isKnockout && (
                    <span className="text-[10px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded font-semibold">+{BONUS} bônus</span>
                  )}
                  <span className={`text-xs font-medium ${match.status === "LIVE" ? "text-red-400 animate-pulse" : match.status === "FINISHED" ? "text-zinc-500" : "text-zinc-400"}`}>
                    {match.status === "LIVE" ? "Ao vivo" : match.status === "FINISHED" ? "Encerrado" : new Date(match.startsAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>

              {/* Point legend */}
              <div className="flex flex-wrap gap-1 mb-3">
                {[
                  { label: "Placar exato", pts: 10 + (isKnockout ? BONUS : 0), color: "text-yellow-400 bg-yellow-400/10" },
                  { label: "Resultado + saldo", pts: 7 + (isKnockout ? BONUS : 0), color: "text-green-400 bg-green-400/10" },
                  { label: "Vencedor", pts: 5 + (isKnockout ? BONUS : 0), color: "text-blue-400 bg-blue-400/10" },
                  { label: "Empate", pts: 4 + (isKnockout ? BONUS : 0), color: "text-blue-400 bg-blue-400/10" },
                ].map(({ label, pts, color }) => (
                  <span key={label} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${color}`}>
                    {label}: {pts}pts
                  </span>
                ))}
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
                    {locked ? (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span>🔒</span>
                        {myPred ? (
                          <>
                            <span className="font-bold text-white">{myPred.homeScore} — {myPred.awayScore}</span>
                            {myEffective && myEffective.result !== "WRONG" && (
                              <span className={`text-xs ${resultColor[myEffective.result] ?? ""}`}>
                                +{myEffective.pts}pts
                              </span>
                            )}
                            {myEffective?.result === "WRONG" && (
                              <span className="text-xs text-red-400">Errou</span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-zinc-600">Sem palpite</span>
                        )}
                      </div>
                    ) : myPred && !editingMatchIds.has(matchId) ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-green-400 text-sm">✓</span>
                        <span className="text-sm font-bold text-white">{myPred.homeScore} — {myPred.awayScore}</span>
                        {myEffective && myEffective.result !== "WRONG" && (
                          <span className={`text-xs ${resultColor[myEffective.result] ?? ""}`}>
                            +{myEffective.pts}pts
                          </span>
                        )}
                        <button
                          onClick={() => startEdit(matchId, myPred)}
                          className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-2 py-0.5 transition-colors"
                        >
                          Editar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1">
                          <ScoreInput
                            value={localScore.home}
                            onChange={(v) => setScores((p) => ({ ...p, [matchId]: { ...p[matchId] ?? { home: "", away: "" }, home: v } }))}
                            disabled={savingMatchId === matchId}
                          />
                          <span className="text-zinc-600">—</span>
                          <ScoreInput
                            value={localScore.away}
                            onChange={(v) => setScores((p) => ({ ...p, [matchId]: { ...p[matchId] ?? { home: "", away: "" }, away: v } }))}
                            disabled={savingMatchId === matchId}
                          />
                        </div>
                        <div className="flex gap-1.5">
                          {myPred && (
                            <button
                              onClick={() => cancelEdit(matchId, myPred)}
                              className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-2 py-1 transition-colors"
                            >
                              Cancelar
                            </button>
                          )}
                          <button
                            onClick={() => handleSaveMatch(matchId)}
                            disabled={savingMatchId === matchId || localScore.home === "" || localScore.away === ""}
                            className="text-xs bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-semibold rounded-lg px-3 py-1 transition-colors"
                          >
                            {savingMatchId === matchId ? "..." : "Salvar"}
                          </button>
                        </div>
                        {matchErrors[matchId] && (
                          <p className="text-xs text-red-400">{matchErrors[matchId]}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Opponent prediction */}
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5">
                      {duel.opponent ? (duel.opponent.name ?? `@${duel.opponent.username}`) : duel.creator.name ?? `@${duel.creator.username}`}
                    </p>
                    {showOpp && oppPred ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-sm font-bold text-white">{oppPred.homeScore} — {oppPred.awayScore}</span>
                        {oppEffective && (
                          <span className={`text-xs ml-1 ${oppEffective.result !== "WRONG" ? (resultColor[oppEffective.result] ?? "") : "text-red-400"}`}>
                            · {resultLabel[oppEffective.result] ?? ""}{oppEffective.result !== "WRONG" ? ` (+${oppEffective.pts}pts)` : ""}
                          </span>
                        )}
                      </div>
                    ) : oppPred && myPred ? (
                      <span className="text-xs text-zinc-500 italic">🔒 Visível ao início do jogo</span>
                    ) : oppPred ? (
                      <span className="text-xs text-zinc-500 italic">Palpite enviado</span>
                    ) : (
                      <span className="text-xs text-zinc-600">Ainda não palpitou</span>
                    )}
                  </div>
                </div>
              )}

              {/* Per-match point breakdown — shows when match is finished and both predicted */}
              {isParticipant && isFinished && myEffective && oppEffective && (
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Pontos neste jogo</p>
                  <div className="flex items-center gap-2">
                    <div className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg py-2 px-2 ${
                      myEffective.pts > oppEffective.pts ? "bg-green-500/10 border border-green-500/30" : "bg-zinc-800"
                    }`}>
                      <span className={`text-lg font-black ${myEffective.result !== "WRONG" ? (resultColor[myEffective.result] ?? "text-zinc-400") : "text-zinc-600"}`}>
                        {myEffective.result !== "WRONG" ? `+${myEffective.pts}` : "0"}
                      </span>
                      <span className="text-[10px] text-zinc-500">{resultLabel[myEffective.result] ?? "Errou"}</span>
                    </div>

                    <span className="text-zinc-600 text-xs font-bold shrink-0">×</span>

                    <div className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg py-2 px-2 ${
                      oppEffective.pts > myEffective.pts ? "bg-green-500/10 border border-green-500/30" : "bg-zinc-800"
                    }`}>
                      <span className={`text-lg font-black ${oppEffective.result !== "WRONG" ? (resultColor[oppEffective.result] ?? "text-zinc-400") : "text-zinc-600"}`}>
                        {oppEffective.result !== "WRONG" ? `+${oppEffective.pts}` : "0"}
                      </span>
                      <span className="text-[10px] text-zinc-500">{resultLabel[oppEffective.result] ?? "Errou"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
