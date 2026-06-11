"use client";

import { useEffect, useState } from "react";

type Pred = {
  id: string;
  team: string;
  points: number;
  user: { id: string; name: string | null; username: string | null; image: string | null };
};

type Props = {
  leagueId: string;
  currentUserId: string;
  isOwner: boolean;
  actualChampion: string | null;
  championPredictionPoints: number;
  competitionName: string | null;
};

export function ChampionWidget({ leagueId, currentUserId, isOwner, actualChampion, championPredictionPoints, competitionName }: Props) {
  const [preds, setPreds] = useState<Pred[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [myTeam, setMyTeam] = useState<string>("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [setting, setSetting] = useState(false);
  const [champSearch, setChampSearch] = useState("");
  const [showOwnerPanel, setShowOwnerPanel] = useState(false);

  const load = async () => {
    const teamsUrl = competitionName
      ? `/api/teams?competition=${encodeURIComponent(competitionName)}`
      : "/api/teams";
    const [predsRes, teamsRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}/champion`),
      fetch(teamsUrl),
    ]);
    if (predsRes.ok) {
      const data: Pred[] = await predsRes.json();
      setPreds(data);
      const mine = data.find((p) => p.user.id === currentUserId);
      if (mine) setMyTeam(mine.team);
    }
    if (teamsRes.ok) setTeams(await teamsRes.json());
  };

  useEffect(() => { load(); }, []);

  const submit = async (team: string) => {
    setSaving(true);
    const res = await fetch(`/api/leagues/${leagueId}/champion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team }),
    });
    if (res.ok) { setMyTeam(team); setSearch(""); await load(); }
    setSaving(false);
  };

  const setChampion = async (champion: string) => {
    setSetting(true);
    await fetch(`/api/leagues/${leagueId}/champion`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ champion }),
    });
    setSetting(false);
    setShowOwnerPanel(false);
    window.location.reload();
  };

  const filtered = teams.filter((t) => t.toLowerCase().includes(search.toLowerCase()));
  const champFiltered = teams.filter((t) => t.toLowerCase().includes(champSearch.toLowerCase()));
  const locked = !!actualChampion;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white flex items-center gap-2">
          🏆 Palpite do Campeão
          <span className="text-xs text-yellow-400 font-normal bg-yellow-400/10 px-2 py-0.5 rounded-full">
            +{championPredictionPoints} pts
          </span>
        </h3>
        {actualChampion && (
          <span className="text-xs text-green-400 bg-green-400/10 px-3 py-1 rounded-full font-medium">
            Campeão: {actualChampion}
          </span>
        )}
      </div>

      {/* My pick */}
      {!locked && (
        <div className="mb-4">
          <p className="text-xs text-zinc-500 mb-2">
            {myTeam ? `Seu palpite: ${myTeam}` : "Escolha seu campeão:"}
          </p>
          <input
            type="text"
            placeholder="Buscar seleção..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-yellow-500 mb-2"
          />
          {search && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
              {filtered.slice(0, 20).map((team) => (
                <button
                  key={team}
                  onClick={() => submit(team)}
                  disabled={saving}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-700 transition-colors flex items-center gap-3 ${
                    team === myTeam ? "text-yellow-400 bg-yellow-400/5" : "text-zinc-200"
                  }`}
                >
                  {team === myTeam && <span className="text-xs">✓</span>}
                  {team}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-zinc-500 text-sm px-4 py-3">Nenhum time encontrado</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Owner panel to set champion */}
      {isOwner && !locked && (
        <div className="mb-4">
          {!showOwnerPanel ? (
            <button
              onClick={() => setShowOwnerPanel(true)}
              className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-1.5 transition-colors"
            >
              Definir campeão real
            </button>
          ) : (
            <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-700">
              <p className="text-sm font-medium text-white mb-2">Quem foi o campeão?</p>
              <input
                type="text"
                placeholder="Buscar seleção..."
                value={champSearch}
                onChange={(e) => setChampSearch(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
              />
              {champSearch && (
                <div className="bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto mb-2">
                  {champFiltered.slice(0, 10).map((team) => (
                    <button
                      key={team}
                      onClick={() => setChampion(team)}
                      disabled={setting}
                      className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
                    >
                      {team}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-zinc-500">
                Isso vai premiar quem acertou com +{championPredictionPoints} pts e não pode ser desfeito.
              </p>
              <button
                onClick={() => setShowOwnerPanel(false)}
                className="text-xs text-zinc-500 hover:text-white mt-2"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* All predictions */}
      {preds.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">Palpites dos membros ({preds.length})</p>
          <div className="space-y-2">
            {preds.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                  locked && p.team === actualChampion
                    ? "bg-yellow-400/10 border border-yellow-400/30"
                    : "bg-zinc-800"
                }`}
              >
                {p.user.image ? (
                  <img src={p.user.image} alt="" className="w-6 h-6 rounded-full shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-zinc-700 shrink-0" />
                )}
                <span className="text-sm text-zinc-300 flex-1 truncate">
                  {p.user.name ?? p.user.username ?? "Usuário"}
                </span>
                <span className={`text-sm font-medium ${locked && p.team === actualChampion ? "text-yellow-400" : "text-zinc-200"}`}>
                  {p.team}
                  {locked && p.team === actualChampion && " 🏆"}
                </span>
                {p.points > 0 && (
                  <span className="text-xs text-yellow-400 font-semibold">+{p.points}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {preds.length === 0 && (
        <p className="text-sm text-zinc-500 text-center py-2">Nenhum palpite enviado ainda. Seja o primeiro!</p>
      )}
    </div>
  );
}
