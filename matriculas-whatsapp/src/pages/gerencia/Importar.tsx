import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { parseBaseGinfo } from "@/lib/gerenciaDreParser";
import { MESES_LABEL } from "@/lib/gerenciaDreTypes";
import type { GerenciaDreImportSummary } from "@/lib/gerenciaDreTypes";

async function importarResumo(summary: GerenciaDreImportSummary, nomeArquivo: string, importadoPor: string) {
  const { data: importacao, error: impErr } = await supabase
    .from("gerencia_dre_importacoes")
    .insert({
      ano: summary.ano,
      nome_arquivo: nomeArquivo,
      total_linhas: summary.linhas.length,
      importado_por: importadoPor,
    })
    .select()
    .single();
  if (impErr || !importacao) throw new Error("Erro ao registrar importação: " + impErr?.message);

  const contasMap = new Map<string, { conta_codigo: string; conta_nome: string; ordem: number }>();
  for (const l of summary.linhas) {
    if (!contasMap.has(l.conta_codigo)) {
      contasMap.set(l.conta_codigo, { conta_codigo: l.conta_codigo, conta_nome: l.conta_nome, ordem: l.ordem });
    }
  }
  const { error: contasErr } = await supabase
    .from("gerencia_dre_contas")
    .upsert(Array.from(contasMap.values()), { onConflict: "conta_codigo", ignoreDuplicates: false });
  if (contasErr) throw new Error("Erro ao atualizar catálogo de contas: " + contasErr.message);

  const lancamentos = summary.linhas.map((l) => ({
    importacao_id: importacao.id,
    ano: summary.ano,
    mes: l.mes,
    conta_codigo: l.conta_codigo,
    remunerado: l.remunerado,
    realizado: l.realizado,
    diferenca: l.diferenca,
    avr_percentual: l.avr_percentual,
  }));
  const { error: lancErr } = await supabase
    .from("gerencia_dre_lancamentos")
    .upsert(lancamentos, { onConflict: "ano,mes,conta_codigo", ignoreDuplicates: false });
  if (lancErr) throw new Error("Erro ao salvar lançamentos: " + lancErr.message);
}

export default function GerenciaImportarPage() {
  const { toast } = useToast();
  const { usuario } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<GerenciaDreImportSummary | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast({ variant: "destructive", title: "Arquivo inválido", description: "Selecione um arquivo .xlsx ou .xls" });
      return;
    }
    setSelectedFile(file);
    setParsedData(null);
    setImportResult(null);
    setIsParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const summary = parseBaseGinfo(buffer);
      setParsedData(summary);
    } catch (err) {
      toast({ variant: "destructive", title: "Erro ao processar planilha", description: err instanceof Error ? err.message : "Erro desconhecido" });
      setSelectedFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !parsedData) return;
    setIsImporting(true);
    setImportResult(null);
    try {
      await importarResumo(parsedData, selectedFile.name, usuario?.nome ?? usuario?.login ?? "desconhecido");
      setImportResult({ success: true, message: `${parsedData.linhas.length} lançamentos importados (${parsedData.ano}).` });
      toast({ title: "Importação concluída", description: `Ano ${parsedData.ano} atualizado com sucesso.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setImportResult({ success: false, message });
      toast({ variant: "destructive", title: "Erro na importação", description: message });
    } finally {
      setIsImporting(false);
    }
  };

  const totalContas = parsedData ? new Set(parsedData.linhas.map((l) => l.conta_codigo)).size : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar BASE GINFO</h1>
        <p className="text-muted-foreground">
          Envie o arquivo mensal exportado do GINFO. Reimportar um ano sobrescreve apenas os meses presentes no arquivo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Selecionar Arquivo</CardTitle>
          <CardDescription>Arraste e solte o arquivo Excel (.xlsx) ou clique para selecionar — a aba "BASE GINFO" será lida automaticamente</CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedFile ? (
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
                isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary hover:bg-accent/30"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">Arraste o arquivo aqui ou clique para selecionar</p>
              <p className="text-sm text-muted-foreground">Suporta arquivos .xlsx e .xls</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-accent/30 rounded-lg border">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                <div>
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setSelectedFile(null); setParsedData(null); setImportResult(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                disabled={isImporting}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {isParsing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Lendo planilha...
            </div>
          )}

          {parsedData && !isParsing && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Ano identificado</p>
                  <p className="text-lg font-semibold">{parsedData.ano}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Contas encontradas</p>
                  <p className="text-lg font-semibold">{totalContas}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Meses no arquivo</p>
                  <p className="text-lg font-semibold">{parsedData.meses.length}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Meses: {parsedData.meses.map((m) => MESES_LABEL[m] ?? m).join(", ")}
              </p>
              <Button onClick={handleImport} disabled={isImporting} className="w-full">
                {isImporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</> : "Confirmar Importação"}
              </Button>
            </div>
          )}

          {importResult && (
            <div className={`mt-4 flex items-center gap-2 p-3 rounded-lg text-sm ${importResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {importResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {importResult.message}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
