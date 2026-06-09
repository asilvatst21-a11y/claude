import { useEffect, useMemo, useState } from 'react'
import {
  GitBranch, Plus, X, Loader2, RefreshCw, Building2,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock, Check,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { FluxoPunitivo } from '../types'

// ─── Sequência punitiva ──────────────────────────────────────────────────

type TipoAcao = 'Advertência Verbal' | 'DTO' | 'Advertência Escrita' | 'Suspensão'

const TIPOS: TipoAcao[] = ['Advertência Verbal', 'DTO', 'Advertência Escrita', 'Suspensão']

const ORIGEM_COLOR: Record<string, string> = {
  GSDPQ:      'bg-blue-50 text-blue-700 border-blue-200',
  Relatos:    'bg-orange-50 text-orange-700 border-orange-200',
  Telemetria: 'bg-purple-50 text-purple-700 border-purple-200',
  DTO:        'bg-teal-50 text-teal-700 border-teal-200',
  Grupo:      'bg-green-50 text-green-700 border-green-200',
  Manual:     'bg-gray-100 text-gray-600 border-gray-200',
}

const ACAO_COLOR: Record<string, string> = {
  'Advertência Verbal':   'bg-yellow-50 text-yellow-800 border-yellow-200',
  'DTO':                  'bg-orange-50 text-orange-700 border-orange-200',
  'Advertência Escrita':  'bg-red-50 text-red-700 border-red-200',
  'Suspensão':            'bg-rose-100 text-rose-800 border-rose-300',
}

// ─── Lógica de sequência ────────────────────────────────────────────

interface ProximaAcao {
  tipo: TipoAcao
  descricao: string
  nivel: 'baixo' | 'medio' | 'alto' | 'critico'
}

function calcProxima(historico: FluxoPunitivo[]): ProximaAcao {
  const concluido = historico.filter(h => h.status === 'Concluido' && h.tipo_acao)
  const verbais  = concluido.filter(h => h.tipo_acao === 'Advertência Verbal').length
  const dtos     = concluido.filter(h => h.tipo_acao === 'DTO').length
  const escritas = concluido.filter(h => h.tipo_acao === 'Advertência Escrita').length
  const susps    = concluido.filter(h => h.tipo_acao === 'Suspensão').length

  if (verbais < 2) return { tipo: 'Advertência Verbal', descricao: `${verbais + 1}ª Advertência Verbal`, nivel: 'baixo' }
  if (dtos < 2)    return { tipo: 'DTO',                descricao: `${dtos + 1}º DTO`,                  nivel: 'medio' }
  if (escritas < 5) return { tipo: 'Advertência Escrita', descricao: `${escritas + 1}ª Advertência Escrita`, nivel: 'alto' }
  const dias = Math.min(susps + 1, 5)
  return { tipo: 'Suspensão', descricao: `Suspensão de ${dias} dia${dias > 1 ? 's' : ''}`, nivel: 'critico' }
}

function nivelStyle(nivel: string) {
  if (nivel === 'baixo')   return 'bg-yellow-50 text-yellow-800 border-yellow-300'
  if (nivel === 'medio')   return 'bg-orange-50 text-orange-700 border-orange-200'
  if (nivel === 'alto')    return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-rose-100 text-rose-900 border-rose-300 font-bold'
}

function posicaoBar(historico: FluxoPunitivo[]) {
  const concluido = historico.filter(h => h.status === 'Concluido' && h.tipo_acao)
  return {
    verbais:  Math.min(concluido.filter(h => h.tipo_acao === 'Advertência Verbal').length, 2),
    dtos:     Math.min(concluido.filter(h => h.tipo_acao === 'DTO').length, 2),
    escritas: Math.min(concluido.filter(h => h.tipo_acao === 'Advertência Escrita').length, 5),
    susps:    Math.min(concluido.filter(h => h.tipo_acao === 'Suspensão').length, 5),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ─── SequenciaBar ─────────────────────────────────────────────────────────────

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

// ─── Modal Definir Ação ───────────────────────────────────────────────────────

interface ModalDefinirProps {
  solicitacao: FluxoPunitivo
  historico: FluxoPunitivo[]
  onClose: () => void
  onSalvar: (id: string, tipo: TipoAcao, dias: number | null, data: string, obs: string) => Promise<void>
}

function ModalDefinirAcao({ solicitacao, historico, onClose, onSalvar }: ModalDefinirProps) {
  const proxima = calcProxima(historico)
  const [tipo,   setTipo]   = useState<TipoAcao>(proxima.tipo)
  const [dias,   setDias]   = useState('')
  const [data,   setData]   = useState(solicitacao.data_acao?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
  const [obs,    setObs]    = useState('')
  const [saving, setSaving] = useState(false)

  const sorted = [...historico].filter(h => h.status === 'Concluido' && h.tipo_acao)
    .sort((a, b) => (a.data_acao ?? a.created_at).localeCompare(b.data_acao ?? b.created_at))

  async function handleSave() {
    setSaving(true)
    await onSalvar(solicitacao.id, tipo, tipo === 'Suspensão' ? (parseInt(dias) || null) : null, data, obs)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <p className="font-semibold text-gray-900">Definir Ação Punitiva</p>
            <p className="text-xs text-gray-500 mt-0.5">{solicitacao.colaborador_nome}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Contexto da solicitação */}
          <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded border font-medium ${ORIGEM_COLOR[solicitacao.origem] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>{solicitacao.origem}</span>
              <span className="text-gray-500">{fmtDate(solicitacao.data_acao)}</span>
            </div>
            {solicitacao.motivo && (
              <p className="text-gray-600 leading-relaxed">{solicitacao.motivo}</p>
            )}
            {solicitacao.registrado_por && (
              <p className="text-gray-400">Solicitado por: {solicitacao.registrado_por}</p>
            )}
          </div>

          {/* Histórico */}
          {sorted.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Histórico de Ações</p>
              <SequenciaBar historico={historico} />
              <div className="mt-2 space-y-1">
                {sorted.map(h => (
                  <div key={h.id} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-14 shrink-0">{fmtDate(h.data_acao)}</span>
                    <span className={`px-1.5 py-0.5 rounded border font-medium ${ACAO_COLOR[h.tipo_acao!] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {h.tipo_acao}{h.dias_suspensao ? ` (${h.dias_suspensao}d)` : ''}
                    </span>
                    <span className={`px-1 py-0.5 rounded border text-[10px] ${ORIGEM_COLOR[h.origem] ?? 'bg-gray-100'}`}>{h.origem}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Próxima ação sugerida */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Sugestão:</span>
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${nivelStyle(proxima.nivel)}`}>{proxima.descricao}</span>
          </div>

          {/* Tipo de ação */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Tipo de Ação</label>
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

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Data da Ação</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Observação (opcional)</label>
            <textarea rows={2} value={obs} onChange={e => setObs(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
              placeholder="Contexto adicional…" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={handleSave}
            disabled={saving || !tipo || (tipo === 'Suspensão' && !dias)}
            className="px-4 py-2 text-sm bg-brand-700 text-white rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Confirmar Ação
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Nova Ação Manual ───────────────────────────────────────────────────

interface ModalNovaProps {
  filial: string
  colaboradores: string[]
  registradoPor: string
  onClose: () => void
  onSalvar: (entry: Omit<FluxoPunitivo, 'id' | 'created_at'>) => Promise<void>
}

function ModalNovaAcao({ filial, colaboradores, registradoPor, onClose, onSalvar }: ModalNovaProps) {
  const [colab,    setColab]    = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [tipo,     setTipo]     = useState<TipoAcao>('Advertência Verbal')
  const [data,     setData]     = useState(new Date().toISOString().slice(0, 10))
  const [dias,     setDias]     = useState('')
  const [obs,      setObs]      = useState('')
  const [saving,   setSaving]   = useState(false)

  const nomeColab = colab === '__novo__' ? novoNome.trim() : colab

  async function handleSave() {
    if (!nomeColab || !tipo) return
    setSaving(true)
    await onSalvar({
      filial, colaborador_nome: nomeColab, origem: 'Manual',
      tipo_acao: tipo, dias_suspensao: tipo === 'Suspensão' ? (parseInt(dias) || null) : null,
      data_acao: data || null, observacao: obs.trim() || null,
      registrado_por: registradoPor, source_id: null,
      status: 'Concluido', motivo: null,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="font-semibold text-gray-900">Registrar Ação Manual</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
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
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Tipo de Ação</label>
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
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400" />
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
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Linha do colaborador (histórico) ─────────────────────────────────────────

function ColabRow({ nome, historico }: { nome: string; historico: FluxoPunitivo[] }) {
  const [open, setOpen] = useState(false)
  const proxima = calcProxima(historico)
  const concluidos = historico.filter(h => h.status === 'Concluido' && h.tipo_acao)
  const sorted = [...concluidos].sort((a, b) => (a.data_acao ?? a.created_at).localeCompare(b.data_acao ?? b.created_at))
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
        <td className="px-4 py-3"><SequenciaBar historico={historico} /></td>
        <td className="px-4 py-3">
          {ultima ? (
            <div>
              <span className={`text-xs px-2 py-0.5 rounded border font-medium ${ACAO_COLOR[ultima.tipo_acao!] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {ultima.tipo_acao}{ultima.dias_suspensao ? ` (${ultima.dias_suspensao}d)` : ''}
              </span>
              <span className="text-xs text-gray-400 ml-2">{fmtDate(ultima.data_acao)}</span>
            </div>
          ) : <span className="text-xs text-gray-400">—</span>}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-1 rounded border font-medium ${nivelStyle(proxima.nivel)}`}>{proxima.descricao}</span>
        </td>
        <td className="px-4 py-3 text-center text-sm text-gray-500">{concluidos.length}</td>
      </tr>

      {open && (
        <tr>
          <td colSpan={5} className="bg-gray-50 border-b border-gray-200 px-6 py-4">
            <div className="space-y-2 max-w-3xl">
              <p className="text-xs font-semibold text-gray-600 uppercase mb-3">Histórico completo</p>
              {sorted.map(h => (
                <div key={h.id} className="flex items-start gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2.5 text-xs">
                  <span className="text-gray-400 w-16 shrink-0">{fmtDate(h.data_acao)}</span>
                  <span className={`px-2 py-0.5 rounded border font-medium shrink-0 ${ACAO_COLOR[h.tipo_acao!] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {h.tipo_acao}{h.dias_suspensao ? ` (${h.dias_suspensao}d)` : ''}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] shrink-0 ${ORIGEM_COLOR[h.origem] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>{h.origem}</span>
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
  const [registros,  setRegistros]  = useState<FluxoPunitivo[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modalNova,  setModalNova]  = useState(false)
  const [modalDefinir, setModalDefinir] = useState<FluxoPunitivo | null>(null)
  const [busca,      setBusca]      = useState('')
  const [abaAtiva,   setAbaAtiva]   = useState<'pendentes' | 'historico'>('pendentes')

  async function carregar() {
    if (!usuario) return
    setLoading(true)

    const { data: manual } = await supabase
      .from('fluxo_punitivo').select('*').eq('filial', usuario.filial)

    const { data: gsdpq } = await supabase
      .from('gsdpq_acoes').select('*').eq('filial', usuario.filial)

    const { data: relatos } = await supabase
      .from('relatos_acoes').select('*').eq('filial', usuario.filial)

    const { data: telemetria } = await supabase
      .from('telemetria_acoes').select('*').eq('filial', usuario.filial)

    const legacyGsdpq: FluxoPunitivo[] = (gsdpq ?? []).map((a: any) => ({
      id: 'gsdpq_' + a.id, filial: a.filial,
      colaborador_nome: a.colaborador_nome, origem: 'GSDPQ' as const,
      tipo_acao: a.tipo_acao, dias_suspensao: a.dias_suspensao ?? null,
      data_acao: a.data_avaliacao ?? null, observacao: a.observacao ?? null,
      registrado_por: a.registrado_por ?? null, source_id: a.id,
      status: 'Concluido' as const, motivo: a.questao ?? null,
      created_at: a.created_at,
    }))

    const legacyRelatos: FluxoPunitivo[] = (relatos ?? []).map((a: any) => ({
      id: 'relato_' + a.id, filial: a.filial,
      colaborador_nome: a.pessoa_relatada ?? a.colaborador_nome ?? '',
      origem: 'Relatos' as const, tipo_acao: a.tipo_acao,
      dias_suspensao: a.dias_suspensao ?? null, data_acao: a.data_relato ?? null,
      observacao: a.observacao ?? null, registrado_por: a.registrado_por ?? null,
      source_id: a.id, status: 'Concluido' as const, motivo: null,
      created_at: a.created_at,
    })).filter((a: any) => a.colaborador_nome)

    const legacyTelemetria: FluxoPunitivo[] = (telemetria ?? []).map((a: any) => ({
      id: 'tel_' + a.id, filial: a.filial,
      colaborador_nome: a.motorista ?? '',
      origem: 'Telemetria' as const, tipo_acao: a.tipo_acao,
      dias_suspensao: a.dias_suspensao ?? null, data_acao: null,
      observacao: a.observacao ?? null, registrado_por: a.registrado_por ?? null,
      source_id: a.id, status: 'Concluido' as const, motivo: null,
      created_at: a.created_at,
    })).filter((a: any) => a.colaborador_nome)

    const todos: FluxoPunitivo[] = [
      ...(manual ?? []) as FluxoPunitivo[],
      ...legacyGsdpq,
      ...legacyRelatos,
      ...legacyTelemetria,
    ]

    setRegistros(todos)
    setLoading(false)
  }

  useEffect(() => { carregar() }, [usuario])

  // ── Dados derivados ──────────────────────────────────────────────────────────

  const pendentes = useMemo(
    () => registros.filter(r => r.status === 'Solicitado').sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [registros]
  )

  const historico = useMemo(() => {
    const map = new Map<string, FluxoPunitivo[]>()
    registros.filter(r => r.status === 'Concluido' && r.tipo_acao).forEach(r => {
      if (!r.colaborador_nome) return
      if (!map.has(r.colaborador_nome)) map.set(r.colaborador_nome, [])
      map.get(r.colaborador_nome)!.push(r)
    })
    return map
  }, [registros])

  const historicoByName = useMemo(() => [...historico.keys()].sort(), [historico])

  const colaboradores = useMemo(() => {
    const names = new Set<string>()
    registros.forEach(r => { if (r.colaborador_nome) names.add(r.colaborador_nome) })
    return [...names].sort()
  }, [registros])

  const historicoFiltrado = useMemo(() => historicoByName.filter(nome =>
    !busca || nome.toLowerCase().includes(busca.toLowerCase())
  ), [historicoByName, busca])

  const pendentesFiltrados = useMemo(() => pendentes.filter(p =>
    !busca || p.colaborador_nome.toLowerCase().includes(busca.toLowerCase())
  ), [pendentes, busca])

  // ── Salvar ────────────────────────────────────────────────────────────────────

  async function handleSalvarManual(entry: Omit<FluxoPunitivo, 'id' | 'created_at'>) {
    await supabase.from('fluxo_punitivo').insert(entry)
    setModalNova(false)
    carregar()
  }

  async function handleDefinirAcao(id: string, tipo: TipoAcao, dias: number | null, data: string, obs: string) {
    await supabase.from('fluxo_punitivo').update({
      tipo_acao: tipo,
      dias_suspensao: dias,
      data_acao: data || null,
      observacao: obs.trim() || null,
      status: 'Concluido',
    }).eq('id', id)
    setModalDefinir(null)
    carregar()
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      <Loader2 size={24} className="animate-spin mr-2" /> Carregando fluxo punitivo…
    </div>
  )

  const emRisco = historicoByName.filter(n => {
    const p = calcProxima(historico.get(n) ?? [])
    return p.nivel === 'alto' || p.nivel === 'critico'
  }).length

  return (
    <div className="p-6 max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <GitBranch size={20} className="text-brand-700" /> Fluxo Punitivo
          </h1>
          <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
            <Building2 size={12} /> {usuario?.filial}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => setModalNova(true)}
            className="flex items-center gap-2 text-sm bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-600 font-medium">
            <Plus size={16} /> Nova Ação Manual
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className={`bg-white rounded-xl border p-4 shadow-sm ${pendentes.length > 0 ? 'border-orange-200' : 'border-gray-100'}`}>
          <p className="text-xs text-gray-500 flex items-center gap-1"><Clock size={11} /> Solicitações Pendentes</p>
          <p className={`text-2xl font-bold mt-0.5 ${pendentes.length > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{pendentes.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500">Colaboradores com histórico</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{historicoByName.length}</p>
        </div>
        <div className={`bg-white rounded-xl border p-4 shadow-sm ${emRisco > 0 ? 'border-red-200' : 'border-gray-100'}`}>
          <p className="text-xs text-gray-500">Em risco (Ad.Escrita/Susp.)</p>
          <p className={`text-2xl font-bold mt-0.5 ${emRisco > 0 ? 'text-red-600' : 'text-gray-900'}`}>{emRisco}</p>
        </div>
      </div>

      {/* Sequência punitiva */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Sequência Punitiva</p>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {[
            { label: '2× Advertência Verbal',  color: 'bg-yellow-400' },
            { label: '→', color: '' },
            { label: '2× DTO',                 color: 'bg-orange-400' },
            { label: '→', color: '' },
            { label: '5× Advertência Escrita', color: 'bg-red-400'    },
            { label: '→', color: '' },
            { label: 'Suspensão (1–5 dias)',    color: 'bg-rose-600'   },
          ].map(({ label, color }, i) => (
            color
              ? <span key={i} className="flex items-center gap-1.5 text-gray-600">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />{label}
                </span>
              : <span key={i} className="font-bold text-gray-400">{label}</span>
          ))}
        </div>
      </div>

      {/* Busca + Abas */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm flex items-center gap-3 flex-wrap">
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar colaborador…"
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-400 w-52" />
        <div className="flex gap-1">
          <button onClick={() => setAbaAtiva('pendentes')}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors flex items-center gap-1.5 ${abaAtiva === 'pendentes' ? 'bg-orange-500 text-white border-orange-500' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
            <Clock size={12} /> Pendentes {pendentes.length > 0 && <span className="bg-white text-orange-600 rounded-full px-1.5 font-bold text-[10px]">{pendentes.length}</span>}
          </button>
          <button onClick={() => setAbaAtiva('historico')}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${abaAtiva === 'historico' ? 'bg-brand-700 text-white border-brand-700' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
            Histórico
          </button>
        </div>
      </div>

      {/* ── Pendentes ── */}
      {abaAtiva === 'pendentes' && (
        <div>
          {pendentesFiltrados.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma solicitação pendente.</p>
              <p className="text-xs mt-1">As solicitações criadas em GSDPQ, DTO e Relatos aparecem aqui.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendentesFiltrados.map(sol => {
                const hist = historico.get(sol.colaborador_nome) ?? []
                const proxima = calcProxima(hist)
                return (
                  <div key={sol.id} className="bg-white rounded-xl border border-orange-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-sm font-semibold text-gray-900">{sol.colaborador_nome}</span>
                          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${ORIGEM_COLOR[sol.origem] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {sol.origem}
                          </span>
                          <span className="text-xs text-gray-400">{fmtDate(sol.data_acao)}</span>
                        </div>
                        {sol.motivo && (
                          <p className="text-xs text-gray-600 mb-2 leading-relaxed line-clamp-2">{sol.motivo}</p>
                        )}
                        <div className="flex items-center gap-3 flex-wrap">
                          {hist.length > 0 && <SequenciaBar historico={[...hist, { ...sol, status: 'Concluido', tipo_acao: null }]} />}
                          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${nivelStyle(proxima.nivel)}`}>
                            Próxima: {proxima.descricao}
                          </span>
                          {sol.registrado_por && (
                            <span className="text-xs text-gray-400">por {sol.registrado_por}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setModalDefinir(sol)}
                        className="shrink-0 flex items-center gap-1.5 text-sm bg-brand-700 text-white px-3 py-2 rounded-lg hover:bg-brand-600 font-medium">
                        <CheckCircle2 size={14} /> Definir ação
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Histórico ── */}
      {abaAtiva === 'historico' && (
        <div>
          {historicoFiltrado.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <GitBranch size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum histórico registrado.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Colaborador</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Progresso</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Última Ação</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Próxima Sugerida</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoFiltrado.map(nome => (
                    <ColabRow key={nome} nome={nome} historico={historico.get(nome) ?? []} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Legenda */}
      {abaAtiva === 'historico' && historicoFiltrado.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-500 pb-2">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-yellow-300" /> Advertência Verbal</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-400" /> DTO</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400" /> Advertência Escrita</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-600" /> Suspensão</span>
          <span className="flex items-center gap-1.5 ml-auto"><AlertTriangle size={12} className="text-red-500" /> Vermelho = próxima é Ad.Escrita ou Suspensão</span>
        </div>
      )}

      {/* Modals */}
      {modalNova && (
        <ModalNovaAcao
          filial={usuario!.filial}
          colaboradores={colaboradores}
          registradoPor={usuario?.nome ?? usuario?.login ?? ''}
          onClose={() => setModalNova(false)}
          onSalvar={handleSalvarManual}
        />
      )}
      {modalDefinir && (
        <ModalDefinirAcao
          solicitacao={modalDefinir}
          historico={historico.get(modalDefinir.colaborador_nome) ?? []}
          onClose={() => setModalDefinir(null)}
          onSalvar={handleDefinirAcao}
        />
      )}
    </div>
  )
}
