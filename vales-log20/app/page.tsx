import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ClipboardList,
  FileSpreadsheet,
  Users,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  DollarSign,
  ArrowRight,
} from "lucide-react";
import { formatCurrency, formatDateBR, calcPrazo } from "@/lib/utils";
import type { StatusVale } from "@/lib/types";
import { DashboardCharts } from "@/components/dashboard-charts";
import type { MonthlyData, DailyData } from "@/components/dashboard-charts";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function getStatusBadgeVariant(status: StatusVale | null | string) {
  switch (status) {
    case "Abonado":
      return "success" as const;
    case "Faturado":
      return "destructive" as const;
    case "Faturar":
      return "warning" as const;
    case "Sem Ação":
    default:
      return "gray" as const;
  }
}

interface AjudanteStats {
  id: string;
  codigo: number;
  nome: string;
  telefone: string | null;
  totalVales: number;
  abonados: number;
  faturados: number;
  pendentes: number;
  valorTotal: number;
}

async function getDashboardData() {
  try {
    const supabase = await createServiceClient();

    // Fetch all vales with ajudantes (no limit — needed for aggregations)
    const { data: allValesData, error: allValesError } = await supabase
      .from("vales")
      .select(
        `
        id,
        numero_vale,
        data_emissao,
        data_rota,
        status_vale,
        acao_transportadora,
        valor_total,
        notificacao_pendente_enviada,
        created_at
      `
      )
      .order("created_at", { ascending: false });

    if (allValesError) throw allValesError;
    const allVales = allValesData ?? [];

    // Aggregate stats
    const totalVales = allVales.length;
    const pendentes = allVales.filter(
      (v) => v.status_vale === "Sem Ação" || v.status_vale === "Faturar"
    ).length;
    const abonados = allVales.filter((v) => v.status_vale === "Abonado").length;
    const faturados = allVales.filter((v) => v.status_vale === "Faturado").length;

    const valorTotalFaturado = allVales
      .filter((v) => v.status_vale === "Faturado")
      .reduce((sum, v) => sum + (v.valor_total ?? 0), 0);

    const valorTotalAbonado = allVales
      .filter((v) => v.status_vale === "Abonado")
      .reduce((sum, v) => sum + (v.valor_total ?? 0), 0);

    const valorTotalPendente = allVales
      .filter((v) => v.status_vale === "Sem Ação" || v.status_vale === "Faturar")
      .reduce((sum, v) => sum + (v.valor_total ?? 0), 0);

    // Status distribution (for bar chart)
    const semAcao = allVales.filter((v) => v.status_vale === "Sem Ação" || !v.status_vale).length;
    const faturar = allVales.filter((v) => v.status_vale === "Faturar").length;

    // ── Chart data ──────────────────────────────────────────────────────────
    interface PeriodStats {
      total: number; abonados: number; faturados: number;
      faturar: number; semAcao: number; valorAbonado: number; valorFaturado: number;
    }
    const monthMap = new Map<string, PeriodStats>();
    const dayMap = new Map<string, PeriodStats>();

    for (const vale of allVales) {
      const rawDate = (vale as { data_emissao?: string | null }).data_emissao
        ?? (vale.created_at ? String(vale.created_at).substring(0, 10) : null);
      if (!rawDate) continue;
      const month = String(rawDate).substring(0, 7);
      const day = String(rawDate).substring(0, 10);
      const status = vale.status_vale;
      const valor = vale.valor_total ?? 0;
      for (const key of [month, day]) {
        const map = key.length === 7 ? monthMap : dayMap;
        const s = map.get(key) ?? { total: 0, abonados: 0, faturados: 0, faturar: 0, semAcao: 0, valorAbonado: 0, valorFaturado: 0 };
        s.total++;
        if (status === "Abonado") { s.abonados++; s.valorAbonado += valor; }
        else if (status === "Faturado") { s.faturados++; s.valorFaturado += valor; }
        else if (status === "Faturar") s.faturar++;
        else s.semAcao++;
        map.set(key, s);
      }
    }

    const monthlyData: MonthlyData[] = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, s]) => {
        const [year, m] = month.split("-");
        return { month, label: `${MONTHS_PT[parseInt(m) - 1]}/${year.slice(2)}`, ...s };
      });

    const dailyData: DailyData[] = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, s]) => ({
        day,
        label: day.substring(8),
        month: day.substring(0, 7),
        total: s.total,
        abonados: s.abonados,
        faturados: s.faturados,
      }));
    // ────────────────────────────────────────────────────────────────────────

    // Recent 10 vales
    const recentValesRaw = allVales.slice(0, 10);

    // Fetch recent vales with ajudantes
    const recentValeIds = recentValesRaw.map((v) => v.id);
    const { data: recentAjudantesData } = await supabase
      .from("vale_ajudantes")
      .select(
        `
        vale_id,
        posicao,
        ajudantes (
          id,
          nome
        )
      `
      )
      .in("vale_id", recentValeIds);

    // Build lookup map: vale_id -> ajudante names
    const valeAjudantesMap = new Map<string, string[]>();
    for (const va of recentAjudantesData ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nome = (va.ajudantes as any)?.nome;
      if (!nome) continue;
      const existing = valeAjudantesMap.get(va.vale_id) ?? [];
      existing.push(nome);
      valeAjudantesMap.set(va.vale_id, existing);
    }

    const recentVales = recentValesRaw.map((v) => ({
      ...v,
      ajudanteNomes: valeAjudantesMap.get(v.id) ?? [],
    }));

    // Fetch all ajudantes with their vales for aggregation
    const { data: ajudantesData, error: ajErr } = await supabase
      .from("ajudantes")
      .select(
        `
        id,
        codigo,
        nome,
        telefone,
        vale_ajudantes (
          vale_id,
          vales (
            id,
            status_vale,
            valor_total
          )
        )
      `
      )
      .order("nome");

    if (ajErr) throw ajErr;

    // Aggregate per-ajudante stats
    const ajudanteStats: AjudanteStats[] = (ajudantesData ?? []).map((aj) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const valeLinks = aj.vale_ajudantes as any[];
      const ajAbonados = valeLinks.filter((va) => va.vales?.status_vale === "Abonado").length;
      const ajFaturados = valeLinks.filter((va) => va.vales?.status_vale === "Faturado").length;
      const ajPendentes = valeLinks.filter((va) => {
        const s = va.vales?.status_vale;
        return s === "Sem Ação" || s === "Faturar";
      }).length;
      const ajValorTotal = valeLinks.reduce((sum, va) => sum + (va.vales?.valor_total ?? 0), 0);

      return {
        id: aj.id,
        codigo: aj.codigo,
        nome: aj.nome,
        telefone: aj.telefone,
        totalVales: valeLinks.length,
        abonados: ajAbonados,
        faturados: ajFaturados,
        pendentes: ajPendentes,
        valorTotal: ajValorTotal,
      };
    });

    // Vales with deadline < 24h or overdue (sem ação + sem tratativa transportadora)
    const valesUrgentes = allVales.filter((v) => {
      if (v.status_vale !== "Sem Ação") return false;
      const acao = (v as { acao_transportadora?: string | null }).acao_transportadora;
      if (acao && acao !== "Sem ação") return false;
      const prazo = calcPrazo((v as { data_emissao?: string | null }).data_emissao);
      return prazo?.status === "urgente" || prazo?.status === "vencido";
    });
    const qtdVencidos = valesUrgentes.filter((v) => {
      const prazo = calcPrazo((v as { data_emissao?: string | null }).data_emissao);
      return prazo?.status === "vencido";
    }).length;
    const qtdUrgentes = valesUrgentes.length - qtdVencidos;

    // Top 10 ajudantes with pending vales
    const topPendentes = ajudanteStats
      .filter((a) => a.pendentes > 0)
      .sort((a, b) => b.pendentes - a.pendentes || b.valorTotal - a.valorTotal)
      .slice(0, 10);

    // All ajudantes that appear in at least one vale
    const ajudantesComVales = ajudanteStats
      .filter((a) => a.totalVales > 0)
      .sort((a, b) => b.totalVales - a.totalVales);

    return {
      stats: {
        total: totalVales,
        pendentes,
        abonados,
        faturados,
        semAcao,
        faturar,
        valorTotalFaturado,
        valorTotalAbonado,
        valorTotalPendente,
      },
      recentVales,
      topPendentes,
      ajudantesComVales,
      monthlyData,
      dailyData,
      qtdVencidos,
      qtdUrgentes,
    };
  } catch {
    return {
      stats: {
        total: 0,
        pendentes: 0,
        abonados: 0,
        faturados: 0,
        semAcao: 0,
        faturar: 0,
        valorTotalFaturado: 0,
        valorTotalAbonado: 0,
        valorTotalPendente: 0,
      },
      recentVales: [],
      topPendentes: [],
      ajudantesComVales: [],
      monthlyData: [],
      dailyData: [],
      qtdVencidos: 0,
      qtdUrgentes: 0,
    };
  }
}

export default async function DashboardPage() {
  const { stats, recentVales, topPendentes, ajudantesComVales, monthlyData, dailyData, qtdVencidos, qtdUrgentes } = await getDashboardData();

  const total = stats.total || 1; // avoid division by zero
  const pctAbonados = Math.round((stats.abonados / total) * 100);
  const pctFaturados = Math.round((stats.faturados / total) * 100);
  const pctFaturar = Math.round((stats.faturar / total) * 100);
  const pctSemAcao = Math.max(0, 100 - pctAbonados - pctFaturados - pctFaturar);

  const statsCards = [
    {
      title: "Total de Vales",
      value: stats.total,
      description: "Todos os vales cadastrados",
      icon: ClipboardList,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Pendentes",
      value: stats.pendentes,
      description: "Sem Ação ou Faturar",
      icon: Clock,
      color: "text-yellow-600",
      bg: "bg-yellow-50",
    },
    {
      title: "Abonados",
      value: stats.abonados,
      description: "Vales abonados",
      icon: CheckCircle,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      title: "Faturados",
      value: stats.faturados,
      description: "Vales faturados ao ajudante",
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      title: "Valor Faturado",
      value: formatCurrency(stats.valorTotalFaturado),
      description: "Soma dos vales Faturados",
      icon: DollarSign,
      color: "text-red-600",
      bg: "bg-red-50",
      isText: true,
    },
    {
      title: "Valor Abonado",
      value: formatCurrency(stats.valorTotalAbonado),
      description: "Soma dos vales Abonados",
      icon: TrendingUp,
      color: "text-green-600",
      bg: "bg-green-50",
      isText: true,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Alerta de prazo crítico */}
      {(qtdVencidos > 0 || qtdUrgentes > 0) && (
        <Link href="/vales" className="block group">
          <div className={`flex items-center justify-between gap-4 rounded-lg border px-5 py-4 transition-colors ${
            qtdVencidos > 0
              ? "border-red-200 bg-red-50 hover:bg-red-100"
              : "border-orange-200 bg-orange-50 hover:bg-orange-100"
          }`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${qtdVencidos > 0 ? "text-red-600" : "text-orange-500"}`} />
              <div>
                <p className={`font-semibold text-sm ${qtdVencidos > 0 ? "text-red-800" : "text-orange-800"}`}>
                  {qtdVencidos > 0 ? "Atenção: prazo vencido!" : "Prazo crítico — menos de 24h"}
                </p>
                <p className={`text-sm mt-0.5 ${qtdVencidos > 0 ? "text-red-700" : "text-orange-700"}`}>
                  {qtdVencidos > 0 && (
                    <span>{qtdVencidos} vale{qtdVencidos > 1 ? "s" : ""} com prazo <strong>vencido</strong>{qtdUrgentes > 0 ? " e " : "."} </span>
                  )}
                  {qtdUrgentes > 0 && (
                    <span>{qtdUrgentes} vale{qtdUrgentes > 1 ? "s" : ""} vencem em <strong>menos de 24h</strong>.</span>
                  )}
                  {" "}Regularize no sistema Ambev imediatamente.
                </p>
              </div>
            </div>
            <div className={`flex items-center gap-1 text-sm font-medium shrink-0 ${qtdVencidos > 0 ? "text-red-700" : "text-orange-700"} group-hover:gap-2 transition-all`}>
              Ver vales
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </Link>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral do sistema de vales LOG20
        </p>
      </div>

      {/* Stats Cards — 6 cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statsCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium leading-tight">
                  {stat.title}
                </CardTitle>
                <div className={`p-1.5 rounded-full ${stat.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`font-bold ${stat.isText ? "text-lg" : "text-2xl"}`}>
                  {stat.value}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/importar">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Importar Planilha
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/vales">
            <ClipboardList className="h-4 w-4 mr-2" />
            Ver Todos os Vales
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/ajudantes">
            <Users className="h-4 w-4 mr-2" />
            Gerenciar Ajudantes
          </Link>
        </Button>
      </div>

      {/* Charts */}
      <DashboardCharts
        monthlyData={monthlyData}
        dailyData={dailyData}
        valorAbonado={stats.valorTotalAbonado}
        valorFaturado={stats.valorTotalFaturado}
        valorPendente={stats.valorTotalPendente}
      />

      {/* Resumo por Status — horizontal stacked bar */}
      {stats.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumo por Status</CardTitle>
            <CardDescription>Distribuição proporcional de todos os vales</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stacked bar */}
            <div className="flex h-8 w-full overflow-hidden rounded-lg border">
              {pctAbonados > 0 && (
                <div
                  className="bg-green-500 flex items-center justify-center text-white text-xs font-semibold"
                  style={{ width: `${pctAbonados}%` }}
                  title={`Abonados: ${stats.abonados} (${pctAbonados}%)`}
                >
                  {pctAbonados >= 8 ? `${pctAbonados}%` : ""}
                </div>
              )}
              {pctFaturados > 0 && (
                <div
                  className="bg-red-500 flex items-center justify-center text-white text-xs font-semibold"
                  style={{ width: `${pctFaturados}%` }}
                  title={`Faturados: ${stats.faturados} (${pctFaturados}%)`}
                >
                  {pctFaturados >= 8 ? `${pctFaturados}%` : ""}
                </div>
              )}
              {pctFaturar > 0 && (
                <div
                  className="bg-orange-400 flex items-center justify-center text-white text-xs font-semibold"
                  style={{ width: `${pctFaturar}%` }}
                  title={`Faturar: ${stats.faturar} (${pctFaturar}%)`}
                >
                  {pctFaturar >= 8 ? `${pctFaturar}%` : ""}
                </div>
              )}
              {pctSemAcao > 0 && (
                <div
                  className="bg-gray-300 flex items-center justify-center text-gray-700 text-xs font-semibold"
                  style={{ width: `${pctSemAcao}%` }}
                  title={`Sem Ação: ${stats.semAcao} (${pctSemAcao}%)`}
                >
                  {pctSemAcao >= 8 ? `${pctSemAcao}%` : ""}
                </div>
              )}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-green-500" />
                <span className="font-medium text-green-700">Abonados</span>
                <span className="text-muted-foreground">— {stats.abonados} ({pctAbonados}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500" />
                <span className="font-medium text-red-700">Faturados</span>
                <span className="text-muted-foreground">— {stats.faturados} ({pctFaturados}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-orange-400" />
                <span className="font-medium text-orange-700">Faturar</span>
                <span className="text-muted-foreground">— {stats.faturar} ({pctFaturar}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-gray-300" />
                <span className="font-medium text-gray-600">Sem Ação</span>
                <span className="text-muted-foreground">— {stats.semAcao} ({pctSemAcao}%)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-column layout: Top Pendentes + Vales Recentes */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Ajudantes com Vales Pendentes */}
        <Card>
          <CardHeader>
            <CardTitle>Top Ajudantes com Vales Pendentes</CardTitle>
            <CardDescription>
              Ajudantes com maior número de vales sem resolução
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topPendentes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="h-10 w-10 text-green-500 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Nenhum ajudante com vales pendentes.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ajudante</TableHead>
                    <TableHead className="text-center">Pend.</TableHead>
                    <TableHead className="text-right">Valor em Risco</TableHead>
                    <TableHead className="text-center">Tel.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topPendentes.map((aj) => (
                    <TableRow key={aj.id}>
                      <TableCell>
                        <Link
                          href={`/vales?ajudante=${aj.id}`}
                          className="font-medium text-sm hover:underline text-primary"
                        >
                          {aj.nome}
                        </Link>
                        <div className="text-xs text-muted-foreground font-mono">
                          {aj.codigo}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="warning">{aj.pendentes}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(aj.valorTotal)}
                      </TableCell>
                      <TableCell className="text-center">
                        {aj.telefone ? (
                          <Badge variant="success">Sim</Badge>
                        ) : (
                          <Badge variant="gray">Não</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Vales Recentes */}
        <Card>
          <CardHeader>
            <CardTitle>Vales Recentes</CardTitle>
            <CardDescription>Últimos 10 vales importados</CardDescription>
          </CardHeader>
          <CardContent>
            {recentVales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  Nenhum vale cadastrado ainda.
                </p>
                <Button asChild size="sm">
                  <Link href="/importar">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Importar Planilha
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vale #</TableHead>
                    <TableHead>Ajudante(s)</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentVales.map((vale) => (
                    <TableRow key={vale.id}>
                      <TableCell className="font-medium">
                        <div>#{vale.numero_vale}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateBR(vale.data_emissao)}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <div className="truncate text-sm">
                          {vale.ajudanteNomes.join(", ") || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCurrency(vale.valor_total ?? 0)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(vale.status_vale)}>
                          {vale.status_vale || "Sem Ação"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Histórico por Ajudante */}
      {ajudantesComVales.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico por Ajudante</CardTitle>
            <CardDescription>
              Todos os ajudantes com vales cadastrados e seu histórico completo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ajudante</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Abonados</TableHead>
                  <TableHead className="text-center">Faturados</TableHead>
                  <TableHead className="text-center">Pendentes</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ajudantesComVales.map((aj) => (
                  <TableRow key={aj.id}>
                    <TableCell>
                      <Link
                        href={`/vales?ajudante=${aj.id}`}
                        className="font-medium hover:underline text-primary"
                      >
                        {aj.nome}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {aj.codigo}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-semibold">{aj.totalVales}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      {aj.abonados > 0 ? (
                        <span className="inline-flex items-center justify-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 min-w-[24px]">
                          {aj.abonados}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {aj.faturados > 0 ? (
                        <span className="inline-flex items-center justify-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 min-w-[24px]">
                          {aj.faturados}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {aj.pendentes > 0 ? (
                        <span className="inline-flex items-center justify-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800 min-w-[24px]">
                          {aj.pendentes}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatCurrency(aj.valorTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
