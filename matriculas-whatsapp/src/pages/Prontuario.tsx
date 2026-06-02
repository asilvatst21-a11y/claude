import { Fragment, useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, ReferenceLine
} from 'recharts'
import {
  Upload, Loader2, Building2, RefreshCw, Download,
  TrendingUp, TrendingDown, Minus, Users,
  ChevronDown, ChevronUp, Calendar, Search
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { ProntuarioSnapshot, ProntuarioRegistro } from '../types'

// ── Faixa config ──────────────────────────────────────────────────────────────

const FAIXAS = ['Verde', 'Amarela', 'Laranja', 'Vermelha', 'Roxa'] as const
type Faixa = typeof FAIXAS[number]

const FAIXA_COR: Record<Faixa, string> = {
  Verde:    '#22c55e',
  Amarela:  '#eab308',
  Laranja:  '#f97316',
  Vermelha: '#ef4444',
  Roxa:     '#a855f7',
}

const FAIXA_CSS: Record<Faixa, string> = {
  Verde:    'bg-green-100 text-green-800 border-green-300',
  Amarela:  'bg-yellow-100 text-yellow-800 border-yellow-300',
  Laranja:  'bg-orange-100 text-orange-800 border-orange-300',
  Vermelha: 'bg-red-100 text-red-700 border-red-300',
  Roxa:     'bg-purple-100 text-purple-800 border-purple-300',
}

const CAT_LABEL: Record<string, string> = {
  acidentes:  'Acidentes',
  colisoes:   'Colisões',
  desvios:    'Desvios',
  fadigas:    'Fadigas',
  multas:     'Multas',
  sac:        'SAC',
  sancoes:    'Sanções',
  sav:        'SAV',
  telemetria: 'Telemetria',
  vmov:       'V-MOV',
}

function calcFaixa(pont: number): Faixa {
  if (pont <= 10.009) return 'Verde'
  if (pont <= 20.009) return 'Amarela'
  if (pont <= 30.009) return 'Laranja'
  if (pont <= 40.009) return 'Vermelha'
  return 'Roxa'
}

function FaixaBadge({ faixa }: { faixa: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${FAIXA_CSS[faixa as Faixa] ?? 'bg-gray-100 text-gray-600'}`}>
      {faixa || '—'}
    </span>
  )
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function pn(v: unknown): number {
  if (!v || v === 'N / A' || v === 'N/A' || v === '-') return 0
  return parseFloat(String(v).replace(',', '.')) || 0
}

type ParsedReg = Omit<ProntuarioRegistro, 'id' | 'snapshot_id' | 'created_at'>

function parseProntuario(buffer: ArrayBuffer, tipo: 'motorista' | 'ajudante', filial: string): ParsedReg[] {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { defval: '', raw: false, header: 1 }) as string[][]

  return rows.slice(5).filter(r => String(r[1] ?? '').trim()).map(r => {
    const isMot = tipo === 'motorista'
    const pont = isMot ? pn(r[19]) : pn(r[12])

    const detalhes: Record<string, number> = isMot ? {
      acidentes:  pn(r[22]) + pn(r[23]) + pn(r[24]) + pn(r[25]),
      colisoes:   pn(r[26]) + pn(r[27]) + pn(r[28]),
      desvios:    pn(r[29]) + pn(r[30]) + pn(r[31]) + pn(r[32]) + pn(r[33]) + pn(r[34]) + pn(r[35]) + pn(r[36]) + pn(r[37]) + pn(r[38]) + pn(r[39]),
      fadigas:    pn(r[40]) + pn(r[41]) + pn(r[42]) + pn(r[43]) + pn(r[44]),
      multas:     pn(r[45]) + pn(r[46]) + pn(r[47]) + pn(r[48]),
      sac:        pn(r[49]) + pn(r[50]),
      sancoes:    pn(r[51]) + pn(r[52]),
      sav:        pn(r[53]) + pn(r[54]),
      telemetria: pn(r[55]) + pn(r[56]) + pn(r[57]) + pn(r[58]) + pn(r[59]) + pn(r[60]) + pn(r[61]) + pn(r[62]) + pn(r[63]),
      vmov:       pn(r[64]) + pn(r[65]) + pn(r[66]) + pn(r[67]) + pn(r[68]) + pn(r[69]) + pn(r[70]) + pn(r[71]),
    } : {
      acidentes:  pn(r[15]) + pn(r[16]) + pn(r[17]) + pn(r[18]),
      colisoes:   0,
      desvios:    pn(r[19]) + pn(r[20]) + pn(r[21]) + pn(r[22]) + pn(r[23]) + pn(r[24]) + pn(r[25]) + pn(r[26]) + pn(r[27]) + pn(r[28]) + pn(r[29]),
      fadigas:    0,
      multas:     0,
      sac:        pn(r[30]) + pn(r[31]),
      sancoes:    pn(r[32]) + pn(r[33]),
      sav:        pn(r[34]) + pn(r[35]),
      telemetria: 0,
      vmov:       pn(r[36]) + pn(r[37]) + pn(r[38]) + pn(r[39]) + pn(r[40]) + pn(r[41]) + pn(r[42]) + pn(r[43]),
    }

    return {
      filial,
      tipo,
      cpf: String(r[4] ?? '').trim(),
      nome: String(r[1] ?? '').trim(),
      cargo: String(r[6] ?? '').trim() || null,
      situacao_empregado: String(r[0] ?? '').trim() || null,
      status: String(isMot ? r[8] : r[7] ?? '').trim() || null,
      motivo: String(isMot ? r[9] : r[8] ?? '').trim() || null,
      pontuacao: pont,
      faixa: calcFaixa(pont),
      sonolencia: Math.round(pn(isMot ? r[21] : r[14])),
      detalhes,
      regiao: String(isMot ? r[73] : r[45] ?? '').trim() || null,
      operacao: String(isMot ? r[76] : r[48] ?? '').trim() || null,
    }
  })
}

// ── Comparison ────────────────────────────────────────────────────────────────

interface Diff {
  reg: ProntuarioRegistro
  pontAnterior: number | null
  faixaAnterior: string | null
  delta: number | null
  mudouFaixa: boolean
  isNovo: boolean
  piorou: boolean
}

function calcDiff(atual: ProntuarioRegistro[], anterior: ProntuarioRegistro[]): Diff[] {
  const mapAnt = new Map(anterior.map(r => [r.cpf, r]))
  return atual.map(r => {
    const ant = mapAnt.get(r.cpf)
    const delta = ant != null ? +(r.pontuacao - ant.pontuacao).toFixed(3) : null
    return {
      reg: r,
      pontAnterior: ant?.pontuacao ?? null,
      faixaAnterior: ant?.faixa ?? null,
      delta,
      mudouFaixa: ant ? r.faixa !== ant.faixa : false,
      isNovo: !ant,
      piorou: delta != null ? delta > 0 : false,
    }
  }).sort((a, b) => b.reg.pontuacao - a.reg.pontuacao)
}

// ── Panel component ───────────────────────────────────────────────────────────

interface HistPoint { date: string; pont: number; faixa: string; label: string }

function ProntuarioPanel({ tipo, filial }: { tipo: 'motorista' | 'ajudante'; filial: string }) {
  const [snapshots, setSnapshots] = useState<ProntuarioSnapshot[]>([])
  const [registros, setRegistros] = useState<Map<string, ProntuarioRegistro[]>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().slice(0, 10))
  const [uploadando, setUploadando] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [expandedCpf, setExpandedCpf] = useState<string | null>(null)
  const [personHistory, setPersonHistory] = useState<HistPoint[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [busca, setBusca] = useState('')
  const label = tipo === 'motorista' ? 'Motoristas' : 'Ajudantes'

  async function carregar() {
    setCarregando(true)
    const { data: snaps } = await supabase
      .from('prontuario_snapshots')
      .select('*')
      .eq('filial', filial)
      .eq('tipo', tipo)
      .order('data_referencia', { ascending: false })
      .limit(10)

    const lista = snaps ?? []
    setSnapshots(lista)

    if (lista.length > 0) {
      const ids = lista.slice(0, 2).map(s => s.id)
      const { data: regs } = await supabase
        .from('prontuario_registros')
        .select('*')
        .in('snapshot_id', ids)

      const m = new Map<string, ProntuarioRegistro[]>()
      ;(regs ?? []).forEach(r => {
        if (!m.has(r.snapshot_id)) m.set(r.snapshot_id, [])
        m.get(r.snapshot_id)!.push(r)
      })
      setRegistros(m)
      setSelectedId(lista[0].id)
    }
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [filial, tipo])

  async function carregarHistoria(cpf: string, snaps: ProntuarioSnapshot[]) {
    setLoadingHistory(true)
    setPersonHistory([])
    const ids = snaps.map(s => s.id)
    if (!ids.length) { setLoadingHistory(false); return }

    const { data } = await supabase
      .from('prontuario_registros')
      .select('pontuacao, faixa, snapshot_id')
      .eq('filial', filial)
      .eq('tipo', tipo)
      .eq('cpf', cpf)
      .in('snapshot_id', ids)

    const snapMap = new Map(snaps.map(s => [s.id, s]))
    const hist: HistPoint[] = (data ?? [])
      .map(r => {
        const snap = snapMap.get(r.snapshot_id)
        return {
          date: snap?.data_referencia ?? '',
          pont: r.pontuacao,
          faixa: r.faixa,
          label: snap ? new Date(snap.data_referencia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '',
        }
      })
      .filter(h => h.date)
      .sort((a, b) => a.date.localeCompare(b.date))

    setPersonHistory(hist)
    setLoadingHistory(false)
  }

  function toggleRow(cpf: string) {
    if (expandedCpf === cpf) {
      setExpandedCpf(null)
      setPersonHistory([])
    } else {
      setExpandedCpf(cpf)
      carregarHistoria(cpf, snapshots)
    }
  }

  const onDrop = useCallback(async (files: File[]) => {
    if (!files[0]) return
    setUploadando(true)
    const buffer = await files[0].arrayBuffer()
    const rows = parseProntuario(buffer, tipo, filial)

    const { data: snap } = await supabase
      .from('prontuario_snapshots')
      .insert({ filial, tipo, data_referencia: uploadDate, nome_arquivo: files[0].name, total_registros: rows.length })
      .select()
      .single()

    if (snap) {
      for (let i = 0; i < rows.length; i += 50) {
        await supabase.from('prontuario_registros').insert(
          rows.slice(i, i + 50).map(r => ({ ...r, snapshot_id: snap.id }))
        )
      }
    }
    setUploadando(false)
    carregar()
  }, [filial, tipo, uploadDate])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    multiple: false,
  })

  const current = selectedId ? (registros.get(selectedId) ?? []) : []
  const prevSnap = snapshots[1]
  const previous = prevSnap ? (registros.get(prevSnap.id) ?? []) : []
  const diffs = calcDiff(current, previous)
  const diffsFiltered = busca.trim()
    ? diffs.filter(d => d.reg.nome.toLowerCase().includes(busca.toLowerCase()) || d.reg.cpf.includes(busca))
    : diffs

  const total = current.length
  const porFaixa = FAIXAS.map(f => ({ faixa: f, count: current.filter(r => r.faixa === f).length }))
  const emVerde   = current.filter(r => r.faixa === 'Verde').length
  const criticos  = current.filter(r => r.faixa === 'Vermelha').length
  const bloqueios = current.filter(r => r.faixa === 'Roxa').length
  const mediaPont = total > 0 ? (current.reduce((s, r) => s + r.pontuacao, 0) / total).toFixed(2) : '0'

  const mudouFaixa     = diffs.filter(d => d.mudouFaixa)
  const pioraramFaixa  = mudouFaixa.filter(d => FAIXAS.indexOf(d.reg.faixa as Faixa) > FAIXAS.indexOf(d.faixaAnterior as Faixa))
  const melhoraramFaixa = mudouFaixa.filter(d => FAIXAS.indexOf(d.reg.faixa as Faixa) < FAIXAS.indexOf(d.faixaAnterior as Faixa))
  const novos = diffs.filter(d => d.isNovo)

  const topCats = Object.keys(CAT_LABEL)
    .map(cat => ({ cat, name: CAT_LABEL[cat], total: current.reduce((s, r) => s + (r.detalhes[cat] ?? 0), 0) }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total)

  function exportar() {
    const dados = diffs.map(d => ({
      'Nome': d.reg.nome, 'CPF': d.reg.cpf, 'Status': d.reg.status,
      'Pontuação Atual': d.reg.pontuacao, 'Faixa Atual': d.reg.faixa,
      'Pontuação Anterior': d.pontAnterior ?? '', 'Faixa Anterior': d.faixaAnterior ?? '',
      'Variação': d.delta ?? '', 'Mudou Faixa': d.mudouFaixa ? 'SIM' : 'NÃO',
    }))
    const ws2 = XLSX.utils.json_to_sheet(dados)
    const wb2 = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb2, ws2, label)
    XLSX.writeFile(wb2, `Prontuario_${label}_${uploadDate}.xlsx`)
  }

  if (carregando) return (
    <div className="flex items-center justify-center py-16 text-gray-400">
      <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
    </div>
  )

  const colSpan = previous.length > 0 ? 6 : 5

  return (
    <div className="space-y-5">
      {/* Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3 mb-3">
          <label className="text-xs text-gray-500 font-medium">Data de referência:</label>
          <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
          {snapshots.length > 0 && (
            <button onClick={exportar} className="ml-auto flex items-center gap-1.5 text-xs text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50">
              <Download size={13} /> Exportar
            </button>
          )}
        </div>
        <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isDragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
          <input {...getInputProps()} />
          {uploadando ? <Loader2 size={20} className="mx-auto text-brand-500 animate-spin" /> : <Upload size={20} className="mx-auto text-gray-400 mb-1" />}
          <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : `Arraste o prontuário de ${label} (.xls/.xlsx)`}</p>
        </div>
      </div>

      {snapshots.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users size={36} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Faça o upload do prontuário para começar.</p>
        </div>
      ) : (
        <>
          {/* Snapshot selector */}
          {snapshots.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium">Referência:</span>
              {snapshots.map(s => (
                <button key={s.id} onClick={() => setSelectedId(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${selectedId === s.id ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'}`}>
                  <Calendar size={11} /> {new Date(s.data_referencia + 'T12:00:00').toLocaleDateString('pt-BR')}
                  <span className="opacity-60">({s.total_registros})</span>
                </button>
              ))}
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { lb: 'Total',     value: total,     sub: `Média: ${mediaPont} pts`,  cor: undefined },
              { lb: 'Em Verde',  value: emVerde,   sub: '0 – 10,009 pts',           cor: 'text-green-700' },
              { lb: 'Críticos',  value: criticos,  sub: 'Vermelha · 30 – 40 pts',   cor: criticos  > 0 ? 'text-red-600'    : undefined },
              { lb: 'Bloqueio',  value: bloqueios, sub: 'Roxa · acima de 40 pts',   cor: bloqueios > 0 ? 'text-purple-700' : undefined },
            ] as const).map(({ lb, value, sub, cor }) => (
              <div key={lb} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">{lb}</p>
                <p className={`text-3xl font-bold mt-0.5 ${cor ?? 'text-gray-900'}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* Faixa distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-semibold text-gray-700 mb-4">Distribuição por Faixa</p>
            <div className="space-y-2">
              {porFaixa.map(({ faixa, count }) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={faixa} className="flex items-center gap-3">
                    <div className="w-36 flex items-center gap-1.5 shrink-0">
                      <FaixaBadge faixa={faixa} />
                      {faixa === 'Roxa'     && <span className="text-xs text-purple-600 font-medium">Bloqueio</span>}
                      {faixa === 'Vermelha' && <span className="text-xs text-red-600 font-medium">Crítico</span>}
                    </div>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-5 rounded-full flex items-center justify-end pr-2 transition-all"
                        style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%`, backgroundColor: FAIXA_COR[faixa as Faixa] }}>
                        {count > 0 && <span className="text-white text-xs font-bold">{count}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Alertas de mudança de faixa */}
          {previous.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[
                {
                  list: pioraramFaixa, icon: TrendingUp, cor: 'red',
                  title: `Subiram de faixa (${pioraramFaixa.length})`,
                  delta: (d: Diff) => d.delta != null ? <span className="text-red-600 font-medium ml-1">+{d.delta.toFixed(2)}</span> : null,
                },
                {
                  list: melhoraramFaixa, icon: TrendingDown, cor: 'green',
                  title: `Melhoraram de faixa (${melhoraramFaixa.length})`,
                  delta: (d: Diff) => d.delta != null ? <span className="text-green-600 font-medium ml-1">{d.delta.toFixed(2)}</span> : null,
                },
                {
                  list: novos, icon: Users, cor: 'blue',
                  title: `Novos / Retornaram (${novos.length})`,
                  delta: () => null,
                },
              ].map(({ list, icon: Icon, cor, title, delta }) => (
                <div key={title} className={`rounded-xl border p-4 ${list.length > 0 ? `bg-${cor}-50 border-${cor}-200` : 'bg-gray-50 border-gray-200'}`}>
                  <p className={`text-xs font-semibold text-${cor}-700 mb-2 flex items-center gap-1`}>
                    <Icon size={13} /> {title}
                  </p>
                  {list.length === 0
                    ? <p className="text-xs text-gray-400">Nenhum</p>
                    : list.slice(0, 8).map(d => (
                      <div key={d.reg.cpf} className="text-xs mb-1.5">
                        <span className="font-medium text-gray-900">{d.reg.nome.split(' ').slice(0, 2).join(' ')}</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {d.faixaAnterior && <><FaixaBadge faixa={d.faixaAnterior} /><span className="text-gray-400">→</span></>}
                          <FaixaBadge faixa={d.reg.faixa} />
                          {delta(d)}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}

          {/* Top categorias */}
          {topCats.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-4">Infrações por Categoria</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={topCats.map(c => ({ name: c.name, total: c.total }))} barSize={36}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={28} />
                  <Tooltip />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {topCats.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#ef4444' : i === 1 ? '#f97316' : '#1a4451'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Ranking table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center gap-3">
              <span className="text-xs text-gray-500 font-medium shrink-0">Ranking — {current.length} colaboradores</span>
              <div className="relative flex-1 max-w-xs">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Buscar nome ou CPF..." value={busca} onChange={e => setBusca(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400" />
              </div>
              {previous.length > 0 && (
                <span className="text-xs text-gray-400 ml-auto shrink-0">
                  vs {new Date(prevSnap.data_referencia + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">#</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Nome</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-500 text-xs">Faixa</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-500 text-xs">Pontuação</th>
                  {previous.length > 0 && <th className="text-center px-4 py-2.5 font-medium text-gray-500 text-xs">Variação</th>}
                  <th className="text-center px-4 py-2.5 font-medium text-gray-500 text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {diffsFiltered.map((d, i) => {
                  const isExp = expandedCpf === d.reg.cpf
                  const catData = Object.entries(d.reg.detalhes)
                    .filter(([, v]) => v > 0)
                    .sort(([, a], [, b]) => b - a)
                  const maxCat = catData[0]?.[1] ?? 1

                  return (
                    <Fragment key={d.reg.cpf}>
                      <tr
                        className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${d.reg.faixa === 'Roxa' ? 'bg-purple-50' : d.reg.faixa === 'Vermelha' ? 'bg-red-50' : ''}`}
                        onClick={() => toggleRow(d.reg.cpf)}
                      >
                        <td className="px-4 py-2.5 text-xs text-gray-400 font-bold">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {isExp ? <ChevronUp size={12} className="text-gray-400 shrink-0" /> : <ChevronDown size={12} className="text-gray-400 shrink-0" />}
                            <span className="text-sm font-medium text-gray-900">{d.reg.nome}</span>
                            {d.isNovo && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Novo</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center"><FaixaBadge faixa={d.reg.faixa} /></td>
                        <td className="px-4 py-2.5 text-center font-semibold text-gray-800">{d.reg.pontuacao.toFixed(2)}</td>
                        {previous.length > 0 && (
                          <td className="px-4 py-2.5 text-center">
                            {d.delta == null
                              ? <span className="text-gray-400 text-xs">—</span>
                              : d.delta > 0
                                ? <span className="flex items-center justify-center gap-0.5 text-red-600 text-xs font-medium"><TrendingUp size={12} />+{d.delta.toFixed(2)}</span>
                                : d.delta < 0
                                  ? <span className="flex items-center justify-center gap-0.5 text-green-600 text-xs font-medium"><TrendingDown size={12} />{d.delta.toFixed(2)}</span>
                                  : <span className="text-gray-400"><Minus size={12} className="inline" /></span>}
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-center">
                          {d.reg.status === 'BLOQUEADO'
                            ? <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">BLOQUEADO</span>
                            : <span className="text-xs text-gray-400">{d.reg.status ?? '—'}</span>}
                        </td>
                      </tr>

                      {isExp && (
                        <tr>
                          <td colSpan={colSpan} className="bg-gray-50 border-b border-gray-200 p-4">
                            <div className="space-y-4">
                              {/* Info grid */}
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                                {[
                                  { k: 'CPF', v: d.reg.cpf || '—' },
                                  { k: 'Cargo', v: d.reg.cargo || '—' },
                                  { k: 'Região', v: d.reg.regiao || '—' },
                                  { k: 'Operação', v: d.reg.operacao || '—' },
                                  { k: 'Status', v: d.reg.status || '—' },
                                  { k: 'Motivo', v: d.reg.motivo || '—' },
                                  { k: 'Sonolência', v: String(d.reg.sonolencia) },
                                  { k: 'Situação', v: d.reg.situacao_empregado || '—' },
                                ].map(({ k, v }) => (
                                  <div key={k} className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                                    <span className="text-gray-400 block mb-0.5">{k}</span>
                                    <span className={`font-medium ${k === 'Sonolência' && Number(v) > 0 ? 'text-orange-600' : 'text-gray-800'}`}>{v}</span>
                                  </div>
                                ))}
                                {d.faixaAnterior && (
                                  <div className="col-span-2 lg:col-span-4 bg-white rounded-lg border border-gray-100 px-3 py-2 flex items-center gap-2">
                                    <span className="text-gray-400">Evolução de faixa:</span>
                                    <FaixaBadge faixa={d.faixaAnterior} />
                                    <span className="text-gray-400">→</span>
                                    <FaixaBadge faixa={d.reg.faixa} />
                                    {d.delta != null && (
                                      <span className={`text-xs font-semibold ml-1 ${d.delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {d.delta > 0 ? '+' : ''}{d.delta.toFixed(2)} pts
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Histórico de pontuação */}
                                <div className="bg-white rounded-lg border border-gray-100 p-3">
                                  <p className="text-xs font-semibold text-gray-600 mb-2">Histórico de Pontuação</p>
                                  {loadingHistory ? (
                                    <div className="flex items-center justify-center py-8 text-gray-400">
                                      <Loader2 size={16} className="animate-spin mr-1" /> Carregando...
                                    </div>
                                  ) : personHistory.length < 2 ? (
                                    <div className="flex items-center justify-center py-8 text-xs text-gray-400 text-center">
                                      Faça mais uploads para ver a evolução da pontuação ao longo do tempo.
                                    </div>
                                  ) : (
                                    <ResponsiveContainer width="100%" height={150}>
                                      <LineChart data={personHistory} margin={{ top: 4, right: 10, left: 0, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} width={30} />
                                        <Tooltip formatter={(v: number) => [`${v.toFixed(2)} pts`, 'Pontuação']} labelFormatter={l => `Semana: ${l}`} />
                                        <ReferenceLine y={10} stroke="#eab308" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Amarela', fontSize: 9, fill: '#eab308', position: 'right' }} />
                                        <ReferenceLine y={20} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Laranja', fontSize: 9, fill: '#f97316', position: 'right' }} />
                                        <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Vermelha', fontSize: 9, fill: '#ef4444', position: 'right' }} />
                                        <ReferenceLine y={40} stroke="#a855f7" strokeDasharray="4 4" strokeWidth={1} label={{ value: 'Bloqueio', fontSize: 9, fill: '#a855f7', position: 'right' }} />
                                        <Line type="monotone" dataKey="pont" stroke="#1a4451" strokeWidth={2}
                                          dot={{ fill: '#1a4451', r: 3 }} activeDot={{ r: 5 }} />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  )}
                                </div>

                                {/* Infrações por categoria */}
                                <div className="bg-white rounded-lg border border-gray-100 p-3">
                                  <p className="text-xs font-semibold text-gray-600 mb-2">Infrações por Categoria</p>
                                  {catData.length === 0 ? (
                                    <div className="flex items-center justify-center py-8 text-xs text-gray-400">
                                      Sem infrações registradas neste upload.
                                    </div>
                                  ) : (
                                    <div className="space-y-2 pt-1">
                                      {catData.map(([cat, val]) => (
                                        <div key={cat} className="flex items-center gap-2 text-xs">
                                          <span className="w-20 text-gray-500 text-right shrink-0">{CAT_LABEL[cat] ?? cat}</span>
                                          <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                                            <div className="h-4 rounded flex items-center justify-end pr-1.5"
                                              style={{
                                                width: `${Math.max((val / maxCat) * 100, 8)}%`,
                                                backgroundColor: val === maxCat ? '#ef4444' : val >= maxCat * 0.6 ? '#f97316' : '#1a4451',
                                              }}>
                                              <span className="text-white text-xs font-bold">
                                                {val % 1 === 0 ? val : val.toFixed(2)}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
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
        </>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Prontuario() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<'motoristas' | 'ajudantes'>('motoristas')

  if (!usuario) return null

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Prontuário</h2>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Building2 size={12} /> {usuario.filial}</p>
        </div>
        <button onClick={() => window.location.reload()}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([['motoristas', 'Motoristas'], ['ajudantes', 'Ajudantes']] as const).map(([id, lbl]) => (
          <button key={id} onClick={() => setAba(id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === id ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {aba === 'motoristas' && <ProntuarioPanel tipo="motorista" filial={usuario.filial} />}
      {aba === 'ajudantes'  && <ProntuarioPanel tipo="ajudante"  filial={usuario.filial} />}
    </div>
  )
}
