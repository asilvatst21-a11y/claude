"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InviteAcceptButtons({ token, duelId }: { token: string; duelId: string }) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    const res = await fetch(`/api/duels/invite/${token}`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      router.push(`/x1/${data.id}`);
    } else {
      setError(data.error ?? "Erro ao aceitar");
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    await fetch(`/api/duels/${duelId}/decline`, { method: "POST" });
    router.push("/x1");
  };

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        onClick={handleAccept}
        disabled={accepting || declining}
        className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black text-sm font-bold rounded-xl transition-colors"
      >
        {accepting ? "Aceitando..." : "Aceitar desafio ⚔️"}
      </button>
      <button
        onClick={handleDecline}
        disabled={accepting || declining}
        className="w-full py-2.5 border border-zinc-700 text-zinc-400 hover:text-white text-sm rounded-xl transition-colors"
      >
        {declining ? "..." : "Recusar"}
      </button>
    </div>
  );
}
