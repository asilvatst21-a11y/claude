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
  _count?: { members: number };
};

export default function LeaguesPage() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", visibility: "PUBLIC" });
  const [inviteCode, setInviteCode] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch("/api/leagues");
    const data = await res.json();
    setLeagues(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createLeague = async () => {
    setSaving(true);
    await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowCreate(false);
    setForm({ name: "", description: "", visibility: "PUBLIC" });
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
            <Input label="Nome da liga" placeholder="Ex: Turma da Firma" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Descrição (opcional)" placeholder="Uma breve descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
            <Input placeholder="Cole o código de convite aqui" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="flex-1" />
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
