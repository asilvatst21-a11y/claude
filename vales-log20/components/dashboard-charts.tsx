"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export interface MonthlyData {
  month: string;
  label: string;
  total: number;
  abonados: number;
  faturados: number;
  faturar: number;
  semAcao: number;
  valorAbonado: number;
  valorFaturado: number;
}

export interface DailyData {
  day: string;
  label: string;
  month: string;
  total: number;
  abonados: number;
  faturados: number;
}

interface Props {
  monthlyData: MonthlyData[];
  dailyData: DailyData[];
  valorAbonado: number;
  valorFaturado: number;
  valorPendente: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function VolumeTooltip({ active, payload, label, isDrilled }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white p-3 shadow-md text-xs space-y-1 min-w-[140px]">
      <p className="font-semibold text-sm mb-2">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="tabular-nums font-semibold">{p.value}</span>
        </div>
      ))}
      {!isDrilled && (
        <p className="text-muted-foreground mt-2 pt-1 border-t">Clique para ver por dia</p>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ValorTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white p-3 shadow-md text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold text-sm mb-2">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="tabular-nums font-semibold">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border bg-white p-3 shadow-md text-xs min-w-[160px]">
      <p className="font-semibold text-sm mb-1">{item.name}</p>
      <p className="tabular-nums">{formatCurrency(item.value)}</p>
    </div>
  );
}

const PIE_COLORS = ["#22c55e", "#ef4444", "#f97316", "#94a3b8"];

export function DashboardCharts({ monthlyData, dailyData, valorAbonado, valorFaturado, valorPendente }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeData: any[] = selectedMonth
    ? dailyData.filter((d) => d.month === selectedMonth)
    : monthlyData;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleVolumeClick = (data: any) => {
    if (!selectedMonth && data?.activePayload?.[0]?.payload?.month) {
      setSelectedMonth(data.activePayload[0].payload.month);
    }
  };

  const selectedMonthLabel = selectedMonth
    ? monthlyData.find((m) => m.month === selectedMonth)?.label ?? selectedMonth
    : null;

  const pieData = [
    { name: "Abonado", value: valorAbonado },
    { name: "Faturado", value: valorFaturado },
    { name: "Pendente", value: valorPendente },
  ].filter((d) => d.value > 0);

  const hasData = monthlyData.length > 0;

  if (!hasData) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground mb-3 opacity-30" />
          <p className="text-muted-foreground">Importe uma planilha para ver os gráficos de análise.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Chart 1 — Volume de Vales (drill-down) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle>Volume de Vales por Período</CardTitle>
              <CardDescription>
                {selectedMonth
                  ? `Detalhe diário — ${selectedMonthLabel}`
                  : "Quantidade emitida por mês · clique num ponto para ver o detalhe diário"}
              </CardDescription>
            </div>
            {selectedMonth && (
              <Button variant="outline" size="sm" onClick={() => setSelectedMonth(null)} className="gap-1">
                <ChevronLeft className="h-4 w-4" />
                Voltar para meses
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={volumeData}
              onClick={handleVolumeClick}
              style={{ cursor: selectedMonth ? "default" : "pointer" }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={30}
              />
              <Tooltip content={<VolumeTooltip isDrilled={!!selectedMonth} />} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                formatter={(value) => <span style={{ color: "#555" }}>{value}</span>}
              />
              <Line
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#6366f1" }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="abonados"
                name="Abonados"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="faturados"
                name="Faturados"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Charts 2 & 3 — side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart 2 — Valor Abonado vs Faturado por mês */}
        <Card>
          <CardHeader>
            <CardTitle>Valor Abonado vs Faturado</CardTitle>
            <CardDescription>Comparativo mensal em R$</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} barGap={2} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tickFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <Tooltip content={<ValorTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  formatter={(value) => <span style={{ color: "#555" }}>{value}</span>}
                />
                <Bar dataKey="valorAbonado" name="Abonado" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="valorFaturado" name="Faturado" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart 3 — Distribuição de valor por status (Pie) */}
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Valor por Status</CardTitle>
            <CardDescription>Percentual do valor total acumulado</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3">
                  {pieData.map((entry, i) => {
                    const total = pieData.reduce((s, d) => s + d.value, 0);
                    const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                    return (
                      <div key={entry.name}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className="w-3 h-3 rounded-sm shrink-0"
                            style={{ backgroundColor: PIE_COLORS[i] }}
                          />
                          <span className="text-sm font-medium">{entry.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground pl-5">
                          {formatCurrency(entry.value)} · {pct}%
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[240px] text-muted-foreground text-sm">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
