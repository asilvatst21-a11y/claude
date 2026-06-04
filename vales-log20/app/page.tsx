import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { formatCurrency, formatDateBR } from "@/lib/utils";
import type { ValeComAjudantes, StatusVale } from "@/lib/types";

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

async function getDashboardData() {
  try {
    const supabase = await createClient();

    // Get vale counts by status
    const { data: vales, error } = await supabase
      .from("vales")
      .select(
        `
        id,
        numero_vale,
        data_emissao,
        status_vale,
        acao_transportadora,
        valor_total,
        notificacao_pendente_enviada,
        vale_ajudantes (
          ajudantes (
            id,
            codigo,
            nome,
            telefone
          )
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    const allVales = vales ?? [];

    const totalVales = allVales.length;
    const pendentes = allVales.filter(
      (v) => v.status_vale === "Sem Ação" || v.status_vale === "Faturar"
    ).length;
    const abonados = allVales.filter((v) => v.status_vale === "Abonado").length;
    const faturados = allVales.filter(
      (v) => v.status_vale === "Faturado"
    ).length;

    // Get total counts from DB
    const { count: totalCount } = await supabase
      .from("vales")
      .select("id", { count: "exact", head: true });

    const { count: pendentesCount } = await supabase
      .from("vales")
      .select("id", { count: "exact", head: true })
      .in("status_vale", ["Sem Ação", "Faturar"]);

    const { count: abonadosCount } = await supabase
      .from("vales")
      .select("id", { count: "exact", head: true })
      .eq("status_vale", "Abonado");

    const { count: faturadosCount } = await supabase
      .from("vales")
      .select("id", { count: "exact", head: true })
      .eq("status_vale", "Faturado");

    return {
      stats: {
        total: totalCount ?? 0,
        pendentes: pendentesCount ?? 0,
        abonados: abonadosCount ?? 0,
        faturados: faturadosCount ?? 0,
      },
      recentVales: allVales,
    };
  } catch {
    return {
      stats: { total: 0, pendentes: 0, abonados: 0, faturados: 0 },
      recentVales: [],
    };
  }
}

export default async function DashboardPage() {
  const { stats, recentVales } = await getDashboardData();

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
      description: "Vales faturados",
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral do sistema de vales LOG20
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-full ${stat.bg}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
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
          <Link href="/ajudantes">
            <Users className="h-4 w-4 mr-2" />
            Gerenciar Ajudantes
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/vales">
            <ClipboardList className="h-4 w-4 mr-2" />
            Ver Todos os Vales
          </Link>
        </Button>
      </div>

      {/* Recent Vales */}
      <Card>
        <CardHeader>
          <CardTitle>Vales Recentes</CardTitle>
          <CardDescription>
            Últimos vales importados no sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentVales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">
                Nenhum vale cadastrado
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Importe uma planilha para começar.
              </p>
              <Button asChild>
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
                  <TableHead>Data Emissão</TableHead>
                  <TableHead>Ajudante(s)</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentVales.map((vale) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const ajudantes = (vale.vale_ajudantes as any[])
                    ?.map((va) => va.ajudantes?.nome)
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <TableRow key={vale.id}>
                      <TableCell className="font-medium">
                        #{vale.numero_vale}
                      </TableCell>
                      <TableCell>
                        {formatDateBR(vale.data_emissao)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {ajudantes || "-"}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(vale.valor_total ?? 0)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getStatusBadgeVariant(vale.status_vale)}
                        >
                          {vale.status_vale || "Sem Ação"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
