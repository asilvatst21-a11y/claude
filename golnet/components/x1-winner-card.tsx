"use client";

import { useState } from "react";

interface Props {
  winnerName?: string;
  loserName?: string;
  winnerPoints: number;
  loserPoints: number;
  isCurrentUserWinner?: boolean;
  isDraw?: boolean;
  player1Name?: string;
  player2Name?: string;
  duelId?: string;
}

const WINNER_TAUNTS = [
  "👑 O rei não tira a coroa. Nunca.",
  "🎯 Bala certeira. Nem encostou.",
  "🔥 Destruiu sem dó nem piedade.",
  "💪 Isso aqui não é sorte, é talento.",
  "🦁 Leão solto no galinheiro.",
  "🧠 Palpiteiro de elite. Nível outro.",
  "😤 Nem suou. Passeou.",
  "⚡ Relâmpago. O adversário nem viu passar.",
  "🏹 Flecheiro do palpite. Certeiro demais.",
  "🎖️ Condecorado na arte de humilhar.",
];

const WINNER_BLOWOUT = [
  "💀 Goleada moral. Isso foi cruel demais.",
  "🚑 Alguém chama a ambulância pro adversário.",
  "🪦 Enterrou vivo e jogou flores por cima.",
  "😂 Isso foi um jogo ou uma palestra? Porque o outro só assistiu.",
  "🏆 Nem foi jogo — foi aula particular. De graça.",
];

const CLOSE_MATCH = [
  "😅 Por pouco... mas por pouco não conta.",
  "🎲 A sorte ajudou, mas quem vence leva o troféu.",
  "🤏 Milímetros separam gênios de mortais.",
];

const LOSER_WINNER_VIEW = [
  "💀 {loser} tentou. Não deu. Saudades.",
  "🤡 {loser} achou que sabia de futebol. Achou errado.",
  "😭 {loser} foi de bala. Pode passar no velório.",
  "☠️ {loser}: próxima vez tenta o bingo.",
  "🪦 Aqui jaz {loser}, que um dia acreditou nos próprios palpites.",
  "🫡 {loser} lutou com honra. E mesmo assim perdeu feio.",
  "📺 {loser} assistiu e aprendeu. Devagar vai longe.",
  "🎪 {loser} foi mais artista do que palpiteiro hoje.",
];

const LOSER_SELF = [
  "😅 Apanhei, mas aprendi. (Mentira, não aprendi nada.)",
  "🤌 Dei o melhor de mim. O melhor foi péssimo.",
  "🫠 Palpiteiro? Eu? Nunca mais.",
  "💀 Fui humilhado em campo. Próxima vez peço revanche.",
  "🙃 Tudo bem. Isso aqui é treino. Era treino. Né?",
  "🤡 Reconheço: meus palpites foram uma obra de ficção científica.",
  "📉 Meu histórico de palpites vai ficar guardado num cofre.",
  "🎭 Foi tudo planejado. Eu queria perder. (Não queria.)",
];

const DRAW_LINES = [
  "🤝 Equilíbrio total. Ninguém ganha, ninguém perde.",
  "⚖️ Dois gênios se encontraram e saíram no zero.",
  "🧐 Impressionante. Idênticos no palpite e na frustração.",
  "🏳️ Empate técnico. Revancha obrigatória.",
  "😤 Isso não resolve nada. Bora pedir revanche!",
];

function pick(arr: string[], seed: string) {
  const idx = arr.length === 0 ? 0 : seed.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % arr.length;
  return arr[idx];
}

function buildShareText(
  isWinner: boolean,
  winnerName: string,
  loserName: string,
  winnerPoints: number,
  loserPoints: number,
  seed: string,
  url: string
) {
  const diff = winnerPoints - loserPoints;
  const isBlowout = diff >= 5;
  const isClose = diff <= 1;

  if (isWinner) {
    const heroLine = isBlowout
      ? pick(WINNER_BLOWOUT, seed)
      : isClose
      ? pick(CLOSE_MATCH, seed)
      : pick(WINNER_TAUNTS, seed);
    const loserLine = pick(LOSER_WINNER_VIEW, seed + "l").replace("{loser}", loserName);
    return (
      `⚔️ X1 PalpitaAí — Resultado\n\n` +
      `🏆 ${winnerName} — ${winnerPoints} pts\n` +
      `💀 ${loserName} — ${loserPoints} pts\n\n` +
      `${heroLine}\n` +
      `${loserLine}\n\n` +
      `Quer me desafiar? ${url}`
    );
  } else {
    const selfLine = pick(LOSER_SELF, seed + "s");
    return (
      `⚔️ X1 PalpitaAí — Resultado\n\n` +
      `🏆 ${winnerName} — ${winnerPoints} pts\n` +
      `💀 Eu (${loserName}) — ${loserPoints} pts\n\n` +
      `${selfLine}\n\n` +
      `Quem topa me dar revanche? ${url}`
    );
  }
}

function ShareButtons({
  getShareText,
  label,
  duelId,
}: {
  getShareText: () => string;
  label: string;
  duelId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(getShareText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareImage = async () => {
    if (!duelId) return;
    setSharingImage(true);
    try {
      const res = await fetch(`/api/x1/${duelId}/share-image`);
      const blob = await res.blob();
      const file = new File([blob], "duelo-x1.png", { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Duelo X1 — PalpitaAí" });
      } else {
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "duelo-x1.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* cancelled */ } finally {
      setSharingImage(false);
    }
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(getShareText())}`, "_blank");
  };

  const handleNativeShare = async () => {
    if (!navigator.share) return;
    try { await navigator.share({ text: getShareText() }); } catch { /* cancelled */ }
  };

  return (
    <div className="px-5 py-4 border-t border-zinc-700 flex flex-col gap-2">
      <p className="text-xs text-zinc-500 text-center mb-1">{label}</p>

      {/* Share image — primary CTA */}
      {duelId && (
        <button
          onClick={handleShareImage}
          disabled={sharingImage}
          className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
        >
          {sharingImage ? (
            "Gerando imagem..."
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Compartilhar como imagem
            </>
          )}
        </button>
      )}

      <button
        onClick={handleWhatsApp}
        className="w-full py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe57] text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        {label.includes("Empate") ? "WhatsApp (texto)" : "Zoar no WhatsApp (texto)"}
      </button>

      <button
        onClick={handleCopy}
        className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
      >
        {copied ? (
          "✓ Copiado!"
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copiar texto
          </>
        )}
      </button>

      {canNativeShare && (
        <button
          onClick={handleNativeShare}
          className="w-full py-2.5 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          Compartilhar
        </button>
      )}
    </div>
  );
}

export function X1WinnerCard({
  winnerName,
  loserName,
  winnerPoints,
  loserPoints,
  isCurrentUserWinner,
  isDraw,
  player1Name,
  player2Name,
  duelId,
}: Props) {
  const effectiveWinner = winnerName ?? "Vencedor";
  const effectiveLoser = loserName ?? "Perdedor";
  const seed = isDraw
    ? (player1Name ?? "") + (player2Name ?? "")
    : effectiveWinner + effectiveLoser;

  const getUrl = () => (typeof window !== "undefined" ? window.location.href : "");

  if (isDraw) {
    const drawLine = pick(DRAW_LINES, seed);
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden mb-6">
        <div className="border-b border-zinc-700 px-5 py-4 text-center bg-gradient-to-r from-yellow-500/10 via-zinc-800 to-yellow-500/10">
          <p className="text-xs font-bold uppercase tracking-widest text-yellow-400 mb-1">Duelo encerrado ⚔️</p>
          <p className="text-2xl font-black text-yellow-300">Empate!</p>
          <p className="text-sm font-semibold mt-0.5 text-zinc-400">{drawLine}</p>
        </div>
        <div className="flex items-stretch divide-x divide-zinc-700">
          <div className="flex-1 flex flex-col items-center justify-center py-5 px-4 gap-1">
            <span className="text-3xl">🤝</span>
            <p className="text-sm font-semibold text-white text-center">{player1Name ?? "Jogador 1"}</p>
            <p className="text-2xl font-black text-yellow-400">{winnerPoints} pts</p>
            <p className="text-xs text-yellow-500 font-medium tracking-wider">EMPATE</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center py-5 px-4 gap-1">
            <span className="text-3xl">🤝</span>
            <p className="text-sm font-semibold text-white text-center">{player2Name ?? "Jogador 2"}</p>
            <p className="text-2xl font-black text-yellow-400">{loserPoints} pts</p>
            <p className="text-xs text-yellow-500 font-medium tracking-wider">EMPATE</p>
          </div>
        </div>
        <ShareButtons
          label="Compartilha o empate e pede revanche 🤝"
          duelId={duelId}
          getShareText={() => {
            return (
              `⚔️ X1 PalpitaAí — Empate!\n\n` +
              `🤝 ${player1Name ?? "Jogador 1"} — ${winnerPoints} pts\n` +
              `🤝 ${player2Name ?? "Jogador 2"} — ${loserPoints} pts\n\n` +
              `${drawLine}\n\n` +
              `Topa revanche? ${getUrl()}`
            );
          }}
        />
      </div>
    );
  }

  const diff = winnerPoints - loserPoints;
  const isBlowout = diff >= 5;
  const isClose = diff <= 1;

  const winnerLine = isBlowout
    ? pick(WINNER_BLOWOUT, seed)
    : isClose
    ? pick(CLOSE_MATCH, seed)
    : pick(WINNER_TAUNTS, seed);
  const loserLine = pick(LOSER_WINNER_VIEW, seed + "l").replace("{loser}", effectiveLoser);
  const selfLoserLine = pick(LOSER_SELF, seed + "s");

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden mb-6">
      <div className={`border-b border-zinc-700 px-5 py-4 text-center ${
        isCurrentUserWinner
          ? "bg-gradient-to-r from-green-500/20 via-yellow-500/10 to-green-500/20"
          : "bg-gradient-to-r from-red-500/10 via-zinc-800 to-red-500/10"
      }`}>
        <p className="text-xs font-bold uppercase tracking-widest text-yellow-400 mb-1">Duelo encerrado ⚔️</p>
        <p className="text-2xl font-black text-white">{effectiveWinner}</p>
        <p className={`text-sm font-semibold mt-0.5 ${isCurrentUserWinner ? "text-green-400" : "text-zinc-400"}`}>
          {winnerLine}
        </p>
      </div>

      <div className="flex items-stretch divide-x divide-zinc-700">
        <div className="flex-1 flex flex-col items-center justify-center py-5 px-4 gap-1">
          <span className="text-3xl">🏆</span>
          <p className="text-sm font-semibold text-white text-center">{effectiveWinner}</p>
          <p className="text-2xl font-black text-green-400">{winnerPoints} pts</p>
          <p className="text-xs text-green-500 font-medium tracking-wider">VENCEDOR</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-5 px-4 gap-1">
          <span className="text-3xl">💀</span>
          <p className="text-sm font-semibold text-zinc-400 text-center">{effectiveLoser}</p>
          <p className="text-2xl font-black text-zinc-500">{loserPoints} pts</p>
          <p className="text-xs text-red-500 font-medium tracking-wider">ELIMINADO</p>
        </div>
      </div>

      <div className="bg-zinc-800/50 border-t border-zinc-700 px-5 py-3 text-center">
        <p className="text-xs text-zinc-400 italic">
          {isCurrentUserWinner ? loserLine : selfLoserLine}
        </p>
      </div>

      <ShareButtons
        label={isCurrentUserWinner ? "Compartilha essa vitória e zoa o perdedor 😂" : "Conta a derrota (ou pede revanche) 😅"}
        duelId={duelId}
        getShareText={() => buildShareText(!!isCurrentUserWinner, effectiveWinner, effectiveLoser, winnerPoints, loserPoints, seed, getUrl())}
      />
    </div>
  );
}
