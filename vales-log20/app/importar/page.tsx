"use client";

import React, { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { ImportacaoSummary, ValeParseado, StatusVale } from "@/lib/types";
import * as XLSX from "xlsx";
import { parseExcelBuffer } from "@/lib/excel-parser";

function getStatusBadgeVariant(status: StatusVale | null | string) {
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
    valesNovos?: number;
    ajudantesNotificados?: number;
    dataMinima?: string | null;
    dataMaxima?: string | null;
    valesSemData?: number;
  } | null>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      toast({
        variant: "destructive",
        title: "Arquivo inválido",
        description: "Por favor, selecione um arquivo .xlsx ou .xls",
      });
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
      toast({
        variant: "destructive",
        title: "Erro ao processar planilha",
        description: err instanceof Error ? err.message : "Erro desconhecido",
      });
      setSelectedFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setParsedData(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async () => {
    if (!selectedFile || !parsedData) return;

    setIsImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/importar", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao importar");
      }

      setImportResult({
        success: true,
        message: `Importação concluída com sucesso!`,
        totalVales: result.totalVales,
        valesNovos: result.valesNovos,
        ajudantesNotificados: result.ajudantesNotificados,
        dataMinima: result.dataMinima,
        dataMaxima: result.dataMaxima,
        valesSemData: result.valesSemData,
      });

      toast({
        title: "Importação concluída",
        description: `${result.totalVales} vales importados.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setImportResult({ success: false, message });
      toast({
        variant: "destructive",
        title: "Erro na importação",
        description: message,
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Date range from preview data
  const datasPreview = parsedData
    ? parsedData.vales.map((v) => v.dataEmissao).filter((d): d is string => !!d).sort()
    : [];
  const dataMin = datasPreview[0] ?? null;
  const dataMax = datasPreview[datasPreview.length - 1] ?? null;
  const semData = parsedData ? parsedData.vales.filter((v) => !v.dataEmissao).length : 0;

  // Count ajudantes that will be notified (those with phone)
  const ajudantesParaNotificar = parsedData
    ? [
        ...new Map(
          parsedData.vales
            .flatMap((v) => v.ajudantes)
            .map((a) => [a.codigo, a])
        ).values(),
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar Planilha</h1>
        <p className="text-muted-foreground">
          Importe a planilha de vales para o sistema
        </p>
      </div>

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle>Selecionar Arquivo</CardTitle>
          <CardDescription>
            Arraste e solte o arquivo Excel (.xlsx) ou clique para selecionar
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedFile ? (
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/30 hover:border-primary hover:bg-accent/30"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">
                Arraste o arquivo aqui ou clique para selecionar
              </p>
              <p className="text-sm text-muted-foreground">
                Suporta arquivos .xlsx e .xls
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-accent/30 rounded-lg border">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                <div>
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearFile}
                disabled={isImporting}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parsing Status */}
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

      {/* Preview */}
      {parsedData && !isParsing && (
        <>
          {/* Summary */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{parsedData.totalLinhas}</div>
                <p className="text-sm text-muted-foreground">Linhas lidas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{parsedData.totalVales}</div>
                <p className="text-sm text-muted-foreground">Vales encontrados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{parsedData.ajudantesEncontrados}</div>
                <p className="text-sm text-muted-foreground">Ajudantes encontrados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm font-semibold tabular-nums">
                  {dataMin && dataMax
                    ? dataMin === dataMax
                      ? dataMin
                      : <>{dataMin}<br/>até {dataMax}</>
                    : "—"}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">Período de emissão</p>
                {semData > 0 && (
                  <p className="text-xs text-yellow-600 mt-1">{semData} sem data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* WhatsApp notification info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notificações WhatsApp</CardTitle>
              <CardDescription>
                Ajudantes que serão notificados via WhatsApp (apenas os que possuem telefone cadastrado e têm vales novos)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ajudantesParaNotificar.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {ajudantesParaNotificar.map((aj) => (
                    <Badge key={aj.codigo} variant="secondary">
                      {aj.nome} (cód. {aj.codigo})
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum ajudante encontrado na planilha.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Preview Table */}
          <Card>
            <CardHeader>
              <CardTitle>Prévia dos Dados</CardTitle>
              <CardDescription>
                Vales que serão importados (mostrando até 50)
              </CardDescription>
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
                      <TableCell className="font-medium">
                        #{vale.numeroVale}
                      </TableCell>
                      <TableCell>{vale.dataEmissao ?? "-"}</TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {vale.ajudantes.map((a) => a.nome).join(", ")}
                      </TableCell>
                      <TableCell>{vale.itens.length}</TableCell>
                      <TableCell>{formatCurrency(vale.valorTotal)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(vale.statusVale)}>
                          {vale.statusVale ?? "Sem Ação"}
                        </Badge>
                      </TableCell>
                      <TableCell>{vale.acaoTransportadora ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedData.vales.length > 50 && (
                <p className="text-sm text-muted-foreground mt-3">
                  Mostrando 50 de {parsedData.vales.length} vales.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Import Action */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleClearFile}
              disabled={isImporting}
            >
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={isImporting}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Confirmar Importação
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* Import Result */}
      {importResult && (
        <Card
          className={
            importResult.success
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {importResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              )}
              <div>
                <p className="font-medium">
                  {importResult.success ? "Importação concluída!" : "Erro na importação"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {importResult.message}
                </p>
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
