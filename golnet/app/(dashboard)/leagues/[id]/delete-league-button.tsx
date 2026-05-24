"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteLeagueButton({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erro ao excluir liga");
        setDeleting(false);
        return;
      }
      router.push("/leagues");
      router.refresh();
    } catch {
      setError("Erro ao excluir liga");
      setDeleting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/60 rounded-lg px-3 py-1.5 transition-colors"
      >
        Excluir liga
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center mb-5">
              <p className="text-3xl mb-3">⚠️</p>
              <h2 className="text-lg font-bold text-white mb-2">Excluir liga?</h2>
              <p className="text-sm text-zinc-400">
                A liga <span className="text-white font-semibold">"{leagueName}"</span> será excluída permanentemente junto com todo o histórico de palpites e rankings.
              </p>
              <p className="text-xs text-red-400 mt-2 font-medium">Esta ação não pode ser desfeita.</p>
            </div>

            {error && (
              <p className="text-xs text-red-400 text-center mb-3">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setOpen(false); setError(null); }}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-bold transition-colors"
              >
                {deleting ? "Excluindo..." : "Sim, excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
