"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Match, Prediction } from "@/types";
import { isPredictionLocked } from "@/lib/scoring";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MatchStatsModal } from "./match-stats-modal";

interface MatchCardProps {
  match: Match & { predictions?: Prediction[] };
  onSaved?: () => void;
}

const statusLabel: Record<string, string> = {
  SCHEDULED: "Agendado",
  LIVE: "Ao vivo",
  FINISHED: "Encerrado",
  POSTPONED: "Adiado",
  CANCELLED: "Cancelado",
};

export function MatchCard({ match, onSaved }: MatchCardProps) {
  const existing = match.predictions?.[0];
  const [home, setHome] = useState(existing?.homeScore?.toString() ?? "");
  const [away, setAway] = useState(existing?.awayScore?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(!!existing);
  const [isEditing, setIsEditing] = useState(!existing);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);

  const locked = isPredictionLocked(new Date(match.startsAt));

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const res = await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: match.id,
        homeScore: parseInt(home),
        awayScore: parseInt(away),
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

  const resultColor: Record<string, string> = {
    EXACT_SCORE: "text-yellow-400",
    CORRECT_RESULT_AND_DIFF: "text-green-400",
    CORRECT_WINNER: "text-blue-400",
    CORRECT_DRAW: "text-blue-400",
    WRONG: "text-red-400",
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
          {match.homeTeamFlag && <img src={match.homeTeamFlag} alt="" className="w-8 h-8 object-contain" />}
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
          {match.awayTeamFlag && <img src={match.awayTeamFlag} alt="" className="w-8 h-8 object-contain" />}
          <span className="text-sm font-medium text-white text-center">{match.awayTeam}</span>
        </div>
      </div>

      {/* Prediction area */}
      <div className="border-t border-zinc-800 pt-3">
        {locked ? (
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
        ) : isSaved && !isEditing ? (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-green-400 font-medium">
              <span>✓</span>
              Palpite: {home} x {away}
            </span>
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
            >
              Editar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={30}
                value={home}
                onChange={(e) => setHome(e.target.value)}
                className="w-14 text-center bg-zinc-800 border border-zinc-700 rounded-lg py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <span className="text-zinc-500 font-bold">x</span>
              <input
                type="number"
                min={0}
                max={30}
                value={away}
                onChange={(e) => setAway(e.target.value)}
                className="w-14 text-center bg-zinc-800 border border-zinc-700 rounded-lg py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <div className="flex gap-2 ml-auto">
                {isSaved && (
                  <button
                    onClick={() => { setIsEditing(false); setHome(existing?.homeScore?.toString() ?? home); setAway(existing?.awayScore?.toString() ?? away); }}
                    className="text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                <Button
                  size="sm"
                  onClick={handleSave}
                  loading={saving}
                  disabled={home === "" || away === ""}
                >
                  Salvar
                </Button>
              </div>
            </div>
            {saveError && <p className="text-xs text-red-400">{saveError}</p>}
          </div>
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
