"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
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

export interface ValeDetalhes {
  id: string;
  numero_vale: number;
  data_emissao: string | null;
  data_rota: string | null;
  mapa: number | null;
  motorista: string | null;
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

export function ValeDetalhesModal({ vale, open, onClose }: Props) {
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
              <InfoRow
                label={vale.ajudantes.length > 1 ? "Ajudantes (vale dividido)" : "Ajudante"}
                value={vale.ajudantes.map((a) => `${a.nome} (cód. ${a.codigo})`).join(" • ")}
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

        </div>
      </DialogContent>
    </Dialog>
  );
}
