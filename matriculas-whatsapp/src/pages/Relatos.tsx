import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from 'recharts'
import {
  Upload, Loader2, Building2, RefreshCw, ChevronDown, ChevronUp,
  FileSearch, Search, Users, X, CheckCircle2, Send, Check, GitBranch,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { enviarMensagemGrupo } from '../lib/zapi'
import type { Relato } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────────────────

interface RelatoAcao {
  id: string
  filial: string
  relato_id: string
  pessoa_relatada: string
  tipo_relato: string | null
  data_relato: string | null
  tipo_acao: string
  dias_suspensao: number | null
  observacao: string | null
  registrado_por: string | null
  created_at: string
}

// ── Constants ─────────────────────────────────────────────────────────────────────────────

const TIPOS_ACAO = ['Reciclagem', 'Advertência Verbal', 'Advertência Escrita', 'Suspensão']

const COR_ACAO: Record<string, string> = {
  'Reciclagem':           'bg-blue-50 text-blue-700 border-blue-200',
  'Advertência Verbal':   'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Advertência Escrita':  'bg-orange-50 text-orange-700 border-orange-200',
  'Suspensão':            'bg-red-50 text-red-700 border-red-200',
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// ── Classificação styling ───────────────────────────────────────────────────────────────────

function classColor(c: string | null) {
  if (!c) return '#94a3b8'
  if (c.includes('POSITIVA')) return '#22c55e'
  if (c.includes('ATO'))      return '#ef4444'
  if (c.includes('INSEGURA')) return '#f97316'
  if (c.includes('QUASE'))    return '#eab308'
  return '#64748b'
}

function ClassBadge({ value }: { value: string | null }) {
  const css = !value ? 'bg-gray-100 text-gray-500 border-gray-200'
    : value.includes('POSITIVA') ? 'bg-green-100 text-green-800 border-green-300'
    : value.includes('ATO')      ? 'bg-red-100 text-red-700 border-red-300'
    : value.includes('INSEGURA') ? 'bg-orange-100 text-orange-800 border-orange-300'
    : value.includes('QUASE')    ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
    : 'bg-gray-100 text-gray-600 border-gray-200'
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${css}`}>{value || '—'}</span>
}

function ClassLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-gray-600">
      {[
        { label: 'Abordagem Positiva', color: '#22c55e' },
        { label: 'Ato Inseguro',       color: '#ef4444' },
        { label: 'Condição Insegura',  color: '#f97316' },
        { label: 'Quase Acidente',     color: '#eab308' },
      ].map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  )
}

// ── Date helpers ────────────────────────────────────────────────────────────────────────────

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

// ── Parsing ───────────────────────────────────────────────────────────────────────────────

function sv(v: unknown) { return String(v ?? '').trim() || null }

function parseRelatos(buffer: ArrayBuffer, filial: string) {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { defval: '', raw: false, header: 1 }) as unknown[][]
  return rows.slice(1).filter(r => r[0]).map(r => ({
    filial,
    external_id:      sv(r[0]),
    data_ocorrencia:  parseDateStr(r[1]),
    data_cadastro:    parseDateStr(r[2]),
    cdd:              sv(r[3]),
    empresa:          sv(r[4]),
    matricula:        sv(r[5]),
    relator:          sv(r[6]),
    funcao:           sv(r[7]),
    equipe:           sv(r[8]),
    classificacao:    sv(r[9]),
    tipo_relato:      sv(r[10]),
    area:             sv(r[11]),
    atividade:        sv(r[12]),
    tarefa_seguranca: sv(r[13]),
    acao_imediata:    sv(r[14]),
    sif:              sv(r[15]),
    empresa_relatada: sv(r[16]),
    pessoa_relatada:  sv(r[17]),
    detalhamento:     sv(r[18]),
    complementacao:   sv(r[19]),
    origem:           sv(r[22]),
    porque_falhou:    sv(r[23]),
    pq1: sv(r[24]), pq2: sv(r[25]), pq3: sv(r[26]), pq4: sv(r[27]), pq5: sv(r[28]),
    motivo1: sv(r[29]), acao1: sv(r[30]),
    motivo2: sv(r[31]), acao2: sv(r[32]),
    motivo3: sv(r[33]), acao3: sv(r[34]),
    data_investigacao: parseDateStr(r[35]),
  }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────────────────

function topN(data: Relato[], key: keyof Relato, n = 10) {
  const m = new Map<string, number>()
  data.forEach(r => { const v = String(r[key] ?? '').trim(); if (v) m.set(v, (m.get(v) ?? 0) + 1) })
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, total]) => ({ name, total }))
}

const ATALHOS = [
  { label: '7d',    dias: 7   },
  { label: '30d',   dias: 30  },
  { label: '90d',   dias: 90  },
  { label: '6m',    dias: 180 },
  { label: '1 ano', dias: 365 },
]

function toISO(d: Date) { return d.toISOString().slice(0, 10) }
function isoToday()     { return toISO(new Date()) }
function isoMinus(dias: number) { const d = new Date(); d.setDate(d.getDate() - dias); return toISO(d) }

// ── Modal Ação Disciplinar ──────────────────────────────────────────────────────────────────

interface ModalAcaoProps {
  pessoaRelatada: string
  tipoRelato: string | null
  dataRelato: string | null
  existente?: RelatoAcao
  onClose: () => void
  onSalvar: (tipo: string, dias: number | null, obs: string) => Promise<void>
}

function ModalAcaoRelato({ pessoaRelatada, tipoRelato, dataRelato, existente, onClose, onSalvar }: ModalAcaoProps) {
  const [tipo,   setTipo]   = useState(existente?.tipo_acao ?? '')
  const [dias,   setDias]   = useState(String(existente?.dias_suspensao ?? ''))
  const [obs,    setObs]    = useState(existente?.observacao ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!tipo) return
    setSaving(true)
    await onSalvar(tipo, tipo === 'Suspensão' ? (parseInt(dias) || null) : null, obs)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">Ação Disciplinar</p>
            <p className="text-xs text-gray-500 mt-0.5">
              <strong>{pessoaRelatada}</strong>
              {tipoRelato && <> · {tipoRelato}</>}
              {dataRelato && <> · {fmtDate(dataRelato)}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Tipo de Ação</p>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_ACAO.map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  className={`px-3 py-2 text-xs rounded-lg border font-medium transition-colors ${
                    tipo === t ? COR_ACAO[t] : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {tipo === 'Suspensão' && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Dias de Suspensão</label>
              <input type="number" min={1} value={dias} onChange={e => setDias(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400"
                placeholder="Ex: 3" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Observação</label>
            <textarea rows={3} value={obs} onChange={e => setObs(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
              placeholder="Detalhes da ação disciplinar..." />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !tipo || (tipo === 'Suspensão' && !dias)}
            className="px-4 py-2 text-sm bg-brand-700 text-white rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {existente ? 'Atualizar' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Relatado Detail Panel ─────────────────────────────────────────────────────────────────

function RelatadoDetail({ nome, relatos, acoes, onSolicitarFluxo, solicitados, fluxosGsdpq }: {
  nome: string
  relatos: Relato[]
  acoes: RelatoAcao[]
  onSolicitarFluxo: (relatos: Relato[]) => void
  solicitados: Set<string>
  fluxosGsdpq: Set<string>
}) {
  const meus = relatos
    .filter(r => r.pessoa_relatada === nome)
    .sort((a, b) => (b.data_ocorrencia ?? '').localeCompare(a.data_ocorrencia ?? ''))

  // Atos inseguros pendentes (sem ação, não-GSDPQ, não solicitados) agrupados por dia
  const pendentesAto = meus.filter(r =>
    r.classificacao?.includes('ATO') &&
    !r.origem?.toUpperCase().includes('GSDPQ') &&
    !acoes.find(a => a.relato_id === r.id) &&
    !solicitados.has(r.id))
  const gruposPendentes = (() => {
    const map = new Map<string, Relato[]>()
    pendentesAto.forEach(r => {
      const dia = (r.data_ocorrencia ?? '').slice(0, 10)
      if (!map.has(dia)) map.set(dia, [])
      map.get(dia)!.push(r)
    })
    return Array.from(map.entries())
      .map(([dia, lista]) => ({ dia, lista }))
      .filter(g => !fluxosGsdpq.has(`${nome}__${g.dia}`))  // ← filtro GSD
  })()

  const diasBloqueadosGsd = (() => {
    const dias = new Set<string>()
    pendentesAto.forEach(r => {
      const dia = (r.data_ocorrencia ?? '').slice(0, 10)
      if (fluxosGsdpq.has(`${nome}__${dia}`)) dias.add(dia)
    })
    return Array.from(dias)
  })()

  const breakdown = [
    { label: 'Ato Inseguro',       color: '#ef4444', match: 'ATO'      },
    { label: 'Condição Insegura',  color: '#f97316', match: 'INSEGURA' },
    { label: 'Quase Acidente',     color: '#eab308', match: 'QUASE'    },
    { label: 'Abordagem Positiva', color: '#22c55e', match: 'POSITIVA' },
  ].map(c => ({ ...c, total: meus.filter(r => r.classificacao?.includes(c.match)).length })).filter(c => c.total > 0)

  return (
    <div className="bg-red-50/30 border-b border-red-100 px-6 py-4">
      <div className="max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">Ocorrências por Tipo — {meus.length} total</p>
          <div className="space-y-2">
            {breakdown.map(({ label, color, total }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-36 shrink-0">{label}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                  <div className="h-5 rounded flex items-center justify-end pr-2"
                    style={{ width: `${Math.max((total / meus.length) * 100, 6)}%`, backgroundColor: color }}>
                    <span className="text-white text-xs font-bold">{total}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">Histórico de Relatos</p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {meus.map(r => {
              const acao       = acoes.find(a => a.relato_id === r.id)
              const isAto      = r.classificacao?.includes('ATO')
              const isGsdpq    = r.origem?.toUpperCase().includes('GSDPQ')
              return (
                <div key={r.id} className="text-xs border-b border-gray-50 pb-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-gray-400 shrink-0 w-12">{fmtDate(r.data_ocorrencia)}</span>
                    <span className="flex-1 text-gray-700 font-medium truncate">{r.tipo_relato ?? r.classificacao ?? '—'}</span>
                    <ClassBadge value={r.classificacao} />
                    {isAto && (
                      isGsdpq
                        ? <span className="shrink-0 text-xs text-gray-400 italic border border-gray-200 px-1.5 py-0.5 rounded">GSDPQ</span>
                        : acao
                          ? <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded border font-medium ${COR_ACAO[acao.tipo_acao]}`}>
                              {acao.tipo_acao}{acao.dias_suspensao ? ` (${acao.dias_suspensao}d)` : ''}
                            </span>
                          : solicitados.has(r.id)
                            ? <span className="shrink-0 flex items-center gap-0.5 text-xs text-green-700 border border-green-200 bg-green-50 px-1.5 py-0.5 rounded">
                                <Check size={10} /> Solicitado
                              </span>
                            : <span className="shrink-0 text-xs text-orange-600">• a solicitar</span>
                    )}
                  </div>
                  {r.relator && (
                    <p className="text-gray-400 pl-14 truncate">
                      Relatante: <span className="text-gray-700 font-medium">{r.relator}</span>
                    </p>
                  )}
                  {r.detalhamento && (
                    <p className="text-gray-500 pl-14 leading-relaxed line-clamp-2">{r.detalhamento}</p>
                  )}
                </div>
              )
            })}
          </div>

          {(gruposPendentes.length > 0 || diasBloqueadosGsd.length > 0) && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase">Solicitar fluxo (agrupado por dia)</p>
              {gruposPendentes.map(g => (
                <button key={g.dia} onClick={() => onSolicitarFluxo(g.lista)}
                  className="w-full flex items-center justify-between gap-2 text-xs text-orange-700 border border-orange-200 bg-orange-50 px-3 py-1.5 rounded hover:bg-orange-100 transition-colors">
                  <span className="flex items-center gap-1.5"><Send size={11} /> {fmtDate(g.dia)}</span>
                  <span className="font-semibold">{g.lista.length} ocorrência{g.lista.length > 1 ? 's' : ''}</span>
                </button>
              ))}
              {diasBloqueadosGsd.map(dia => (
                <div key={dia} className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded">
                  <GitBranch size={11} /> {fmtDate(dia)} — Fluxo já solicitado via GSDPQ
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Relatante Detail Panel ────────────────────────────────────────────────────────────────

function RelatanteDetail({ nome, relatos }: { nome: string; relatos: Relato[] }) {
  const meus = relatos
    .filter(r => r.relator === nome)
    .sort((a, b) => (b.data_ocorrencia ?? '').localeCompare(a.data_ocorrencia ?? ''))

  const breakdown = [
    { label: 'Abordagem Positiva', color: '#22c55e', match: 'POSITIVA' },
    { label: 'Condição Insegura',  color: '#f97316', match: 'INSEGURA' },
    { label: 'Ato Inseguro',       color: '#ef4444', match: 'ATO'      },
    { label: 'Quase Acidente',     color: '#eab308', match: 'QUASE'    },
  ].map(c => ({ ...c, total: meus.filter(r => r.classificacao?.includes(c.match)).length })).filter(c => c.total > 0)

  return (
    <div className="bg-green-50/30 border-b border-green-100 px-6 py-4">
      <div className="max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">O que reportou — {meus.length} relatos</p>
          <div className="space-y-2">
            {breakdown.map(({ label, color, total }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-36 shrink-0">{label}</span>
                <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                  <div className="h-5 rounded flex items-center justify-end pr-2"
                    style={{ width: `${Math.max((total / meus.length) * 100, 6)}%`, backgroundColor: color }}>
                    <span className="text-white text-xs font-bold">{total}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">Relatos realizados</p>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {meus.map(r => (
              <div key={r.id} className="text-xs border-b border-gray-50 pb-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-gray-400 shrink-0 w-12">{fmtDate(r.data_ocorrencia)}</span>
                  <span className="flex-1 text-gray-700 font-medium truncate">{r.tipo_relato ?? '—'}</span>
                  <ClassBadge value={r.classificacao} />
                </div>
                {r.pessoa_relatada && (
                  <p className="text-gray-400 pl-14 truncate">Relatado: <span className="text-gray-600">{r.pessoa_relatada}</span></p>
                )}
                {r.detalhamento && (
                  <p className="text-gray-500 pl-14 leading-relaxed line-clamp-2">{r.detalhamento}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────────────────────

export default function Relatos() {
  const { usuario } = useAuth()
  const [data,      setData]      = useState<Relato[]>([])
  const [acoes,     setAcoes]     = useState<RelatoAcao[]>([])
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [tab,       setTab]       = useState(0)
  const [dateFrom, setDateFrom] = useState(() => isoMinus(30))
  const [dateTo,   setDateTo]   = useState(() => isoToday())
  const [filtroClass,   setFiltroClass]   = useState('')
  const [filtroArea,    setFiltroArea]    = useState('')
  const [busca,         setBusca]         = useState('')
  const [expandedId,          setExpandedId]          = useState<string | null>(null)
  const [expandedRelatadoId,  setExpandedRelatadoId]  = useState<string | null>(null)
  const [expandedRelatanteId, setExpandedRelatanteId] = useState<string | null>(null)
  const [modalAcao, setModalAcao] = useState<Relato | null>(null)
  const [solicitados, setSolicitados] = useState<Set<string>>(new Set())
  const [fluxosGsdpq, setFluxosGsdpq] = useState<Set<string>>(new Set())

  async function carregar() {
    if (!usuario) return
    setLoading(true)
    const [{ data: rows }, { data: acoesRows }, { data: fluxosGsd }] = await Promise.all([
      supabase.from('relatos').select('*').eq('filial', usuario.filial).order('data_ocorrencia', { ascending: false }),
      supabase.from('relatos_acoes').select('*').eq('filial', usuario.filial),
      supabase.from('fluxo_punitivo').select('colaborador_nome, data_infracao').eq('filial', usuario.filial).eq('origem', 'GSDPQ'),
    ])
    setData(rows ?? [])
    setAcoes(acoesRows ?? [])
    setFluxosGsdpq(new Set((fluxosGsd ?? []).map(f => `${f.colaborador_nome}__${f.data_infracao}`)))
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
    accept: {
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  })

  // Consolida todos os relatos do mesmo colaborador no mesmo dia em um único fluxo
  async function solicitarFluxo(relatos: Relato[]) {
    if (!usuario || relatos.length === 0) return
    const { data: filialData } = await supabase.from('filiais').select('grupo_fluxo_whatsapp').eq('nome', usuario.filial).single()
    const grupo = filialData?.grupo_fluxo_whatsapp ?? null

    const pessoaRelatada = relatos[0].pessoa_relatada ?? ''
    const registradoPor = usuario.nome ?? usuario.login
    const dia = relatos[0].data_ocorrencia?.slice(0, 10) ?? null

    const itens = relatos.map(r => [r.tipo_relato, r.detalhamento].filter(Boolean).join(' — ')).filter(Boolean)
    const motivo = itens.length <= 1
      ? (itens[0] ?? '')
      : `${itens.length} ocorrência(s):\n` + itens.map((l, i) => `${i + 1}. ${l}`).join('\n')

    await supabase.from('fluxo_punitivo').insert({
      filial: usuario.filial,
      colaborador_nome: pessoaRelatada,
      origem: 'Relatos',
      tipo_acao: null,
      status: 'Solicitado',
      motivo: motivo || null,
      data_acao: dia,
      data_infracao: dia,
      observacao: null,
      registrado_por: registradoPor,
      source_id: relatos.map(r => r.id).join(','),
    })

    if (grupo) {
      const lista = itens.map((l, i) => `${i + 1}. ${l}`).join('\n')
      const mensagem = `🔔 *Solicitação de Fluxo Punitivo*\n📍 Filial: ${usuario.filial}\n👤 Colaborador: ${pessoaRelatada}\n📋 Origem: Relatos\n🗓️ Data: ${dia ?? '—'}\n⚠️ Ocorrências (${itens.length}):\n${lista}\n✍️ Solicitado por: ${registradoPor}`
      const { sucesso, erro } = await enviarMensagemGrupo(grupo, mensagem)
      await supabase.from('disparos').insert({ filial: usuario.filial, whatsapp: grupo, mensagem, status: sucesso ? 'enviado' : 'erro', erro: erro ?? null })
      if (!sucesso) alert(`Solicitação registrada, mas a mensagem para o grupo falhou:\n${erro}`)
    } else {
      alert('Solicitação registrada. Configure o grupo de WhatsApp da filial em Admin → Filiais para enviar a notificação automaticamente.')
    }

    setSolicitados(prev => new Set([...prev, ...relatos.map(r => r.id)]))
  }

  async function salvarAcao(tipo: string, dias: number | null, obs: string) {
    if (!modalAcao || !usuario) return
    const existente = acoes.find(a => a.relato_id === modalAcao.id)
    if (existente) {
      await supabase.from('relatos_acoes').update({
        tipo_acao: tipo, dias_suspensao: dias, observacao: obs || null,
        registrado_por: usuario.nome ?? usuario.login,
      }).eq('id', existente.id)
    } else {
      await supabase.from('relatos_acoes').insert({
        filial: usuario.filial,
        relato_id: modalAcao.id,
        pessoa_relatada: modalAcao.pessoa_relatada ?? '',
        tipo_relato: modalAcao.tipo_relato,
        data_relato: modalAcao.data_ocorrencia,
        tipo_acao: tipo,
        dias_suspensao: dias,
        observacao: obs || null,
        registrado_por: usuario.nome ?? usuario.login,
      })
    }
    setModalAcao(null)
    const { data: updated } = await supabase.from('relatos_acoes').select('*').eq('filial', usuario.filial)
    setAcoes(updated ?? [])
  }

  // ── Filtered data ────────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let d = data
    if (dateFrom) d = d.filter(r => r.data_ocorrencia && r.data_ocorrencia.slice(0, 10) >= dateFrom)
    if (dateTo)   d = d.filter(r => r.data_ocorrencia && r.data_ocorrencia.slice(0, 10) <= dateTo)
    if (filtroClass) d = d.filter(r => r.classificacao === filtroClass)
    if (filtroArea)  d = d.filter(r => r.area === filtroArea)
    return d
  }, [data, dateFrom, dateTo, filtroClass, filtroArea])

  const classes = useMemo(() => [...new Set(data.map(r => r.classificacao).filter(Boolean))] as string[], [data])
  const areas   = useMemo(() => [...new Set(data.map(r => r.area).filter(Boolean))] as string[], [data])

  // ── KPIs ───────────────────────────────────────────────────────────────────────────────

  const total        = filtered.length
  const positivos    = filtered.filter(r => r.classificacao?.includes('POSITIVA')).length
  const atos         = filtered.filter(r => r.classificacao?.includes('ATO')).length
  const condicoes    = filtered.filter(r => r.classificacao?.includes('INSEGURA') && !r.classificacao.includes('ATO')).length
  const comInvest    = filtered.filter(r => r.pq1).length
  const sifPotencial = filtered.filter(r => r.sif && r.sif.trim() !== '' && r.sif.toUpperCase() !== 'NÃO' && r.sif.toUpperCase() !== 'NAO').length
  const investRate   = atos > 0 ? Math.round((filtered.filter(r => r.classificacao?.includes('ATO') && r.pq1).length / atos) * 100) : 0

  // ── Charts data ──────────────────────────────────────────────────────────────────────────

  const trendData = useMemo(() => {
    const weeks = new Map<string, number>()
    filtered.filter(r => r.data_ocorrencia).forEach(r => {
      const w = weekKey(r.data_ocorrencia!); weeks.set(w, (weeks.get(w) ?? 0) + 1)
    })
    return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-10)
      .map(([date, t]) => ({ label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), total: t }))
  }, [filtered])

  const classBreak = useMemo(() => {
    const m = new Map<string, number>()
    filtered.forEach(r => { const k = r.classificacao ?? 'Outros'; m.set(k, (m.get(k) ?? 0) + 1) })
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total }))
  }, [filtered])

  const diaSemanaData = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0]
    filtered.filter(r => r.data_ocorrencia).forEach(r => { counts[new Date(r.data_ocorrencia!).getDay()]++ })
    return DIAS_SEMANA.map((dia, i) => ({ dia, total: counts[i] }))
  }, [filtered])

  const topTipos      = useMemo(() => topN(filtered, 'tipo_relato', 10), [filtered])
  const topAreas      = useMemo(() => topN(filtered, 'area',        8),  [filtered])
  const topFuncoes    = useMemo(() => topN(filtered, 'funcao',      10), [filtered])
  const topAtividades = useMemo(() => topN(filtered, 'atividade',   8),  [filtered])
  const topEquipes    = useMemo(() => topN(filtered, 'equipe',      8),  [filtered])

  // ── Relatantes ────────────────────────────────────────────────────────────────────────────

  const relatantes = useMemo(() => {
    const m = new Map<string, { nome: string; funcao: string; equipe: string; total: number; pos: number; atos: number; cond: number; ultima: string }>()
    filtered.forEach(r => {
      const k = r.relator ?? '—'
      const cur = m.get(k) ?? { nome: k, funcao: r.funcao ?? '—', equipe: r.equipe ?? '—', total: 0, pos: 0, atos: 0, cond: 0, ultima: '' }
      cur.total++
      if (r.classificacao?.includes('POSITIVA')) cur.pos++
      if (r.classificacao?.includes('ATO'))      cur.atos++
      if (r.classificacao?.includes('INSEGURA') && !r.classificacao.includes('ATO')) cur.cond++
      if (r.data_ocorrencia && r.data_ocorrencia > cur.ultima) cur.ultima = r.data_ocorrencia
      m.set(k, cur)
    })
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [filtered])

  // ── Relatados ─────────────────────────────────────────────────────────────────────────────

  const relatados = useMemo(() => {
    const m = new Map<string, { nome: string; empresa: string; total: number; atos: number; cond: number; ultima: string }>()
    filtered.filter(r => r.pessoa_relatada).forEach(r => {
      const k = r.pessoa_relatada!
      const cur = m.get(k) ?? { nome: k, empresa: r.empresa_relatada ?? '—', total: 0, atos: 0, cond: 0, ultima: '' }
      cur.total++
      if (r.classificacao?.includes('ATO'))      cur.atos++
      if (r.classificacao?.includes('INSEGURA') && !r.classificacao.includes('ATO')) cur.cond++
      if (r.data_ocorrencia && r.data_ocorrencia > cur.ultima) cur.ultima = r.data_ocorrencia
      m.set(k, cur)
    })
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [filtered])

  // ── Investigações ─────────────────────────────────────────────────────────────────────────

  const investList = useMemo(() =>
    filtered.filter(r => r.pq1 || r.motivo1).sort((a, b) => (b.data_ocorrencia ?? '').localeCompare(a.data_ocorrencia ?? ''))
  , [filtered])

  const investFiltered = busca
    ? investList.filter(r => [r.relator, r.tipo_relato, r.external_id, r.pessoa_relatada].some(v => v?.toLowerCase().includes(busca.toLowerCase())))
    : investList

  const recorrentes = relatados.filter(r => r.total >= 3).length
  const maxDia      = Math.max(...diaSemanaData.map(d => d.total), 1)

  const TABS = ['Dashboard', 'Relatantes', 'Relatados', 'Por Setor', 'Investigações']

  if (!usuario) return null
  if (loading) return (
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
          <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 mb-4 space-y-2.5 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-500">Período</span>
              <div className="flex items-center gap-1.5">
                <input type="date" value={dateFrom} max={dateTo || isoToday()}
                  onChange={e => setDateFrom(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                <span className="text-xs text-gray-400">até</span>
                <input type="date" value={dateTo} min={dateFrom} max={isoToday()}
                  onChange={e => setDateTo(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400" />
              </div>
              <div className="flex gap-1">
                {ATALHOS.map(a => (
                  <button key={a.label}
                    onClick={() => { setDateFrom(isoMinus(a.dias)); setDateTo(isoToday()) }}
                    className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-700 transition-colors">
                    {a.label}
                  </button>
                ))}
                <button onClick={() => { setDateFrom(''); setDateTo('') }}
                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-700 transition-colors">
                  Tudo
                </button>
              </div>
              <span className="ml-auto text-xs text-gray-400 font-medium">{filtered.length} relatos no período</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-500">Filtros</span>
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
            </div>
          </div>

          {/* Color legend */}
          <div className="mb-5 px-4 py-3 bg-white rounded-xl border border-gray-100">
            <ClassLegend />
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

          {/* ─── DASHBOARD ──────────────────────────────────────────────────────────────────── */}
          {tab === 0 && (
            <div className="space-y-5">
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                {([
                  { label: 'Total Relatos',    value: total,        cor: undefined,                                    sub: 'no período' },
                  { label: 'Abordagens +',     value: positivos,    cor: 'text-green-700',                             sub: 'comportamentos positivos' },
                  { label: 'Atos Inseguros',   value: atos,         cor: atos > 0 ? 'text-red-600' : undefined,        sub: 'atos inseguros' },
                  { label: 'Cond. Inseguras',  value: condicoes,    cor: condicoes > 0 ? 'text-orange-600' : undefined, sub: 'condições inseguras' },
                  { label: 'Investigados',     value: comInvest,    cor: undefined,                                    sub: `${investRate}% dos atos c/ 5-Porquês` },
                  { label: 'Potencial SIF',    value: sifPotencial, cor: sifPotencial > 0 ? 'text-red-700' : undefined, sub: 'risco grave/fatal' },
                ] as const).map(({ label: lb, value, cor, sub }) => (
                  <div key={lb} className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500 leading-tight">{lb}</p>
                    <p className={`text-2xl font-bold mt-0.5 ${cor ?? 'text-gray-900'}`}>{value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Por Classificação + Tendência */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Por Classificação</p>
                  <div className="space-y-2">
                    {classBreak.map(({ name, total: v }) => (
                      <div key={name} className="flex items-center gap-3">
                        <span className="w-40 text-xs text-gray-600 truncate shrink-0">{name}</span>
                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-5 rounded-full flex items-center justify-end pr-2"
                            style={{ width: `${Math.max(total > 0 ? Math.round((v / total) * 100) : 0, v > 0 ? 4 : 0)}%`, backgroundColor: classColor(name) }}>
                            <span className="text-white text-xs font-bold">{v}</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 w-8 text-right">{total > 0 ? Math.round((v / total) * 100) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Tendência Semanal</p>
                  {trendData.length < 2 ? (
                    <div className="flex items-center justify-center py-8 text-xs text-gray-400">Dados insuficientes.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={trendData} margin={{ top: 4, right: 10, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} width={24} />
                        <Tooltip />
                        <Line type="monotone" dataKey="total" stroke="#1a4451" strokeWidth={2} dot={{ fill: '#1a4451', r: 3 }} name="Relatos" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {topTipos.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Relatos por Tipo</p>
                  <ResponsiveContainer width="100%" height={topTipos.length * 32 + 20}>
                    <BarChart data={topTipos} layout="vertical" barSize={18} margin={{ left: 160, right: 40 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
                      <Tooltip formatter={(v) => [v, 'Relatos']} />
                      <Bar dataKey="total" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, fill: '#6b7280' }}>
                        {topTipos.map((_, i) => <Cell key={i} fill={i === 0 ? '#1a4451' : i < 3 ? '#334e5a' : '#64748b'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

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

          {/* ─── RELATANTES ──────────────────────────────────────────────────────────────────── */}
          {tab === 1 && (
            <div className="space-y-5">
              {relatantes.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Top 10 Relatantes</p>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Abordagens Positivas</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> Condições Inseguras</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Atos Inseguros</span>
                  </div>
                  <ResponsiveContainer width="100%" height={Math.min(relatantes.length, 10) * 32 + 20}>
                    <BarChart
                      data={relatantes.slice(0, 10).map(r => ({ name: r.nome.split(' ').slice(0, 2).join(' '), pos: r.pos, cond: r.cond, atos: r.atos }))}
                      layout="vertical" barSize={18} margin={{ left: 100, right: 10 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip formatter={(v, name) => [v, name === 'pos' ? 'Abordagens +' : name === 'cond' ? 'Cond. Inseguras' : 'Atos Inseguros']} />
                      <Bar dataKey="pos"  stackId="a" fill="#22c55e" name="pos" />
                      <Bar dataKey="cond" stackId="a" fill="#f97316" name="cond" />
                      <Bar dataKey="atos" stackId="a" fill="#ef4444" name="atos" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 text-xs font-medium text-gray-500">
                  {relatantes.length} relatantes únicos · clique para ver detalhes
                </div>
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100">
                    <tr>
                      {['#', 'Nome', 'Função', 'Equipe', 'Total', 'Positivos', 'Cond.Ins.', 'Atos Ins.', 'Última'].map(h => (
                        <th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-500 ${['#','Total','Positivos','Cond.Ins.','Atos Ins.','Última'].includes(h) ? 'text-center' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {relatantes.map((r, i) => (
                      <Fragment key={r.nome}>
                        <tr className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedRelatanteId(expandedRelatanteId === r.nome ? null : r.nome)}>
                          <td className="px-4 py-2.5 text-xs text-gray-400 font-bold text-center">{i + 1}</td>
                          <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                            <span className="flex items-center gap-1">
                              {r.nome}
                              {expandedRelatanteId === r.nome ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">{r.funcao}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">{r.equipe}</td>
                          <td className="px-4 py-2.5 text-center font-bold text-gray-800">{r.total}</td>
                          <td className="px-4 py-2.5 text-center text-green-700 font-medium">{r.pos}</td>
                          <td className="px-4 py-2.5 text-center text-orange-600 font-medium">{r.cond}</td>
                          <td className="px-4 py-2.5 text-center text-red-600 font-medium">{r.atos}</td>
                          <td className="px-4 py-2.5 text-center text-xs text-gray-400">{fmtDate(r.ultima)}</td>
                        </tr>
                        {expandedRelatanteId === r.nome && (
                          <tr><td colSpan={9} className="p-0">
                            <RelatanteDetail nome={r.nome} relatos={filtered} />
                          </td></tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── RELATADOS ──────────────────────────────────────────────────────────────────── */}
          {tab === 2 && (
            <div className="space-y-5">
              {relatados.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Nenhum dado de pessoa relatada no período.</div>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Top Relatados — Atos vs Condições</p>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Atos Inseguros</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> Condições Inseguras</span>
                    </div>
                    <ResponsiveContainer width="100%" height={Math.min(relatados.length, 8) * 32 + 20}>
                      <BarChart
                        data={relatados.slice(0, 8).map(r => ({ name: r.nome.split(' ').slice(0, 2).join(' '), atos: r.atos, cond: r.cond }))}
                        layout="vertical" barSize={18} margin={{ left: 90, right: 30 }}>
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                        <Tooltip formatter={(v, name) => [v, name === 'atos' ? 'Atos Inseguros' : 'Cond. Inseguras']} />
                        <Bar dataKey="atos" stackId="a" fill="#ef4444" name="atos" />
                        <Bar dataKey="cond" stackId="a" fill="#f97316" name="cond" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">{relatados.length} pessoas relatadas · clique para ver detalhes e registrar ações disciplinares</span>
                      {recorrentes > 0 && <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">{recorrentes} recorrentes (3+)</span>}
                    </div>
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-100">
                        <tr>
                          {['#', 'Pessoa Relatada', 'Empresa', 'Total', 'Atos Ins.', 'Cond.Ins.', 'Ações Disc.', 'Última'].map(h => (
                            <th key={h} className={`px-4 py-2.5 text-xs font-medium text-gray-500 ${['#','Total','Atos Ins.','Cond.Ins.','Ações Disc.','Última'].includes(h) ? 'text-center' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {relatados.map((r, i) => {
                          const acoesCount = acoes.filter(a => a.pessoa_relatada === r.nome).length
                          return (
                            <Fragment key={r.nome}>
                              <tr className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${r.total >= 3 ? 'bg-red-50/40' : ''}`}
                                onClick={() => setExpandedRelatadoId(expandedRelatadoId === r.nome ? null : r.nome)}>
                                <td className="px-4 py-2.5 text-xs text-gray-400 font-bold text-center">{i + 1}</td>
                                <td className="px-4 py-2.5">
                                  <span className="flex items-center gap-1 text-sm font-medium text-gray-900">
                                    {r.nome}
                                    {r.total >= 3 && <span className="ml-1 text-xs bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded-full">Recorrente</span>}
                                    {expandedRelatadoId === r.nome ? <ChevronUp size={12} className="text-gray-400 ml-1" /> : <ChevronDown size={12} className="text-gray-400 ml-1" />}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-gray-500">{r.empresa}</td>
                                <td className="px-4 py-2.5 text-center font-bold text-gray-800">{r.total}</td>
                                <td className="px-4 py-2.5 text-center text-red-600 font-medium">{r.atos}</td>
                                <td className="px-4 py-2.5 text-center text-orange-600 font-medium">{r.cond}</td>
                                <td className="px-4 py-2.5 text-center">
                                  {acoesCount > 0
                                    ? <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full">{acoesCount}</span>
                                    : <span className="text-xs text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-center text-xs text-gray-400">{fmtDate(r.ultima)}</td>
                              </tr>
                              {expandedRelatadoId === r.nome && (
                                <tr><td colSpan={8} className="p-0">
                                  <RelatadoDetail nome={r.nome} relatos={filtered} acoes={acoes} onSolicitarFluxo={solicitarFluxo} solicitados={solicitados} fluxosGsdpq={fluxosGsdpq} />
                                </td></tr>
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
          )}

          {/* ─── POR SETOR ──────────────────────────────────────────────────────────────────── */}
          {tab === 3 && (
            <div className="space-y-4">
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

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-1">Ocorrências por Dia da Semana</p>
                <p className="text-xs text-gray-400 mb-4">Identifica os dias de maior concentração de relatos</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={diaSemanaData} margin={{ top: 4, right: 10, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} width={24} />
                    <Tooltip formatter={(v) => [v, 'Relatos']} />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]} name="Relatos">
                      {diaSemanaData.map((entry, i) => (
                        <Cell key={i} fill={entry.total === maxDia && maxDia > 0 ? '#ef4444' : '#1a4451'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ─── INVESTIGAÇÕES ──────────────────────────────────────────────────────────────────── */}
          {tab === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 max-w-sm">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Buscar por relator, tipo, pessoa ou ID..." value={busca} onChange={e => setBusca(e.target.value)}
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
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Pessoa Relatada</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Tipo de Relato</th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Classificação</th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">5-Porquês</th>
                      </tr>
                    </thead>
                    <tbody>
                      {investFiltered.map(r => {
                        const isExp  = expandedId === r.id
                        const pqs    = [r.pq1, r.pq2, r.pq3, r.pq4, r.pq5].filter(Boolean) as string[]
                        const causes = ([[r.motivo1, r.acao1], [r.motivo2, r.acao2], [r.motivo3, r.acao3]] as [string|null,string|null][]).filter(([m]) => m)
                        return (
                          <Fragment key={r.id}>
                            <tr className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(isExp ? null : r.id)}>
                              <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{r.external_id}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(r.data_ocorrencia)}</td>
                              <td className="px-4 py-2.5 text-xs font-medium text-gray-900">{r.relator?.split(' ').slice(0, 2).join(' ')}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-600">{r.pessoa_relatada?.split(' ').slice(0, 2).join(' ') ?? '—'}</td>
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
                                <td colSpan={7} className="bg-gray-50 border-b border-gray-200 px-4 py-4">
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                                    <div className="space-y-2">
                                      {[
                                        { k: 'Área',            v: r.area            },
                                        { k: 'Atividade',       v: r.atividade       },
                                        { k: 'Pessoa Relatada', v: r.pessoa_relatada },
                                        { k: 'Ação Imediata',   v: r.acao_imediata   },
                                        { k: 'Porque Falhou?',  v: r.porque_falhou   },
                                        { k: 'Detalhamento',    v: r.detalhamento    },
                                      ].filter(({ v }) => v).map(({ k, v }) => (
                                        <div key={k} className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                                          <span className="text-gray-400 block mb-0.5">{k}</span>
                                          <span className="text-gray-800">{v}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="space-y-2">
                                      {pqs.length > 0 && (
                                        <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                                          <p className="text-gray-600 font-semibold mb-2">5-Porquês</p>
                                          {pqs.map((pq, idx) => (
                                            <div key={idx} className="flex gap-2 mb-1.5">
                                              <span className="text-brand-700 font-bold shrink-0">P{idx + 1}:</span>
                                              <span className="text-gray-700">{pq}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {causes.length > 0 && (
                                        <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                                          <p className="text-gray-600 font-semibold mb-2">Causas Raiz e Ações</p>
                                          {causes.map(([motivo, acao], idx) => (
                                            <div key={idx} className="mb-2 border-l-2 border-brand-300 pl-2">
                                              <p className="text-gray-500">Causa {idx + 1}: <span className="text-gray-900 font-medium">{motivo}</span></p>
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

      {/* Modal Ação Disciplinar */}
      {modalAcao && (
        <ModalAcaoRelato
          pessoaRelatada={modalAcao.pessoa_relatada ?? '—'}
          tipoRelato={modalAcao.tipo_relato}
          dataRelato={modalAcao.data_ocorrencia}
          existente={acoes.find(a => a.relato_id === modalAcao.id)}
          onClose={() => setModalAcao(null)}
          onSalvar={salvarAcao}
        />
      )}
    </div>
  )
}
