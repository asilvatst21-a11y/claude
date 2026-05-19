"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Match, Prediction } from "@/types";
import { isPredictionLocked } from "@/lib/scoring";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const [saved, setSaved] = useState(false);

  const locked = isPredictionLocked(new Date(match.startsAt));

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: match.id,
        homeScore: parseInt(home),
        awayScore: parseInt(away),
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved?.();
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
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{match.group ? `Grupo ${match.group}` : match.stage.replace(/_/g, " ")}</span>
        <div className="flex items-center gap-2">
          {match.status === "LIVE" && (
            <span className="flex items-center gap-1 text-green-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Ao vivo
            </span>
          )}
          {match.status !== "LIVE" && (
            <span>{statusLabel[match.status]}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 flex flex-col items-center gap-1">
          {match.homeTeamFlag && <img src={match.homeTeamFlag} alt="" className="w-8 h-8 object-contain" />}
          <span className="text-sm font-medium text-white text-center">{match.homeTeam}</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          {match.status === "FINISHED" && match.homeScore !== null ? (
            <span className="text-2xl font-bold text-white">
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
        ) : (
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
            <Button
              size="sm"
              className="ml-auto"
              onClick={handleSave}
              loading={saving}
              disabled={home === "" || away === ""}
            >
              {saved ? "Salvo!" : "Salvar"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
