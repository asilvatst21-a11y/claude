import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/valesUtils";
import type { ImportacaoSummary, ValeParseado } from "@/lib/valesTypes";
import { parseExcelBuffer } from "@/lib/excelParser";
import { valesSupabase } from "@/lib/valesSupabase";

type StatusVale = "Abonado" | "Faturado" | "Faturar" | "Sem Ação" | null | string;

function getStatusBadgeVariant(status: StatusVale) {
  switch (status) {
    case "Abonado": return "success" as const;
    case "Faturado": return "destructive" as const;
    case "Faturar": return "warning" as const;
    default: return "gray" as const;
  }
}

async function importarPlanilha(file: File, summary: ImportacaoSummary) {
  const { data: importacao, error: importacaoError } = await valesSupabase
    .from("importacoes")
    .insert({
      nome_arquivo: file.name,
      total_linhas: summary.totalLinhas,
      total_vales: summary.totalVales,
      status: "processando",
    })
    .select()
    .single();

  if (importacaoError || !importacao) {
    throw new Error("Erro ao criar importação: " + importacaoError?.message);
  }

  const ajudantesMap = new Map<number, { codigo: number; nome: string }>();
  for (const vale of summary.vales) {
    for (const aj of vale.ajudantes) {
      if (!ajudantesMap.has(aj.codigo)) {
        ajudantesMap.set(aj.codigo, { codigo: aj.codigo, nome: aj.nome });
      }
    }
  }

  const ajudantesRows = Array.from(ajudantesMap.values());
  if (ajudantesRows.length > 0) {
    const { error: ajErr } = await valesSupabase
      .from("ajudantes")
      .upsert(ajudantesRows, { onConflict: "codigo", ignoreDuplicates: false });
    if (ajErr) throw new Error("Erro ao salvar ajudantes: " + ajErr.message);
  }

  const { data: ajudantesSaved, error: ajFetchErr } = await valesSupabase
    .from("ajudantes")
    .select("id, codigo")
    .in("codigo", ajudantesRows.map((a) => a.codigo));
  if (ajFetchErr) throw new Error("Erro ao buscar ajudantes: " + ajFetchErr.message);

  const codigoToId = new Map<number, string>();
  for (const aj of ajudantesSaved ?? []) codigoToId.set(aj.codigo, aj.id);

  const valesRows = summary.vales.map((v) => ({
    numero_vale: v.numeroVale,
    data_emissao: v.dataEmissao,
    data_rota: v.dataRota,
    mapa: v.mapa,
    motorista: v.motorista,
    veiculo: v.veiculo,
    status_vale: v.statusVale,
    acao_transportadora: v.acaoTransportadora,
    justificativa_transportadora: v.justificativaTransportadora,
    acao_primeiro_nivel: v.acaoPrimeiroNivel,
    data_primeiro_nivel: v.dataPrimeiroNivel,
    usuario_primeiro_nivel: v.usuarioPrimeiroNivel,
    motivo_primeiro_nivel: v.motivoPrimeiroNivel,
    justificativa_primeiro_nivel: v.justificativaPrimeiroNivel,
    valor_total: v.valorTotal,
    importacao_id: importacao.id,
  }));

  const { error: valesErr } = await valesSupabase
    .from("vales")
    .upsert(valesRows, { onConflict: "numero_vale", ignoreDuplicates: false });
  if (valesErr) throw new Error("Erro ao salvar vales: " + valesErr.message);

  const { data: valesSaved, error: valesFetchErr } = await valesSupabase
    .from("vales")
    .select("id, numero_vale")
    .in("numero_vale", summary.vales.map((v) => v.numeroVale));
  if (valesFetchErr) throw new Error("Erro ao buscar vales: " + valesFetchErr.message);

  const numeroToValeId = new Map<number, string>();
  for (const v of valesSaved ?? []) numeroToValeId.set(v.numero_vale, v.id);

  const valeIds = Array.from(numeroToValeId.values());
  await valesSupabase.from("vale_itens").delete().in("vale_id", valeIds);

  const itensRows = summary.vales.flatMap((v) => {
    const valeId = numeroToValeId.get(v.numeroVale);
    if (!valeId) return [];
    return v.itens.map((item) => ({
      vale_id: valeId,
      tipo_item: item.tipoItem,
      item: item.item,
      unidade: item.unidade,
      qtde_diferenca: item.qtdeDiferenca,
      qtde_diferenca_avulsa: item.qtdeDiferencaAvulsa,
      valor: item.valor,
      justificativa_ajudante: item.justificativaAjudante,
      acao_transportadora: item.acaoTransportadora,
    }));
  });

  if (itensRows.length > 0) {
    const { error: itensErr } = await valesSupabase.from("vale_itens").insert(itensRows);
    if (itensErr) throw new Error("Erro ao salvar itens: " + itensErr.message);
  }

  const valeAjudantesRows = summary.vales.flatMap((v) => {
    const valeId = numeroToValeId.get(v.numeroVale);
    if (!valeId) return [];
    return v.ajudantes
      .map((aj) => {
        const ajId = codigoToId.get(aj.codigo);
        if (!ajId) return null;
        return { vale_id: valeId, ajudante_id: ajId, posicao: aj.posicao };
      })
      .filter((r): r is { vale_id: string; ajudante_id: string; posicao: number } => r !== null);
  });

  if (valeAjudantesRows.length > 0) {
    await valesSupabase
      .from("vale_ajudantes")
      .upsert(valeAjudantesRows, { onConflict: "vale_id,ajudante_id", ignoreDuplicates: true });
  }

  await valesSupabase
    .from("importacoes")
    .update({ status: "concluido", total_ajudantes_notificados: 0 })
    .eq("id", importacao.id);

  return { ajudantesEncontrados: ajudantesRows.length };
}

export default function ImportarPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ImportacaoSummary | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    totalVales?: number;
    dataMinima?: string | null;
    dataMaxima?: string | null;
    valesSemData?: number;
  } | null>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast({ variant: "destructive", title: "Arquivo inválido", description: "Por favor, selecione um arquivo .xlsx ou .xls" });
      return;
    }

    setSelectedFile(file);
    setParsedData(null);
    setImportResult(null);
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const summary = parseExcelBuffer(buffer);
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
      await importarPlanilha(selectedFile, parsedData);
      const datas = parsedData.vales.map((v) => v.dataEmissao).filter((d): d is string => !!d).sort();
      setImportResult({
        success: true,
        message: "Importação concluída com sucesso!",
        totalVales: parsedData.totalVales,
        dataMinima: datas[0] ?? null,
        dataMaxima: datas[datas.length - 1] ?? null,
        valesSemData: parsedData.vales.filter((v) => !v.dataEmissao).length,
      });
      toast({ title: "Importação concluída", description: `${parsedData.totalVales} vales importados.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setImportResult({ success: false, message });
      toast({ variant: "destructive", title: "Erro na importação", description: message });
    } finally {
      setIsImporting(false);
    }
  };

  const datasPreview = parsedData
    ? parsedData.vales.map((v) => v.dataEmissao).filter((d): d is string => !!d).sort()
    : [];
  const dataMin = datasPreview[0] ?? null;
  const dataMax = datasPreview[datasPreview.length - 1] ?? null;
  const semData = parsedData ? parsedData.vales.filter((v) => !v.dataEmissao).length : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar Planilha</h1>
        <p className="text-muted-foreground">Importe a planilha de vales para o sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Selecionar Arquivo</CardTitle>
          <CardDescription>Arraste e solte o arquivo Excel (.xlsx) ou clique para selecionar</CardDescription>
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
              <Button variant="ghost" size="icon" onClick={() => { setSelectedFile(null); setParsedData(null); setImportResult(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} disabled={isImporting}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isParsing && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p>Processando planilha...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {parsedData && !isParsing && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{parsedData.totalLinhas}</div><p className="text-sm text-muted-foreground">Linhas lidas</p></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{parsedData.totalVales}</div><p className="text-sm text-muted-foreground">Vales encontrados</p></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{parsedData.ajudantesEncontrados}</div><p className="text-sm text-muted-foreground">Ajudantes encontrados</p></CardContent></Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm font-semibold tabular-nums">
                  {dataMin && dataMax ? dataMin === dataMax ? dataMin : <>{dataMin}<br />até {dataMax}</> : "—"}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">Período de emissão</p>
                {semData > 0 && <p className="text-xs text-yellow-600 mt-1">{semData} sem data</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Prévia dos Dados</CardTitle>
              <CardDescription>Vales que serão importados (mostrando até 50)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vale #</TableHead>
                    <TableHead>Data Emissão</TableHead>
                    <TableHead>Ajudante(s)</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead>Valor Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ação Transp.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.vales.slice(0, 50).map((vale: ValeParseado) => (
                    <TableRow key={vale.numeroVale}>
                      <TableCell className="font-medium">#{vale.numeroVale}</TableCell>
                      <TableCell>{vale.dataEmissao ?? "-"}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{vale.ajudantes.map((a) => a.nome).join(", ")}</TableCell>
                      <TableCell>{vale.itens.length}</TableCell>
                      <TableCell>{formatCurrency(vale.valorTotal)}</TableCell>
                      <TableCell><Badge variant={getStatusBadgeVariant(vale.statusVale)}>{vale.statusVale ?? "Sem Ação"}</Badge></TableCell>
                      <TableCell>{vale.acaoTransportadora ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedData.vales.length > 50 && (
                <p className="text-sm text-muted-foreground mt-3">Mostrando 50 de {parsedData.vales.length} vales.</p>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setSelectedFile(null); setParsedData(null); }} disabled={isImporting}>Cancelar</Button>
            <Button onClick={handleImport} disabled={isImporting}>
              {isImporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</> : <><Upload className="h-4 w-4 mr-2" />Confirmar Importação</>}
            </Button>
          </div>
        </>
      )}

      {importResult && (
        <Card className={importResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {importResult.success ? <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" /> : <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />}
              <div>
                <p className="font-medium">{importResult.success ? "Importação concluída!" : "Erro na importação"}</p>
                <p className="text-sm text-muted-foreground mt-1">{importResult.message}</p>
                {importResult.success && (
                  <ul className="text-sm mt-2 space-y-1">
                    <li>• {importResult.totalVales} vales processados</li>
                    {importResult.dataMinima && importResult.dataMaxima && (
                      <li>• Período: {importResult.dataMinima} até {importResult.dataMaxima}</li>
                    )}
                    {!!importResult.valesSemData && (
                      <li className="text-yellow-700">• {importResult.valesSemData} vales sem data de emissão</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
