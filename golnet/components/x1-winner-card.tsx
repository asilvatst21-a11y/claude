"use client";

import { useState } from "react";

interface Props {
  winnerName: string;
  loserName: string;
  winnerPoints: number;
  loserPoints: number;
  isCurrentUserWinner: boolean;
}

const winnerTaunts = [
  "🏆 Soberano absoluto do palpite!",
  "👑 O rei não tira a coroa.",
  "🎯 Bala certeira. Nem encostou.",
  "🔥 Destruiu sem dó nem piedade.",
  "💪 Não veio pra brincar, não.",
];

const loserTaunts = [
  "💀 Tentou. Não deu.",
  "🪦 Aqui jaz alguém que achou que sabia de futebol.",
  "😂 Foi de bala... perdeu.",
  "🤡 Isso é que é palpite? Sério?",
  "☠️ Próxima vez tenta o bingo.",
];

function pick(arr: string[], seed: string) {
  const idx = seed.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % arr.length;
  return arr[idx];
}

export function X1WinnerCard({ winnerName, loserName, winnerPoints, loserPoints, isCurrentUserWinner }: Props) {
  const [sharing, setSharing] = useState(false);
  const seed = winnerName + loserName;

  const winnerLine = pick(winnerTaunts, seed);
  const loserLine = pick(loserTaunts, seed + "l");

  const shareText =
    `⚔️ X1 PalpitaAí — Resultado\n` +
    `\n` +
    `🏆 ${winnerName} — ${winnerPoints} pts\n` +
    `💀 ${loserName} — ${loserPoints} pts\n` +
    `\n` +
    `${winnerLine}\n` +
    `${loserLine}\n` +
    `\npalpitai.vercel.app`;

  const handleShare = async () => {
    setSharing(true);
    if (navigator.share) {
      try { await navigator.share({ text: shareText }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(shareText);
    }
    setSharing(false);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden mb-6">
      {/* Banner topo */}
      <div className="bg-gradient-to-r from-green-500/20 via-yellow-500/10 to-green-500/20 border-b border-zinc-700 px-5 py-4 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-yellow-400 mb-1">Duelo encerrado ⚔️</p>
        <p className="text-2xl font-black text-white">{winnerName}</p>
        <p className="text-sm text-green-400 font-semibold mt-0.5">{winnerLine}</p>
      </div>

      {/* Placar */}
      <div className="flex items-stretch divide-x divide-zinc-700">
        <div className="flex-1 flex flex-col items-center justify-center py-5 px-4 gap-1">
          <span className="text-3xl">🏆</span>
          <p className="text-sm font-semibold text-white">{winnerName}</p>
          <p className="text-2xl font-black text-green-400">{winnerPoints} pts</p>
          <p className="text-xs text-green-500 font-medium">VENCEDOR</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-5 px-4 gap-1">
          <span className="text-3xl">💀</span>
          <p className="text-sm font-semibold text-zinc-400">{loserName}</p>
          <p className="text-2xl font-black text-zinc-500">{loserPoints} pts</p>
          <p className="text-xs text-red-500 font-medium">ELIMINADO</p>
        </div>
      </div>

      {/* Zoação */}
      <div className="bg-zinc-800/50 border-t border-zinc-700 px-5 py-3 text-center">
        <p className="text-xs text-zinc-400 italic">{loserLine}</p>
      </div>

      {/* Share */}
      <div className="px-5 py-4 border-t border-zinc-700">
        <button
          onClick={handleShare}
          disabled={sharing}
          className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black text-sm font-bold transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          {isCurrentUserWinner ? "Zoar o perdedor 😂" : "Compartilhar resultado"}
        </button>
      </div>
    </div>
  );
}
