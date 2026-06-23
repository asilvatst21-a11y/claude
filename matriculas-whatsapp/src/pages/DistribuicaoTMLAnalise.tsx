import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { BarChart2, AlertTriangle, CheckCircle2, Clock, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { SALA_TML_LABEL, type SalaTML } from '../lib/tml'

const CORES = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d']

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
  atraso_minutos: number | null
  resultado: 'no_prazo' | 'atrasado' | 'indefinido'
}

interface LinhaAlerta {
  sala: SalaTML
  justificativa: string | null
  status: string
}

function Card({ icon: Icon, label, value, hint }: { icon: typeof BarChart2; label: string; value: string; hint?: string }) {
  return (
    <div className="border rounded-lg bg-white p-4 flex items-start gap-3">
      <div className="h-9 w-9 rounded-lg bg-accent/40 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-accent-600" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold leading-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
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
        .select('sala, matricula, nome, data_saida, atraso_minutos, resultado')
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

  // ── Cards de resumo ──────────────────────────────────────────────────────
  const totalSaidas = historicoFiltrado.length
  const totalPerdidos = historicoFiltrado.filter((h) => h.resultado === 'atrasado').length
  const pctPerdido = totalSaidas > 0 ? (totalPerdidos / totalSaidas) * 100 : 0
  const atrasados = historicoFiltrado.filter((h) => h.resultado === 'atrasado' && h.atraso_minutos != null)
  const atrasoMedio = atrasados.length > 0
    ? atrasados.reduce((acc, h) => acc + (h.atraso_minutos ?? 0), 0) / atrasados.length
    : 0
  const totalJustificados = alertasFiltrados.filter((a) => a.status === 'justificado').length
  const pctJustificado = totalPerdidos > 0 ? (totalJustificados / totalPerdidos) * 100 : 0

  // ── Ranking por sala ──────────────────────────────────────────────────────
  const porSala = useMemo(() => {
    const mapa = new Map<string, { sala: string; saidas: number; perdidos: number; somaAtraso: number; nAtraso: number }>()
    for (const h of historicoFiltrado) {
      if (!h.sala) continue
      const k = mapa.get(h.sala) ?? { sala: h.sala, saidas: 0, perdidos: 0, somaAtraso: 0, nAtraso: 0 }
      k.saidas++
      if (h.resultado === 'atrasado') {
        k.perdidos++
        k.somaAtraso += h.atraso_minutos ?? 0
        k.nAtraso++
      }
      mapa.set(h.sala, k)
    }
    return [...mapa.values()].map((k) => ({
      sala: SALA_TML_LABEL[k.sala as SalaTML] ?? k.sala,
      saidas: k.saidas,
      perdidos: k.perdidos,
      pct: k.saidas > 0 ? Math.round((k.perdidos / k.saidas) * 1000) / 10 : 0,
      atrasoMedio: k.nAtraso > 0 ? Math.round(k.somaAtraso / k.nAtraso) : 0,
    }))
  }, [historicoFiltrado])

  // ── Ranking de motoristas (reincidência) ────────────────────────────────
  const porMotorista = useMemo(() => {
    const mapa = new Map<string, { nome: string; matricula: number | null; perdidos: number }>()
    for (const h of historicoFiltrado) {
      if (h.resultado !== 'atrasado') continue
      const chave = h.matricula != null ? String(h.matricula) : `s/matricula:${h.nome}`
      const k = mapa.get(chave) ?? { nome: h.nome ?? '—', matricula: h.matricula, perdidos: 0 }
      k.perdidos++
      mapa.set(chave, k)
    }
    return [...mapa.values()].sort((a, b) => b.perdidos - a.perdidos).slice(0, 10)
  }, [historicoFiltrado])

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

  // ── Tendência temporal (por dia) ────────────────────────────────────────
  const porDia = useMemo(() => {
    const mapa = new Map<string, { dia: string; saidas: number; perdidos: number }>()
    for (const h of historicoFiltrado) {
      if (!h.data_saida) continue
      const k = mapa.get(h.data_saida) ?? { dia: h.data_saida, saidas: 0, perdidos: 0 }
      k.saidas++
      if (h.resultado === 'atrasado') k.perdidos++
      mapa.set(h.data_saida, k)
    }
    return [...mapa.values()]
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map((k) => ({
        dia: k.dia.slice(5).split('-').reverse().join('/'),
        saidas: k.saidas,
        perdidos: k.perdidos,
        pct: k.saidas > 0 ? Math.round((k.perdidos / k.saidas) * 1000) / 10 : 0,
      }))
  }, [historicoFiltrado])

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <BarChart2 className="h-6 w-6 text-primary" /> Análise de TML
        </h1>
        <p className="text-sm text-muted-foreground">Acumulado de TMLs perdidos, ranking por sala, motorista e motivo.</p>
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
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card icon={CheckCircle2} label="Saídas no período" value={String(totalSaidas)} />
            <Card icon={AlertTriangle} label="TMLs perdidos" value={`${totalPerdidos} (${pctPerdido.toFixed(1)}%)`} />
            <Card icon={Clock} label="Atraso médio" value={`${atrasoMedio.toFixed(0)} min`} hint="apenas TMLs perdidos" />
            <Card icon={Users} label="Justificados" value={`${totalJustificados} (${pctJustificado.toFixed(0)}%)`} hint="do total de TMLs perdidos" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="border rounded-lg bg-white p-4">
              <h2 className="text-sm font-semibold mb-3">TMLs perdidos por sala</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={porSala}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sala" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="perdidos" name="Perdidos" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saidas" name="Saídas" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                {porSala.map((s) => (
                  <p key={s.sala}>{s.sala}: {s.pct}% perdido · atraso médio {s.atrasoMedio} min</p>
                ))}
              </div>
            </div>

            <div className="border rounded-lg bg-white p-4">
              <h2 className="text-sm font-semibold mb-3">Distribuição por motivo</h2>
              {porMotivo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma justificativa registrada no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={porMotivo} dataKey="total" nameKey="motivo" cx="50%" cy="50%" outerRadius={85} label={(p) => `${p.total}`}>
                      {porMotivo.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="border rounded-lg bg-white p-4">
            <h2 className="text-sm font-semibold mb-3">Tendência de TMLs perdidos por dia</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={porDia}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dia" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="perdidos" name="TMLs perdidos" stroke="#dc2626" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="pct" name="% perdido" stroke="#d97706" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="border rounded-lg bg-white p-4">
            <h2 className="text-sm font-semibold mb-3">Top 10 motoristas com mais TML perdido</h2>
            {porMotorista.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum TML perdido no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-1.5 pr-2">Motorista</th>
                    <th className="py-1.5 pr-2">Matrícula</th>
                    <th className="py-1.5 pr-2 text-right">TMLs perdidos</th>
                  </tr>
                </thead>
                <tbody>
                  {porMotorista.map((m) => (
                    <tr key={`${m.matricula}-${m.nome}`} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">{m.nome}</td>
                      <td className="py-1.5 pr-2">{m.matricula ?? '—'}</td>
                      <td className="py-1.5 pr-2 text-right font-semibold">{m.perdidos}</td>
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
