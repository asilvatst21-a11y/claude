import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, LabelList,
} from 'recharts'
import { Timer, TrendingDown, CheckCircle2, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { SALA_TML_LABEL, type SalaTML, DESLOCAMENTO_IDEAL_MIN, DESLOCAMENTO_ESTOURO_MIN } from '../lib/tml'

const TOOLTIP_STYLE = { borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function primeiroDiaDoMesISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

interface LinhaChecklist {
  id: string
  sala: SalaTML | null
  matricula: number | null
  nome: string | null
  data: string | null
  horario_inicio: string | null
  tempo_deslocamento_minutos: number | null
  motivo: string | null
}

function Card({
  icon: Icon, label, value, hint, accent = 'text-accent-600 bg-accent/40',
}: { icon: typeof Timer; label: string; value: string; hint?: string; accent?: string }) {
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

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>}
      {children}
    </div>
  )
}

export default function DistribuicaoTMLDeslocamento() {
  const { usuario } = useAuth()
  const [de, setDe] = useState(primeiroDiaDoMesISO())
  const [ate, setAte] = useState(hojeISO())
  const [sala, setSala] = useState<SalaTML | 'TODAS'>('TODAS')

  const [checklist, setChecklist] = useState<LinhaChecklist[]>([])
  const [loading, setLoading] = useState(true)
  const [salvandoMotivo, setSalvandoMotivo] = useState<string | null>(null)
  const [rascunhoMotivo, setRascunhoMotivo] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const { data: chk } = await supabase
      .from('checklist_tml')
      .select('id, sala, matricula, nome, data, horario_inicio, tempo_deslocamento_minutos, motivo')
      .eq('filial', usuario.filial)
      .gte('data', de)
      .lte('data', ate)
      .limit(5000)
    setChecklist(Array.isArray(chk) ? chk : [])
    setLoading(false)
  }, [usuario, de, ate])

  useEffect(() => { carregar() }, [carregar])

  const checklistFiltrado = useMemo(
    () => (sala === 'TODAS' ? checklist : checklist.filter((c) => c.sala === sala)),
    [checklist, sala]
  )

  const comDeslocamento = checklistFiltrado.filter((c) => c.tempo_deslocamento_minutos != null)
  const tempoDeslocamentoMedioGeral = comDeslocamento.length > 0
    ? comDeslocamento.reduce((acc, c) => acc + (c.tempo_deslocamento_minutos ?? 0), 0) / comDeslocamento.length
    : 0
  const antesMatinalGeral = comDeslocamento.filter((c) => (c.tempo_deslocamento_minutos ?? 0) < 0).length
  const pctAntesMatinalGeral = comDeslocamento.length > 0 ? (antesMatinalGeral / comDeslocamento.length) * 100 : 0
  const estouroGatilhoGeral = comDeslocamento.filter((c) => (c.tempo_deslocamento_minutos ?? 0) > DESLOCAMENTO_ESTOURO_MIN).length
  const pctEstouroGatilhoGeral = comDeslocamento.length > 0 ? (estouroGatilhoGeral / comDeslocamento.length) * 100 : 0

  function corDeslocamento(min: number): string {
    if (min > DESLOCAMENTO_ESTOURO_MIN) return 'text-red-700'
    if (min > DESLOCAMENTO_IDEAL_MIN) return 'text-amber-700'
    return 'text-green-700'
  }

  const porSalaDeslocamento = useMemo(() => {
    const mapa = new Map<string, { sala: string; soma: number; n: number; antesMatinal: number }>()
    for (const c of checklistFiltrado) {
      if (!c.sala || c.tempo_deslocamento_minutos == null) continue
      const k = mapa.get(c.sala) ?? { sala: c.sala, soma: 0, n: 0, antesMatinal: 0 }
      k.soma += c.tempo_deslocamento_minutos
      k.n++
      if (c.tempo_deslocamento_minutos < 0) k.antesMatinal++
      mapa.set(c.sala, k)
    }
    return [...mapa.values()].map((k) => ({
      sala: SALA_TML_LABEL[k.sala as SalaTML] ?? k.sala,
      tempoMedio: k.n > 0 ? Math.round(k.soma / k.n) : 0,
      pctAntesMatinal: k.n > 0 ? Math.round((k.antesMatinal / k.n) * 1000) / 10 : 0,
    }))
  }, [checklistFiltrado])

  const porMotoristaDeslocamento = useMemo(() => {
    const mapa = new Map<string, { nome: string; matricula: number | null; soma: number; n: number }>()
    for (const c of checklistFiltrado) {
      if (c.tempo_deslocamento_minutos == null) continue
      const chave = c.matricula != null ? String(c.matricula) : `s/matricula:${c.nome}`
      const k = mapa.get(chave) ?? { nome: c.nome ?? '—', matricula: c.matricula, soma: 0, n: 0 }
      k.soma += c.tempo_deslocamento_minutos
      k.n++
      mapa.set(chave, k)
    }
    return [...mapa.values()]
      .map((k) => ({ ...k, tempoMedio: k.n > 0 ? Math.round(k.soma / k.n) : 0 }))
      .sort((a, b) => b.tempoMedio - a.tempoMedio)
      .slice(0, 10)
  }, [checklistFiltrado])

  const ocorrenciasMaisDemoradas = useMemo(
    () => [...comDeslocamento].sort((a, b) => (b.tempo_deslocamento_minutos ?? 0) - (a.tempo_deslocamento_minutos ?? 0)).slice(0, 20),
    [comDeslocamento]
  )
  const ocorrenciasAntesMatinal = useMemo(
    () => comDeslocamento.filter((c) => (c.tempo_deslocamento_minutos ?? 0) < 0).sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '')),
    [comDeslocamento]
  )

  async function salvarMotivo(id: string) {
    const motivo = (rascunhoMotivo[id] ?? '').trim()
    setSalvandoMotivo(id)
    const { error } = await supabase.from('checklist_tml').update({ motivo: motivo || null }).eq('id', id)
    if (!error) {
      setChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, motivo: motivo || null } : c)))
    }
    setSalvandoMotivo(null)
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Timer className="h-6 w-6 text-primary" /> Tempo de Deslocamento
        </h1>
        <p className="text-sm text-muted-foreground">
          Horário em que o motorista iniciou o checklist menos o horário real de fim da matinal (registrado no Timer da Matinal).
          Ideal: até {DESLOCAMENTO_IDEAL_MIN} min. Estouro de gatilho: acima de {DESLOCAMENTO_ESTOURO_MIN} min.
        </p>
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
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card icon={Timer} label="Tempo médio de deslocamento" value={`${tempoDeslocamentoMedioGeral.toFixed(0)} min`} accent="text-cyan-600 bg-cyan-50" />
            <Card icon={AlertTriangle} label="Estouro de gatilho" value={`${estouroGatilhoGeral} (${pctEstouroGatilhoGeral.toFixed(1)}%)`} hint={`deslocamento acima de ${DESLOCAMENTO_ESTOURO_MIN} min`} accent="text-red-600 bg-red-50" />
            <Card icon={TrendingDown} label="Iniciaram antes da matinal" value={`${antesMatinalGeral} (${pctAntesMatinalGeral.toFixed(1)}%)`} hint="checklist começou antes do turno" accent="text-amber-600 bg-amber-50" />
            <Card icon={CheckCircle2} label="Registros de checklist" value={String(comDeslocamento.length)} accent="text-blue-600 bg-blue-50" />
          </div>

          <ChartCard title="Tempo médio de deslocamento e % de início antes da matinal por sala">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={porSalaDeslocamento} margin={{ top: 20 }}>
                <defs>
                  <linearGradient id="gradTempoDeslocamentoSala" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0891b2" stopOpacity={1} />
                    <stop offset="100%" stopColor="#0891b2" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="sala" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="min" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="min" dataKey="tempoMedio" name="Tempo médio de deslocamento (min)" fill="url(#gradTempoDeslocamentoSala)" radius={[8, 8, 0, 0]} barSize={40}>
                  <LabelList dataKey="tempoMedio" position="top" style={{ fontSize: 11, fill: '#0891b2', fontWeight: 600 }} />
                </Bar>
                <Line yAxisId="pct" type="monotone" dataKey="pctAntesMatinal" name="% antes da matinal" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }}>
                  <LabelList dataKey="pctAntesMatinal" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 11, fill: '#f59e0b', fontWeight: 600 }} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="border rounded-xl bg-white shadow-sm">
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-semibold">Top 10 motoristas com maior tempo de deslocamento</h2>
              <p className="text-xs text-muted-foreground">Tempo meta de início ainda não definido — ranking apenas por tempo médio</p>
            </div>
            {porMotoristaDeslocamento.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum registro de checklist no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                    <th className="py-2 px-4">Motorista</th>
                    <th className="py-2 px-4">Matrícula</th>
                    <th className="py-2 px-4 text-right">Registros</th>
                    <th className="py-2 px-4 text-right">Tempo médio (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {porMotoristaDeslocamento.map((m) => (
                    <tr key={`${m.matricula}-${m.nome}`} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 px-4">{m.nome}</td>
                      <td className="py-2 px-4">{m.matricula ?? '—'}</td>
                      <td className="py-2 px-4 text-right">{m.n}</td>
                      <td className="py-2 px-4 text-right font-semibold text-cyan-700">{m.tempoMedio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="border rounded-xl bg-white shadow-sm">
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-semibold">Ocorrências com maior tempo de deslocamento</h2>
              <p className="text-xs text-muted-foreground">Cadastre o motivo de quem levou mais tempo pra iniciar o checklist</p>
            </div>
            {ocorrenciasMaisDemoradas.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum registro de checklist no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                    <th className="py-2 px-4">Data</th>
                    <th className="py-2 px-4">Motorista</th>
                    <th className="py-2 px-4">Sala</th>
                    <th className="py-2 px-4">Início checklist</th>
                    <th className="py-2 px-4 text-right">Deslocamento (min)</th>
                    <th className="py-2 px-4">Motivo</th>
                    <th className="py-2 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {ocorrenciasMaisDemoradas.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 px-4 whitespace-nowrap">{c.data ? c.data.slice(8, 10) + '/' + c.data.slice(5, 7) : '—'}</td>
                      <td className="py-2 px-4">{c.nome ?? '—'}</td>
                      <td className="py-2 px-4 whitespace-nowrap">{c.sala ? SALA_TML_LABEL[c.sala] : '—'}</td>
                      <td className="py-2 px-4">{c.horario_inicio ?? '—'}</td>
                      <td className={`py-2 px-4 text-right font-semibold ${corDeslocamento(c.tempo_deslocamento_minutos ?? 0)}`}>
                        {c.tempo_deslocamento_minutos}
                        {(c.tempo_deslocamento_minutos ?? 0) > DESLOCAMENTO_ESTOURO_MIN && (
                          <span className="ml-1 text-[10px] font-bold uppercase">estouro</span>
                        )}
                      </td>
                      <td className="py-2 px-4">
                        <input
                          value={rascunhoMotivo[c.id] ?? c.motivo ?? ''}
                          onChange={(e) => setRascunhoMotivo((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          placeholder="Motivo…"
                          className="w-full border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <button
                          onClick={() => salvarMotivo(c.id)}
                          disabled={salvandoMotivo === c.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border hover:bg-accent transition-colors disabled:opacity-50"
                        >
                          {salvandoMotivo === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Salvar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {ocorrenciasAntesMatinal.length > 0 && (
            <div className="border rounded-xl bg-amber-50 border-amber-200 shadow-sm">
              <div className="px-4 py-3 border-b border-amber-200">
                <h2 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Colaboradores que iniciaram o checklist antes da matinal
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-amber-700 border-b border-amber-200">
                    <th className="py-2 px-4">Data</th>
                    <th className="py-2 px-4">Motorista</th>
                    <th className="py-2 px-4">Sala</th>
                    <th className="py-2 px-4">Início checklist</th>
                    <th className="py-2 px-4 text-right">Antes da matinal (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {ocorrenciasAntesMatinal.map((c) => (
                    <tr key={c.id} className="border-b border-amber-200 last:border-0">
                      <td className="py-2 px-4 whitespace-nowrap">{c.data ? c.data.slice(8, 10) + '/' + c.data.slice(5, 7) : '—'}</td>
                      <td className="py-2 px-4">{c.nome ?? '—'}</td>
                      <td className="py-2 px-4 whitespace-nowrap">{c.sala ? SALA_TML_LABEL[c.sala] : '—'}</td>
                      <td className="py-2 px-4">{c.horario_inicio ?? '—'}</td>
                      <td className="py-2 px-4 text-right font-semibold text-amber-800">{Math.abs(c.tempo_deslocamento_minutos ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
