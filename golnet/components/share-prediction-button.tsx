"use client";

import { useState } from "react";

interface Props {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  predHome: number;
  predAway: number;
  result: string;
  points: number;
}

const resultEmoji: Record<string, string> = {
  EXACT_SCORE: "🎯",
  CORRECT_RESULT_AND_DIFF: "💙",
  CORRECT_WINNER: "✅",
  CORRECT_DRAW: "✅",
  WRONG: "❌",
};

const resultLabel: Record<string, string> = {
  EXACT_SCORE: "Placar exato!",
  CORRECT_RESULT_AND_DIFF: "Diferença certa!",
  CORRECT_WINNER: "Acertou o vencedor!",
  CORRECT_DRAW: "Acertou o empate!",
  WRONG: "Errou esse",
};

export function SharePredictionButton({ homeTeam, awayTeam, homeScore, awayScore, predHome, predAway, result, points }: Props) {
  const [copied, setCopied] = useState(false);

  const emoji = resultEmoji[result] ?? "⚽";
  const label = resultLabel[result] ?? result;

  const text =
    `${emoji} ${label}\n` +
    `${homeTeam} ${homeScore}–${awayScore} ${awayTeam}\n` +
    `Meu palpite: ${predHome}–${predAway}${points > 0 ? ` · +${points} pts` : ""}\n` +
    `palpitai.vercel.app`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // user cancelled or not supported
      }
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      title="Compartilhar palpite"
      className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded"
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
        </svg>
      )}
    </button>
  );
}
