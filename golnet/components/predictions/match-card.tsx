"use client";

import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Match, Prediction } from "@/types";
import type { GoalEvent } from "@/lib/api-football";
import { isPredictionLocked } from "@/lib/scoring";
import { Button } from "@/components/ui/button";
import { cn, teamLogo } from "@/lib/utils";
import { MatchStatsModal } from "./match-stats-modal";

interface MatchCardProps {
  match: Match & { predictions?: Prediction[] };
  onSaved?: () => void;
  goalScorerEnabled?: boolean;
  goalScorerPoints?: number;
}

type GsData = { home: string[]; away: string[] };

function parseGs(raw: string | null | undefined): GsData {
  if (!raw) return { home: [], away: [] };
  try {
    const parsed = JSON.parse(raw) as GsData;
    if (Array.isArray(parsed.home) && Array.isArray(parsed.away)) return parsed;
  } catch { /* legacy plain-text — ignore */ }
  return { home: [], away: [] };
}

const statusLabel: Record<string, string> = {
  SCHEDULED: "Agendado",
  LIVE: "Ao vivo",
  FINISHED: "Encerrado",
  POSTPONED: "Adiado",
  CANCELLED: "Cancelado",
};

const resultColor: Record<string, string> = {
  EXACT_SCORE: "text-yellow-400",
  CORRECT_RESULT_AND_DIFF: "text-green-400",
  CORRECT_WINNER: "text-blue-400",
  CORRECT_DRAW: "text-blue-400",
  WRONG: "text-red-400",
};

export function MatchCard({ match, onSaved, goalScorerEnabled, goalScorerPoints = 5 }: MatchCardProps) {
  const existing = match.predictions?.[0];
  const existingGs = parseGs((existing as { goalScorerPrediction?: string | null })?.goalScorerPrediction);

  const [home, setHome] = useState(existing?.homeScore?.toString() ?? "");
  const [away, setAway] = useState(existing?.awayScore?.toString() ?? "");
  const [gsHome, setGsHome] = useState<string[]>(existingGs.home);
  const [gsAway, setGsAway] = useState<string[]>(existingGs.away);
  const [players, setPlayers] = useState<{ home: string[]; away: string[] } | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(!!existing);
  const [isEditing, setIsEditing] = useState(!existing);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const playersLoadedRef = useRef(false);

  const locked = isPredictionLocked(new Date(match.startsAt));

  const homeGoalCount = Math.max(0, parseInt(home) || 0);
  const awayGoalCount = Math.max(0, parseInt(away) || 0);
  const totalGoals = homeGoalCount + awayGoalCount;

  // Derived scorer arrays: always sized to current goal count
  const homeScorers = Array.from({ length: homeGoalCount }, (_, i) => gsHome[i] ?? "");
  const awayScorers = Array.from({ length: awayGoalCount }, (_, i) => gsAway[i] ?? "");

  // Auto-load squad when goal slots become visible
  useEffect(() => {
    if (totalGoals > 0 && !playersLoadedRef.current && !locked) {
      playersLoadedRef.current = true;
      setLoadingPlayers(true);
      fetch(`/api/matches/${match.id}/players`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setPlayers(data); })
        .finally(() => setLoadingPlayers(false));
    }
  }, [totalGoals > 0, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateGs = (team: "home" | "away", idx: number, val: string) => {
    if (team === "home") setGsHome((p) => { const n = [...p]; n[idx] = val; return n; });
    else setGsAway((p) => { const n = [...p]; n[idx] = val; return n; });
  };

  const buildGsPayload = () => {
    const h = homeScorers.map((s) => s.trim()).filter(Boolean);
    const a = awayScorers.map((s) => s.trim()).filter(Boolean);
    if (h.length === 0 && a.length === 0) return undefined;
    return JSON.stringify({ home: h, away: a });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const gsPayload = buildGsPayload();
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: match.id,
        homeScore: parseInt(home),
        awayScore: parseInt(away),
        ...(gsPayload ? { goalScorerPrediction: gsPayload } : {}),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setIsSaved(true);
      setIsEditing(false);
      onSaved?.();
    } else {
      const data = await res.json();
      setSaveError(data.error ?? "Erro ao salvar");
    }
  };

  // Save only goal scorers (when score already saved)
  const handleSaveGs = async () => {
    if (home === "" || away === "") return;
    setSaving(true);
    setSaveError(null);
    const gsPayload = buildGsPayload();
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: match.id,
        homeScore: parseInt(home),
        awayScore: parseInt(away),
        ...(gsPayload ? { goalScorerPrediction: gsPayload } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setSaveError(data.error ?? "Erro ao salvar");
    }
  };

  return (
    <div className={cn(
      "bg-zinc-900 border rounded-xl p-4 flex flex-col gap-3",
      match.status === "LIVE" ? "border-green-500/50 shadow-green-500/10 shadow-lg" : "border-zinc-800"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{match.group ? `Grupo ${match.group}` : match.stage.replace(/_/g, " ")}</span>
        <div className="flex items-center gap-2">
          {match.status === "LIVE" && (
            <span className="flex items-center gap-1 text-green-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Ao vivo
            </span>
          )}
          {match.status !== "LIVE" && <span>{statusLabel[match.status]}</span>}
        </div>
      </div>

      {showStats && (
        <MatchStatsModal
          matchId={match.id}
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          homeTeamFlag={match.homeTeamFlag ?? null}
          awayTeamFlag={match.awayTeamFlag ?? null}
          onClose={() => setShowStats(false)}
        />
      )}

      {/* Teams */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex flex-col items-center gap-1">
          {match.homeTeamFlag && <img src={teamLogo(match.homeTeamFlag)} alt="" className="w-8 h-8 object-contain" />}
          <span className="text-sm font-medium text-white text-center">{match.homeTeam}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          {(match.status === "FINISHED" || match.status === "LIVE") && match.homeScore !== null ? (
            <span className={`text-2xl font-bold ${match.status === "LIVE" ? "text-green-400" : "text-white"}`}>
              {match.homeScore} — {match.awayScore}
            </span>
          ) : (
            <span className="text-xs text-zinc-500">
              {format(new Date(match.startsAt), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center gap-1">
          {match.awayTeamFlag && <img src={teamLogo(match.awayTeamFlag)} alt="" className="w-8 h-8 object-contain" />}
          <span className="text-sm font-medium text-white text-center">{match.awayTeam}</span>
        </div>
      </div>

      {/* Actual goal scorers (finished/live) */}
      {(match.status === "FINISHED" || match.status === "LIVE") && (() => {
        const goals = (match.goals as GoalEvent[] | null) ?? [];
        if (goals.length === 0) return null;
        const homeGoals = goals.filter((g) => g.team === "home");
        const awayGoals = goals.filter((g) => g.team === "away");
        const goalIcon = (type: GoalEvent["type"]) =>
          type === "owngoal" ? "⚽ (CG)" : type === "penalty" ? "⚽ (P)" : "⚽";
        return (
          <div className="flex gap-2 text-[11px] text-zinc-400 mt-0.5">
            <div className="flex-1 flex flex-col items-end gap-0.5">
              {homeGoals.map((g, i) => (
                <span key={i}>{g.player} {g.minute}{g.extra ? `+${g.extra}` : ""}&apos; {goalIcon(g.type)}</span>
              ))}
            </div>
            <div className="w-px bg-zinc-800 shrink-0" />
            <div className="flex-1 flex flex-col items-start gap-0.5">
              {awayGoals.map((g, i) => (
                <span key={i}>{goalIcon(g.type)} {g.minute}{g.extra ? `+${g.extra}` : ""}&apos; {g.player}</span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Prediction area */}
      <div className="border-t border-zinc-800 pt-3 flex flex-col gap-3">
        {locked ? (
          /* LOCKED */
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-zinc-500">
                <span>🔒</span>
                {existing ? `Seu palpite: ${existing.homeScore} x ${existing.awayScore}` : "Sem palpite"}
              </span>
              {existing?.result && (
                <span className={cn("font-semibold", resultColor[existing.result])}>
                  +{(existing.points ?? 0) + (existing.bonusPoints ?? 0)} pts
                </span>
              )}
            </div>
            {/* Predicted scorers (locked) */}
            {(existingGs.home.length > 0 || existingGs.away.length > 0) && (
              <div className="flex gap-4 text-xs text-zinc-500">
                {existingGs.home.length > 0 && (
                  <div>
                    <p className="text-zinc-600 mb-0.5">{match.homeTeam}</p>
                    {existingGs.home.map((p, i) => (
                      <p key={i} className="text-zinc-300">⚽ {p}
                        {goalScorerEnabled && (existing as { goalScorerCorrect?: boolean | null })?.goalScorerCorrect === true && <span className="text-green-400 ml-1">✓ +{goalScorerPoints}pts</span>}
                      </p>
                    ))}
                  </div>
                )}
                {existingGs.away.length > 0 && (
                  <div>
                    <p className="text-zinc-600 mb-0.5">{match.awayTeam}</p>
                    {existingGs.away.map((p, i) => (
                      <p key={i} className="text-zinc-300">⚽ {p}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* NOT LOCKED */
          <>
            {/* Score row */}
            {isSaved && !isEditing ? (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-green-400 font-medium">
                  <span>✓</span>
                  Placar: {home} x {away}
                </span>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Editar placar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={30} value={home}
                  onChange={(e) => setHome(e.target.value)}
                  className="w-14 text-center bg-zinc-800 border border-zinc-700 rounded-lg py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <span className="text-zinc-500 font-bold">x</span>
                <input
                  type="number" min={0} max={30} value={away}
                  onChange={(e) => setAway(e.target.value)}
                  className="w-14 text-center bg-zinc-800 border border-zinc-700 rounded-lg py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <div className="flex gap-2 ml-auto">
                  {isSaved && (
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setHome(existing?.homeScore?.toString() ?? home);
                        setAway(existing?.awayScore?.toString() ?? away);
                        setGsHome(existingGs.home);
                        setGsAway(existingGs.away);
                      }}
                      className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                  <Button size="sm" onClick={handleSave} loading={saving} disabled={home === "" || away === ""}>
                    Salvar
                  </Button>
                </div>
              </div>
            )}

            {/* Goal scorer distribution */}
            {totalGoals > 0 && (
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300">
                    ⚽ Artilheiros do palpite
                    {goalScorerEnabled && <span className="text-blue-400 ml-1">(+{goalScorerPoints} pts por acerto)</span>}
                  </span>
                  {loadingPlayers && <span className="text-xs text-zinc-500">Carregando jogadores...</span>}
                </div>

                {/* Datalists for autocomplete */}
                {players && (
                  <>
                    <datalist id={`home-pl-${match.id}`}>
                      {players.home.map((p) => <option key={p} value={p} />)}
                    </datalist>
                    <datalist id={`away-pl-${match.id}`}>
                      {players.away.map((p) => <option key={p} value={p} />)}
                    </datalist>
                  </>
                )}

                {/* Home team scorers */}
                {homeGoalCount > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1">
                      {match.homeTeamFlag && <img src={teamLogo(match.homeTeamFlag) ?? ""} alt="" className="w-3.5 h-3.5 object-contain" />}
                      {match.homeTeam} — {homeGoalCount} gol{homeGoalCount !== 1 ? "s" : ""}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {homeScorers.map((val, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-zinc-600 w-10 shrink-0">Gol {i + 1}</span>
                          <input
                            type="text"
                            list={players ? `home-pl-${match.id}` : undefined}
                            value={val}
                            onChange={(e) => updateGs("home", i, e.target.value)}
                            placeholder={loadingPlayers ? "Carregando..." : "Nome do jogador"}
                            maxLength={80}
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Away team scorers */}
                {awayGoalCount > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-1.5 flex items-center gap-1">
                      {match.awayTeamFlag && <img src={teamLogo(match.awayTeamFlag) ?? ""} alt="" className="w-3.5 h-3.5 object-contain" />}
                      {match.awayTeam} — {awayGoalCount} gol{awayGoalCount !== 1 ? "s" : ""}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {awayScorers.map((val, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-zinc-600 w-10 shrink-0">Gol {i + 1}</span>
                          <input
                            type="text"
                            list={players ? `away-pl-${match.id}` : undefined}
                            value={val}
                            onChange={(e) => updateGs("away", i, e.target.value)}
                            placeholder={loadingPlayers ? "Carregando..." : "Nome do jogador"}
                            maxLength={80}
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-xs placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Save button when score already locked and user is editing only scorers */}
                {isSaved && !isEditing && (
                  <Button size="sm" onClick={handleSaveGs} loading={saving} className="self-end">
                    Salvar artilheiros ✓
                  </Button>
                )}
              </div>
            )}

            {saveError && <p className="text-xs text-red-400">{saveError}</p>}
          </>
        )}
      </div>

      {/* Raio-X button */}
      <button
        onClick={() => setShowStats(true)}
        className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 hover:text-white transition-colors border border-zinc-700/50"
      >
        <span>⚡</span>
        Raio-X do jogo
      </button>
    </div>
  );
}
