"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle, Loader2, RefreshCw, Eye, Search, X, Send, UserPlus, AlertTriangle, Clock, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { ValeDetalhesModal, type ValeDetalhes } from "@/components/vale-detalhes-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateBR, calcPrazo, type PrazoStatus } from "@/lib/utils";

interface ValeRow extends ValeDetalhes {
  notificacao_pendente_enviada: boolean;
  notificacao_final_enviada: boolean;
}

interface AjudanteSimples {
  id: string;
  codigo: number;
  nome: string;
  telefone: string | null;
}

function getStatusBadgeVariant(status: string | null) {
  switch (status) {
    case "Abonado": return "success" as const;
    case "Faturado": return "destructive" as const;
    case "Faturar": return "warning" as const;
    default: return "gray" as const;
  }
}

function getAcaoBadgeVariant(acao: string | null) {
  switch (acao) {
    case "Aprovado": return "success" as const;
    case "Reprovado": return "destructive" as const;
    default: return "secondary" as const;
  }
}

const PRAZO_STYLES: Record<PrazoStatus, string> = {
  ok:      "bg-green-50 text-green-700 border-green-200",
  alerta:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  urgente: "bg-orange-50 text-orange-700 border-orange-200",
  vencido: "bg-red-50 text-red-700 border-red-200",
};

type SortField = "mapa" | "numero_vale" | "data_emissao" | "itens" | "valor_total" | "status_vale" | "prazo";
type SortDir = "asc" | "desc";

function SortableHead({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = sortField === field;
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 font-medium hover:text-foreground transition-colors"
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </button>
    </TableHead>
  );
}

const PRAZO_ORDER: Record<string, number> = { vencido: 0, urgente: 1, alerta: 2, ok: 3 };

function sortVales(list: ValeRow[], field: SortField | null, dir: SortDir): ValeRow[] {
  if (!field) return list;
  return [...list].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "mapa":
        cmp = (a.mapa ?? -1) - (b.mapa ?? -1);
        break;
      case "numero_vale":
        cmp = (a.numero_vale ?? 0) - (b.numero_vale ?? 0);
        break;
      case "data_emissao":
        cmp = (a.data_emissao ?? "").localeCompare(b.data_emissao ?? "");
        break;
      case "itens":
        cmp = a.itens.length - b.itens.length;
        break;
      case "valor_total":
        cmp = (a.valor_total ?? 0) - (b.valor_total ?? 0);
        break;
      case "status_vale":
        cmp = (a.status_vale ?? "").localeCompare(b.status_vale ?? "", "pt-BR");
        break;
      case "prazo": {
        const pa = calcPrazo(a.data_emissao);
        const pb = calcPrazo(b.data_emissao);
        const oa = pa ? PRAZO_ORDER[pa.status] ?? 9 : 9;
        const ob = pb ? PRAZO_ORDER[pb.status] ?? 9 : 9;
        cmp = oa - ob;
        break;
      }
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function PrazoBadge({ dataEmissao }: { dataEmissao: string | null }) {
  const info = calcPrazo(dataEmissao);
  if (!info) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${PRAZO_STYLES[info.status]}`}>
      {(info.status === "urgente" || info.status === "vencido") && <AlertTriangle className="h-3 w-3" />}
      {info.status === "ok" && <Clock className="h-3 w-3" />}
      {info.label}
    </span>
  );
}

function buildMensagem(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function ValesContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [vales, setVales] = useState<ValeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("todos");
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [detalhesVale, setDetalhesVale] = useState<ValeDetalhes | null>(null);

  // Filters — initialize ajudante filter from URL param if present
  const [busca, setBusca] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [ajudanteFiltro, setAjudanteFiltro] = useState(
    searchParams.get("ajudante") ?? "todos"
  );

  // Sorting
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  // Ajudantes list for filter + atribuir
  const [ajudantesList, setAjudantesList] = useState<AjudanteSimples[]>([]);

  // WhatsApp preview
  const [previewVale, setPreviewVale] = useState<ValeRow | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);

  // Atribuir ajudante
  const [atribuirVale, setAtribuirVale] = useState<ValeRow | null>(null);
  const [buscaAtribuir, setBuscaAtribuir] = useState("");
  const [atribuindo, setAtribuindo] = useState(false);

  const fetchVales = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/vales");
      if (!response.ok) throw new Error("Erro ao carregar vales");
      const data = await response.json();
      setVales(data);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao carregar vales",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const fetchAjudantes = useCallback(async () => {
    try {
      const res = await fetch("/api/ajudantes");
      if (res.ok) setAjudantesList(await res.json());
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchVales();
    fetchAjudantes();
  }, [fetchVales, fetchAjudantes]);

  const openPreview = useCallback(async (vale: ValeRow) => {
    setPreviewTemplate(null);
    setPreviewVale(vale);
    try {
      const res = await fetch("/api/configuracoes");
      const data = await res.json();
      setPreviewTemplate(
        data.notificacao_template_pendente ||
        "Olá {nome}! Você possui {qtd} vale(s) pendente(s) no sistema LOG20 que precisam ser tratados. Vale(s): {vales}. Por favor, procure o financeiro para regularizar."
      );
    } catch {
      setPreviewTemplate(
        "Olá {nome}! Você possui {qtd} vale(s) pendente(s) no sistema LOG20 que precisam ser tratados. Vale(s): {vales}. Por favor, procure o financeiro para regularizar."
      );
    }
  }, []);

  const sendNotificacao = async (valeId: string, numeroVale: number) => {
    setNotifyingId(valeId);
    setPreviewVale(null);
    try {
      const response = await fetch("/api/notificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vale_id: valeId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Erro ao enviar notificação");
      toast({
        title: "Notificação enviada",
        description: `Mensagem WhatsApp enviada para vale #${numeroVale}`,
      });
      await fetchVales();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro ao notificar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setNotifyingId(null);
    }
  };

  const handleAtribuirAjudante = async (ajudanteId: string) => {
    if (!atribuirVale) return;
    setAtribuindo(true);
    try {
      const res = await fetch(`/api/vales/${atribuirVale.id}/ajudante`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ajudante_id: ajudanteId }),
      });
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || "Erro ao atribuir");
      }
      toast({ title: "Ajudante atribuído com sucesso" });
      setAtribuirVale(null);
      setBuscaAtribuir("");
      await fetchVales();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setAtribuindo(false);
    }
  };

  const hasFilters = busca || dataInicio || dataFim || ajudanteFiltro !== "todos";

  function applyFilters(list: ValeRow[]): ValeRow[] {
    return list.filter((v) => {
      if (dataInicio && v.data_emissao && v.data_emissao < dataInicio) return false;
      if (dataFim && v.data_emissao && v.data_emissao > dataFim) return false;
      if (ajudanteFiltro !== "todos") {
        if (!v.ajudantes.some((a) => a.id === ajudanteFiltro)) return false;
      }
      if (busca) {
        const q = busca.toLowerCase();
        const matchVale = String(v.numero_vale).includes(q);
        const matchAj = v.ajudantes.some((a) => a.nome.toLowerCase().includes(q));
        const matchMotorista = v.motorista?.toLowerCase().includes(q) ?? false;
        if (!matchVale && !matchAj && !matchMotorista) return false;
      }
      return true;
    });
  }

  function filterByTab(list: ValeRow[], tab: string): ValeRow[] {
    switch (tab) {
      case "pendentes":
        return list.filter((v) => v.status_vale === "Sem Ação");
      case "faturados":
        return list.filter((v) => v.status_vale === "Faturado" || v.status_vale === "Faturar");
      case "abonados":
        return list.filter((v) => v.status_vale === "Abonado");
      case "sem_ajudante":
        return list.filter((v) => v.ajudantes.length === 0);
      default:
        return list;
    }
  }

  const valesFiltered = applyFilters(vales);
  const filteredVales = sortVales(filterByTab(valesFiltered, activeTab), sortField, sortDir);

  // Resumo acumulado dos vales filtrados
  const resumo = {
    total: valesFiltered.length,
    valorTotal: valesFiltered.reduce((s, v) => s + (v.valor_total ?? 0), 0),
    abonados: valesFiltered.filter((v) => v.status_vale === "Abonado").length,
    valorAbonado: valesFiltered.filter((v) => v.status_vale === "Abonado").reduce((s, v) => s + (v.valor_total ?? 0), 0),
    faturados: valesFiltered.filter((v) => v.status_vale === "Faturado" || v.status_vale === "Faturar").length,
    valorFaturado: valesFiltered.filter((v) => v.status_vale === "Faturado" || v.status_vale === "Faturar").reduce((s, v) => s + (v.valor_total ?? 0), 0),
    pendentes: valesFiltered.filter((v) => v.status_vale === "Sem Ação").length,
  };

  const tabCounts = {
    todos: valesFiltered.length,
    pendentes: valesFiltered.filter((v) => v.status_vale === "Sem Ação").length,
    faturados: valesFiltered.filter((v) => v.status_vale === "Faturado" || v.status_vale === "Faturar").length,
    abonados: valesFiltered.filter((v) => v.status_vale === "Abonado").length,
    sem_ajudante: valesFiltered.filter((v) => v.ajudantes.length === 0).length,
  };

  const ajudantesComTelefone = previewVale?.ajudantes.filter((a) => a.telefone) ?? [];
  const ajudantesSemTelefone = previewVale?.ajudantes.filter((a) => !a.telefone) ?? [];

  const ajudantesAtribuirFiltrados = ajudantesList.filter((a) => {
    const q = buscaAtribuir.toLowerCase();
    return (
      !q ||
      a.nome.toLowerCase().includes(q) ||
      String(a.codigo).includes(q)
    );
  });

  const tabs = [
    { value: "todos", label: "Todos", count: tabCounts.todos },
    { value: "pendentes", label: "Pendentes", count: tabCounts.pendentes },
    { value: "faturados", label: "Faturados", count: tabCounts.faturados },
    { value: "abonados", label: "Abonados", count: tabCounts.abonados },
    ...(tabCounts.sem_ajudante > 0
      ? [{ value: "sem_ajudante", label: "Sem ajudante", count: tabCounts.sem_ajudante }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <ValeDetalhesModal

        vale={detalhesVale}
        open={!!detalhesVale}
        onClose={() => setDetalhesVale(null)}
      />

      {/* WhatsApp Preview Modal */}
      {previewVale && (
        <Dialog open={!!previewVale} onOpenChange={(o) => { if (!o) { setPreviewVale(null); setPreviewTemplate(null); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-green-600" />
                Preview — Notificação WhatsApp
              </DialogTitle>
              <DialogDescription>
                Vale #{previewVale.numero_vale} — confirme antes de enviar
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {previewTemplate === null ? (
                <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando mensagem configurada...
                </div>
              ) : ajudantesComTelefone.length > 0 ? (
                <div className="space-y-3">
                  {ajudantesComTelefone.map((aj) => (
                    <div key={aj.id} className="rounded-md border p-3 space-y-1.5">
                      <p className="text-sm font-medium">
                        {aj.nome}{" "}
                        <span className="text-muted-foreground font-normal">· {aj.telefone}</span>
                      </p>
                      <div className="bg-green-50 border border-green-200 rounded p-2.5">
                        <p className="text-sm text-green-900 leading-snug whitespace-pre-wrap">
                          {buildMensagem(previewTemplate, {
                            nome: aj.nome,
                            qtd: "1",
                            vales: `#${previewVale.numero_vale}`,
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-sm text-yellow-800">
                    Nenhum ajudante deste vale tem telefone cadastrado. Cadastre os
                    telefones na aba Ajudantes antes de notificar.
                  </p>
                </div>
              )}
              {ajudantesSemTelefone.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Sem telefone (não serão notificados):{" "}
                  {ajudantesSemTelefone.map((a) => a.nome).join(", ")}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewVale(null)} disabled={!!notifyingId}>
                Cancelar
              </Button>
              <Button
                onClick={() => sendNotificacao(previewVale.id, previewVale.numero_vale)}
                disabled={!!notifyingId || ajudantesComTelefone.length === 0 || previewTemplate === null}
                className="gap-2"
              >
                {notifyingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Confirmar e Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Atribuir Ajudante Modal */}
      {atribuirVale && (
        <Dialog open={!!atribuirVale} onOpenChange={(o) => { if (!o) { setAtribuirVale(null); setBuscaAtribuir(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Atribuir Ajudante</DialogTitle>
              <DialogDescription>
                Vale #{atribuirVale.numero_vale} — selecione o ajudante responsável
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-8"
                  placeholder="Buscar por nome ou código..."
                  value={buscaAtribuir}
                  onChange={(e) => setBuscaAtribuir(e.target.value)}
                />
              </div>
              <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
                {ajudantesAtribuirFiltrados.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3 text-center">Nenhum ajudante encontrado</p>
                ) : (
                  ajudantesAtribuirFiltrados.map((aj) => (
                    <button
                      key={aj.id}
                      className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center justify-between group"
                      onClick={() => handleAtribuirAjudante(aj.id)}
                      disabled={atribuindo}
                    >
                      <div>
                        <p className="text-sm font-medium">{aj.nome}</p>
                        <p className="text-xs text-muted-foreground">Cód. {aj.codigo}</p>
                      </div>
                      {aj.telefone ? (
                        <span className="text-xs text-green-600">{aj.telefone}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">sem tel.</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAtribuirVale(null); setBuscaAtribuir(""); }}>
                Cancelar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vales</h1>
          <p className="text-muted-foreground">Gerencie todos os vales do sistema</p>
        </div>
        <Button variant="outline" onClick={fetchVales} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8"
            placeholder="Buscar por nº do vale, ajudante ou motorista..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select value={ajudanteFiltro} onValueChange={setAjudanteFiltro}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por ajudante" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os ajudantes</SelectItem>
            {ajudantesList.map((aj) => (
              <SelectItem key={aj.id} value={aj.id}>
                {aj.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-36"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            title="Data inicial (emissão)"
          />
          <span className="text-muted-foreground text-sm">até</span>
          <Input
            type="date"
            className="w-36"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            title="Data final (emissão)"
          />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setBusca(""); setDataInicio(""); setDataFim(""); setAjudanteFiltro("todos"); }}
            className="gap-1"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </Button>
        )}
      </div>

      {/* Resumo acumulado — sempre visível */}
      {valesFiltered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Total</p>
            <p className="text-lg font-bold">{resumo.total}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(resumo.valorTotal)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Pendentes</p>
            <p className="text-lg font-bold text-yellow-600">{resumo.pendentes}</p>
            <p className="text-xs text-muted-foreground">
              {resumo.total > 0 ? `${Math.round((resumo.pendentes / resumo.total) * 100)}%` : "—"}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Abonados</p>
            <p className="text-lg font-bold text-green-600">{resumo.abonados}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(resumo.valorAbonado)}</p>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground mb-0.5">Faturados</p>
            <p className="text-lg font-bold text-red-600">{resumo.faturados}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(resumo.valorFaturado)}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label} ({tab.count})
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            <Card>
              <CardHeader>
                <CardTitle>{tab.label}</CardTitle>
                <CardDescription>
                  {filterByTab(valesFiltered, tab.value).length} vale(s) encontrado(s)
                  {hasFilters && <span className="text-primary"> · filtro ativo</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <div className="px-6 pb-6 pt-0">
                {/* Prazo banner — only on pendentes tab */}
                {tab.value === "pendentes" && (() => {
                  const semTratativa = filterByTab(valesFiltered, "pendentes")
                    .filter((v) => !v.acao_transportadora || v.acao_transportadora === "Sem ação");
                  const vencidos = semTratativa.filter((v) => calcPrazo(v.data_emissao)?.status === "vencido").length;
                  const urgentes = semTratativa.filter((v) => calcPrazo(v.data_emissao)?.status === "urgente").length;
                  if (!vencidos && !urgentes) return null;
                  return (
                    <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                      <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                      <div className="text-sm text-red-800">
                        <span className="font-semibold">Atenção ao prazo de 3 dias! </span>
                        {vencidos > 0 && <span>{vencidos} vale{vencidos > 1 ? "s" : ""} com prazo <strong>vencido</strong>. </span>}
                        {urgentes > 0 && <span>{urgentes} vale{urgentes > 1 ? "s" : ""} vencem em <strong>menos de 24h</strong>. </span>}
                        <span className="text-red-600">Regularize no sistema Ambev imediatamente.</span>
                      </div>
                    </div>
                  );
                })()}
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2">Carregando...</span>
                  </div>
                ) : filteredVales.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {hasFilters
                      ? "Nenhum vale encontrado com os filtros aplicados."
                      : "Nenhum vale encontrado nesta categoria."}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead field="mapa" label="Mapa" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHead field="numero_vale" label="Vale #" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHead field="data_emissao" label="Data" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <TableHead>Ajudante(s)</TableHead>
                        <SortableHead field="itens" label="Itens" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHead field="valor_total" label="Valor Total" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHead field="status_vale" label="Status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortableHead field="prazo" label="Prazo" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <TableHead>Ação Transp.</TableHead>
                        <TableHead>Ação Ambev</TableHead>
                        <TableHead>Justificativa</TableHead>
                        <TableHead>Notificado</TableHead>
                        <TableHead className="sticky right-0 bg-background text-right shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVales.map((vale) => (
                        <TableRow key={vale.id}>
                          <TableCell className="text-muted-foreground">{vale.mapa ?? "—"}</TableCell>
                          <TableCell className="font-medium">#{vale.numero_vale}</TableCell>
                          <TableCell>{formatDateBR(vale.data_emissao)}</TableCell>
                          <TableCell className="max-w-[180px]">
                            {vale.ajudantes.length > 0 ? (
                              <div className="truncate">
                                {vale.ajudantes.map((a) => a.nome).join(", ")}
                              </div>
                            ) : (
                              <Badge variant="gray" className="text-xs">Sem ajudante</Badge>
                            )}
                          </TableCell>
                          <TableCell>{vale.itens.length}</TableCell>
                          <TableCell>{formatCurrency(vale.valor_total ?? 0)}</TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(vale.status_vale)}>
                              {vale.status_vale ?? "Sem Ação"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {vale.status_vale === "Sem Ação" && (!vale.acao_transportadora || vale.acao_transportadora === "Sem ação")
                              ? <PrazoBadge dataEmissao={vale.data_emissao} />
                              : <span className="text-muted-foreground text-sm">—</span>
                            }
                          </TableCell>
                          <TableCell>
                            {vale.acao_transportadora ? (
                              <Badge variant={getAcaoBadgeVariant(vale.acao_transportadora)}>
                                {vale.acao_transportadora}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {vale.acao_primeiro_nivel ? (
                              <Badge
                                variant={
                                  vale.acao_primeiro_nivel === "Aprovado" ? "success" :
                                  vale.acao_primeiro_nivel === "Reprovado" ? "destructive" : "gray"
                                }
                              >
                                {vale.acao_primeiro_nivel}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {vale.justificativa_primeiro_nivel ? (
                              <span
                                className="text-sm truncate block"
                                title={vale.justificativa_primeiro_nivel}
                              >
                                {vale.justificativa_primeiro_nivel.length > 60
                                  ? vale.justificativa_primeiro_nivel.slice(0, 60) + "…"
                                  : vale.justificativa_primeiro_nivel}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {vale.notificacao_pendente_enviada ? (
                              <Badge variant="success">Sim</Badge>
                            ) : (
                              <Badge variant="gray">Não</Badge>
                            )}
                          </TableCell>
                          <TableCell className="sticky right-0 bg-background text-right shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                            <div className="flex items-center justify-end gap-1">
                              {vale.ajudantes.length === 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setAtribuirVale(vale)}
                                  title="Atribuir ajudante"
                                >
                                  <UserPlus className="h-4 w-4" />
                                  <span className="ml-1 hidden sm:inline">Atribuir</span>
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDetalhesVale(vale)}
                                title="Ver detalhes do vale"
                              >
                                <Eye className="h-4 w-4" />
                                <span className="ml-1 hidden sm:inline">Detalhes</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openPreview(vale)}
                                disabled={notifyingId === vale.id}
                                title="Enviar notificação WhatsApp"
                              >
                                {notifyingId === vale.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MessageCircle className="h-4 w-4" />
                                )}
                                <span className="ml-1 hidden sm:inline">Notificar</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export default function ValesPage() {
  return (
    <Suspense>
      <ValesContent />
    </Suspense>
  );
}
