"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinLeagueButton({
  leagueId,
  inviteCode,
}: {
  leagueId: string;
  inviteCode: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const join = async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Erro ao entrar na liga.");
      setLoading(false);
      return;
    }

    router.push(`/leagues/${leagueId}`);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={join}
        disabled={loading}
        className="w-full py-3.5 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors text-base"
      >
        {loading ? "Entrando…" : "Entrar na liga"}
      </button>
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </div>
  );
}
