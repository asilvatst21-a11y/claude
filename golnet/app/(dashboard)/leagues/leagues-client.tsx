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
};

type ScoringForm = {
  ptsExactScore: number;
  ptsCorrectDiff: number;
  ptsCorrectWinner: number;
  ptsCorrectDraw: number;
  ptsKnockoutBonus: number;
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
  {
    key: "ptsKnockoutBonus",
    label: "Bônus mata-mata",
    description: "Pontos extras somados a qualquer acerto em jogos eliminatórios.",
    example: "Ex: acertou o vencedor em uma semifinal → ganha pontos normais + este bônus",
    default: 3,
  },
];

const DEFAULT_SCORING: ScoringForm = {
  ptsExactScore: 10,
  ptsCorrectDiff: 7,
  ptsCorrectWinner: 5,
  ptsCorrectDraw: 4,
  ptsKnockoutBonus: 3,
};

export function LeaguesClient({ isPro }: { isPro: boolean }) {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", visibility: "PUBLIC" });
  const [scoring, setScoring] = useState<ScoringForm>(DEFAULT_SCORING);
  const [useCustomScoring, setUseCustomScoring] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [saving, setSaving] = useState(false);

  // Team filter
  const [allTeams, setAllTeams] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [showTeamList, setShowTeamList] = useState(false);

  // Champion prediction
  const [championEnabled, setChampionEnabled] = useState(false);
  const [championPoints, setChampionPoints] = useState(20);

  const load = async () => {
    const res = await fetch("/api/leagues");
    const data = await res.json();
    setLeagues(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetch("/api/teams").then((r) => r.json()).then(setAllTeams).catch(() => {});
  }, []);

  const createLeague = async () => {
    setSaving(true);
    await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        teamFilter,
        championPredictionEnabled: championEnabled,
        championPredictionPoints: championPoints,
        ...(isPro && useCustomScoring ? scoring : {}),
      }),
    });
    setSaving(false);
    setShowCreate(false);
    setForm({ name: "", description: "", visibility: "PUBLIC" });
    setScoring(DEFAULT_SCORING);
    setUseCustomScoring(false);
    setTeamFilter([]);
    setTeamSearch("");
    setChampionEnabled(false);
    setChampionPoints(20);
    load();
  };

  const joinLeague = async () => {
    setSaving(true);
    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode }),
    });
    if (res.ok) {
      setShowJoin(false);
      setInviteCode("");
      load();
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Minhas Ligas</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowJoin(true)}>
            Entrar em liga
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            + Criar liga
          </Button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-white mb-4">Criar nova liga</h2>
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
                <option value="PUBLIC">Pública</option>
                <option value="PRIVATE">Privada (por convite)</option>
              </select>
            </div>

            {/* Team filter */}
            <div className="mt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => { setShowTeamList((v) => !v); if (showTeamList) setTeamFilter([]); }}
                  className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${showTeamList ? "bg-blue-500" : "bg-zinc-700"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${showTeamList ? "translate-x-5" : "translate-x-1"}`} />
                </div>
                <span className="text-sm font-medium text-zinc-300">
                  Filtrar por seleções
                  {teamFilter.length > 0 && (
                    <span className="ml-2 text-xs text-blue-400">({teamFilter.length} selecionadas)</span>
                  )}
                </span>
              </label>
              {showTeamList && (
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Buscar seleção..."
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                  />
                  {teamFilter.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {teamFilter.map((t) => (
                        <span
                          key={t}
                          className="flex items-center gap-1 text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-full"
                        >
                          {t}
                          <button
                            onClick={() => setTeamFilter((prev) => prev.filter((x) => x !== t))}
                            className="hover:text-white"
                          >×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {allTeams
                      .filter((t) => t.toLowerCase().includes(teamSearch.toLowerCase()))
                      .slice(0, 30)
                      .map((team) => {
                        const selected = teamFilter.includes(team);
                        return (
                          <button
                            key={team}
                            onClick={() => setTeamFilter((prev) =>
                              selected ? prev.filter((x) => x !== team) : [...prev, team]
                            )}
                            className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${
                              selected ? "bg-blue-500/10 text-blue-300" : "text-zinc-300 hover:bg-zinc-700"
                            }`}
                          >
                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected ? "bg-blue-500 border-blue-500 text-white" : "border-zinc-600"}`}>
                              {selected && "✓"}
                            </span>
                            {team}
                          </button>
                        );
                      })}
                    {allTeams.filter((t) => t.toLowerCase().includes(teamSearch.toLowerCase())).length === 0 && (
                      <p className="text-zinc-500 text-sm px-4 py-3">Nenhum time encontrado</p>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Deixe vazio para contar todos os jogos. Selecione times para contar apenas jogos das seleções escolhidas.
                  </p>
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
                <span className="text-sm font-medium text-zinc-300">
                  Palpite do Campeão 🏆
                </span>
              </label>
              {championEnabled && (
                <div className="mt-3 bg-zinc-800 rounded-xl p-4">
                  <p className="text-xs text-zinc-400 mb-3">
                    Membros palpitam qual seleção vai ser campeã. O dono define o campeão real e os pontos são premiados automaticamente.
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-300">Pontos pelo acerto:</span>
                    <button
                      onClick={() => setChampionPoints((v) => Math.max(1, v - 5))}
                      className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center"
                    >−</button>
                    <span className="w-12 text-center font-bold text-yellow-400">{championPoints}</span>
                    <button
                      onClick={() => setChampionPoints((v) => Math.min(500, v + 5))}
                      className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center"
                    >+</button>
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
                            <button
                              onClick={() => setScoring((s) => ({ ...s, [field.key]: Math.max(0, s[field.key] - 1) }))}
                              className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-lg flex items-center justify-center"
                            >−</button>
                            <span className="w-10 text-center font-bold text-green-400 text-lg">
                              {scoring[field.key]}
                            </span>
                            <button
                              onClick={() => setScoring((s) => ({ ...s, [field.key]: Math.min(100, s[field.key] + 1) }))}
                              className="w-7 h-7 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-lg flex items-center justify-center"
                            >+</button>
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
                    <Link href="/pricing" className="text-green-400 hover:underline">
                      Upgrade para Pro
                    </Link>{" "}
                    para personalizar.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <Button onClick={createLeague} loading={saving} disabled={!form.name}>Criar</Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}

      {showJoin && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-white mb-4">Entrar em liga por código</h2>
          <div className="flex gap-3">
            <Input
              placeholder="Cole o código de convite aqui"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="flex-1"
            />
            <Button onClick={joinLeague} loading={saving} disabled={!inviteCode}>Entrar</Button>
            <Button variant="ghost" onClick={() => setShowJoin(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 text-center py-10">Carregando...</div>
      ) : leagues.length === 0 ? (
        <div className="text-center text-zinc-500 py-20">
          <p className="text-4xl mb-4">🏆</p>
          <p className="text-lg">Você não está em nenhuma liga.</p>
          <p className="text-sm mt-2">Crie uma nova ou entre com um código de convite.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {leagues.map((league) => (
            <Link key={league.id} href={`/leagues/${league.id}`}>
              <div className="bg-zinc-900 border border-zinc-800 hover:border-green-500/40 rounded-xl p-5 cursor-pointer transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-white">{league.name}</h3>
                  <span className="text-xs text-zinc-500 bg-zinc-800 rounded px-2 py-0.5">
                    {league.role === "OWNER" ? "Dono" : league.role === "ADMIN" ? "Admin" : "Membro"}
                  </span>
                </div>
                {league.description && <p className="text-sm text-zinc-400 mb-3">{league.description}</p>}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">
                    {league.visibility === "PRIVATE" ? "🔒 Privada" : "🌐 Pública"}
                  </span>
                  <span className="text-green-400 font-semibold">{league.totalPoints} pts</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
