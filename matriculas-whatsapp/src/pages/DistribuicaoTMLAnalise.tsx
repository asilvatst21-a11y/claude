import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, LabelList,
} from 'recharts'
import { BarChart2, AlertTriangle, CheckCircle2, Clock, Users, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { SALA_TML_LABEL, REGRAS_TML, horarioParaMinutos, type SalaTML } from '../lib/tml'

const CORES = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d']
const TOOLTIP_STYLE = { borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function primeiroDiaDoMesISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

interface LinhaHistorico {
  sala: SalaTML | null
  matricula: number | null
  nome: string | null
  data_saida: string | null
  horario_saida: string | null
  atraso_minutos: number | null
  resultado: 'no_prazo' | 'atrasado' | 'indefinido' | 'invalido'
}

// Tempo decorrido desde o horário matinal da sala até a saída real do carro.
function tempoSaidaMinutos(h: LinhaHistorico): number | null {
  if (!h.sala || !h.horario_saida) return null
  return horarioParaMinutos(h.horario_saida) - horarioParaMinutos(REGRAS_TML[h.sala].matinal)
}

interface LinhaAlerta {
  sala: SalaTML
  justificativa: string | null
  status: string
}

function Card({
  icon: Icon, label, value, hint, accent = 'text-accent-600 bg-accent/40',
}: { icon: typeof BarChart2; label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="border rounded-xl bg-white p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold leading-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-l-4 border-accent-500 pl-3">
      <h2 className="text-base font-bold">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>}
      {children}
    </div>
  )
}

export default function DistribuicaoTMLAnalise() {
  const { usuario } = useAuth()
  const [de, setDe] = useState(primeiroDiaDoMesISO())
  const [ate, setAte] = useState(hojeISO())
  const [sala, setSala] = useState<SalaTML | 'TODAS'>('TODAS')

  const [historico, setHistorico] = useState<LinhaHistorico[]>([])
  const [alertas, setAlertas] = useState<LinhaAlerta[]>([])
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const [{ data: hist }, { data: al }] = await Promise.all([
      supabase
        .from('historico_tml')
        .select('sala, matricula, nome, data_saida, horario_saida, atraso_minutos, resultado')
        .eq('filial', usuario.filial)
        .gte('data_saida', de)
        .lte('data_saida', ate)
        .limit(5000),
      supabase
        .from('alertas_tml')
        .select('sala, justificativa, status')
        .eq('filial', usuario.filial)
        .gte('created_at', de)
        .lte('created_at', `${ate}T23:59:59`)
        .limit(5000),
    ])
    setHistorico(Array.isArray(hist) ? hist : [])
    setAlertas(Array.isArray(al) ? al : [])
    setLoading(false)
  }, [usuario, de, ate])

  useEffect(() => { carregar() }, [carregar])

  const historicoFiltrado = useMemo(
    () => (sala === 'TODAS' ? historico : historico.filter((h) => h.sala === sala)),
    [historico, sala]
  )
  const alertasFiltrados = useMemo(
    () => (sala === 'TODAS' ? alertas : alertas.filter((a) => a.sala === sala)),
    [alertas, sala]
  )

  // Saída antes da matinal é inválida e não entra em nenhuma conta — só fica
  // visível aqui como contador informativo.
  const totalInvalidos = historicoFiltrado.filter((h) => h.resultado === 'invalido').length
  const historicoValido = useMemo(
    () => historicoFiltrado.filter((h) => h.resultado !== 'invalido'),
    [historicoFiltrado]
  )

  // ── Cards de resumo ──────────────────────────────────────────────────────
  const totalSaidas = historicoValido.length
  const totalPerdidos = historicoValido.filter((h) => h.resultado === 'atrasado').length
  const pctPerdido = totalSaidas > 0 ? (totalPerdidos / totalSaidas) * 100 : 0
  const validos = historicoValido.filter((h) => h.resultado === 'no_prazo' || h.resultado === 'atrasado')
  const pctAtingimento = validos.length > 0
    ? (validos.filter((h) => h.resultado === 'no_prazo').length / validos.length) * 100
    : 0
  const totalJustificados = alertasFiltrados.filter((a) => a.status === 'justificado').length
  const pctJustificado = totalPerdidos > 0 ? (totalJustificados / totalPerdidos) * 100 : 0

  // ── Tempo de saída (saída real − horário matinal) e conformidade geral do CDD ──
  const comTempoSaida = historicoValido
    .map((h) => ({ h, t: tempoSaidaMinutos(h) }))
    .filter((x): x is { h: LinhaHistorico; t: number } => x.t != null)
  const tempoSaidaMedioGeral = comTempoSaida.length > 0
    ? comTempoSaida.reduce((acc, x) => acc + x.t, 0) / comTempoSaida.length
    : 0
  const dentroToleranciaGeral = comTempoSaida.filter((x) => x.t <= REGRAS_TML[x.h.sala as SalaTML].toleranciaMin).length
  const pctConformidadeGeral = comTempoSaida.length > 0 ? (dentroToleranciaGeral / comTempoSaida.length) * 100 : 0

  // ── Ranking por sala ──────────────────────────────────────────────────────
  const porSala = useMemo(() => {
    const mapa = new Map<string, { sala: string; saidas: number; perdidos: number; noPrazo: number; somaTempoSaida: number; nTempoSaida: number; dentroTolerancia: number }>()
    for (const h of historicoValido) {
      if (!h.sala) continue
      const k = mapa.get(h.sala) ?? { sala: h.sala, saidas: 0, perdidos: 0, noPrazo: 0, somaTempoSaida: 0, nTempoSaida: 0, dentroTolerancia: 0 }
      k.saidas++
      if (h.resultado === 'atrasado') k.perdidos++
      if (h.resultado === 'no_prazo') k.noPrazo++
      const tempoSaida = tempoSaidaMinutos(h)
      if (tempoSaida != null) {
        k.somaTempoSaida += tempoSaida
        k.nTempoSaida++
        if (tempoSaida <= REGRAS_TML[h.sala].toleranciaMin) k.dentroTolerancia++
      }
      mapa.set(h.sala, k)
    }
    return [...mapa.values()].map((k) => ({
      sala: SALA_TML_LABEL[k.sala as SalaTML] ?? k.sala,
      saidas: k.saidas,
      perdidos: k.perdidos,
      pct: k.saidas > 0 ? Math.round((k.perdidos / k.saidas) * 1000) / 10 : 0,
      pctAtingimento: (k.noPrazo + k.perdidos) > 0 ? Math.round((k.noPrazo / (k.noPrazo + k.perdidos)) * 1000) / 10 : 0,
      tempoSaidaMedio: k.nTempoSaida > 0 ? Math.round(k.somaTempoSaida / k.nTempoSaida) : 0,
      conformidadePct: k.nTempoSaida > 0 ? Math.round((k.dentroTolerancia / k.nTempoSaida) * 1000) / 10 : 0,
    }))
  }, [historicoValido])

  // ── Ranking de motoristas (reincidência + tempo médio em todas as saídas) ──
  const porMotorista = useMemo(() => {
    const mapa = new Map<string, { nome: string; matricula: number | null; saidas: number; perdidos: number; somaTempo: number; nTempo: number }>()
    for (const h of historicoValido) {
      const chave = h.matricula != null ? String(h.matricula) : `s/matricula:${h.nome}`
      const k = mapa.get(chave) ?? { nome: h.nome ?? '—', matricula: h.matricula, saidas: 0, perdidos: 0, somaTempo: 0, nTempo: 0 }
      k.saidas++
      if (h.resultado === 'atrasado') k.perdidos++
      if (h.atraso_minutos != null) { k.somaTempo += h.atraso_minutos; k.nTempo++ }
      mapa.set(chave, k)
    }
    return [...mapa.values()]
      .map((k) => ({ ...k, tempoMedio: k.nTempo > 0 ? Math.round(k.somaTempo / k.nTempo) : 0 }))
      .sort((a, b) => b.perdidos - a.perdidos)
      .slice(0, 10)
  }, [historicoValido])

  // ── Ranking de motivos ───────────────────────────────────────────────────
  const porMotivo = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const a of alertasFiltrados) {
      if (!a.justificativa) continue
      mapa.set(a.justificativa, (mapa.get(a.justificativa) ?? 0) + 1)
    }
    return [...mapa.entries()]
      .map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total)
  }, [alertasFiltrados])

  // ── Tendência temporal (por dia): TML médio + conformidade ─────────────
  const porDia = useMemo(() => {
    const mapa = new Map<string, { dia: string; saidas: number; somaTempoSaida: number; nTempoSaida: number; dentroTolerancia: number }>()
    for (const h of historicoValido) {
      if (!h.data_saida || !h.sala) continue
      const k = mapa.get(h.data_saida) ?? { dia: h.data_saida, saidas: 0, somaTempoSaida: 0, nTempoSaida: 0, dentroTolerancia: 0 }
      k.saidas++
      const tempoSaida = tempoSaidaMinutos(h)
      if (tempoSaida != null) {
        k.somaTempoSaida += tempoSaida
        k.nTempoSaida++
        if (tempoSaida <= REGRAS_TML[h.sala].toleranciaMin) k.dentroTolerancia++
      }
      mapa.set(h.data_saida, k)
    }
    return [...mapa.values()]
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map((k) => ({
        dia: k.dia.slice(5).split('-').reverse().join('/'),
        saidas: k.saidas,
        tempoSaidaMedio: k.nTempoSaida > 0 ? Math.round(k.somaTempoSaida / k.nTempoSaida) : 0,
        conformidadePct: k.nTempoSaida > 0 ? Math.round((k.dentroTolerancia / k.nTempoSaida) * 1000) / 10 : 0,
      }))
  }, [historicoValido])

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" /> Análise de TML
          </h1>
          <p className="text-sm text-muted-foreground">Acumulado de TMLs perdidos e ranking por sala, motorista e motivo.</p>
        </div>
        <Link to="/distribuicao/tml/deslocamento" className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
          <Timer className="h-4 w-4" /> Tempo de Deslocamento
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3 border rounded-lg bg-white p-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">De</label>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Até</label>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Sala</label>
          <select value={sala} onChange={(e) => setSala(e.target.value as SalaTML | 'TODAS')} className="border rounded-md px-2 py-1.5 text-sm">
            <option value="TODAS">Todas</option>
            <option value="COLORADO">{SALA_TML_LABEL.COLORADO}</option>
            <option value="SUB-FURIA">{SALA_TML_LABEL['SUB-FURIA']}</option>
          </select>
        </div>
        {totalInvalidos > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {totalInvalidos} saída(s) inválida(s) (antes da matinal) excluída(s) da análise
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <SectionTitle title="TML — saída na portaria" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card icon={CheckCircle2} label="Saídas no período" value={String(totalSaidas)} accent="text-blue-600 bg-blue-50" />
            <Card icon={AlertTriangle} label="TMLs perdidos" value={`${totalPerdidos} (${pctPerdido.toFixed(1)}%)`} accent="text-red-600 bg-red-50" />
            <Card icon={CheckCircle2} label="% Atingimento do TML" value={`${pctAtingimento.toFixed(1)}%`} accent="text-green-600 bg-green-50" />
            <Card icon={Users} label="Justificados" value={`${totalJustificados} (${pctJustificado.toFixed(0)}%)`} hint="do total de TMLs perdidos" accent="text-violet-600 bg-violet-50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card icon={Clock} label="Tempo médio de saída — Geral CDD" value={`${tempoSaidaMedioGeral.toFixed(0)} min`} hint="saída real − horário matinal, todas as salas" accent="text-cyan-600 bg-cyan-50" />
            <Card icon={CheckCircle2} label="% Conformidade — Geral CDD" value={`${pctConformidadeGeral.toFixed(1)}%`} hint="carros que saíram dentro da tolerância" accent="text-green-600 bg-green-50" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartCard title="TMLs perdidos por sala">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={porSala} barGap={6} margin={{ top: 20 }}>
                  <defs>
                    <linearGradient id="gradPerdidos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="gradSaidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="sala" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="perdidos" name="Perdidos" fill="url(#gradPerdidos)" radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="perdidos" position="top" style={{ fontSize: 11, fill: '#ef4444', fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="saidas" name="Saídas" fill="url(#gradSaidas)" radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="saidas" position="top" style={{ fontSize: 11, fill: '#3b82f6', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                {porSala.map((s) => (
                  <p key={s.sala}>{s.sala}: {s.pct}% perdido</p>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="% de atingimento do TML por sala">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={porSala} barGap={6} margin={{ top: 20 }}>
                  <defs>
                    <linearGradient id="gradAtingimento" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity={1} />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="sala" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="pctAtingimento" name="% Atingimento" fill="url(#gradAtingimento)" radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="pctAtingimento" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 11, fill: '#16a34a', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Tempo médio de saída e % de conformidade por sala"
              subtitle="Saída real − horário matinal · conformidade = dentro da tolerância de cada sala"
            >
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={porSala} margin={{ top: 20 }}>
                  <defs>
                    <linearGradient id="gradTempoSaidaSala" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={1} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="sala" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="min" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="min" dataKey="tempoSaidaMedio" name="Tempo médio de saída (min)" fill="url(#gradTempoSaidaSala)" radius={[8, 8, 0, 0]} barSize={40}>
                    <LabelList dataKey="tempoSaidaMedio" position="top" style={{ fontSize: 11, fill: '#7c3aed', fontWeight: 600 }} />
                  </Bar>
                  <Line yAxisId="pct" type="monotone" dataKey="conformidadePct" name="% Conformidade" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3, fill: '#16a34a' }}>
                    <LabelList dataKey="conformidadePct" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 11, fill: '#16a34a', fontWeight: 600 }} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Distribuição por motivo">
              {porMotivo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma justificativa registrada no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={porMotivo} dataKey="total" nameKey="motivo" cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={2} label={(p) => `${p.total}`}>
                      {porMotivo.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} stroke="#fff" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          <ChartCard
            title="Histórico de TML médio e conformidade por dia"
            subtitle="Barras: tempo médio de saída (min) · Linha: % de conformidade"
          >
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={porDia} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradTempoSaidaDia" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={1} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="min" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="min" dataKey="tempoSaidaMedio" name="Tempo médio de saída (min)" fill="url(#gradTempoSaidaDia)" radius={[8, 8, 0, 0]} barSize={28}>
                  <LabelList dataKey="tempoSaidaMedio" position="top" style={{ fontSize: 11, fill: '#7c3aed', fontWeight: 600 }} />
                </Bar>
                <Line yAxisId="pct" type="monotone" dataKey="conformidadePct" name="% Conformidade" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3, fill: '#16a34a' }}>
                  <LabelList dataKey="conformidadePct" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 11, fill: '#16a34a', fontWeight: 600 }} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="border rounded-xl bg-white shadow-sm">
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-semibold">Top 10 motoristas com mais TML perdido</h2>
            </div>
            {porMotorista.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum TML perdido no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                    <th className="py-2 px-4">Motorista</th>
                    <th className="py-2 px-4">Matrícula</th>
                    <th className="py-2 px-4 text-right">TMLs perdidos</th>
                    <th className="py-2 px-4 text-right">Tempo médio (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {porMotorista.map((m) => (
                    <tr key={`${m.matricula}-${m.nome}`} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 px-4">{m.nome}</td>
                      <td className="py-2 px-4">{m.matricula ?? '—'}</td>
                      <td className="py-2 px-4 text-right font-semibold text-red-600">{m.perdidos}</td>
                      <td className="py-2 px-4 text-right">{m.tempoMedio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
