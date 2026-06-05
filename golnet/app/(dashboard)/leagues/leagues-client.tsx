"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type League = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  inviteCode: string;
  role: string;
  totalPoints: number;
  competitionName?: string | null;
  teamFilter?: string[];
};

type PublicLeague = {
  id: string;
  name: string;
  description: string | null;
  competitionName: string | null;
  teamFilter: string[];
  _count: { members: number };
};

type ScoringForm = {
  ptsExactScore: number;
  ptsCorrectDiff: number;
  ptsCorrectWinner: number;
  ptsCorrectDraw: number;
};

const SCORING_FIELDS: {
  key: keyof ScoringForm;
  label: string;
  description: string;
  example: string;
  default: number;
}[] = [
  {
    key: "ptsExactScore",
    label: "Placar exato",
    description: "Acertou o placar completo do jogo.",
    example: "Ex: palpitou 2x1 e terminou 2x1 → ganha estes pontos",
    default: 10,
  },
  {
    key: "ptsCorrectDiff",
    label: "Vencedor + saldo de gols",
    description: "Acertou quem venceu e a diferença de gols, mas não o placar exato.",
    example: "Ex: palpitou 3x1 e terminou 2x0 → mesmo vencedor, mesma diferença (2)",
    default: 7,
  },
  {
    key: "ptsCorrectWinner",
    label: "Acertou o vencedor",
    description: "Acertou quem venceu, mas errou o placar e/ou a diferença.",
    example: "Ex: palpitou 2x0 e terminou 1x0 → acertou o time vencedor",
    default: 5,
  },
  {
    key: "ptsCorrectDraw",
    label: "Acertou o empate",
    description: "Previu empate e o jogo terminou empatado (qualquer placar).",
    example: "Ex: palpitou 1x1 e terminou 0x0 → acertou o empate",
    default: 4,
  },
];

const DEFAULT_SCORING: ScoringForm = {
  ptsExactScore: 10,
  ptsCorrectDiff: 7,
  ptsCorrectWinner: 5,
  ptsCorrectDraw: 4,
};

function ShareLeagueButton({ league }: { league: League }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const link = `${window.location.origin}/entrar?c=${league.inviteCode}`;
    if (navigator.share) {
      await navigator.share({
        title: league.name,
        text: `Entre na liga "${league.name}" no PalpitaAí!`,
        url: link,
      }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(link).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={(e) => { e.preventDefault(); share(); }}
      className="text-xs text-zinc-500 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800"
      title="Compartilhar link da liga"
    >
      {copied ? "✓ Link copiado" : "Compartilhar"}
    </button>
  );
}

export function LeaguesClient({ isPro }: { isPro: boolean }) {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [publicLeagues, setPublicLeagues] = useState<PublicLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"mine" | "discover">("mine");
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", visibility: "PUBLIC" });
  const [scoring, setScoring] = useState<ScoringForm>(DEFAULT_SCORING);
  const [useCustomScoring, setUseCustomScoring] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Competition & team filter
  const [competitions, setCompetitions] = useState<{ name: string; leagueId: number | null }[]>([]);
  const [competitionName, setCompetitionName] = useState<string>("");
  const [allTeams, setAllTeams] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [showFilterSection, setShowFilterSection] = useState(false);

  // Champion prediction
  const [championEnabled, setChampionEnabled] = useState(false);
  const [championPoints, setChampionPoints] = useState(20);

  const load = async () => {
    try {
      const res = await fetch("/api/leagues");
      const data = await res.json();
      if (Array.isArray(data)) setLeagues(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadPublic = async () => {
    try {
      const res = await fetch("/api/leagues/public");
      const data = await res.json();
      if (Array.isArray(data)) setPublicLeagues(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    loadPublic();
    fetch("/api/competitions").then((r) => r.json()).then(setCompetitions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!competitionName) { setAllTeams([]); setTeamFilter([]); return; }
    fetch(`/api/teams?competition=${encodeURIComponent(competitionName)}`)
      .then((r) => r.json())
      .then(setAllTeams)
      .catch(() => {});
    setTeamFilter([]);
  }, [competitionName]);

  const createLeague = async () => {
    setSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          competitionName: competitionName || undefined,
          teamFilter,
          championPredictionEnabled: championEnabled,
          championPredictionPoints: championPoints,
          ...(isPro && useCustomScoring ? scoring : {}),
        }),
      });

      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* non-JSON response */ }

      if (!res.ok) {
        setCreateError((data.message as string) ?? (data.error as string) ?? `Erro ao criar liga (${res.status})`);
        return;
      }

      setShowCreate(false);
      setForm({ name: "", description: "", visibility: "PUBLIC" });
      setScoring(DEFAULT_SCORING);
      setUseCustomScoring(false);
      setCompetitionName("");
      setTeamFilter([]);
      setTeamSearch("");
      setShowFilterSection(false);
      setChampionEnabled(false);
      setChampionPoints(20);
      await load();
      await loadPublic();
    } catch {
      setCreateError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const joinLeague = async (leagueId?: string) => {
    setSaving(true);
    setJoinError(null);
    try {
      const body = leagueId ? { leagueId } : { inviteCode };
      const res = await fetch("/api/leagues/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.message ?? data.error ?? "Erro ao entrar na liga");
        return;
      }
      setShowJoin(false);
      setInviteCode("");
      await load();
      await loadPublic();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Ligas</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowJoin(true)}>
            Entrar por código
          </Button>
          <Button size="sm" onClick={() => { setShowCreate(true); setCreateError(null); }}>
            + Criar liga
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("mine")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "mine" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Minhas ligas {leagues.length > 0 && <span className="ml-1 text-xs text-zinc-400">({leagues.length})</span>}
        </button>
        <button
          onClick={() => setTab("discover")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "discover" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Descobrir {publicLeagues.length > 0 && <span className="ml-1 text-xs text-zinc-400">({publicLeagues.length})</span>}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-white mb-4">Criar nova liga</h2>
          {createError && (
            <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
              <p className="text-red-400 text-sm">⚠️ {createError}</p>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <Input
              label="Nome da liga"
              placeholder="Ex: Turma da Firma"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="Descrição (opcional)"
              placeholder="Uma breve descrição"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div>
              <label className="text-sm font-medium text-zinc-300 block mb-1">Visibilidade</label>
              <select
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value })}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="PUBLIC">Pública — aparece para todos descobrirem</option>
                <option value="PRIVATE">Privada — apenas por convite</option>
              </select>
            </div>

            {/* Competition & team filter */}
            <div className="mt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => {
                    setShowFilterSection((v) => !v);
                    if (showFilterSection) { setCompetitionName(""); setTeamFilter([]); }
                  }}
                  className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${showFilterSection ? "bg-blue-500" : "bg-zinc-700"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${showFilterSection ? "translate-x-5" : "translate-x-1"}`} />
                </div>
                <span className="text-sm font-medium text-zinc-300">
                  Filtrar por competição / times
                  {competitionName && (
                    <span className="ml-2 text-xs text-blue-400">
                      {competitionName}{teamFilter.length > 0 ? ` · ${teamFilter.length} time${teamFilter.length > 1 ? "s" : ""}` : ""}
                    </span>
                  )}
                </span>
              </label>

              {showFilterSection && (
                <div className="mt-3 flex flex-col gap-3">
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">1. Selecione a competição</label>
                    <select
                      value={competitionName}
                      onChange={(e) => setCompetitionName(e.target.value)}
                      className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Todas as competições —</option>
                      {competitions.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {competitionName && (
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">
                        2. Filtrar por time(s) — opcional
                      </label>
                      {teamFilter.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {teamFilter.map((t) => (
                            <span key={t} className="flex items-center gap-1 text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-full">
                              {t}
                              <button onClick={() => setTeamFilter((prev) => prev.filter((x) => x !== t))} className="hover:text-white ml-0.5">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <input
                        type="text"
                        placeholder="Buscar time/seleção..."
                        value={teamSearch}
                        onChange={(e) => setTeamSearch(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {allTeams.length > 0 && (
                        <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto mt-1">
                          {allTeams
                            .filter((t) => t.toLowerCase().includes(teamSearch.toLowerCase()))
                            .map((team) => {
                              const selected = teamFilter.includes(team);
                              return (
                                <button
                                  key={team}
                                  onClick={() => setTeamFilter((prev) => selected ? prev.filter((x) => x !== team) : [...prev, team])}
                                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${selected ? "bg-blue-500/10 text-blue-300" : "text-zinc-300 hover:bg-zinc-700"}`}
                                >
                                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 text-xs ${selected ? "bg-blue-500 border-blue-500 text-white" : "border-zinc-600"}`}>
                                    {selected && "✓"}
                                  </span>
                                  {team}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Champion prediction */}
            <div className="mt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setChampionEnabled((v) => !v)}
                  className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${championEnabled ? "bg-yellow-500" : "bg-zinc-700"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${championEnabled ? "translate-x-5" : "translate-x-1"}`} />
                </div>
                <span className="text-sm font-medium text-zinc-300">Palpite do Campeão 🏆</span>
              </label>
              {championEnabled && (
                <div className="mt-3 bg-zinc-800 rounded-xl p-4">
                  <p className="text-xs text-zinc-400 mb-3">
                    Membros palpitam qual seleção vai ser campeã. O dono define o campeão real e os pontos são premiados automaticamente.
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-300">Pontos pelo acerto:</span>
                    <button onClick={() => setChampionPoints((v) => Math.max(1, v - 5))} className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center">−</button>
                    <span className="w-12 text-center font-bold text-yellow-400">{championPoints}</span>
                    <button onClick={() => setChampionPoints((v) => Math.min(500, v + 5))} className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center">+</button>
                    <span className="text-xs text-zinc-500">pts</span>
                  </div>
                </div>
              )}
            </div>

            {/* Custom scoring — PRO only */}
            {isPro ? (
              <div className="mt-2">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div
                    onClick={() => setUseCustomScoring((v) => !v)}
                    className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${useCustomScoring ? "bg-green-500" : "bg-zinc-700"}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${useCustomScoring ? "translate-x-5" : "translate-x-1"}`} />
                  </div>
                  <span className="text-sm font-medium text-zinc-300">
                    Pontuação personalizada
                    <span className="ml-2 text-xs text-green-400 font-semibold">PRO</span>
                  </span>
                </label>
                {useCustomScoring && (
                  <div className="mt-4 flex flex-col gap-4">
                    {SCORING_FIELDS.map((field) => (
                      <div key={field.key} className="bg-zinc-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-white">{field.label}</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setScoring((s) => ({ ...s, [field.key]: Math.max(0, s[field.key] - 1) }))} className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-lg flex items-center justify-center">−</button>
                            <span className="w-10 text-center font-bold text-green-400 text-lg">{scoring[field.key]}</span>
                            <button onClick={() => setScoring((s) => ({ ...s, [field.key]: Math.min(100, s[field.key] + 1) }))} className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-lg flex items-center justify-center">+</button>
                            <span className="text-xs text-zinc-500 ml-1">pts</span>
                          </div>
                        </div>
                        <p className="text-xs text-zinc-400">{field.description}</p>
                        <p className="text-xs text-zinc-500 mt-0.5 italic">{field.example}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3 mt-1">
                <span className="text-xl">🔒</span>
                <div>
                  <p className="text-sm text-zinc-300 font-medium">Pontuação padrão</p>
                  <p className="text-xs text-zinc-500">
                    10 pts placar exato · 7 resultado+saldo · 5 vencedor · 4 empate · +3 mata-mata.{" "}
                    <Link href="/pricing" className="text-green-400 hover:underline">Upgrade para Pro</Link>{" "}
                    para personalizar.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <Button onClick={createLeague} loading={saving} disabled={!form.name}>Criar</Button>
              <Button variant="ghost" onClick={() => { setShowCreate(false); setCreateError(null); }}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Join by code form */}
      {showJoin && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-white mb-4">Entrar em liga por código</h2>
          <div className="flex gap-3">
            <Input
              placeholder="Cole o código de convite aqui"
              value={inviteCode}
              onChange={(e) => { setInviteCode(e.target.value); setJoinError(null); }}
              className="flex-1"
            />
            <Button onClick={() => joinLeague()} loading={saving} disabled={!inviteCode}>Entrar</Button>
            <Button variant="ghost" onClick={() => { setShowJoin(false); setJoinError(null); }}>Cancelar</Button>
          </div>
          {joinError && <p className="text-red-400 text-sm mt-2">{joinError}</p>}
        </div>
      )}

      {/* My leagues tab */}
      {tab === "mine" && (
        loading ? (
          <div className="text-zinc-500 text-center py-10">Carregando...</div>
        ) : leagues.length === 0 ? (
          <div className="text-center text-zinc-500 py-20">
            <p className="text-4xl mb-4">🏆</p>
            <p className="text-lg">Você não está em nenhuma liga.</p>
            <p className="text-sm mt-2">Crie uma nova, entre com código ou descubra ligas públicas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {leagues.map((league) => (
              <div key={league.id} className="bg-zinc-900 border border-zinc-800 hover:border-green-500/40 rounded-xl p-5 transition-colors">
                <Link href={`/leagues/${league.id}`} className="block mb-3">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-semibold text-white">{league.name}</h3>
                    <span className="text-xs text-zinc-500 bg-zinc-800 rounded px-2 py-0.5 shrink-0 ml-2">
                      {league.role === "OWNER" ? "Dono" : league.role === "ADMIN" ? "Admin" : "Membro"}
                    </span>
                  </div>
                  {league.description && <p className="text-sm text-zinc-400 mb-2">{league.description}</p>}
                  {league.competitionName && (
                    <p className="text-xs text-blue-400 mb-2">🏟️ {league.competitionName}{league.teamFilter && league.teamFilter.length > 0 ? ` · ${league.teamFilter.join(", ")}` : ""}</p>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-500">{league.visibility === "PRIVATE" ? "🔒 Privada" : "🌐 Pública"}</span>
                    <span className="text-green-400 font-semibold">{league.totalPoints} pts</span>
                  </div>
                </Link>
                <div className="flex items-center justify-between border-t border-zinc-800 pt-3 mt-1">
                  <span className="text-xs text-zinc-600 font-mono truncate">{league.inviteCode}</span>
                  <ShareLeagueButton league={league} />
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Discover public leagues tab */}
      {tab === "discover" && (
        publicLeagues.length === 0 ? (
          <div className="text-center text-zinc-500 py-20">
            <p className="text-4xl mb-4">🔍</p>
            <p className="text-lg">Nenhuma liga pública disponível.</p>
            <p className="text-sm mt-2">Seja o primeiro a criar uma liga pública!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {publicLeagues.map((league) => (
              <div key={league.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h3 className="font-semibold text-white mb-1">{league.name}</h3>
                {league.description && <p className="text-sm text-zinc-400 mb-2">{league.description}</p>}
                {league.competitionName && (
                  <p className="text-xs text-blue-400 mb-2">🏟️ {league.competitionName}{league.teamFilter.length > 0 ? ` · ${league.teamFilter.join(", ")}` : ""}</p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-zinc-500">
                    👥 {league._count.members} {league._count.members === 1 ? "membro" : "membros"}
                  </span>
                  <Button
                    size="sm"
                    loading={saving}
                    onClick={() => joinLeague(league.id)}
                  >
                    Entrar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
