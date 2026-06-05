"use client";

import React, { useState, useEffect, useCallback } from "react";
import { MessageCircle, Loader2, RefreshCw, Eye } from "lucide-react";
import { ValeDetalhesModal, type ValeDetalhes } from "@/components/vale-detalhes-modal";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDateBR } from "@/lib/utils";
import type { StatusVale } from "@/lib/types";

interface ValeRow extends ValeDetalhes {
  mapa: number | null;
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

export default function ValesPage() {
  const { toast } = useToast();
  const [vales, setVales] = useState<ValeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("todos");
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [detalhesVale, setDetalhesVale] = useState<ValeDetalhes | null>(null);

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

  const handleNotificar = async (valeId: string, numeroVale: number) => {
    setNotifyingId(valeId);
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

  const filterVales = (tab: string): ValeRow[] => {
    switch (tab) {
      case "pendentes":
        return vales.filter(
          (v) => v.status_vale === "Sem Ação" || v.status_vale === "Faturar"
        );
      case "abonados":
        return vales.filter((v) => v.status_vale === "Abonado");
      case "faturados":
        return vales.filter((v) => v.status_vale === "Faturado");
      default:
        return vales;
    }
  };

  const filteredVales = filterVales(activeTab);

  const tabCounts = {
    todos: vales.length,
    pendentes: vales.filter(
      (v) => v.status_vale === "Sem Ação" || v.status_vale === "Faturar"
    ).length,
    abonados: vales.filter((v) => v.status_vale === "Abonado").length,
    faturados: vales.filter((v) => v.status_vale === "Faturado").length,
  };

  return (
    <div className="space-y-6">
      <ValeDetalhesModal
        vale={detalhesVale}
        open={!!detalhesVale}
        onClose={() => setDetalhesVale(null)}
      />
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

        {["todos", "pendentes", "abonados", "faturados"].map((tab) => (
          <TabsContent key={tab} value={tab}>
            <Card>
              <CardHeader>
                <CardTitle className="capitalize">
                  {tab === "todos" ? "Todos os Vales" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </CardTitle>
                <CardDescription>
                  {filterVales(tab).length} vale(s) encontrado(s)
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
                    Nenhum vale encontrado nesta categoria.
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
                                onClick={() => handleNotificar(vale.id, vale.numero_vale)}
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
