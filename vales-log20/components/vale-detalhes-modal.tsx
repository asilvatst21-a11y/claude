"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus } from "lucide-react";
import { formatCurrency, formatDateBR } from "@/lib/utils";

interface ValeItem {
  id: string;
  tipo_item: string | null;
  item: string | null;
  unidade: string | null;
  qtde_diferenca: number | null;
  qtde_diferenca_avulsa: number | null;
  valor: number | null;
}

interface ValeNota {
  id: string;
  texto: string;
  created_at: string;
}

export interface ValeDetalhes {
  id: string;
  numero_vale: number;
  data_emissao: string | null;
  data_rota: string | null;
  mapa: number | null;
  motorista: string | null;
  veiculo: string | null;
  status_vale: string | null;
  acao_transportadora: string | null;
  justificativa_transportadora: string | null;
  acao_primeiro_nivel: string | null;
  justificativa_primeiro_nivel: string | null;
  valor_total: number;
  ajudantes: { id: string; nome: string; codigo: number; telefone: string | null }[];
  itens: ValeItem[];
}

interface Props {
  vale: ValeDetalhes | null;
  open: boolean;
  onClose: () => void;
}

function StatusBadge({ status }: { status: string | null }) {
  const variant =
    status === "Abonado" ? "success" :
    status === "Faturado" ? "destructive" :
    status === "Faturar" ? "warning" :
    status === "Aprovado" ? "success" :
    status === "Reprovado" ? "destructive" :
    "gray";
  return <Badge variant={variant as never}>{status ?? "Sem Ação"}</Badge>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1">
      <span className="text-sm font-medium text-muted-foreground min-w-[180px] shrink-0">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function formatNotaDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ValeDetalhesModal({ vale, open, onClose }: Props) {
  const [notas, setNotas] = useState<ValeNota[]>([]);
  const [loadingNotas, setLoadingNotas] = useState(false);
  const [novoTexto, setNovoTexto] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [erroNota, setErroNota] = useState<string | null>(null);

  const fetchNotas = useCallback(async () => {
    if (!vale) return;
    setLoadingNotas(true);
    try {
      const res = await fetch(`/api/vales/${vale.id}/notas`);
      if (res.ok) setNotas(await res.json());
    } finally {
      setLoadingNotas(false);
    }
  }, [vale]);

  useEffect(() => {
    if (open && vale) {
      fetchNotas();
    } else {
      setNotas([]);
      setNovoTexto("");
    }
  }, [open, vale, fetchNotas]);

  const handleAdicionarNota = async () => {
    if (!vale || !novoTexto.trim()) return;
    setSalvandoNota(true);
    setErroNota(null);
    try {
      const res = await fetch(`/api/vales/${vale.id}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: novoTexto }),
      });
      if (res.ok) {
        setNovoTexto("");
        await fetchNotas();
      } else {
        const data = await res.json().catch(() => ({}));
        setErroNota(data.error ?? "Erro ao salvar anotação");
      }
    } catch {
      setErroNota("Erro de conexão ao salvar anotação");
    } finally {
      setSalvandoNota(false);
    }
  };

  if (!vale) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg">
            Vale #{vale.numero_vale}
            <StatusBadge status={vale.status_vale} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">

          {/* Dados Gerais */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Dados do Vale
            </h3>
            <div className="space-y-1.5">
              <InfoRow label="Data da Rota" value={formatDateBR(vale.data_rota)} />
              <InfoRow label="Data de Emissão" value={formatDateBR(vale.data_emissao)} />
              <InfoRow label="Mapa" value={vale.mapa != null ? String(vale.mapa) : null} />
              <InfoRow label="Motorista" value={vale.motorista} />
              <InfoRow label="Placa do Veículo" value={vale.veiculo ?? "—"} />
              <InfoRow
                label={vale.ajudantes.length > 1 ? "Ajudantes (vale dividido)" : "Ajudante"}
                value={
                  vale.ajudantes.length > 0
                    ? vale.ajudantes.map((a) => `${a.nome} (cód. ${a.codigo})`).join(" • ")
                    : <span className="text-muted-foreground italic">Sem ajudante identificado</span>
                }
              />
              <InfoRow label="Valor Total" value={<span className="font-semibold">{formatCurrency(vale.valor_total)}</span>} />
            </div>
          </section>

          <Separator />

          {/* Itens */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Itens com Diferença
            </h3>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-center">UN</TableHead>
                    <TableHead className="text-center">Qtde Dif.</TableHead>
                    <TableHead className="text-center">Avulsa</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vale.itens.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.item ?? "-"}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{item.unidade ?? "-"}</TableCell>
                      <TableCell className="text-center">{item.qtde_diferenca ?? "-"}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{item.qtde_diferenca_avulsa ?? "-"}</TableCell>
                      <TableCell className="text-right">{item.valor != null ? formatCurrency(item.valor) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <Separator />

          {/* Tratativa Transportadora (LOG20) */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Tratativa Transportadora (LOG20)
            </h3>
            <div className="space-y-1.5">
              <InfoRow
                label="Ação Transportadora"
                value={vale.acao_transportadora ? <StatusBadge status={vale.acao_transportadora} /> : <span className="text-muted-foreground text-sm">Sem ação</span>}
              />
              <InfoRow label="Justificativa" value={vale.justificativa_transportadora} />
            </div>
            {!vale.acao_transportadora && !vale.justificativa_transportadora && (
              <p className="text-sm text-muted-foreground italic">Sem tratativa registrada</p>
            )}
          </section>

          <Separator />

          {/* Tratativa Ambev (1º Nível) */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Tratativa Ambev — 1º Nível
            </h3>
            <div className="space-y-1.5">
              <InfoRow
                label="Ação 1º Nível"
                value={vale.acao_primeiro_nivel ? <StatusBadge status={vale.acao_primeiro_nivel} /> : <span className="text-muted-foreground text-sm">Sem ação</span>}
              />
              <InfoRow label="Justificativa Ambev" value={vale.justificativa_primeiro_nivel} />
            </div>
            {!vale.acao_primeiro_nivel && !vale.justificativa_primeiro_nivel && (
              <p className="text-sm text-muted-foreground italic">Pendente de tratativa Ambev</p>
            )}
          </section>

          <Separator />

          {/* Notas / Comentários */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Anotações
            </h3>

            {loadingNotas ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando anotações...
              </div>
            ) : notas.length > 0 ? (
              <div className="space-y-2 mb-4">
                {notas.map((nota) => (
                  <div key={nota.id} className="rounded-md border bg-muted/30 px-3 py-2">
                    <p className="text-sm">{nota.texto}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatNotaDate(nota.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic mb-4">
                Nenhuma anotação registrada.
              </p>
            )}

            {erroNota && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-2">
                {erroNota}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <textarea
                className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                placeholder="Ex: Entrevista feita. Ajudante não quis assinar..."
                value={novoTexto}
                onChange={(e) => setNovoTexto(e.target.value)}
                disabled={salvandoNota}
              />
              <Button
                size="sm"
                onClick={handleAdicionarNota}
                disabled={!novoTexto.trim() || salvandoNota}
                className="self-end gap-1"
              >
                {salvandoNota ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Adicionar anotação
              </Button>
            </div>
          </section>

        </div>
      </DialogContent>
    </Dialog>
  );
}
