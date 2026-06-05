"use client";

import React, { useState, useEffect, useCallback } from "react";
import { MessageCircle, Loader2, RefreshCw, Eye, Search, X, Send } from "lucide-react";
import { ValeDetalhesModal, type ValeDetalhes } from "@/components/vale-detalhes-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatCurrency, formatDateBR } from "@/lib/utils";
import type { StatusVale } from "@/lib/types";

interface ValeRow extends ValeDetalhes {
  notificacao_pendente_enviada: boolean;
  notificacao_final_enviada: boolean;
}

function getStatusBadgeVariant(status: string | null) {
  switch (status) {
    case "Abonado":
      return "success" as const;
    case "Faturado":
      return "destructive" as const;
    case "Faturar":
      return "warning" as const;
    default:
      return "gray" as const;
  }
}

function getAcaoBadgeVariant(acao: string | null) {
  switch (acao) {
    case "Aprovado":
      return "success" as const;
    case "Reprovado":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function buildMensagemPendente(vale: ValeRow, ajudante: { nome: string }) {
  return (
    `Olá ${ajudante.nome}! Você possui vale(s) pendente(s) no sistema LOG20. ` +
    `Por favor, procure o financeiro para regularizar. ` +
    `Vale(s): #${vale.numero_vale}`
  );
}

export default function ValesPage() {
  const { toast } = useToast();
  const [vales, setVales] = useState<ValeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("todos");
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [detalhesVale, setDetalhesVale] = useState<ValeDetalhes | null>(null);

  // Filters
  const [busca, setBusca] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  // WhatsApp preview
  const [previewVale, setPreviewVale] = useState<ValeRow | null>(null);

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

  useEffect(() => {
    fetchVales();
  }, [fetchVales]);

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

      if (!response.ok) {
        throw new Error(result.error || "Erro ao enviar notificação");
      }

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

  const hasFilters = busca || dataInicio || dataFim;

  function applySearchAndDate(list: ValeRow[]): ValeRow[] {
    return list.filter((v) => {
      if (dataInicio && v.data_emissao && v.data_emissao < dataInicio) return false;
      if (dataFim && v.data_emissao && v.data_emissao > dataFim) return false;
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
        return list.filter(
          (v) => v.status_vale === "Sem Ação" || v.status_vale === "Faturar"
        );
      case "abonados":
        return list.filter((v) => v.status_vale === "Abonado");
      case "faturados":
        return list.filter((v) => v.status_vale === "Faturado");
      default:
        return list;
    }
  }

  const valesFiltered = applySearchAndDate(vales);
  const filteredVales = filterByTab(valesFiltered, activeTab);

  const tabCounts = {
    todos: valesFiltered.length,
    pendentes: valesFiltered.filter(
      (v) => v.status_vale === "Sem Ação" || v.status_vale === "Faturar"
    ).length,
    abonados: valesFiltered.filter((v) => v.status_vale === "Abonado").length,
    faturados: valesFiltered.filter((v) => v.status_vale === "Faturado").length,
  };

  const ajudantesComTelefone =
    previewVale?.ajudantes.filter((a) => a.telefone) ?? [];
  const ajudantesSemTelefone =
    previewVale?.ajudantes.filter((a) => !a.telefone) ?? [];

  return (
    <div className="space-y-6">
      <ValeDetalhesModal
        vale={detalhesVale}
        open={!!detalhesVale}
        onClose={() => setDetalhesVale(null)}
      />

      {/* WhatsApp Preview Modal */}
      {previewVale && (
        <Dialog open={!!previewVale} onOpenChange={(o) => !o && setPreviewVale(null)}>
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
              {ajudantesComTelefone.length > 0 ? (
                <div className="space-y-3">
                  {ajudantesComTelefone.map((aj) => (
                    <div key={aj.id} className="rounded-md border p-3 space-y-1.5">
                      <p className="text-sm font-medium">
                        {aj.nome}{" "}
                        <span className="text-muted-foreground font-normal">
                          · {aj.telefone}
                        </span>
                      </p>
                      <div className="bg-green-50 border border-green-200 rounded p-2.5">
                        <p className="text-sm text-green-900 leading-snug whitespace-pre-wrap">
                          {buildMensagemPendente(previewVale, aj)}
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
              <Button
                variant="outline"
                onClick={() => setPreviewVale(null)}
                disabled={!!notifyingId}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => sendNotificacao(previewVale.id, previewVale.numero_vale)}
                disabled={!!notifyingId || ajudantesComTelefone.length === 0}
                className="gap-2"
              >
                {notifyingId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Confirmar e Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vales</h1>
          <p className="text-muted-foreground">
            Gerencie todos os vales do sistema
          </p>
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
            onClick={() => { setBusca(""); setDataInicio(""); setDataFim(""); }}
            className="gap-1"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="todos">
            Todos ({tabCounts.todos})
          </TabsTrigger>
          <TabsTrigger value="pendentes">
            Pendentes ({tabCounts.pendentes})
          </TabsTrigger>
          <TabsTrigger value="abonados">
            Abonados ({tabCounts.abonados})
          </TabsTrigger>
          <TabsTrigger value="faturados">
            Faturados ({tabCounts.faturados})
          </TabsTrigger>
        </TabsList>

        {(["todos", "pendentes", "abonados", "faturados"] as const).map((tab) => (
          <TabsContent key={tab} value={tab}>
            <Card>
              <CardHeader>
                <CardTitle className="capitalize">
                  {tab === "todos" ? "Todos os Vales" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </CardTitle>
                <CardDescription>
                  {filterByTab(valesFiltered, tab).length} vale(s) encontrado(s)
                  {hasFilters && (
                    <span className="text-primary"> · filtro ativo</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                        <TableHead>Vale #</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Ajudante(s)</TableHead>
                        <TableHead>Itens</TableHead>
                        <TableHead>Valor Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ação Transp.</TableHead>
                        <TableHead>Ação Ambev</TableHead>
                        <TableHead>Justificativa</TableHead>
                        <TableHead>Notificado</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVales.map((vale) => (
                        <TableRow key={vale.id}>
                          <TableCell className="font-medium">
                            #{vale.numero_vale}
                          </TableCell>
                          <TableCell>
                            {formatDateBR(vale.data_emissao)}
                          </TableCell>
                          <TableCell className="max-w-[180px]">
                            <div className="truncate">
                              {vale.ajudantes.map((a) => a.nome).join(", ") || "-"}
                            </div>
                          </TableCell>
                          <TableCell>{vale.itens.length}</TableCell>
                          <TableCell>
                            {formatCurrency(vale.valor_total ?? 0)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(vale.status_vale)}>
                              {vale.status_vale ?? "Sem Ação"}
                            </Badge>
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
                                  vale.acao_primeiro_nivel === "Aprovado"
                                    ? "success"
                                    : vale.acao_primeiro_nivel === "Reprovado"
                                    ? "destructive"
                                    : "gray"
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
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
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
                                onClick={() => setPreviewVale(vale)}
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
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
