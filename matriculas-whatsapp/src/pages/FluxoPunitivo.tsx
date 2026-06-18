import { useEffect, useMemo, useState } from 'react'
import {
  GitBranch, Plus, X, Loader2, RefreshCw, Building2,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock, Check, Trash2, BookOpen, Printer, RotateCcw, ClipboardCopy,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { imprimirDocumentoFluxo, geraDocumento } from '../lib/documentos'
import type { FluxoPunitivo } from '../types'

// ─── Sequência punitiva ──────────────────────────────────────────────────

type TipoAcao = 'Orientação Verbal' | 'Advertência Verbal' | 'DTO' | 'Advertência Escrita' | 'Suspensão'

const TIPOS: TipoAcao[] = ['Orientação Verbal', 'Advertência Verbal', 'DTO', 'Advertência Escrita', 'Suspensão']

const ORIGEM_COLOR: Record<string, string> = {
  GSDPQ:      'bg-blue-50 text-blue-700 border-blue-200',
  Relatos:    'bg-orange-50 text-orange-700 border-orange-200',
  Telemetria: 'bg-purple-50 text-purple-700 border-purple-200',
  DTO:        'bg-teal-50 text-teal-700 border-teal-200',
  Grupo:      'bg-green-50 text-green-700 border-green-200',
  Manual:     'bg-gray-100 text-gray-600 border-gray-200',
  Vales:      'bg-indigo-50 text-indigo-700 border-indigo-200',
}

const ACAO_COLOR: Record<string, string> = {
  'Orientação Verbal':    'bg-slate-50 text-slate-600 border-slate-200',
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
  const concluido   = historico.filter(h => h.status === 'Concluido' && h.tipo_acao)
  const orientacoes = concluido.filter(h => h.tipo_acao === 'Orientação Verbal').length
  const verbais      = concluido.filter(h => h.tipo_acao === 'Advertência Verbal').length
  const dtos         = concluido.filter(h => h.tipo_acao === 'DTO').length
  const escritas     = concluido.filter(h => h.tipo_acao === 'Advertência Escrita').length
  const susps        = concluido.filter(h => h.tipo_acao === 'Suspensão').length

  if (orientacoes < 3) return { tipo: 'Orientação Verbal', descricao: `${orientacoes + 1}ª Orientação Verbal`, nivel: 'baixo' }
  if (verbais < 3) return { tipo: 'Advertência Verbal', descricao: `${verbais + 1}ª Advertência Verbal`, nivel: 'baixo' }
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
    orientacoes: Math.min(concluido.filter(h => h.tipo_acao === 'Orientação Verbal').length, 3),
    verbais:  Math.min(concluido.filter(h => h.tipo_acao === 'Advertência Verbal').length, 3),
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

/** Registros reais (em fluxo_punitivo) podem ser reabertos. Legacy (gsdpq_/relato_/tel_) não. */
function registroEditavel(h: FluxoPunitivo): boolean {
  return !/^(gsdpq_|relato_|tel_)/.test(h.id)
}

/** Rótulo da origem para o GINFO */
const ORIGEM_GINFO: Record<string, string> = {
  GSDPQ: 'GSDPQ', Relatos: 'RELATO', Telemetria: 'TELEMETRIA', DTO: 'DTO', Grupo: 'GRUPO',
}

/** Monta o texto da ação para colar no GINFO: origem + data + texto já montado. */
function montarTextoGinfo(h: { origem: string | null; colaborador_nome: string; tipo_acao: string | null; dias_suspensao: number | null; data_acao: string | null; data_infracao: string | null; motivo: string | null; observacao: string | null }): string {
  const origem = ORIGEM_GINFO[h.origem ?? ''] ?? (h.origem ?? '—').toUpperCase()
  const data = fmtDate(h.data_infracao ?? h.data_acao)
  const acao = h.tipo_acao ? `${h.tipo_acao}${h.dias_suspensao ? ` (${h.dias_suspensao} dias)` : ''}` : 'Ação disciplinar'
  const motivo = (h.motivo || h.observacao || '').replace(/\s+/g, ' ').trim()
  const frase = `${h.colaborador_nome} — ${acao}${motivo ? `. Motivo: ${motivo}` : ''}.`
  return `Origem: ${origem}\nData: ${data}\n\n${frase}`
}

/** Normaliza uma data (ISO ou DD/MM/AAAA) para chave YYYY-MM-DD comparável */
function diaKey(s: string | null): string {
  if (!s) return ''
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return s
}

// ─── Fuzzy name matching ──────────────────────────────────────────────────────

function normalizar(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

function similaridadeNome(a: string, b: string): number {
  const tA = new Set(normalizar(a).split(' ').filter(Boolean))
  const tB = new Set(normalizar(b).split(' ').filter(Boolean))
  if (tA.size === 0 || tB.size === 0) return 0
  const inter = [...tA].filter(t => tB.has(t)).length
  const union = new Set([...tA, ...tB]).size
  return inter / union
}

function sugerirColaborador(nome: string, lista: ColaboradorBase[]): string | null {
  if (!nome || lista.length === 0) return null
  let melhor = ''
  let melhorScore = 0
  for (const c of lista) {
    const s = similaridadeNome(nome, c.nome)
    if (s > melhorScore) { melhorScore = s; melhor = c.nome }
  }
  return melhorScore >= 0.5 ? melhor : null
}

/** Extrai os itens de infração de um motivo (ignora cabeçalho "N ocorrência(s)…" e numeração) */
function extrairItens(motivo: string): string[] {
  return (motivo || '').split('\n').map(l => l.trim()).filter(Boolean)
    .filter(l => !/^\d+\s+ocorrência/i.test(l))
    .map(l => l.replace(/^\d+\.\s*/, ''))
}

/** Combina os motivos de um grupo de solicitações em uma lista única numerada */
function combinarMotivos(grupo: FluxoPunitivo[]): string {
  const itens: string[] = []
  grupo.forEach(g => {
    const base = (g.motivo || g.observacao || '').trim()
    if (base) itens.push(...extrairItens(base))
  })
  if (itens.length === 0) return ''
  if (itens.length === 1) return itens[0]
  return `${itens.length} infrações:\n` + itens.map((l, i) => `${i + 1}. ${l}`).join('\n')
}

// ─── SequenciaBar ─────────────────────────────────────────────────────────────

function SequenciaBar({ historico }: { historico: FluxoPunitivo[] }) {
  const { orientacoes, verbais, dtos, escritas, susps } = posicaoBar(historico)
  const steps = [
    { label: 'Orientação', total: 3, filled: orientacoes, color: 'bg-slate-400' },
    { label: 'Ad. Verbal', total: 3, filled: verbais, color: 'bg-yellow-400' },
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

interface ColaboradorBase { nome: string; funcao: string | null }

interface ModalDefinirProps {
  grupo: FluxoPunitivo[]
  historico: FluxoPunitivo[]
  motivosPadrao: string[]
  colabList: ColaboradorBase[]
  onClose: () => void
  onSalvar: (grupo: FluxoPunitivo[], tipo: TipoAcao, dias: number | null, data: string, dataInfracao: string, obs: string, motivo: string, nomeCorreto: string) => Promise<void>
}

function ModalDefinirAcao({ grupo, historico, motivosPadrao, colabList, onClose, onSalvar }: ModalDefinirProps) {
  const solicitacao = grupo[0]
  const proxima = calcProxima(historico)
  const origens = [...new Set(grupo.map(g => g.origem))]
  const isGrupo = grupo.some(g => g.origem === 'Grupo')
  const motivoInicial = grupo.length > 1 ? combinarMotivos(grupo) : (solicitacao.motivo ?? '')
  const [tipo,        setTipo]        = useState<TipoAcao>(proxima.tipo)
  const [dias,        setDias]        = useState('')
  const [data,        setData]        = useState(new Date().toISOString().slice(0, 10))
  const [dataInfracao, setDataInfracao] = useState(solicitacao.data_infracao?.slice(0, 10) ?? diaKey(solicitacao.data_acao) ?? '')
  const [obs,         setObs]         = useState('')
  const [motivo,      setMotivo]      = useState(motivoInicial)
  const sugestaoAuto = useMemo(() => sugerirColaborador(solicitacao.colaborador_nome, colabList), [solicitacao.colaborador_nome, colabList])
  const [nomeCorreto, setNomeCorreto] = useState(sugestaoAuto ?? solicitacao.colaborador_nome)
  const [saving,      setSaving]      = useState(false)

  // Colaboradores agrupados por função para o select
  const colabPorFuncao = useMemo(() => {
    const map = new Map<string, string[]>()
    colabList.forEach(c => {
      const f = c.funcao || 'Sem função'
      if (!map.has(f)) map.set(f, [])
      map.get(f)!.push(c.nome)
    })
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [colabList])

  const sorted = [...historico].filter(h => h.status === 'Concluido' && h.tipo_acao)
    .sort((a, b) => (a.data_acao ?? a.created_at).localeCompare(b.data_acao ?? b.created_at))

  async function handleSave() {
    setSaving(true)
    await onSalvar(grupo, tipo, tipo === 'Suspensão' ? (parseInt(dias) || null) : null, data, dataInfracao, obs, motivo, nomeCorreto || solicitacao.colaborador_nome)
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
            <div className="flex items-center gap-2 flex-wrap">
              {origens.map(o => (
                <span key={o} className={`px-2 py-0.5 rounded border font-medium ${ORIGEM_COLOR[o] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>{o}</span>
              ))}
              <span className="text-gray-500">{fmtDate(solicitacao.data_infracao ?? solicitacao.data_acao)}</span>
              {grupo.length > 1 && (
                <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">
                  {grupo.length} solicitações no mesmo dia
                </span>
              )}
            </div>
            {grupo.length > 1 && (
              <p className="text-orange-600 text-[11px]">
                Regra: várias ocorrências no mesmo dia geram um único fluxo. Confira o motivo combinado abaixo.
              </p>
            )}
            {solicitacao.registrado_por && (
              <p className="text-gray-400">Solicitado por: {solicitacao.registrado_por}</p>
            )}
          </div>

          {/* Colaborador — sugestão automática por similaridade + ajuste manual */}
          {colabList.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Colaborador
                {sugestaoAuto && sugestaoAuto !== solicitacao.colaborador_nome && nomeCorreto === sugestaoAuto && (
                  <span className="ml-2 text-blue-500 font-normal">✦ sugerido automaticamente</span>
                )}
                {nomeCorreto !== solicitacao.colaborador_nome && nomeCorreto !== sugestaoAuto && (
                  <span className="ml-2 text-orange-500 font-normal">nome corrigido</span>
                )}
              </label>
              <select
                value={nomeCorreto}
                onChange={e => setNomeCorreto(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                {/* Mantém o nome original caso não esteja na lista */}
                {!colabList.some(c => c.nome === solicitacao.colaborador_nome) && (
                  <option value={solicitacao.colaborador_nome}>
                    {solicitacao.colaborador_nome} (recebido)
                  </option>
                )}
                {colabPorFuncao.map(([funcao, nomes]) => (
                  <optgroup key={funcao} label={funcao}>
                    {nomes.map(n => <option key={n} value={n}>{n}</option>)}
                  </optgroup>
                ))}
              </select>
              {nomeCorreto !== solicitacao.colaborador_nome && (
                <p className="text-[10px] text-gray-400 mt-1">
                  Recebido: <em>{solicitacao.colaborador_nome}</em>
                </p>
              )}
            </div>
          )}

          {/* Motivo editável (sempre para Grupo, opcional para outros) */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              {isGrupo ? 'Motivo padronizado' : 'Motivo'}
              {isGrupo && <span className="ml-1 text-orange-500 font-normal">(obrigatório — texto recebido do grupo)</span>}
            </label>
            {isGrupo && motivosPadrao.length > 0 && (
              <select
                value={motivosPadrao.includes(motivo) ? motivo : ''}
                onChange={e => { if (e.target.value) setMotivo(e.target.value) }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-1 focus:ring-brand-400"
              >
                <option value="">Selecionar motivo padronizado…</option>
                {motivosPadrao.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <textarea
              rows={2}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
              placeholder={isGrupo ? 'Digite ou selecione um motivo padronizado…' : 'Motivo (opcional)'}
            />
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data da infração</label>
              <input type="date" value={dataInfracao} onChange={e => setDataInfracao(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400" />
              <p className="text-[10px] text-gray-400 mt-1">Aparece no documento: "…no dia DD/MM/AAAA"</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data da ação</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400" />
            </div>
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
            disabled={saving || !tipo || (tipo === 'Suspensão' && !dias) || (isGrupo && !motivo.trim())}
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
  const [dataInfracao, setDataInfracao] = useState('')
  const [dias,     setDias]     = useState('')
  const [motivo,   setMotivo]   = useState('')
  const [obs,      setObs]      = useState('')
  const [saving,   setSaving]   = useState(false)

  const nomeColab = colab === '__novo__' ? novoNome.trim() : colab

  async function handleSave() {
    if (!nomeColab || !tipo) return
    setSaving(true)
    await onSalvar({
      filial, colaborador_nome: nomeColab, origem: 'Manual',
      tipo_acao: tipo, dias_suspensao: tipo === 'Suspensão' ? (parseInt(dias) || null) : null,
      data_acao: data || null, data_infracao: dataInfracao || null,
      observacao: obs.trim() || null,
      registrado_por: registradoPor, source_id: null,
      status: 'Concluido', motivo: motivo.trim() || null,
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
            <label className="text-xs font-medium text-gray-600 block mb-1">Motivo</label>
            <input value={motivo} onChange={e => setMotivo(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder="Ex: Falta injustificada" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data da infração</label>
              <input type="date" value={dataInfracao} onChange={e => setDataInfracao(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Data da ação</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Observação</label>
            <textarea rows={2} value={obs} onChange={e => setObs(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-none"
              placeholder="Contexto adicional, etc." />
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

function ColabRow({ nome, historico, filial, onReabrir, onExcluir }: { nome: string; historico: FluxoPunitivo[]; filial: string; onReabrir: (h: FluxoPunitivo) => void; onExcluir: (h: FluxoPunitivo) => void }) {
  const [open, setOpen] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)
  async function copiarGinfo(h: FluxoPunitivo) {
    try {
      await navigator.clipboard.writeText(montarTextoGinfo(h))
      setCopiado(h.id)
      setTimeout(() => setCopiado(c => (c === h.id ? null : c)), 1500)
    } catch { /* clipboard indisponível */ }
  }
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
                  <div className="flex-1 min-w-0">
                    {h.motivo && <p className="text-gray-700 font-medium truncate">{h.motivo}</p>}
                    {h.observacao && <p className="text-gray-400 italic truncate">{h.observacao}</p>}
                  </div>
                  {h.registrado_por && <span className="text-gray-400 shrink-0 ml-auto">{h.registrado_por}</span>}
                  <button
                    onClick={() => copiarGinfo(h)}
                    title="Copiar texto para o GINFO"
                    className={`shrink-0 transition-colors ${h.registrado_por ? '' : 'ml-auto'} ${copiado === h.id ? 'text-green-600' : 'text-gray-300 hover:text-brand-700'}`}>
                    {copiado === h.id ? <Check size={14} /> : <ClipboardCopy size={14} />}
                  </button>
                  {geraDocumento(h.tipo_acao) && (
                    <button
                      onClick={() => imprimirDocumentoFluxo({
                        tipo: h.tipo_acao!, nome, motivo: h.motivo || h.observacao || '',
                        data: h.data_acao, dataInfracao: h.data_infracao, dias: h.dias_suspensao,
                        filial, origem: h.origem ?? undefined,
                      })}
                      title="Imprimir documento"
                      className="shrink-0 text-gray-300 hover:text-brand-700 transition-colors">
                      <Printer size={14} />
                    </button>
                  )}
                  {registroEditavel(h) && (
                    <button
                      onClick={() => onReabrir(h)}
                      title="Reabrir (voltar para pendente e editar)"
                      className="shrink-0 text-gray-300 hover:text-orange-500 transition-colors">
                      <RotateCcw size={14} />
                    </button>
                  )}
                  {!h.id.startsWith('tel_') && (
                    <button
                      onClick={() => onExcluir(h)}
                      title="Excluir fluxo"
                      className="shrink-0 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
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
  const [registros,     setRegistros]     = useState<FluxoPunitivo[]>([])
  const [loading,       setLoading]       = useState(true)
  const [modalNova,     setModalNova]     = useState(false)
  const [modalDefinir,  setModalDefinir]  = useState<FluxoPunitivo[] | null>(null)
  const [busca,         setBusca]         = useState('')
  const [abaAtiva,      setAbaAtiva]      = useState<'pendentes' | 'historico' | 'motivos'>('pendentes')
  const [motivosPadrao, setMotivosPadrao] = useState<string[]>([])
  const [colabList,     setColabList]     = useState<ColaboradorBase[]>([])
  const [novoMotivo,    setNovoMotivo]    = useState('')
  const [savingMotivo,  setSavingMotivo]  = useState(false)
  const [copiadoGinfo,  setCopiadoGinfo]  = useState<string | null>(null)
  async function copiarGinfoPend(sol: FluxoPunitivo, motivo: string) {
    try {
      await navigator.clipboard.writeText(montarTextoGinfo({ ...sol, motivo: motivo || sol.motivo }))
      setCopiadoGinfo(sol.id)
      setTimeout(() => setCopiadoGinfo(c => (c === sol.id ? null : c)), 1500)
    } catch { /* clipboard indisponível */ }
  }

  async function carregarMotivos() {
    if (!usuario) return
    const { data } = await supabase
      .from('motivos_fluxo').select('descricao').eq('filial', usuario.filial).eq('ativo', true).order('descricao')
    setMotivosPadrao((data ?? []).map((m: any) => m.descricao))
  }

  async function carregar() {
    if (!usuario) return
    setLoading(true)
    carregarMotivos()

    // Lista de colaboradores cadastrados (para corrigir nomes vindos do grupo)
    supabase.from('colaboradores').select('nome, funcao').eq('filial', usuario.filial).order('nome')
      .then(({ data }) => setColabList((data ?? []) as ColaboradorBase[]))

    const { data: manual } = await supabase
      .from('fluxo_punitivo').select('*').eq('filial', usuario.filial)

    const { data: gsdpq } = await supabase
      .from('gsdpq_acoes').select('*').eq('filial', usuario.filial)

    const { data: relatos } = await supabase
      .from('relatos_acoes').select('*').eq('filial', usuario.filial)

    const { data: telemetria } = await supabase
      .from('telemetria_acoes').select('*').eq('filial', usuario.filial)

    // Orientação Verbal já sobe direto para fluxo_punitivo (origem nativa); evita
    // duplicar essas linhas aqui, que viriam pela projeção legada das tabelas de ações.
    const legacyGsdpq: FluxoPunitivo[] = (gsdpq ?? [])
      .filter((a: any) => a.tipo_acao !== 'Orientação Verbal')
      .map((a: any) => ({
        id: 'gsdpq_' + a.id, filial: a.filial,
        colaborador_nome: a.colaborador_nome, origem: 'GSDPQ' as const,
        tipo_acao: a.tipo_acao, dias_suspensao: a.dias_suspensao ?? null,
        data_acao: a.data_avaliacao ?? null, data_infracao: a.data_avaliacao ?? null,
        observacao: a.observacao ?? null,
        registrado_por: a.registrado_por ?? null, source_id: a.id,
        status: 'Concluido' as const, motivo: a.questao ?? null,
        created_at: a.created_at,
      }))

    const legacyRelatos: FluxoPunitivo[] = (relatos ?? [])
      .filter((a: any) => a.tipo_acao !== 'Orientação Verbal')
      .map((a: any) => ({
        id: 'relato_' + a.id, filial: a.filial,
        colaborador_nome: a.pessoa_relatada ?? a.colaborador_nome ?? '',
        origem: 'Relatos' as const, tipo_acao: a.tipo_acao,
        dias_suspensao: a.dias_suspensao ?? null, data_acao: a.data_relato ?? null,
        data_infracao: a.data_relato ?? null,
        observacao: a.observacao ?? null, registrado_por: a.registrado_por ?? null,
        source_id: a.id, status: 'Concluido' as const, motivo: a.tipo_relato ?? null,
        created_at: a.created_at,
      })).filter((a: any) => a.colaborador_nome)

    const legacyTelemetria: FluxoPunitivo[] = (telemetria ?? [])
      .filter((a: any) => a.tipo_acao !== 'Comunicado/Orientação')
      .map((a: any) => ({
        id: 'tel_' + a.id, filial: a.filial,
        colaborador_nome: a.motorista ?? '',
        origem: 'Telemetria' as const, tipo_acao: a.tipo_acao,
        dias_suspensao: a.dias_suspensao ?? null, data_acao: null, data_infracao: null,
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

  // Agrupa pendentes do mesmo colaborador na mesma data (um único fluxo por dia)
  const pendentesGrupos = useMemo(() => {
    const map = new Map<string, FluxoPunitivo[]>()
    pendentesFiltrados.forEach(p => {
      const key = `${p.colaborador_nome}__${diaKey(p.data_infracao ?? p.data_acao)}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    })
    return [...map.values()].sort((a, b) => b[0].created_at.localeCompare(a[0].created_at))
  }, [pendentesFiltrados])

  // ── Salvar ────────────────────────────────────────────────────────────────────

  async function handleSalvarManual(entry: Omit<FluxoPunitivo, 'id' | 'created_at'>) {
    await supabase.from('fluxo_punitivo').insert(entry)
    setModalNova(false)
    if (geraDocumento(entry.tipo_acao)) {
      imprimirDocumentoFluxo({
        tipo: entry.tipo_acao!, nome: entry.colaborador_nome,
        motivo: entry.motivo || entry.observacao || '',
        data: entry.data_acao, dataInfracao: entry.data_infracao,
        dias: entry.dias_suspensao, filial: usuario!.filial,
        origem: entry.origem ?? undefined,
      })
    }
    carregar()
  }

  async function handleDefinirAcao(grupo: FluxoPunitivo[], tipo: TipoAcao, dias: number | null, data: string, dataInfracao: string, obs: string, motivo: string, nomeCorreto: string) {
    const [master, ...resto] = grupo
    const nomeDefinitivo = nomeCorreto.trim() || master.colaborador_nome
    await supabase.from('fluxo_punitivo').update({
      colaborador_nome: nomeDefinitivo,
      tipo_acao: tipo,
      dias_suspensao: dias,
      data_acao: data || null,
      data_infracao: dataInfracao || null,
      observacao: obs.trim() || null,
      motivo: motivo.trim() || null,
      status: 'Concluido',
    }).eq('id', master.id)

    // Demais solicitações do mesmo dia são absorvidas (não contam na sequência)
    for (const r of resto) {
      await supabase.from('fluxo_punitivo').update({
        colaborador_nome: nomeDefinitivo,
        status: 'Concluido',
        tipo_acao: null,
        observacao: `Incluído no fluxo único de ${nomeDefinitivo} em ${dataInfracao || diaKey(data)}`,
      }).eq('id', r.id)
    }

    setModalDefinir(null)
    if (geraDocumento(tipo)) {
      imprimirDocumentoFluxo({
        tipo, nome: nomeDefinitivo,
        motivo: motivo.trim() || obs.trim(),
        data, dataInfracao: dataInfracao || null, dias, filial: usuario!.filial,
        origem: master.origem ?? undefined,
      })
    }
    carregar()
  }

  // Quando um fluxo vem do GSDPQ, ao solicitar a tela do GSDPQ trava os itens
  // gravando uma marca em gsdpq_acoes (tipo_acao: 'Fluxo Punitivo') — sem essa
  // marca removida, o item nunca reaparece no GSDPQ para o usuário escolher de
  // novo entre Fluxo ou Orientação Verbal. Libera a marca ao excluir o fluxo.
  async function liberarMarcaGsdpq(h: { filial: string; colaborador_nome: string; origem: string | null; data_infracao: string | null }) {
    if ((h.origem ?? '').toUpperCase() !== 'GSDPQ' || !h.colaborador_nome || !h.data_infracao) return
    const { data: marcas } = await supabase.from('gsdpq_acoes')
      .select('id, data_avaliacao')
      .eq('filial', h.filial)
      .eq('colaborador_nome', h.colaborador_nome)
      .eq('tipo_acao', 'Fluxo Punitivo')
    const ids = (marcas ?? []).filter((m: any) => diaKey(m.data_avaliacao) === h.data_infracao).map((m: any) => m.id)
    if (ids.length > 0) await supabase.from('gsdpq_acoes').delete().in('id', ids)
  }

  async function handleExcluirFluxo(grupo: FluxoPunitivo[]) {
    const nome = grupo[0].colaborador_nome
    const n = grupo.length
    const msg = n > 1
      ? `Excluir ${n} registros de fluxo de ${nome}? O colaborador volta a poder ser solicitado novamente (Fluxo ou Orientação).`
      : `Excluir o fluxo pendente de ${nome}? O colaborador volta a poder ser solicitado novamente (Fluxo ou Orientação).`
    if (!window.confirm(msg)) return
    const ids = grupo.map(g => g.id).filter(id => registroEditavel({ id } as FluxoPunitivo))
    if (ids.length === 0) {
      alert('Estes registros vêm da tela de origem e não podem ser excluídos aqui.')
      return
    }
    const { error } = await supabase.from('fluxo_punitivo').delete().in('id', ids)
    if (error) { alert('Erro ao excluir o fluxo:\n' + error.message); return }
    await liberarMarcaGsdpq(grupo[0])
    carregar()
  }

  async function handleExcluirRegistro(h: FluxoPunitivo) {
    let tabela: string
    let realId: string
    if (h.id.startsWith('gsdpq_')) {
      tabela = 'gsdpq_acoes'; realId = h.id.slice('gsdpq_'.length)
    } else if (h.id.startsWith('relato_')) {
      tabela = 'relatos_acoes'; realId = h.id.slice('relato_'.length)
    } else if (registroEditavel(h)) {
      tabela = 'fluxo_punitivo'; realId = h.id
    } else {
      alert('Este registro vem de Telemetria e deve ser removido na tela de origem.')
      return
    }
    if (!window.confirm(`Excluir este fluxo de ${h.colaborador_nome}? O colaborador volta a poder ser solicitado novamente (Fluxo ou Orientação).`)) return
    const { error } = await supabase.from(tabela).delete().eq('id', realId)
    if (error) { alert('Erro ao excluir o fluxo:\n' + error.message); return }
    // When deleting a real fluxo_punitivo row, also remove any matching entry
    // in the source table so it doesn't reappear as a legacy projection.
    if (tabela === 'fluxo_punitivo' && h.source_id) {
      if ((h.origem ?? '').toLowerCase().includes('relato')) {
        await supabase.from('relatos_acoes').delete().eq('id', h.source_id)
      } else if ((h.origem ?? '').toUpperCase() === 'GSDPQ') {
        await supabase.from('gsdpq_acoes').delete().eq('id', h.source_id)
      }
    }
    if (tabela === 'fluxo_punitivo') await liberarMarcaGsdpq(h)
    carregar()
  }

  async function handleReabrir(h: FluxoPunitivo) {
    if (!window.confirm(`Reabrir a ação de ${h.colaborador_nome}? Ela volta para Pendentes para ser redefinida.`)) return
    await supabase.from('fluxo_punitivo').update({
      status: 'Solicitado',
      tipo_acao: null,
      dias_suspensao: null,
    }).eq('id', h.id)
    setAbaAtiva('pendentes')
    carregar()
  }

  async function handleAdicionarMotivo() {
    if (!novoMotivo.trim() || !usuario) return
    setSavingMotivo(true)
    await supabase.from('motivos_fluxo').insert({ filial: usuario.filial, descricao: novoMotivo.trim() })
    setNovoMotivo('')
    setSavingMotivo(false)
    carregarMotivos()
  }

  async function handleRemoverMotivo(descricao: string) {
    if (!usuario) return
    await supabase.from('motivos_fluxo').update({ ativo: false })
      .eq('filial', usuario.filial).eq('descricao', descricao)
    carregarMotivos()
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
          <button onClick={() => setAbaAtiva('motivos')}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors flex items-center gap-1.5 ${abaAtiva === 'motivos' ? 'bg-brand-700 text-white border-brand-700' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
            <BookOpen size={12} /> Motivos
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
              {pendentesGrupos.map(grupo => {
                const sol = grupo[0]
                const hist = historico.get(sol.colaborador_nome) ?? []
                const proxima = calcProxima(hist)
                const origens = [...new Set(grupo.map(g => g.origem))]
                const motivoExibido = grupo.length > 1 ? combinarMotivos(grupo) : (sol.motivo ?? '')
                const sugestao = sugerirColaborador(sol.colaborador_nome, colabList)
                const nomeSugerido = sugestao && sugestao !== sol.colaborador_nome ? sugestao : null
                return (
                  <div key={sol.id} className="bg-white rounded-xl border border-orange-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-sm font-semibold text-gray-900">
                            {nomeSugerido ? nomeSugerido : sol.colaborador_nome}
                          </span>
                          {nomeSugerido && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 font-medium">
                              ✦ sugerido · recebido: {sol.colaborador_nome}
                            </span>
                          )}
                          {origens.map(o => (
                            <span key={o} className={`text-xs px-2 py-0.5 rounded border font-medium ${ORIGEM_COLOR[o] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              {o}
                            </span>
                          ))}
                          <span className="text-xs text-gray-400">{fmtDate(sol.data_infracao ?? sol.data_acao)}</span>
                          {grupo.length > 1 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">
                              {grupo.length} ocorrências · fluxo único
                            </span>
                          )}
                        </div>
                        {motivoExibido && (
                          <p className="text-xs text-gray-600 mb-2 leading-relaxed line-clamp-3 whitespace-pre-line">{motivoExibido}</p>
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
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => setModalDefinir(grupo)}
                          className="flex items-center gap-1.5 text-sm bg-brand-700 text-white px-3 py-2 rounded-lg hover:bg-brand-600 font-medium">
                          <CheckCircle2 size={14} /> Definir ação
                        </button>
                        <button
                          onClick={() => copiarGinfoPend(sol, motivoExibido)}
                          title="Copiar texto para o GINFO"
                          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${copiadoGinfo === sol.id ? 'text-green-600 border-green-200 bg-green-50' : 'text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                          {copiadoGinfo === sol.id ? <Check size={12} /> : <ClipboardCopy size={12} />}
                          {copiadoGinfo === sol.id ? 'Copiado' : 'Copiar p/ GINFO'}
                        </button>
                        <button
                          onClick={() => handleExcluirFluxo(grupo)}
                          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 hover:bg-red-50 transition-colors">
                          <Trash2 size={12} /> Excluir
                        </button>
                      </div>
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
                    <ColabRow key={nome} nome={nome} historico={historico.get(nome) ?? []} filial={usuario!.filial} onReabrir={handleReabrir} onExcluir={handleExcluirRegistro} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Motivos Padronizados ── */}
      {abaAtiva === 'motivos' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Motivos Padronizados</p>
            <p className="text-xs text-gray-400">Usados para padronizar as solicitações que chegam via grupo WhatsApp.</p>
          </div>
          <div className="flex gap-2">
            <input
              value={novoMotivo}
              onChange={e => setNovoMotivo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdicionarMotivo()}
              placeholder="Novo motivo…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <button
              onClick={handleAdicionarMotivo}
              disabled={savingMotivo || !novoMotivo.trim()}
              className="flex items-center gap-1.5 text-sm bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-50 font-medium"
            >
              {savingMotivo ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
            </button>
          </div>
          {motivosPadrao.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">Nenhum motivo cadastrado. Adicione os motivos padrão da sua filial.</p>
          ) : (
            <div className="space-y-1.5">
              {motivosPadrao.map(m => (
                <div key={m} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2.5 text-sm">
                  <span className="text-gray-800">{m}</span>
                  <button onClick={() => handleRemoverMotivo(m)} className="text-gray-300 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
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
          grupo={modalDefinir}
          historico={historico.get(modalDefinir[0].colaborador_nome) ?? []}
          motivosPadrao={motivosPadrao}
          colabList={colabList}
          onClose={() => setModalDefinir(null)}
          onSalvar={handleDefinirAcao}
        />
      )}
    </div>
  )
}
