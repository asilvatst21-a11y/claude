import { useEffect, useMemo, useState } from 'react'
import {
  GitBranch, Plus, X, Loader2, RefreshCw, Building2,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { FluxoPunitivo } from '../types'

// ─── Sequência punitiva ───────────────────────────────────────────────────────

type TipoAcao = 'Advertência Verbal' | 'DTO' | 'Advertência Escrita' | 'Suspensão'

const TIPOS: TipoAcao[] = ['Advertência Verbal', 'DTO', 'Advertência Escrita', 'Suspensão']

const ORIGENS = ['GSDPQ', 'Relatos', 'Telemetria', 'Manual'] as const
type Origem = typeof ORIGENS[number]

const ORIGEM_COLOR: Record<Origem, string> = {
  GSDPQ:      'bg-blue-50 text-blue-700 border-blue-200',
  Relatos:    'bg-orange-50 text-orange-700 border-orange-200',
  Telemetria: 'bg-purple-50 text-purple-700 border-purple-200',
  Manual:     'bg-gray-100 text-gray-600 border-gray-200',
}

const ACAO_COLOR: Record<string, string> = {
  'Advertência Verbal':   'bg-yellow-50 text-yellow-800 border-yellow-200',
  'DTO':                  'bg-orange-50 text-orange-700 border-orange-200',
  'Advertência Escrita':  'bg-red-50 text-red-700 border-red-200',
  'Suspensão':            'bg-rose-100 text-rose-800 border-rose-300',
}

// ─── Lógica de sequência ──────────────────────────────────────────────────────

interface ProximaAcao {
  tipo: TipoAcao
  descricao: string
  nivel: 'baixo' | 'medio' | 'alto' | 'critico'
}

function calcProxima(historico: FluxoPunitivo[]): ProximaAcao {
  const verbais  = historico.filter(h => h.tipo_acao === 'Advertência Verbal').length
  const dtos     = historico.filter(h => h.tipo_acao === 'DTO').length
  const escritas = historico.filter(h => h.tipo_acao === 'Advertência Escrita').length
  const susps    = historico.filter(h => h.tipo_acao === 'Suspensão').length

  if (verbais < 2) return {
    tipo: 'Advertência Verbal',
    descricao: `${verbais + 1}ª Advertência Verbal`,
    nivel: 'baixo',
  }
  if (dtos < 2) return {
    tipo: 'DTO',
    descricao: `${dtos + 1}º DTO`,
    nivel: 'medio',
  }
  if (escritas < 5) return {
    tipo: 'Advertência Escrita',
    descricao: `${escritas + 1}ª Advertência Escrita`,
    nivel: 'alto',
  }
  const dias = Math.min(susps + 1, 5)
  return {
    tipo: 'Suspensão',
    descricao: `Suspensão de ${dias} dia${dias > 1 ? 's' : ''}`,
    nivel: 'critico',
  }
}

function nivelStyle(nivel: string) {
  if (nivel === 'baixo')   return 'bg-yellow-50 text-yellow-800 border-yellow-300'
  if (nivel === 'medio')   return 'bg-orange-50 text-orange-700 border-orange-200'
  if (nivel === 'alto')    return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-rose-100 text-rose-900 border-rose-300 font-bold'
}

function posicaoBar(historico: FluxoPunitivo[]) {
  const verbais  = Math.min(historico.filter(h => h.tipo_acao === 'Advertência Verbal').length, 2)
  const dtos     = Math.min(historico.filter(h => h.tipo_acao === 'DTO').length, 2)
  const escritas = Math.min(historico.filter(h => h.tipo_acao === 'Advertência Escrita').length, 5)
  const susps    = Math.min(historico.filter(h => h.tipo_acao === 'Suspensão').length, 5)
  return { verbais, dtos, escritas, susps }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '—'
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ─── Modal nova ação ─────────────────────────────────────────────────────────

interface ModalProps {
  filial: string
  colaboradorInicial?: string
  colaboradores: string[]
  registradoPor: string
  onClose: () => void
  onSalvar: (entry: Omit<FluxoPunitivo, 'id' | 'created_at'>) => Promise<void>
}

function ModalNovaAcao({ filial, colaboradorInicial = '', colaboradores, registradoPor, onClose, onSalvar }: ModalProps) {
  const [colab,   setColab]   = useState(colaboradorInicial)
  const [novoNome, setNovoNome] = useState('')
  const [tipo,    setTipo]    = useState<TipoAcao>('Advertência Verbal')
  const [origem,  setOrigem]  = useState<Origem>('Manual')
  const [data,    setData]    = useState(new Date().toISOString().slice(0, 10))
  const [dias,    setDias]    = useState('')
  const [obs,     setObs]     = useState('')
  const [saving,  setSaving]  = useState(false)

  const nomeColab = colab === '__novo__' ? novoNome.trim() : colab

  async function handleSave() {
    if (!nomeColab || !tipo) return
    setSaving(true)
    await onSalvar({
      filial,
      colaborador_nome: nomeColab,
      origem,
      tipo_acao: tipo,
      dias_suspensao: tipo === 'Suspensão' ? (parseInt(dias) || null) : null,
      data_acao: data || null,
      observacao: obs.trim() || null,
      registrado_por: registradoPor,
      source_id: null,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="font-semibold text-gray-900">Registrar Ação Punitiva</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {/* Colaborador */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Colaborador</label>
            <select value={colab} onChange={e => setColab(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400">
              <option value="">Selecione…</option>
              {colaboradores.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__novo__">+ Novo colaborador…</option>
            </select>
            {colab === '__novo__' && (
              <input className="mt-2 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400"
                placeholder="Nome completo" value={novoNome} onChange={e => setNovoNome(e.target.value)} />
            )}
          </div>

          {/* Origem */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Origem</label>
            <div className="flex gap-2 flex-wrap">
              {ORIGENS.map(o => (
                <button key={o} onClick={() => setOrigem(o)}
                  className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${origem === o ? ORIGEM_COLOR[o] : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                  {o}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo de ação */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Tipo de Ação</label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS.map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  className={`px-3 py-2 text-xs rounded-lg border font-medium transition-colors ${tipo === t ? ACAO_COLOR[t] : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {tipo === 'Suspensão' && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Dias de Suspensão</label>
              <input type="number" min={1} max={5} value={dias} onChange={e => setDias(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400"
                placeholder="1 a 5 dias" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Observação</label>
            <textarea rows={2} value={obs} onChange={e => setObs(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
              placeholder="Motivo, contexto, etc." />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={handleSave}
            disabled={saving || !nomeColab || !tipo || (tipo === 'Suspensão' && !dias)}
            className="px-4 py-2 text-sm bg-brand-700 text-white rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Progress bar component ───────────────────────────────────────────────────

function SequenciaBar({ historico }: { historico: FluxoPunitivo[] }) {
  const { verbais, dtos, escritas, susps } = posicaoBar(historico)
  const steps = [
    { label: 'Ad. Verbal', total: 2, filled: verbais, color: 'bg-yellow-400' },
    { label: 'DTO',        total: 2, filled: dtos,    color: 'bg-orange-400' },
    { label: 'Ad. Escrita',total: 5, filled: escritas,color: 'bg-red-400'    },
    { label: 'Suspensão',  total: 5, filled: susps,   color: 'bg-rose-600'   },
  ]
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {steps.map(s => (
        <div key={s.label} className="flex flex-col items-center gap-0.5">
          <div className="flex gap-0.5">
            {Array.from({ length: s.total }).map((_, i) => (
              <div key={i} className={`w-3 h-3 rounded-sm ${i < s.filled ? s.color : 'bg-gray-200'}`} />
            ))}
          </div>
          <span className="text-[9px] text-gray-400 leading-none">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Linha do colaborador ─────────────────────────────────────────────────────

function ColabRow({ nome, historico, onAdd }: {
  nome: string; historico: FluxoPunitivo[]; onAdd: () => void
}) {
  const [open, setOpen] = useState(false)
  const proxima = calcProxima(historico)
  const sorted = [...historico].sort((a, b) => (a.data_acao ?? a.created_at).localeCompare(b.data_acao ?? b.created_at))
  const ultima = sorted[sorted.length - 1]

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {open ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
            <span className="text-sm font-medium text-gray-900">{nome}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <SequenciaBar historico={historico} />
        </td>
        <td className="px-4 py-3">
          {ultima ? (
            <div>
              <span className={`text-xs px-2 py-0.5 rounded border font-medium ${ACAO_COLOR[ultima.tipo_acao] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {ultima.tipo_acao}
              </span>
              <span className="text-xs text-gray-400 ml-2">{fmtDate(ultima.data_acao)}</span>
            </div>
          ) : <span className="text-xs text-gray-400">—</span>}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-1 rounded border font-medium ${nivelStyle(proxima.nivel)}`}>
            {proxima.descricao}
          </span>
        </td>
        <td className="px-4 py-3 text-center text-sm text-gray-500">{historico.length}</td>
        <td className="px-4 py-3 text-center">
          <button onClick={e => { e.stopPropagation(); onAdd() }}
            className="flex items-center gap-1 text-xs text-brand-700 border border-brand-200 bg-brand-50 px-2 py-1 rounded hover:bg-brand-100 mx-auto">
            <Plus size={12} /> Ação
          </button>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={6} className="bg-gray-50 border-b border-gray-200 px-6 py-4">
            <div className="space-y-2 max-w-3xl">
              <p className="text-xs font-semibold text-gray-600 uppercase mb-3">Histórico completo</p>
              {sorted.map(h => (
                <div key={h.id} className="flex items-start gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2.5 text-xs">
                  <span className="text-gray-400 w-16 shrink-0">{fmtDate(h.data_acao)}</span>
                  <span className={`px-2 py-0.5 rounded border font-medium shrink-0 ${ACAO_COLOR[h.tipo_acao] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {h.tipo_acao}{h.dias_suspensao ? ` (${h.dias_suspensao}d)` : ''}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] shrink-0 ${ORIGEM_COLOR[h.origem as Origem] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    {h.origem}
                  </span>
                  {h.observacao && <span className="text-gray-500 italic flex-1 truncate">{h.observacao}</span>}
                  {h.registrado_por && <span className="text-gray-400 shrink-0 ml-auto">{h.registrado_por}</span>}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FluxoPunitivo() {
  const { usuario } = useAuth()
  const [acoes, setAcoes]     = useState<FluxoPunitivo[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<{ open: boolean; colaborador?: string }>({ open: false })
  const [busca, setBusca]     = useState('')
  const [filtroOrigem, setFiltroOrigem] = useState<Origem | 'Todas'>('Todas')

  async function carregar() {
    if (!usuario) return
    setLoading(true)

    // Load manual entries
    const { data: manual } = await supabase
      .from('fluxo_punitivo').select('*').eq('filial', usuario.filial)

    // Load GSDPQ actions and normalize
    const { data: gsdpq } = await supabase
      .from('gsdpq_acoes').select('*').eq('filial', usuario.filial)

    // Load Relatos actions and normalize
    const { data: relatos } = await supabase
      .from('relatos_acoes').select('*').eq('filial', usuario.filial)

    // Load Telemetria actions and normalize
    const { data: telemetria } = await supabase
      .from('telemetria_acoes').select('*').eq('filial', usuario.filial)

    const merged: FluxoPunitivo[] = [
      ...(manual ?? []) as FluxoPunitivo[],

      ...(gsdpq ?? []).map((a: any) => ({
        id: 'gsdpq_' + a.id,
        filial: a.filial,
        colaborador_nome: a.colaborador_nome,
        origem: 'GSDPQ' as Origem,
        tipo_acao: a.tipo_acao,
        dias_suspensao: a.dias_suspensao ?? null,
        data_acao: a.data_avaliacao ?? null,
        observacao: a.observacao ?? null,
        registrado_por: a.registrado_por ?? null,
        source_id: a.id,
        created_at: a.created_at,
      })),

      ...(relatos ?? []).map((a: any) => ({
        id: 'relato_' + a.id,
        filial: a.filial,
        colaborador_nome: a.pessoa_relatada ?? a.colaborador_nome ?? '',
        origem: 'Relatos' as Origem,
        tipo_acao: a.tipo_acao,
        dias_suspensao: a.dias_suspensao ?? null,
        data_acao: a.data_relato ?? null,
        observacao: a.observacao ?? null,
        registrado_por: a.registrado_por ?? null,
        source_id: a.id,
        created_at: a.created_at,
      })).filter(a => a.colaborador_nome),

      ...(telemetria ?? []).map((a: any) => ({
        id: 'tel_' + a.id,
        filial: a.filial,
        colaborador_nome: a.motorista ?? '',
        origem: 'Telemetria' as Origem,
        tipo_acao: a.tipo_acao,
        dias_suspensao: a.dias_suspensao ?? null,
        data_acao: null,
        observacao: a.observacao ?? null,
        registrado_por: a.registrado_por ?? null,
        source_id: a.id,
        created_at: a.created_at,
      })).filter(a => a.colaborador_nome),
    ]

    setAcoes(merged)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [usuario])

  async function handleSalvar(entry: Omit<FluxoPunitivo, 'id' | 'created_at'>) {
    await supabase.from('fluxo_punitivo').insert(entry)
    setModal({ open: false })
    carregar()
  }

  const byColab = useMemo(() => {
    const map = new Map<string, FluxoPunitivo[]>()
    acoes.forEach(a => {
      if (!a.colaborador_nome) return
      if (!map.has(a.colaborador_nome)) map.set(a.colaborador_nome, [])
      map.get(a.colaborador_nome)!.push(a)
    })
    return map
  }, [acoes])

  const colaboradores = useMemo(() => [...byColab.keys()].sort(), [byColab])

  const filtrado = useMemo(() => colaboradores.filter(nome => {
    if (busca && !nome.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroOrigem !== 'Todas') {
      const hist = byColab.get(nome) ?? []
      if (!hist.some(h => h.origem === filtroOrigem)) return false
    }
    return true
  }), [colaboradores, busca, filtroOrigem, byColab])

  // KPIs
  const totalColab = colaboradores.length
  const emRisco = colaboradores.filter(n => {
    const p = calcProxima(byColab.get(n) ?? [])
    return p.nivel === 'alto' || p.nivel === 'critico'
  }).length
  const origemCounts = useMemo(() => {
    const c: Record<string, number> = {}
    acoes.forEach(a => { c[a.origem] = (c[a.origem] ?? 0) + 1 })
    return c
  }, [acoes])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      <Loader2 size={24} className="animate-spin mr-2" /> Carregando fluxo punitivo…
    </div>
  )

  return (
    <div className="p-6 max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <GitBranch size={20} className="text-brand-700" /> Fluxo Punitivo
          </h1>
          <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
            <Building2 size={12} /> {usuario?.filial} · Histórico unificado de ações disciplinares
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => setModal({ open: true })}
            className="flex items-center gap-2 text-sm bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-600 font-medium">
            <Plus size={16} /> Nova Ação
          </button>
        </div>
      </div>

      {/* Legenda da sequência */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Sequência Punitiva</p>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {[
            { label: '2× Advertência Verbal',  color: 'bg-yellow-400', text: 'text-yellow-800' },
            { label: '→', color: '', text: 'text-gray-400' },
            { label: '2× DTO',                 color: 'bg-orange-400', text: 'text-orange-800' },
            { label: '→', color: '', text: 'text-gray-400' },
            { label: '5× Advertência Escrita', color: 'bg-red-400',    text: 'text-red-800'    },
            { label: '→', color: '', text: 'text-gray-400' },
            { label: 'Suspensão (1–5 dias)',    color: 'bg-rose-600',   text: 'text-rose-900'   },
          ].map(({ label, color, text }, i) => (
            color
              ? <span key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${text} bg-opacity-10`} style={{ background: 'transparent' }}>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />{label}
                </span>
              : <span key={i} className={`font-bold ${text}`}>{label}</span>
          ))}
        </div>
      </div>

      {/* KPIs */}
      {acoes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">Colaboradores</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{totalColab}</p>
          </div>
          <div className={`bg-white rounded-xl border p-4 shadow-sm ${emRisco > 0 ? 'border-red-200' : 'border-gray-100'}`}>
            <p className="text-xs text-gray-500">Em risco (Ad.Escrita/Susp.)</p>
            <p className={`text-2xl font-bold mt-0.5 ${emRisco > 0 ? 'text-red-600' : 'text-gray-900'}`}>{emRisco}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">Total de ações</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{acoes.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs text-gray-500">Origens</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(origemCounts).map(([o, n]) => (
                <span key={o} className={`text-xs px-1.5 py-0.5 rounded border ${ORIGEM_COLOR[o as Origem] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  {o}: {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      {acoes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm flex items-center gap-3 flex-wrap">
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar colaborador…"
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 w-52" />
          <div className="flex gap-1">
            {(['Todas', ...ORIGENS] as const).map(o => (
              <button key={o} onClick={() => setFiltroOrigem(o as any)}
                className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors ${
                  filtroOrigem === o
                    ? o === 'Todas' ? 'bg-brand-700 text-white border-brand-700' : ORIGEM_COLOR[o as Origem]
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                {o}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-gray-400">{filtrado.length} colaborador(es)</span>
        </div>
      )}

      {/* Tabela */}
      {acoes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <GitBranch size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma ação registrada ainda.</p>
          <p className="text-xs mt-1">As ações do GSDPQ, Relatos e Telemetria aparecem automaticamente aqui.</p>
          <button onClick={() => setModal({ open: true })}
            className="mt-4 flex items-center gap-2 text-sm bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-600 font-medium mx-auto">
            <Plus size={16} /> Registrar primeira ação
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Colaborador</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Progresso na Sequência</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Última Ação</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Próxima Ação Sugerida</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Total</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {filtrado.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-xs">Nenhum resultado</td></tr>
              )}
              {filtrado.map(nome => (
                <ColabRow
                  key={nome}
                  nome={nome}
                  historico={byColab.get(nome) ?? []}
                  onAdd={() => setModal({ open: true, colaborador: nome })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legenda de risco */}
      {acoes.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-500 pb-2">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-yellow-300" /> Advertência Verbal</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-400" /> DTO</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400" /> Advertência Escrita</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-600" /> Suspensão</span>
          <span className="flex items-center gap-1.5 ml-auto"><AlertTriangle size={12} className="text-red-500" /> Vermelho = próxima ação é Advertência Escrita ou Suspensão</span>
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <ModalNovaAcao
          filial={usuario!.filial}
          colaboradorInicial={modal.colaborador}
          colaboradores={colaboradores}
          registradoPor={usuario?.nome ?? usuario?.login ?? ''}
          onClose={() => setModal({ open: false })}
          onSalvar={handleSalvar}
        />
      )}
    </div>
  )
}
