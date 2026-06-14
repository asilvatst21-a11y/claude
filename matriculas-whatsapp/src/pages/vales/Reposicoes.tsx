import { useEffect, useState, useCallback } from "react";
import { CheckCircle, XCircle, AlertTriangle, Clock, Package, RefreshCw, Download, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/valesUtils";
import { valesSupabase } from "@/lib/valesSupabase";

type Status = "pendente" | "validado" | "negado" | "quebra";

interface Reposicao {
  id: string;
  numero: string;
  motorista_nome: string | null;
  motorista_telefone: string | null;
  mapa: string | null;
  cliente: string | null;
  codigo_pdv: string | null;
  produto: string | null;
  quantidade: string | null;
  tipo_reposicao: string | null;
  motivo: string | null;
  mensagem_original: string | null;
  status: Status;
  validador_resposta: string | null;
  validado_em: string | null;
  created_at: string;
}

const TIPO_REPOSICAO_LABEL: Record<string, string> = {
  falta: "Falta",
  inversao: "Inversão",
  avaria: "Avaria",
  indefinido: "Não informado",
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: React.ElementType }> = {
  pendente: { label: "Pendente", color: "text-yellow-600 bg-yellow-50", icon: Clock },
  validado: { label: "Validado", color: "text-green-600 bg-green-50", icon: CheckCircle },
  negado: { label: "Negado", color: "text-red-600 bg-red-50", icon: XCircle },
  quebra: { label: "Quebra", color: "text-orange-600 bg-orange-50", icon: AlertTriangle },
};

const TABS: { value: "todos" | Status; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pendente", label: "Pendentes" },
  { value: "validado", label: "Validados" },
  { value: "negado", label: "Negados" },
  { value: "quebra", label: "Quebras" },
];

function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pendente;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function formatDate(str: string | null) {
  if (!str) return "—";
  return new Date(str).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ReposicoesPage() {
  const [reposicoes, setReposicoes] = useState<Reposicao[]>([]);
  const [tab, setTab] = useState<"todos" | Status>("todos");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [observacao, setObservacao] = useState<Record<string, string>>({});

  // suppress unused import warning
  void formatCurrency;

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = valesSupabase.from("reposicoes").select("*").order("created_at", { ascending: false });
    if (tab !== "todos") query = query.eq("status", tab);
    const { data } = await query;
    setReposicoes(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAction(id: string, status: Status) {
    setActionLoading(id + status);
    await valesSupabase
      .from("reposicoes")
      .update({ status, validador_resposta: observacao[id] ?? null, validado_em: new Date().toISOString() })
      .eq("id", id);
    setActionLoading(null);
    setObservacao((o) => { const next = { ...o }; delete next[id]; return next; });
    await fetchData();
  }

  const stats = {
    total: reposicoes.length,
    pendente: reposicoes.filter((r) => r.status === "pendente").length,
    validado: reposicoes.filter((r) => r.status === "validado").length,
    negado: reposicoes.filter((r) => r.status === "negado").length,
    quebra: reposicoes.filter((r) => r.status === "quebra").length,
  };

  function exportQuebras() {
    const quebras = reposicoes.filter((r) => r.status === "quebra");
    if (!quebras.length) return;
    const header = "Número,Data,Motorista,Mapa,Cliente,Produto,Quantidade,Motivo";
    const rows = quebras.map((q) =>
      [q.numero, formatDate(q.created_at), q.motorista_nome ?? "", q.mapa ?? "", q.cliente ?? "", q.produto ?? "", q.quantidade ?? "", q.motivo ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quebras_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reposições</h1>
          <p className="text-sm text-muted-foreground">Solicitações via WhatsApp normalizadas por IA</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4" />Atualizar
          </button>
          <button onClick={exportQuebras} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <Download className="h-4 w-4" />Exportar Quebras
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total, icon: Package, color: "text-primary" },
          { label: "Pendentes", value: stats.pendente, icon: Clock, color: "text-yellow-600" },
          { label: "Validados", value: stats.validado, icon: CheckCircle, color: "text-green-600" },
          { label: "Negados", value: stats.negado, icon: XCircle, color: "text-red-600" },
          { label: "Quebras", value: stats.quebra, icon: AlertTriangle, color: "text-orange-600" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border bg-white p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-muted-foreground">Carregando...</div>
      ) : reposicoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-lg border-dashed">
          <Package className="h-10 w-10 opacity-20 mb-3" />
          <p>Nenhuma reposição encontrada</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Número</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Data</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Motorista</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Produto</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">PDV</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mapa</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reposicoes.map((r) => (
                <>
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{r.numero}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div>{r.motorista_nome ?? "—"}</div>
                      {r.motorista_telefone && <div className="text-xs text-muted-foreground">{r.motorista_telefone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {r.tipo_reposicao ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {TIPO_REPOSICAO_LABEL[r.tipo_reposicao] ?? r.tipo_reposicao}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div>{r.produto ?? "—"}</div>
                      {r.quantidade && <div className="text-xs text-muted-foreground">{r.quantidade}</div>}
                    </td>
                    <td className="px-4 py-3">{r.codigo_pdv ?? r.cliente ?? "—"}</td>
                    <td className="px-4 py-3">{r.mapa ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {r.status === "pendente" && (
                          <>
                            <button onClick={() => handleAction(r.id, "validado")} disabled={!!actionLoading} className="px-2 py-1 rounded text-xs bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors">
                              {actionLoading === r.id + "validado" ? "..." : "Validar"}
                            </button>
                            <button onClick={() => handleAction(r.id, "negado")} disabled={!!actionLoading} className="px-2 py-1 rounded text-xs bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors">
                              {actionLoading === r.id + "negado" ? "..." : "Negar"}
                            </button>
                          </>
                        )}
                        {r.status === "negado" && (
                          <button onClick={() => handleAction(r.id, "quebra")} disabled={!!actionLoading} className="px-2 py-1 rounded text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50 transition-colors">
                            {actionLoading === r.id + "quebra" ? "..." : "Marcar Quebra"}
                          </button>
                        )}
                        <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="p-1 rounded hover:bg-accent transition-colors">
                          {expanded === r.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr key={r.id + "-detail"} className="bg-muted/20">
                      <td colSpan={9} className="px-4 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                          <div><span className="text-xs text-muted-foreground block mb-0.5">Cliente</span><span className="font-medium">{r.cliente ?? "—"}</span></div>
                          <div><span className="text-xs text-muted-foreground block mb-0.5">Motivo</span><span className="font-medium">{r.motivo ?? "—"}</span></div>
                          {r.validado_em && <div><span className="text-xs text-muted-foreground block mb-0.5">Validado em</span><span className="font-medium">{formatDate(r.validado_em)}</span></div>}
                          {r.validador_resposta && <div><span className="text-xs text-muted-foreground block mb-0.5">Resposta</span><span className="font-medium">{r.validador_resposta}</span></div>}
                        </div>
                        {r.mensagem_original && r.mensagem_original !== "[áudio]" && (
                          <div className="text-xs text-muted-foreground border-l-2 pl-3 italic">&ldquo;{r.mensagem_original}&rdquo;</div>
                        )}
                        {r.status === "pendente" && (
                          <div className="mt-3 flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Observação (opcional)"
                              value={observacao[r.id] ?? ""}
                              onChange={(e) => setObservacao((o) => ({ ...o, [r.id]: e.target.value }))}
                              className="flex-1 max-w-xs px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
