"use client";

import { useEffect, useState } from "react";

type JoinRequest = {
  id: string;
  createdAt: string;
  user: { id: string; name: string | null; username: string | null; image: string | null };
};

export function JoinRequestsPanel({ leagueId }: { leagueId: string }) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/join-requests`);
      if (res.ok) setRequests(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [leagueId]);

  const act = async (requestId: string, action: "approve" | "reject") => {
    setActing(requestId);
    await fetch(`/api/leagues/${leagueId}/join-requests`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action }),
    });
    setActing(null);
    await load();
  };

  if (loading) return <div className="text-zinc-500 text-sm py-4">Carregando...</div>;

  if (requests.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
        Nenhuma solicitação pendente.
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="font-semibold text-white">
          Solicitações de entrada{" "}
          <span className="ml-1.5 text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full px-2 py-0.5">
            {requests.length}
          </span>
        </h2>
      </div>
      <div className="divide-y divide-zinc-800">
        {requests.map((req) => (
          <div key={req.id} className="flex items-center gap-4 px-4 py-3">
            {req.user.image ? (
              <img src={req.user.image} alt="" className="w-9 h-9 rounded-full shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                {req.user.name?.[0] ?? "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{req.user.name ?? "—"}</p>
              {req.user.username && <p className="text-xs text-zinc-500">@{req.user.username}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => act(req.id, "approve")}
                disabled={acting === req.id}
                className="px-3 py-1.5 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black text-xs font-semibold rounded-lg transition-colors"
              >
                Aprovar
              </button>
              <button
                onClick={() => act(req.id, "reject")}
                disabled={acting === req.id}
                className="px-3 py-1.5 border border-zinc-700 hover:border-red-500/50 hover:text-red-400 disabled:opacity-40 text-zinc-400 text-xs rounded-lg transition-colors"
              >
                Recusar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
