import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import {
  Upload, Loader2, RefreshCw, Clock, TrendingUp, TrendingDown,
  AlertTriangle, Users, ThumbsUp,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { JornadaRegistro } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtH(h: number): string {
  if (h === 0) return '—'
  const abs = Math.abs(h)
  const hh = Math.floor(abs)
  const mm = Math.round((abs - hh) * 60)
  const str = mm > 0 ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`
  return h < 0 ? `-${str}` : str
}

function scoreClass(score: number) {
  if (score <= 20)  return { label: 'Baixo',   css: 'bg-green-100 text-green-700 border-green-200' }
  if (score <= 60)  return { label: 'Atenção', css: 'bg-yellow-100 text-yellow-800 border-yellow-200' }
  if (score <= 120) return { label: 'Alto',    css: 'bg-orange-100 text-orange-800 border-orange-200' }
  return              { label: 'Crítico', css: 'bg-red-100 text-red-700 border-red-200' }
}

function heatStyle(value: number, max: number): React.CSSProperties {
  if (value === 0) return { backgroundColor: '#f0fdf4', color: '#4b7459' }
  const ratio = Math.min(value / Math.max(max, 1), 1)
  if (ratio < 0.35) return { backgroundColor: '#fef9c3', color: '#713f12', fontWeight: '600' }
  if (ratio < 0.65) return { backgroundColor: '#fed7aa', color: '#7c2d12', fontWeight: '600' }
  return { backgroundColor: '#fecaca', color: '#7f1d1d', fontWeight: '700' }
}

function ConfigInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600 whitespace-nowrap">{label}</span>
      <input type="number" min={0} step={0.5} value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-16 text-center text-xs border border-yellow-300 bg-yellow-50 rounded px-1.5 py-1 font-semibold" />
    </div>
  )
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseJornada(buffer: ArrayBuffer, filial: string): Omit<JornadaRegistro, 'id' | 'created_at'>[] {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets['_Dados_Ponto']
  if (!ws) throw new Error('Aba "_Dados_Ponto" não encontrada no arquivo.')

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  const matriculaMap: Record<string, string> = {}
  rows.slice(1).forEach(r => {
    const nome = String(r[10] ?? '').trim()
    const mat  = r[11]
    if (nome && mat) matriculaMap[nome] = String(mat)
  })

  const results: Omit<JornadaRegistro, 'id' | 'created_at'>[] = []
  rows.slice(1).forEach(r => {
    const nome = String(r[0] ?? '').trim()
    const mes  = String(r[1] ?? '').trim()
    const sort = Number(r[2]) || 0
    if (!nome || !mes || !sort) return

    results.push({
      filial,
      nome,
      matricula:    matriculaMap[nome] ?? null,
      mes,
      sort,
      horas_extras: Number(r[3]) || 0,
      horas_menos:  Number(r[4]) || 0,
      faltas:       Number(r[5]) || 0,
      folgas:       Number(r[6]) || 0,
      atestados:    Number(r[7]) || 0,
      afastamentos: Number(r[8]) || 0,
    })
  })
  return results
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onUpload, uploading }: { onUpload: (f: File) => void; uploading: boolean }) {
  const onDrop = useCallback((files: File[]) => { if (files[0]) onUpload(files[0]) }, [onUpload])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: false,
    accept: { 'application/vnd.ms-excel': ['.xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    disabled: uploading,
  })
  return (
    <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors
      ${isDragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}
      ${uploading ? 'opacity-60 cursor-default' : ''}`}>
      <input {...getInputProps()} />
      {uploading
        ? <><Loader2 size={22} className="mx-auto mb-1.5 text-brand-500 animate-spin" /><p className="text-sm text-gray-600">Importando…</p></>
        : <><Upload size={22} className="mx-auto mb-1.5 text-gray-400" /><p className="text-sm text-gray-600">Arraste o <strong>Dash_ponto.xlsx</strong> ou <span className="text-brand-600">clique para selecionar</span></p><p className="text-xs text-gray-400 mt-0.5">O arquivo deve conter a aba "_Dados_Ponto"</p></>
      }
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'evolucao' | 'horas' | 'ocorrencias' | 'pontualidade' | 'alertas' | 'calor'
type OcorrTipo = 'faltas' | 'atestados' | 'afastamentos' | 'folgas'

export default function Jornada() {
  const { usuario } = useAuth()

  const [registros, setRegistros]   = useState<JornadaRegistro[]>([])
  const [loading, setLoading]       = useState(true)
  const [uploading, setUploading]   = useState(false)
  const [tab, setTab]               = useState<Tab>('evolucao')
  const [ocorrTipo, setOcorrTipo]   = useState<OcorrTipo>('faltas')
  const [tipoCalor, setTipoCalor]   = useState<OcorrTipo>('faltas')

  // Pontualidade weights
  const [pesoFaltas, setPesoFaltas]             = useState(3)
  const [pesoHM, setPesoHM]                     = useState(2)
  const [pesoAtestados, setPesoAtestados]       = useState(1)
  const [pesoAfastamentos, setPesoAfastamentos] = useState(1)

  // Alert thresholds
  const [thFaltas, setThFaltas]           = useState(2)
  const [thHM, setThHM]                   = useState(30)
  const [thAtestados, setThAtestados]     = useState(1)
  const [thAfastamentos, setThAfastamentos] = useState(5)

  async function loadData() {
    if (!usuario) return
    setLoading(true)
    const { data } = await supabase
      .from('jornada_registros').select('*').eq('filial', usuario.filial)
      .order('sort').order('nome')
    setRegistros(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [usuario])

  async function handleUpload(file: File) {
    if (!usuario) return
    setUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      const rows   = parseJornada(buffer, usuario.filial)
      const CHUNK  = 100
      for (let i = 0; i < rows.length; i += CHUNK) {
        await supabase.from('jornada_registros')
          .upsert(rows.slice(i, i + CHUNK), { onConflict: 'filial,nome,sort' })
      }
      await loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao importar arquivo.')
    } finally {
      setUploading(false)
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const meses = useMemo(() => {
    const seen = new Map<string, number>()
    registros.forEach(r => seen.set(r.mes, r.sort))
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m)
  }, [registros])

  const funcionarios = useMemo(() =>
    [...new Set(registros.map(r => r.nome))].sort(),
    [registros])

  const byFuncMes = useMemo(() => {
    const map: Record<string, Record<string, JornadaRegistro>> = {}
    registros.forEach(r => {
      if (!map[r.nome]) map[r.nome] = {}
      map[r.nome][r.mes] = r
    })
    return map
  }, [registros])

  const evolucaoData = useMemo(() => meses.map(mes => {
    const regs = registros.filter(r => r.mes === mes)
    const he = regs.reduce((s, r) => s + r.horas_extras, 0)
    const hm = regs.reduce((s, r) => s + r.horas_menos, 0)
    return {
      mes: mes.split('/')[0],
      he: Math.round(he * 10) / 10,
      hm: Math.round(hm * 10) / 10,
      saldo: Math.round((he - hm) * 10) / 10,
      faltas:       regs.reduce((s, r) => s + r.faltas, 0),
      atestados:    regs.reduce((s, r) => s + r.atestados, 0),
      afastamentos: regs.reduce((s, r) => s + r.afastamentos, 0),
    }
  }), [registros, meses])

  const ultimoMes = evolucaoData[evolucaoData.length - 1]

  function pivotFuncionarios(field: keyof JornadaRegistro, fmt: (v: number) => string | number = v => v) {
    return funcionarios.map(nome => {
      const porMes: Record<string, number> = {}
      meses.forEach(m => { porMes[m] = Number(byFuncMes[nome]?.[m]?.[field]) || 0 })
      const total = Object.values(porMes).reduce((s, v) => s + v, 0)
      return { nome, porMes, total: Math.round(total * 100) / 100, fmtTotal: fmt(Math.round(total * 10) / 10) }
    }).sort((a, b) => b.total - a.total)
  }

  const heData     = useMemo(() => pivotFuncionarios('horas_extras', fmtH), [funcionarios, meses, byFuncMes])
  const hmData     = useMemo(() => pivotFuncionarios('horas_menos',  fmtH), [funcionarios, meses, byFuncMes])
  const ocorrData  = useMemo(() => pivotFuncionarios(
    ocorrTipo === 'faltas' ? 'faltas' : ocorrTipo === 'atestados' ? 'atestados' : ocorrTipo === 'afastamentos' ? 'afastamentos' : 'folgas'
  ), [funcionarios, meses, byFuncMes, ocorrTipo])

  const scoreRanking = useMemo(() => funcionarios.map(nome => {
    const regs = meses.map(m => byFuncMes[nome]?.[m]).filter(Boolean) as JornadaRegistro[]
    const ft = regs.reduce((s, r) => s + r.faltas, 0)
    const hmt = Math.round(regs.reduce((s, r) => s + r.horas_menos, 0) * 10) / 10
    const at = regs.reduce((s, r) => s + r.atestados, 0)
    const aft = regs.reduce((s, r) => s + r.afastamentos, 0)
    const score = Math.round(ft * pesoFaltas + hmt * pesoHM + at * pesoAtestados + aft * pesoAfastamentos)
    return { nome, ft, hmt, at, aft, score }
  }).sort((a, b) => b.score - a.score), [funcionarios, meses, byFuncMes, pesoFaltas, pesoHM, pesoAtestados, pesoAfastamentos])

  const alertasData = useMemo(() => funcionarios.map(nome => {
    const regs = meses.map(m => byFuncMes[nome]?.[m]).filter(Boolean) as JornadaRegistro[]
    const hmt = regs.reduce((s, r) => s + r.horas_menos, 0)
    const at  = regs.reduce((s, r) => s + r.atestados, 0)
    const aft = regs.reduce((s, r) => s + r.afastamentos, 0)
    const faltasMes = meses.map(m => ({ m, v: byFuncMes[nome]?.[m]?.faltas ?? 0 }))
    const fF  = faltasMes.some(f => f.v >= thFaltas)
    const fHM = hmt >= thHM
    const fAt = at  >= thAtestados
    const fAf = aft >= thAfastamentos
    return { nome, faltasMes, fF, fHM, fAt, fAf, hmt: Math.round(hmt * 10) / 10, at, aft, flags: +fF + +fHM + +fAt + +fAf }
  }).filter(a => a.flags > 0).sort((a, b) => b.flags - a.flags), [funcionarios, meses, byFuncMes, thFaltas, thHM, thAtestados, thAfastamentos])

  const maxCalor = useMemo(() => {
    const field = tipoCalor as keyof JornadaRegistro
    return Math.max(...registros.map(r => Number(r[field]) || 0), 1)
  }, [registros, tipoCalor])

  const maxScore = Math.max(...scoreRanking.map(s => s.score), 1)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      <Loader2 size={24} className="animate-spin mr-2" /> Carregando jornada…
    </div>
  )

  const TABS: [Tab, string][] = [
    ['evolucao',     'Evolução Mensal'],
    ['horas',        'Horas por Funcionário'],
    ['ocorrencias',  'Ocorrências'],
    ['pontualidade', 'Pontualidade'],
    ['alertas',      `Alertas${alertasData.length > 0 ? ` (${alertasData.length})` : ''}`],
    ['calor',        'Mapa de Calor'],
  ]

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Controle de Jornada</h1>
          <p className="text-sm text-gray-500">Horas extras, ocorrências e pontualidade — LOG20 Logística</p>
        </div>
        <button onClick={loadData} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <RefreshCw size={16} />
        </button>
      </div>

      <UploadZone onUpload={handleUpload} uploading={uploading} />

      {registros.length === 0 && !uploading && (
        <div className="text-center py-16 text-gray-400">
          <Clock size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum dado importado. Faça upload do Dash_ponto.xlsx.</p>
        </div>
      )}

      {registros.length > 0 && (
        <>
          {/* Tabs */}
          <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto">
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === k
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* ── EVOLUÇÃO MENSAL ─────────────────────────────────────── */}
          {tab === 'evolucao' && (
            <div className="space-y-5">
              {/* KPIs do último mês */}
              {ultimoMes && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'H. Extras (equipe)', value: fmtH(ultimoMes.he),     icon: TrendingUp,   color: 'text-green-700' },
                    { label: 'H. a Menos (equipe)', value: fmtH(ultimoMes.hm),    icon: TrendingDown, color: 'text-red-600' },
                    { label: 'Saldo HE−HM',          value: fmtH(ultimoMes.saldo), icon: Clock,        color: ultimoMes.saldo >= 0 ? 'text-green-700' : 'text-red-600' },
                    { label: 'Faltas',                value: ultimoMes.faltas,      icon: Users,        color: ultimoMes.faltas > 0 ? 'text-orange-600' : 'text-gray-600' },
                    { label: 'Atestados',             value: ultimoMes.atestados,   icon: AlertTriangle, color: ultimoMes.atestados > 0 ? 'text-yellow-600' : 'text-gray-600' },
                    { label: 'Afastamentos',          value: ultimoMes.afastamentos, icon: ThumbsUp,   color: 'text-gray-600' },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                      <div className={`flex items-center gap-1 text-xs font-medium mb-1 ${color}`}>
                        <Icon size={12} /> {label}
                      </div>
                      <p className="text-xl font-bold text-gray-900">{value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{ultimoMes.mes}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* HE e HM por mês */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Horas Extras × Horas a Menos — Equipe</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={evolucaoData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fmtH(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="he"  name="H. Extras"  fill="#22c55e" radius={[3, 3, 0, 0]} barSize={28} />
                    <Bar dataKey="hm"  name="H. a Menos" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Saldo linha + Ocorrências */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Saldo HE − HM</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={evolucaoData} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => fmtH(v)} />
                      <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#1a4451" strokeWidth={2} dot={{ r: 3 }}>
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Ocorrências Mensais — Equipe</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={evolucaoData} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="faltas"       name="Faltas"       fill="#ef4444" barSize={12} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="atestados"    name="Atestados"    fill="#f97316" barSize={12} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="afastamentos" name="Afastamentos" fill="#eab308" barSize={12} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ── HORAS POR FUNCIONÁRIO ────────────────────────────────── */}
          {tab === 'horas' && (
            <div className="space-y-6">
              {[
                { title: '⏫ Horas Extras', data: heData, color: 'text-green-700', fmt: fmtH },
                { title: '⏬ Horas a Menos', data: hmData, color: 'text-red-600', fmt: fmtH },
              ].map(({ title, data, color, fmt }) => (
                <div key={title} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
                    <p className={`text-sm font-semibold ${color}`}>{title}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-100">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 sticky left-0 bg-white">Funcionário</th>
                          {meses.map(m => (
                            <th key={m} className="text-center px-3 py-2 text-xs font-semibold text-gray-500 whitespace-nowrap">{m.split('/')[0]}</th>
                          ))}
                          <th className="text-center px-3 py-2 text-xs font-semibold text-gray-700">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.map(({ nome, porMes, fmtTotal }) => (
                          <tr key={nome} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-800 text-xs sticky left-0 bg-white hover:bg-gray-50 max-w-[200px] truncate font-medium">{nome}</td>
                            {meses.map(m => (
                              <td key={m} className="px-3 py-2 text-center text-xs text-gray-600">{fmt(porMes[m] ?? 0)}</td>
                            ))}
                            <td className="px-3 py-2 text-center text-xs font-bold text-gray-800">{fmtTotal}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── OCORRÊNCIAS ──────────────────────────────────────────── */}
          {tab === 'ocorrencias' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {(['faltas', 'atestados', 'afastamentos', 'folgas'] as OcorrTipo[]).map(t => (
                  <button key={t} onClick={() => setOcorrTipo(t)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors capitalize ${ocorrTipo === t
                      ? 'bg-brand-700 text-white border-brand-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 sticky left-0 bg-gray-50">#</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 sticky left-6 bg-gray-50">Funcionário</th>
                        {meses.map(m => (
                          <th key={m} className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">{m.split('/')[0]}</th>
                        ))}
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-700">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {ocorrData.filter(d => d.total > 0).map(({ nome, porMes, total }, i) => (
                        <tr key={nome} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-xs text-gray-400 font-bold">{i + 1}</td>
                          <td className="px-4 py-2 text-gray-800 text-xs font-medium max-w-[180px] truncate">{nome}</td>
                          {meses.map(m => (
                            <td key={m} className="px-3 py-2 text-center text-xs text-gray-600">
                              {porMes[m] > 0 ? <span className="font-semibold text-orange-700">{porMes[m]}</span> : <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center text-xs font-bold text-gray-800">{total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── PONTUALIDADE ────────────────────────────────────────── */}
          {tab === 'pontualidade' && (
            <div className="space-y-4">
              {/* Weights config */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-yellow-800 mb-3">⚙️ Pesos (editáveis) — Score = (Faltas × P1) + (HM acum. × P2) + (Atestados × P3) + (Afastamentos × P4)</p>
                <div className="flex flex-wrap gap-4">
                  <ConfigInput label="P1 — Faltas"       value={pesoFaltas}       onChange={setPesoFaltas} />
                  <ConfigInput label="P2 — HM acum."     value={pesoHM}           onChange={setPesoHM} />
                  <ConfigInput label="P3 — Atestados"    value={pesoAtestados}    onChange={setPesoAtestados} />
                  <ConfigInput label="P4 — Afastamentos" value={pesoAfastamentos} onChange={setPesoAfastamentos} />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">#</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Funcionário</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-red-600">Faltas</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-orange-600">HM Acum.</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-yellow-600">Atestados</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Afastamentos</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-700 w-40">Score</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Classif.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {scoreRanking.map(({ nome, ft, hmt, at, aft, score }, i) => {
                      const cls = scoreClass(score)
                      return (
                        <tr key={nome} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-xs text-gray-400 font-bold">{i + 1}</td>
                          <td className="px-4 py-2 font-medium text-gray-800 text-xs max-w-[180px] truncate">{nome}</td>
                          <td className="px-3 py-2 text-center text-xs font-semibold text-red-700">{ft || '—'}</td>
                          <td className="px-3 py-2 text-center text-xs font-semibold text-orange-700">{fmtH(hmt)}</td>
                          <td className="px-3 py-2 text-center text-xs font-semibold text-yellow-700">{at || '—'}</td>
                          <td className="px-3 py-2 text-center text-xs text-gray-500">{aft || '—'}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-3 rounded-full" style={{ width: `${(score / maxScore) * 100}%`, backgroundColor: score > 120 ? '#ef4444' : score > 60 ? '#f97316' : score > 20 ? '#eab308' : '#22c55e' }} />
                              </div>
                              <span className="text-xs font-bold text-gray-700 w-7 text-right">{score}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${cls.css}`}>{cls.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ALERTAS ─────────────────────────────────────────────── */}
          {tab === 'alertas' && (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-yellow-800 mb-3">⚙️ Thresholds (editáveis) — Alerta ativado quando o funcionário atingir ou ultrapassar o valor configurado</p>
                <div className="flex flex-wrap gap-4">
                  <ConfigInput label="Faltas/mês ≥"       value={thFaltas}       onChange={setThFaltas} />
                  <ConfigInput label="HM total (h) ≥"     value={thHM}           onChange={setThHM} />
                  <ConfigInput label="Atestados total ≥"  value={thAtestados}    onChange={setThAtestados} />
                  <ConfigInput label="Afastamentos total ≥" value={thAfastamentos} onChange={setThAfastamentos} />
                </div>
              </div>

              {alertasData.length === 0
                ? (
                  <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-100">
                    <ThumbsUp size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum funcionário atingiu os thresholds configurados.</p>
                  </div>
                )
                : (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                          <tr>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Funcionário</th>
                            <th className="text-center px-3 py-2.5 text-xs font-semibold text-red-600">Faltas/mês</th>
                            <th className="text-center px-3 py-2.5 text-xs font-semibold text-orange-600">HM Total</th>
                            <th className="text-center px-3 py-2.5 text-xs font-semibold text-yellow-600">Atestados</th>
                            <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Afastamentos</th>
                            <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Faltas por mês</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {alertasData.map(({ nome, faltasMes, fF, fHM, fAt, fAf, hmt, at, aft }) => (
                            <tr key={nome} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-medium text-gray-800 text-xs max-w-[180px] truncate">{nome}</td>
                              <td className="px-3 py-2.5 text-center">
                                {fF ? <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">⚠ ALERTA</span> : <span className="text-xs text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {fHM ? <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">⚠ {fmtH(hmt)}</span> : <span className="text-xs text-gray-500">{fmtH(hmt)}</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {fAt ? <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-medium">⚠ {at}</span> : <span className="text-xs text-gray-500">{at || '—'}</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {fAf ? <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">⚠ {aft}</span> : <span className="text-xs text-gray-500">{aft || '—'}</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex gap-1 justify-center flex-wrap">
                                  {faltasMes.map(({ m, v }) => (
                                    <span key={m} className={`text-xs px-1 py-0.5 rounded ${v >= thFaltas ? 'bg-red-100 text-red-700 font-bold' : 'text-gray-300'}`}>
                                      {m.split('/')[0]}{v >= thFaltas ? `:${v}` : ''}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              }
            </div>
          )}

          {/* ── MAPA DE CALOR ───────────────────────────────────────── */}
          {tab === 'calor' && (
            <div className="space-y-4">
              <div className="flex gap-2 items-center">
                <span className="text-xs text-gray-500 font-medium">Tipo:</span>
                {(['faltas', 'atestados', 'afastamentos', 'folgas'] as OcorrTipo[]).map(t => (
                  <button key={t} onClick={() => setTipoCalor(t)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors capitalize ${tipoCalor === t
                      ? 'bg-brand-700 text-white border-brand-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-4 text-xs text-gray-400">
                  <span className="w-4 h-4 rounded" style={{ backgroundColor: '#f0fdf4' }} />
                  <span>0</span>
                  <span className="w-4 h-4 rounded ml-2" style={{ backgroundColor: '#fef9c3' }} />
                  <span>baixo</span>
                  <span className="w-4 h-4 rounded ml-2" style={{ backgroundColor: '#fed7aa' }} />
                  <span>médio</span>
                  <span className="w-4 h-4 rounded ml-2" style={{ backgroundColor: '#fecaca' }} />
                  <span>alto</span>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 sticky left-0 bg-gray-50">Funcionário</th>
                        {meses.map(m => (
                          <th key={m} className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">{m.split('/')[0]}</th>
                        ))}
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-700">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funcionarios.map(nome => {
                        const field = tipoCalor as keyof JornadaRegistro
                        const vals = meses.map(m => Number(byFuncMes[nome]?.[m]?.[field]) || 0)
                        const total = vals.reduce((s, v) => s + v, 0)
                        if (total === 0) return null
                        return (
                          <tr key={nome} className="border-b border-gray-50">
                            <td className="px-4 py-1.5 text-xs text-gray-800 font-medium sticky left-0 bg-white max-w-[180px] truncate">{nome}</td>
                            {vals.map((v, i) => (
                              <td key={i} className="px-4 py-1.5 text-center text-xs font-medium" style={heatStyle(v, maxCalor)}>
                                {v > 0 ? v : '—'}
                              </td>
                            ))}
                            <td className="px-3 py-1.5 text-center text-xs font-bold text-gray-700">{total}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
