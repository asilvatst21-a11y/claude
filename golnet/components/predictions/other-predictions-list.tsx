"use client";

import type { OtherPrediction } from "@/types";

const resultColor: Record<string, string> = {
  EXACT_SCORE: "text-yellow-400",
  CORRECT_RESULT_AND_DIFF: "text-green-400",
  CORRECT_WINNER: "text-blue-400",
  CORRECT_DRAW: "text-blue-400",
  WRONG: "text-red-400",
};

interface Props {
  predictions: OtherPrediction[];
}

export function OtherPredictionsList({ predictions }: Props) {
  if (predictions.length === 0) return null;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/60 rounded-xl px-3 py-2.5">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">
        Palpites da liga
      </p>
      <div className="flex flex-col gap-1.5">
        {predictions.map((p) => (
          <div key={p.userId} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              {p.image ? (
                <img src={p.image} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-zinc-700 shrink-0 flex items-center justify-center text-[10px] text-zinc-400">
                  {(p.name ?? p.username ?? "?")[0].toUpperCase()}
                </div>
              )}
              <span className="text-zinc-300 truncate">{p.name ?? p.username ?? "Usuário"}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="text-zinc-400 font-mono">
                {p.homeScore} x {p.awayScore}
              </span>
              {p.result && (
                <span className={`font-semibold ${resultColor[p.result] ?? "text-zinc-500"}`}>
                  +{p.points}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
