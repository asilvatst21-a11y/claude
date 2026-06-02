import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid
} from 'recharts'
import {
  Upload, Loader2, Building2, RefreshCw, ChevronDown, ChevronUp,
  FileSearch, Search, Users
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Relato } from '../types'

// ── Classificação styling ─────────────────────────────────────────────────────

function classColor(c: string | null) {
  if (!c) return '#94a3b8'
  if (c.includes('POSITIVA')) return '#22c55e'
  if (c.includes('INSEGURA')) return '#f97316'
  if (c.includes('ATO'))      return '#ef4444'
  if (c.includes('QUASE'))    return '#eab308'
  return '#64748b'
}

function ClassBadge({ value }: { value: string | null }) {
  const css = !value ? 'bg-gray-100 text-gray-500 border-gray-200'
    : value.includes('POSITIVA') ? 'bg-green-100 text-green-800 border-green-300'
    : value.includes('INSEGURA') ? 'bg-orange-100 text-orange-800 border-orange-300'
    : value.includes('ATO')      ? 'bg-red-100 text-red-700 border-red-300'
    : value.includes('QUASE')    ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
    : 'bg-gray-100 text-gray-600 border-gray-200'
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${css}`}>{value || '—'}</span>
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDateStr(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}))?/)
  if (m) { const [, d, mo, y, t] = m; return t ? `${y}-${mo}-${d}T${t}:00` : `${y}-${mo}-${d}` }
  return null
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function weekKey(iso: string) {
  const d = new Date(iso)
  const day = d.getDay()
  const mon = new Date(d)
  mon.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  return mon.toISOString().slice(0, 10)
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function s(v: unknown) { return String(v ?? '').trim() || null }

function parseRelatos(buffer: ArrayBuffer, filial: string) {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { defval: '', raw: false, header: 1 }) as unknown[][]
  return rows.slice(1).filter(r => r[0]).map(r => ({
    filial,
    external_id:       s(r[0]),
    data_ocorrencia:   parseDateStr(r[1]),
    data_cadastro:     parseDateStr(r[2]),
    cdd:               s(r[3]),
    empresa:           s(r[4]),
    matricula:         s(r[5]),
    relator:           s(r[6]),
    funcao:            s(r[7]),
    equipe:            s(r[8]),
    classificacao:     s(r[9]),
    tipo_relato:       s(r[10]),
    area:              s(r[11]),
    atividade:         s(r[12]),
    tarefa_seguranca:  s(r[13]),
    acao_imediata:     s(r[14]),
    sif:               s(r[15]),
    empresa_relatada:  s(r[16]),
    pessoa_relatada:   s(r[17]),
    detalhamento:      s(r[18]),
    complementacao:    s(r[19]),
    origem:            s(r[22]),
    porque_falhou:     s(r[23]),
    pq1: s(r[24]), pq2: s(r[25]), pq3: s(r[26]), pq4: s(r[27]), pq5: s(r[28]),
    motivo1: s(r[29]), acao1: s(r[30]),
    motivo2: s(r[31]), acao2: s(r[32]),
    motivo3: s(r[33]), acao3: s(r[34]),
    data_investigacao: parseDateStr(r[35]),
  }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function topN(data: Relato[], key: keyof Relato, n = 10) {
  const m = new Map<string, number>()
  data.forEach(r => { const v = String(r[key] ?? '').trim(); if (v) m.set(v, (m.get(v) ?? 0) + 1) })
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, total]) => ({ name, total }))
}

const PERIODS = [
  { label: '7 dias',  days: 7   },
  { label: '30 dias', days: 30  },
  { label: '90 dias', days: 90  },
  { label: 'Tudo',    days: 0   },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function Relatos() {
  const { usuario } = useAuth()
  const [data,       setData]       = useState<Relato[]>([])
  const [loading,    setLoading]    = useState(true)
  const [uploading,  setUploading]  = useState(false)
  const [tab,        setTab]        = useState(0)
  const [periodDays, setPeriodDays] = useState(30)
  const [filtroClass,setFiltroClass]= useState('')
  const [filtroArea, setFiltroArea] = useState('')
  const [busca,      setBusca]      = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function carregar() {
    if (!usuario) return
    setLoading(true)
    const { data: rows } = await supabase
      .from('relatos').select('*')
      .eq('filial', usuario.filial)
      .order('data_ocorrencia', { ascending: false })
    setData(rows ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [usuario?.filial])

  const onDrop = useCallback(async (files: File[]) => {
    if (!files[0] || !usuario) return
    setUploading(true)
    const buf = await files[0].arrayBuffer()
    const rows = parseRelatos(buf, usuario.filial)
    for (let i = 0; i < rows.length; i += 100)
      await supabase.from('relatos').upsert(rows.slice(i, i + 100), { onConflict: 'filial,external_id', ignoreDuplicates: false })
    setUploading(false)
    carregar()
  }, [usuario])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: false,
    accept: { 'application/vnd.ms-excel': ['.xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
  })

  // Filtered data
  const filtered = useMemo(() => {
    let d = data
    if (periodDays > 0) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - periodDays)
      d = d.filter(r => r.data_ocorrencia && new Date(r.data_ocorrencia) >= cutoff)
    }
    if (filtroClass) d = d.filter(r => r.classificacao === filtroClass)
    if (filtroArea)  d = d.filter(r => r.area === filtroArea)
    return d
  }, [data, periodDays, filtroClass, filtroArea])

  const classes  = useMemo(() => [...new Set(data.map(r => r.classificacao).filter(Boolean))] as string[], [data])
  const areas    = useMemo(() => [...new Set(data.map(r => r.area).filter(Boolean))] as string[], [data])

  // KPIs
  const total     = filtered.length
  const positivos = filtered.filter(r => r.classificacao?.includes('POSITIVA')).length
  const inseguros = filtered.filter(r => !r.classificacao?.includes('POSITIVA')).length
  const comInvest = filtered.filter(r => r.pq1).length

  // Trend
  const trendData = useMemo(() => {
    const weeks = new Map<string, number>()
    filtered.filter(r => r.data_ocorrencia).forEach(r => { const w = weekKey(r.data_ocorrencia!); weeks.set(w, (weeks.get(w) ?? 0) + 1) })
    return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-10)
      .map(([date, t]) => ({ label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), total: t }))
  }, [filtered])

  // Classification breakdown
  const classBreak = useMemo(() => {
    const m = new Map<string, number>()
    filtered.forEach(r => { const k = r.classificacao ?? 'Outros'; m.set(k, (m.get(k) ?? 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total }))
  }, [filtered])

  const topTipos     = useMemo(() => topN(filtered, 'tipo_relato', 10),  [filtered])
  const topAreas     = useMemo(() => topN(filtered, 'area',        8),   [filtered])
  const topFuncoes   = useMemo(() => topN(filtered, 'funcao',      10),  [filtered])
  const topAtividades= useMemo(() => topN(filtered, 'atividade',   8),   [filtered])
  const topEquipes   = useMemo(() => topN(filtered, 'equipe',      8),   [filtered])

  // Relatantes
  const relatantes = useMemo(() => {
    const m = new Map<string, { nome: string; funcao: string; equipe: string; total: number; pos: number; ultima: string }>()
    filtered.forEach(r => {
      const k = r.relator ?? '—'
      const cur = m.get(k) ?? { nome: k, funcao: r.funcao ?? '—', equipe: r.equipe ?? '—', total: 0, pos: 0, ultima: '' }
      cur.total++
      if (r.classificacao?.includes('POSITIVA')) cur.pos++
      if (r.data_ocorrencia && r.data_ocorrencia > cur.ultima) cur.ultima = r.data_ocorrencia
      m.set(k, cur)
    })
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [filtered])

  // Relatados
  const relatados = useMemo(() => {
    const m = new Map<string, { nome: string; empresa: string; total: number; ultima: string; tipos: string[] }>()
    filtered.filter(r => r.pessoa_relatada).forEach(r => {
      const k = r.pessoa_relatada!
      const cur = m.get(k) ?? { nome: k, empresa: r.empresa_relatada ?? '—', total: 0, ultima: '', tipos: [] }
      cur.total++
      if (r.data_ocorrencia && r.data_ocorrencia > cur.ultima) cur.ultima = r.data_ocorrencia
      if (r.tipo_relato && !cur.tipos.includes(r.tipo_relato)) cur.tipos.push(r.tipo_relato)
      m.set(k, cur)
    })
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [filtered])

  // Investigações
  const investList = useMemo(() =>
    filtered.filter(r => r.pq1 || r.motivo1).sort((a, b) => (b.data_ocorrencia ?? '').localeCompare(a.data_ocorrencia ?? ''))
  , [filtered])
  const investFiltered = busca
    ? investList.filter(r => [r.relator, r.tipo_relato, r.external_id].some(v => v?.toLowerCase().includes(busca.toLowerCase())))
    : investList

  // Recorrentes
  const recorrentes = relatados.filter(r => r.total >= 3).length

  const TABS = ['Dashboard', 'Relatantes', 'Relatados', 'Por Setor', 'Investigações']

  if (!usuario) return null
  if (loading)  return (
    <div className="flex items-center justify-center min-h-screen text-gray-400">
      <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
    </div>
  )

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Relatos</h2>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Building2 size={12} /> {usuario.filial}</p>
        </div>
        <button onClick={carregar} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* Upload */}
      <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors mb-6 ${isDragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
        <input {...getInputProps()} />
        {uploading ? <Loader2 size={20} className="mx-auto text-brand-500 animate-spin" /> : <Upload size={20} className="mx-auto text-gray-400 mb-1" />}
        <p className="text-sm text-gray-600">{uploading ? 'Importando...' : 'Arraste o arquivo de Relatos (.xlsx)'}</p>
        {!uploading && data.length > 0 && <p className="text-xs text-gray-400 mt-0.5">{data.length} relatos carregados · reimporte para atualizar</p>}
      </div>

      {data.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileSearch size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum relato. Faça o upload do arquivo para começar.</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap mb-5">
            <div className="flex gap-1">
              {PERIODS.map(opt => (
                <button key={opt.label} onClick={() => setPeriodDays(opt.days)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors border ${periodDays === opt.days ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <select value={filtroClass} onChange={e => setFiltroClass(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-400">
              <option value="">Todas classificações</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-400">
              <option value="">Todas as áreas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className="ml-auto text-xs text-gray-400 font-medium">{filtered.length} relatos no período</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 mb-6">
            {TABS.map((t, idx) => (
              <button key={t} onClick={() => setTab(idx)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === idx ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t}
              </button>
            ))}
          </div>

          {/* ─── DASHBOARD ──────────────────────────────────────────────────── */}
          {tab === 0 && (
            <div className="space-y-5">
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {([
                  { label: 'Total Relatos',    value: total,     sub: 'no período selecionado',  cor: undefined           },
                  { label: 'Abordagens +',     value: positivos, sub: 'comportamentos positivos', cor: 'text-green-700'    },
                  { label: 'Cond. Inseguras',  value: inseguros, sub: 'atos/cond. inseguros',    cor: inseguros > 0 ? 'text-orange-600' : undefined },
                  { label: 'Com Investigação', value: comInvest, sub: '5-Porquês preenchido',    cor: undefined           },
                ] as const).map(({ label: lb, value, sub, cor }) => (
                  <div key={lb} className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">{lb}</p>
                    <p className={`text-3xl font-bold mt-0.5 ${cor ?? 'text-gray-900'}`}>{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Classificação + Trend */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Por Classificação */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Por Classificação</p>
                  <div className="space-y-2">
                    {classBreak.map(({ name, total: v }) => (
                      <div key={name} className="flex items-center gap-3">
                        <span className="w-40 text-xs text-gray-600 truncate shrink-0">{name}</span>
                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-5 rounded-full flex items-center justify-end pr-2 transition-all"
                            style={{ width: `${Math.max(total > 0 ? Math.round((v / total) * 100) : 0, v > 0 ? 4 : 0)}%`, backgroundColor: classColor(name) }}>
                            <span className="text-white text-xs font-bold">{v}</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{total > 0 ? Math.round((v / total) * 100) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tendência semanal */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Tendência Semanal</p>
                  {trendData.length < 2 ? (
                    <div className="flex items-center justify-center py-8 text-xs text-gray-400">Dados insuficientes para tendência.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={trendData} margin={{ top: 4, right: 10, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} width={24} />
                        <Tooltip />
                        <Line type="monotone" dataKey="total" stroke="#1a4451" strokeWidth={2} dot={{ fill: '#1a4451', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Top tipos */}
              {topTipos.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Top Tipos de Relato</p>
                  <div className="space-y-2">
                    {topTipos.map(({ name, total: v }, i) => (
                      <div key={name} className="flex items-center gap-3 text-xs">
                        <span className="w-4 text-gray-400 font-bold text-right shrink-0">{i + 1}</span>
                        <span className="flex-1 text-gray-700 truncate">{name}</span>
                        <div className="w-36 h-4 bg-gray-100 rounded overflow-hidden shrink-0">
                          <div className="h-4 rounded flex items-center justify-end pr-1.5"
                            style={{ width: `${Math.max((v / (topTipos[0]?.total ?? 1)) * 100, 6)}%`, backgroundColor: i < 2 ? '#1a4451' : '#64748b' }}>
                            <span className="text-white text-xs font-bold">{v}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Insight cards */}
              {relatados.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className={`rounded-xl border p-4 ${recorrentes > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1"><Users size={12} /> Relatados Recorrentes</p>
                    <p className={`text-2xl font-bold ${recorrentes > 0 ? 'text-red-700' : 'text-gray-600'}`}>{recorrentes}</p>
                    <p className="text-xs text-gray-500 mt-0.5">pessoas com 3+ relatos</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-1">Mais Relatante</p>
                    <p className="text-sm font-bold text-gray-900 truncate">{relatantes[0]?.nome.split(' ').slice(0, 2).join(' ') ?? '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{relatantes[0]?.total ?? 0} relatos · {relatantes[0]?.funcao ?? '—'}</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-1">Área Mais Ativa</p>
                    <p className="text-sm font-bold text-gray-900 truncate">{topAreas[0]?.name ?? '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{topAreas[0]?.total ?? 0} relatos registrados</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── RELATANTES ─────────────────────────────────────────────────── */}
          {tab === 1 && (
            <div className="space-y-5">
              {relatantes.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Top 10 Relatantes (positivos vs inseguros)</p>
                  <ResponsiveContainer width="100%" height={Math.min(relatantes.length, 10) * 32 + 20}>
                    <BarChart
                      data={relatantes.slice(0, 10).map(r => ({ name: r.nome.split(' ').slice(0, 2).join(' '), pos: r.pos, ins: r.total - r.pos }))}
                      layout="vertical" barSize={18} margin={{ left: 100, right: 10 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip formatter={(v, name) => [v, name === 'pos' ? 'Positivos' : 'Inseguros/Atos']} />
                      <Bar dataKey="pos" stackId="a" fill="#22c55e" name="Positivos" />
                      <Bar dataKey="ins" stackId="a" fill="#f97316" name="Inseguros/Atos" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 text-xs font-medium text-gray-500">
                  {relatantes.length} relatantes únicos no período
                </div>
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      {['#', 'Nome', 'Função', 'Equipe', 'Total', 'Positivos', 'Outros', 'Última ocorrência'].map(h => (
                        <th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-500 ${h === '#' || h.includes('Total') || h.includes('Pos') || h.includes('Out') || h.includes('Última') ? 'text-center' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {relatantes.map((r, i) => (
                      <tr key={r.nome} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-xs text-gray-400 font-bold text-center">{i + 1}</td>
                        <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{r.nome}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{r.funcao}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{r.equipe}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-gray-800">{r.total}</td>
                        <td className="px-4 py-2.5 text-center text-green-700 font-medium">{r.pos}</td>
                        <td className="px-4 py-2.5 text-center text-orange-600 font-medium">{r.total - r.pos}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-gray-400">{fmtDate(r.ultima)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── RELATADOS ──────────────────────────────────────────────────── */}
          {tab === 2 && (
            <div className="space-y-5">
              {relatados.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Nenhum dado de pessoa relatada no período.</div>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-sm font-semibold text-gray-700 mb-4">Top Relatados — recorrência de ocorrências</p>
                    <ResponsiveContainer width="100%" height={Math.min(relatados.length, 8) * 32 + 20}>
                      <BarChart data={relatados.slice(0, 8).map(r => ({ name: r.nome.split(' ').slice(0, 2).join(' '), total: r.total }))}
                        layout="vertical" barSize={18} margin={{ left: 90, right: 30 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                        <Tooltip />
                        <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                          {relatados.slice(0, 8).map((r, i) => <Cell key={i} fill={r.total >= 3 ? '#ef4444' : i < 2 ? '#f97316' : '#1a4451'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">{relatados.length} pessoas relatadas</span>
                      {recorrentes > 0 && <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">{recorrentes} recorrentes (3+)</span>}
                    </div>
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-100">
                        <tr>
                          {['#', 'Pessoa Relatada', 'Empresa', 'Ocorrências', 'Última', 'Tipos de relato'].map(h => (
                            <th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-500 ${h === '#' || h === 'Ocorrências' || h === 'Última' ? 'text-center' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {relatados.map((r, i) => (
                          <tr key={r.nome} className={`border-b border-gray-50 hover:bg-gray-50 ${r.total >= 3 ? 'bg-red-50' : ''}`}>
                            <td className="px-4 py-2.5 text-xs text-gray-400 font-bold text-center">{i + 1}</td>
                            <td className="px-4 py-2.5">
                              <span className="text-sm font-medium text-gray-900">{r.nome}</span>
                              {r.total >= 3 && <span className="ml-2 text-xs bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full">Recorrente</span>}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">{r.empresa}</td>
                            <td className="px-4 py-2.5 text-center font-bold text-gray-800">{r.total}</td>
                            <td className="px-4 py-2.5 text-center text-xs text-gray-400">{fmtDate(r.ultima)}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs truncate">
                              {r.tipos.slice(0, 2).join(', ')}{r.tipos.length > 2 ? ` +${r.tipos.length - 2}` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── POR SETOR ──────────────────────────────────────────────────── */}
          {tab === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[
                { title: 'Por Área',              data: topAreas,      color: '#1a4451' },
                { title: 'Por Atividade',          data: topAtividades, color: '#0ea5e9' },
                { title: 'Por Função (Relatante)', data: topFuncoes,    color: '#8b5cf6' },
                { title: 'Por Equipe',             data: topEquipes,    color: '#f59e0b' },
              ].map(({ title, data: d, color }) => d.length > 0 && (
                <div key={title} className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">{title}</p>
                  <ResponsiveContainer width="100%" height={d.length * 32 + 20}>
                    <BarChart data={d} layout="vertical" barSize={18} margin={{ left: 100, right: 36 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
                      <Tooltip />
                      <Bar dataKey="total" fill={color} radius={[0, 4, 4, 0]}
                        label={{ position: 'right', fontSize: 10, fill: '#6b7280' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}

          {/* ─── INVESTIGAÇÕES ──────────────────────────────────────────────── */}
          {tab === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 max-w-sm">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Buscar por relator, tipo ou ID..." value={busca} onChange={e => setBusca(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400" />
                </div>
                <span className="text-xs text-gray-400">{investFiltered.length} relatos com investigação</span>
              </div>

              {investFiltered.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Nenhum relato com 5-Porquês no período.</div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100 bg-gray-50">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">ID</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Data</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Relator</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Tipo de Relato</th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Classificação</th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">5-Porquês</th>
                      </tr>
                    </thead>
                    <tbody>
                      {investFiltered.map(r => {
                        const isExp = expandedId === r.id
                        const pqs   = [r.pq1, r.pq2, r.pq3, r.pq4, r.pq5].filter(Boolean) as string[]
                        const acoes = ([[r.motivo1, r.acao1], [r.motivo2, r.acao2], [r.motivo3, r.acao3]] as [string|null,string|null][]).filter(([m]) => m)
                        return (
                          <Fragment key={r.id}>
                            <tr className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(isExp ? null : r.id)}>
                              <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{r.external_id}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(r.data_ocorrencia)}</td>
                              <td className="px-4 py-2.5 text-xs font-medium text-gray-900">{r.relator?.split(' ').slice(0, 2).join(' ')}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-600 max-w-xs truncate">{r.tipo_relato}</td>
                              <td className="px-4 py-2.5 text-center"><ClassBadge value={r.classificacao} /></td>
                              <td className="px-4 py-2.5 text-center">
                                <span className="flex items-center justify-center gap-1 text-xs text-brand-700 font-medium">
                                  {pqs.length}/5
                                  {isExp ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                                </span>
                              </td>
                            </tr>
                            {isExp && (
                              <tr>
                                <td colSpan={6} className="bg-gray-50 border-b border-gray-200 px-4 py-4">
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                                    {/* Context */}
                                    <div className="space-y-2">
                                      {[
                                        { k: 'Área',            v: r.area          },
                                        { k: 'Atividade',       v: r.atividade     },
                                        { k: 'Pessoa Relatada', v: r.pessoa_relatada },
                                        { k: 'Ação Imediata',   v: r.acao_imediata },
                                        { k: 'Porque Falhou?',  v: r.porque_falhou },
                                        { k: 'Detalhamento',    v: r.detalhamento  },
                                      ].filter(({ v }) => v).map(({ k, v }) => (
                                        <div key={k} className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                                          <span className="text-gray-400 block mb-0.5">{k}</span>
                                          <span className="text-gray-800">{v}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {/* 5-Why + Actions */}
                                    <div className="space-y-2">
                                      {pqs.length > 0 && (
                                        <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                                          <p className="text-gray-600 font-semibold mb-2">5-Porquês</p>
                                          {pqs.map((pq, i) => (
                                            <div key={i} className="flex gap-2 mb-1.5">
                                              <span className="text-brand-700 font-bold shrink-0">P{i + 1}:</span>
                                              <span className="text-gray-700">{pq}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {acoes.length > 0 && (
                                        <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                                          <p className="text-gray-600 font-semibold mb-2">Causas Raiz e Ações</p>
                                          {acoes.map(([motivo, acao], i) => (
                                            <div key={i} className="mb-2 border-l-2 border-brand-300 pl-2">
                                              <p className="text-gray-500">Causa {i + 1}: <span className="text-gray-900 font-medium">{motivo}</span></p>
                                              {acao && <p className="text-gray-500 mt-0.5">Ação: <span className="text-green-700 font-medium">{acao}</span></p>}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
