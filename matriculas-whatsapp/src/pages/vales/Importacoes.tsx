import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, FileSpreadsheet, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { valesSupabase } from "@/lib/valesSupabase";
import type { Importacao } from "@/lib/valesTypes";

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "concluido") return <Badge variant="success" className="gap-1"><CheckCircle className="h-3 w-3" />Concluído</Badge>;
  if (status === "processando") return <Badge variant="warning" className="gap-1"><Clock className="h-3 w-3" />Processando</Badge>;
  return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />{status}</Badge>;
}

export default function ImportacoesPage() {
  const { toast } = useToast();
  const [importacoes, setImportacoes] = useState<Importacao[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchImportacoes = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await valesSupabase
        .from("importacoes")
        .select("*")
        .order("importado_em", { ascending: false });
      if (error) throw new Error(error.message);
      setImportacoes(data ?? []);
    } catch (err) {
      toast({ variant: "destructive", title: "Erro", description: err instanceof Error ? err.message : "Erro ao carregar histórico" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchImportacoes(); }, [fetchImportacoes]);

  const totalValesImportados = importacoes.reduce((acc, i) => acc + (i.total_vales ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Histórico de Importações</h1>
          <p className="text-muted-foreground">Registro de todas as planilhas importadas</p>
        </div>
        <Button variant="outline" onClick={fetchImportacoes} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{importacoes.length}</div><p className="text-sm text-muted-foreground">Importações realizadas</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{importacoes.filter((i) => i.status === "concluido").length}</div><p className="text-sm text-muted-foreground">Concluídas com sucesso</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{totalValesImportados}</div><p className="text-sm text-muted-foreground">Total de vales processados</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Importações</CardTitle>
          <CardDescription>{importacoes.length} importação(ões) encontrada(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2">Carregando...</span>
            </div>
          ) : importacoes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Nenhuma importação realizada ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data / Hora</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="text-center">Linhas</TableHead>
                  <TableHead className="text-center">Vales</TableHead>
                  <TableHead className="text-center">Notificados</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importacoes.map((imp) => (
                  <TableRow key={imp.id}>
                    <TableCell className="text-sm tabular-nums">{formatDateTime(imp.importado_em)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-sm font-medium truncate max-w-[220px]">{imp.nome_arquivo ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{imp.total_linhas ?? "—"}</TableCell>
                    <TableCell className="text-center tabular-nums font-medium">{imp.total_vales ?? "—"}</TableCell>
                    <TableCell className="text-center tabular-nums">{imp.total_ajudantes_notificados}</TableCell>
                    <TableCell><StatusBadge status={imp.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
