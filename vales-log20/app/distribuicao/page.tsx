"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import type { AlertaTML } from "@/lib/types";

const SALA_LABEL: Record<string, string> = { INT: "Interior", PET: "Petrópolis" };

function UploadBox({
  titulo,
  descricao,
  endpoint,
  onImported,
}: {
  titulo: string;
  descricao: string;
  endpoint: string;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFile(file: File) {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Erro ao importar");

      toast({
        title: "Importação concluída",
        description:
          typeof result.alertasEnviados === "number"
            ? `${result.total} saída(s) processada(s), ${result.alertasEnviados} alerta(s) enviado(s).`
            : `${result.total} registro(s) importado(s).`,
      });
      onImported();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro na importação",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-accent/30 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-primary" />
          ) : (
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          )}
          <p className="text-sm font-medium">
            {isUploading ? "Processando..." : "Clique para selecionar o arquivo"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">.xlsx ou .xls</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: AlertaTML["status"] }) {
  if (status === "justificado") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-600 bg-green-50">
        <CheckCircle className="h-3 w-3" /> Justificado
      </span>
    );
  }
  if (status === "erro") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-red-600 bg-red-50">
        <AlertTriangle className="h-3 w-3" /> Erro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-yellow-600 bg-yellow-50">
      <Clock className="h-3 w-3" /> Aguardando justificativa
    </span>
  );
}

export default function DistribuicaoPage() {
  const { toast } = useToast();
  const [alertas, setAlertas] = useState<AlertaTML[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [justificando, setJustificando] = useState<AlertaTML | null>(null);
  const [textoJustificativa, setTextoJustificativa] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchAlertas = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/distribuicao/alertas");
      const data = await res.json();
      setAlertas(Array.isArray(data) ? data : []);
    } catch {
      toast({ variant: "destructive", title: "Erro ao carregar alertas" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAlertas();
  }, [fetchAlertas]);

  async function handleSalvarJustificativa() {
    if (!justificando) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/distribuicao/alertas/${justificando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justificativa: textoJustificativa }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao salvar");

      toast({ title: "Justificativa registrada" });
      setJustificando(null);
      setTextoJustificativa("");
      await fetchAlertas();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
    } finally {
      setIsSaving(false);
    }
  }

  const stats = {
    total: alertas.length,
    pendentes: alertas.filter((a) => a.status === "enviado").length,
    justificados: alertas.filter((a) => a.status === "justificado").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Distribuição — Carta de Controle TML
          </h1>
          <p className="text-muted-foreground">
            Monitoramento automático de saída na portaria (Interior e Petrópolis)
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/distribuicao/supervisores">
            <Button variant="outline">
              <Users className="h-4 w-4 mr-2" />
              Supervisores
            </Button>
          </Link>
          <Button variant="outline" onClick={fetchAlertas} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <UploadBox
          titulo="1. Escala do dia (03.11.49.02)"
          descricao="Define qual motorista/placa está escalado para cada sala (Interior e Petrópolis)."
          endpoint="/api/distribuicao/escala"
          onImported={fetchAlertas}
        />
        <UploadBox
          titulo="2. Saída na portaria (03.11.20)"
          descricao="Compara o horário de saída com o limite da sala e dispara alerta automático ao supervisor quando o motorista perde o TML."
          endpoint="/api/distribuicao/saida"
          onImported={fetchAlertas}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground mb-1">Alertas hoje</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground mb-1">Aguardando justificativa</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pendentes}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground mb-1">Justificados</p>
            <p className="text-2xl font-bold text-green-600">{stats.justificados}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alertas de TML</CardTitle>
          <CardDescription>Motoristas que saíram após o limite de 30 minutos</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : alertas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="h-10 w-10 mx-auto opacity-20 mb-3" />
              <p>Nenhum alerta registrado ainda.</p>
              <p className="text-sm mt-1">
                Importe a escala e a saída para começar o monitoramento.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Mapa</TableHead>
                  <TableHead>Sala</TableHead>
                  <TableHead>Placa</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Limite</TableHead>
                  <TableHead>Saída</TableHead>
                  <TableHead>Atraso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertas.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.numero}</TableCell>
                    <TableCell>{a.mapa}</TableCell>
                    <TableCell>{SALA_LABEL[a.sala] ?? a.sala}</TableCell>
                    <TableCell>{a.placa ?? "—"}</TableCell>
                    <TableCell>{a.matricula ?? "—"}</TableCell>
                    <TableCell>{a.horario_limite}</TableCell>
                    <TableCell>{a.horario_saida}</TableCell>
                    <TableCell>{a.atraso_minutos} min</TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                      {a.justificativa && (
                        <p
                          className="text-xs text-muted-foreground mt-1 max-w-[220px] truncate"
                          title={a.justificativa}
                        >
                          {a.justificativa}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.status === "enviado" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setJustificando(a);
                            setTextoJustificativa("");
                          }}
                        >
                          Registrar justificativa
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!justificando}
        onOpenChange={(open) => {
          if (!open) setJustificando(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar justificativa</DialogTitle>
            <DialogDescription>
              {justificando?.numero} — Mapa {justificando?.mapa}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="justificativa">Justificativa</Label>
            <Input
              id="justificativa"
              value={textoJustificativa}
              onChange={(e) => setTextoJustificativa(e.target.value)}
              placeholder="Ex: Fila na portaria"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJustificando(null)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarJustificativa} disabled={isSaving || !textoJustificativa}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
