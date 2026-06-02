import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts'
import {
  FileSpreadsheet, ChevronDown, ChevronUp, AlertTriangle, CheckCircle,
  XCircle, Users, ClipboardList, BarChart2, RefreshCw, Shield, Upload,
  Download, Plus, Loader2, Building2
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { GsdpqAvaliacao, GsdpqAcao } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPOS_ACAO = ['Reciclagem', 'Advertência Verbal', 'Advertência Escrita', 'Suspensão']

const COR_ACAO: Record<string, string> = {
  'Reciclagem': 'bg-blue-50 text-blue-700 border-blue-200',
  'Advertência Verbal': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Advertência Escrita': 'bg-orange-50 text-orange-700 border-orange-200',
  'Suspensão': 'bg-red-50 text-red-700 border-red-200',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResumoColaborador {
  nome: string
  equipe: string
  totalNO: number
  totalOK: number
  totalAvaliacoes: number
  percentualConformidade: number
  reincidencias: { questao: string; vezes: number }[]
  nosPorQuestao: Record<string, number>
  evolucao: { data: string; conformidade: number }[]
  avaliacoesPorData: Record<string, { nos: string[]; observacoes: string; realizadoPor: string }>
}

interface ModalAcao {
  avaliacaoId: string
  colaboradorNome: string
  questao: string
  dataAvaliacao: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseGsdpqExcel(buffer: ArrayBuffer): { rows: Omit<GsdpqAvaliacao, 'id' | 'created_at' | 'colaborador_id'>[]; questoes: string[] } {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false })
  if (raw.length === 0) return { rows: [], questoes: [] }

  const todasColunas = Object.keys(raw[0])
  const questoes = todasColunas.slice(13).filter(q => q.trim() !== '')

  const rows: Omit<GsdpqAvaliacao, 'id' | 'created_at' | 'colaborador_id'>[] = []

  raw.forEach(r => {
    const cols = Object.keys(r)
    const colaborador_nome = (r[cols[5]] ?? '').trim()
    if (!colaborador_nome) return
    const realizado_por = r[cols[3]] ?? ''
    const equipe = r[cols[7]] ?? ''
    const data_avaliacao = r[cols[9]] ?? ''
    const observacoes = r[cols[12]] ?? ''
    const filial = r[cols[1]] ?? ''

    questoes.forEach(q => {
      const resultado = (r[q] ?? '').toString().toUpperCase().trim()
      if (!resultado) return
      rows.push({ filial, colaborador_nome, realizado_por, equipe, data_avaliacao, questao: q, resultado, observacoes })
    })
  })

  return { rows, questoes }
}

function parseColaboradoresExcel(buffer: ArrayBuffer, filial: string) {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false })
  return raw
    .filter(r => (r['COLABORADOR'] ?? '').trim())
    .map(r => ({
      filial,
      matricula: String(r['MATR'] ?? '').trim() || null,
      nome: (r['COLABORADOR'] ?? '').trim(),
      equipe: (r['EQUIPE'] ?? '').trim() || null,
      funcao: (r['FUNCAO'] ?? '').trim() || null,
      status: (r['STATUS'] ?? 'TRABALHANDO').trim(),
    }))
}

function calcularResumos(avaliacoes: GsdpqAvaliacao[], questoes: string[]): ResumoColaborador[] {
  const mapa = new Map<string, GsdpqAvaliacao[]>()
  avaliacoes.forEach(av => {
    if (!mapa.has(av.colaborador_nome)) mapa.set(av.colaborador_nome, [])
    mapa.get(av.colaborador_nome)!.push(av)
  })

  return Array.from(mapa.entries()).map(([nome, avs]) => {
    let totalNO = 0, totalOK = 0
    const nosPorQuestao: Record<string, number> = {}
    const avaliacoesPorData: Record<string, { nos: string[]; observacoes: string; realizadoPor: string }> = {}

    avs.forEach(av => {
      const key = av.data_avaliacao ?? ''
      if (!avaliacoesPorData[key]) avaliacoesPorData[key] = { nos: [], observacoes: av.observacoes ?? '', realizadoPor: av.realizado_por ?? '' }
      if (av.resultado === 'NO') {
        totalNO++
        nosPorQuestao[av.questao] = (nosPorQuestao[av.questao] ?? 0) + 1
        avaliacoesPorData[key].nos.push(av.questao)
      } else if (av.resultado === 'OK') totalOK++
    })

    const reincidencias = Object.entries(nosPorQuestao)
      .filter(([, v]) => v > 1)
      .map(([questao, vezes]) => ({ questao, vezes }))
      .sort((a, b) => b.vezes - a.vezes)

    const datasOrdenadas = Object.keys(avaliacoesPorData).sort()
    const evolucao = datasOrdenadas.map(data => {
      const nosNaData = questoes.filter(q => {
        const av = avs.find(a => a.data_avaliacao === data && a.questao === q)
        return av?.resultado === 'NO'
      }).length
      const okNaData = questoes.filter(q => {
        const av = avs.find(a => a.data_avaliacao === data && a.questao === q)
        return av?.resultado === 'OK'
      }).length
      const total = nosNaData + okNaData
      return { data: data.slice(0, 5), conformidade: total > 0 ? Math.round((okNaData / total) * 100) : 100 }
    })

    const totalRespondidas = totalNO + totalOK
    const percentualConformidade = totalRespondidas > 0 ? Math.round((totalOK / totalRespondidas) * 100) : 100
    const totalAvaliacoes = datasOrdenadas.length
    const equipe = avs[0].equipe ?? ''

    return { nome, equipe, totalNO, totalOK, totalAvaliacoes, percentualConformidade, reincidencias, nosPorQuestao, evolucao, avaliacoesPorData }
  }).sort((a, b) => b.totalNO - a.totalNO)
}

function calcularRankingQuestoes(avaliacoes: GsdpqAvaliacao[]) {
  const counts: Record<string, { NO: number; OK: number }> = {}
  avaliacoes.forEach(av => {
    if (!counts[av.questao]) counts[av.questao] = { NO: 0, OK: 0 }
    if (av.resultado === 'NO') counts[av.questao].NO++
    else if (av.resultado === 'OK') counts[av.questao].OK++
  })
  return Object.entries(counts)
    .filter(([, v]) => v.NO > 0)
    .map(([questao, v]) => ({ questao, ...v }))
    .sort((a, b) => b.NO - a.NO)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConformidadeBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-brand-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 text-right">{pct}%</span>
    </div>
  )
}

function ModalRegistrarAcao({ modal, acaoExistente, onClose, onSalvar }: {
  modal: ModalAcao
  acaoExistente?: GsdpqAcao
  onClose: () => void
  onSalvar: (tipo: string, dias: number | null, obs: string) => Promise<void>
}) {
  const [tipo, setTipo] = useState(acaoExistente?.tipo_acao ?? '')
  const [dias, setDias] = useState<string>(String(acaoExistente?.dias_suspensao ?? ''))
  const [obs, setObs] = useState(acaoExistente?.observacao ?? '')
  const [loading, setLoading] = useState(false)

  async function salvar() {
    if (!tipo) return
    setLoading(true)
    await onSalvar(tipo, tipo === 'Suspensão' ? (parseInt(dias) || null) : null, obs)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Registrar Ação Disciplinar</h3>
        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
          <strong>{modal.colaboradorNome}</strong> · {modal.dataAvaliacao}<br />
          <span className="text-red-600">{modal.questao.length > 80 ? modal.questao.slice(0, 80) + '…' : modal.questao}</span>
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Ação *</label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_ACAO.map(t => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className={`px-3 py-2 rounded-lg text-sm border font-medium transition-colors ${
                    tipo === t ? COR_ACAO[t] + ' border' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {tipo === 'Suspensão' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade de dias *</label>
              <input
                type="number"
                min="1"
                value={dias}
                onChange={e => setDias(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Ex: 1"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observação (opcional)</label>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="Detalhes da ação tomada..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            onClick={salvar}
            disabled={loading || !tipo || (tipo === 'Suspensão' && !dias)}
            className="px-4 py-2 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-2"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : 'Salvar Ação'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ColaboradorRow({ r, avaliacoes, acoes, onRegistrarAcao }: {
  r: ResumoColaborador
  avaliacoes: GsdpqAvaliacao[]
  acoes: GsdpqAcao[]
  onRegistrarAcao: (modal: ModalAcao) => void
}) {
  const [open, setOpen] = useState(false)

  const datasOrdenadas = Object.keys(r.avaliacoesPorData).sort()
  const acoesColaborador = acoes.filter(a => a.colaborador_nome === r.nome)

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {open ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
            <div>
              <p className="font-medium text-gray-900 text-sm">{r.nome}</p>
              <p className="text-xs text-gray-400">{r.equipe}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-center text-sm text-gray-700">{r.totalAvaliacoes}</td>
        <td className="px-4 py-3 text-center">
          <span className={`text-sm font-bold ${r.totalNO > 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.totalNO}</span>
        </td>
        <td className="px-4 py-3 text-center">
          {r.reincidencias.length > 0
            ? <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                <AlertTriangle size={11} /> {r.reincidencias.length}
              </span>
            : <span className="text-xs text-gray-400">—</span>}
        </td>
        <td className="px-4 py-3 text-center">
          {acoesColaborador.length > 0
            ? <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                <Shield size={11} /> {acoesColaborador.length}
              </span>
            : <span className="text-xs text-gray-400">—</span>}
        </td>
        <td className="px-4 py-3 w-40"><ConformidadeBar pct={r.percentualConformidade} /></td>
      </tr>

      {open && (
        <tr>
          <td colSpan={6} className="bg-gray-50 border-b border-gray-200 px-6 py-5">
            <div className="space-y-5">

              {/* Evolução temporal */}
              {r.evolucao.length > 1 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Evolução de Conformidade</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={r.evolucao}>
                      <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" width={32} />
                      <Tooltip formatter={(v) => [`${v}%`, 'Conformidade']} />
                      <Line type="monotone" dataKey="conformidade" stroke="#1a4451" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Reincidências */}
              {r.reincidencias.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-700 uppercase mb-2 flex items-center gap-1">
                    <AlertTriangle size={12} /> Reincidências
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {r.reincidencias.map(re => (
                      <span key={re.questao} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded border border-orange-200">
                        <strong>{re.vezes}x</strong> — {re.questao.length > 80 ? re.questao.slice(0, 80) + '…' : re.questao}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico de avaliações com ações */}
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Histórico de Avaliações</p>
                <div className="space-y-3">
                  {datasOrdenadas.map(data => {
                    const info = r.avaliacoesPorData[data]
                    const nosNaData = info.nos
                    return (
                      <div key={data} className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="text-xs font-semibold text-gray-700">{data}</span>
                            <span className="text-xs text-gray-400 ml-2">por {info.realizadoPor}</span>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${nosNaData.length === 0 ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700'}`}>
                            {nosNaData.length === 0 ? '✓ Sem NOs' : `${nosNaData.length} NO${nosNaData.length > 1 ? 's' : ''}`}
                          </span>
                        </div>

                        {nosNaData.length > 0 && (
                          <div className="space-y-2 mt-2">
                            {nosNaData.map(questao => {
                              const avaliacao = avaliacoes.find(av =>
                                av.colaborador_nome === r.nome &&
                                av.data_avaliacao === data &&
                                av.questao === questao
                              )
                              const acaoExistente = acoes.find(a =>
                                a.avaliacao_id === avaliacao?.id
                              )
                              return (
                                <div key={questao} className="flex items-start justify-between gap-2 bg-red-50 rounded p-2">
                                  <div className="flex items-start gap-1.5 flex-1">
                                    <XCircle size={12} className="text-red-500 mt-0.5 shrink-0" />
                                    <span className="text-xs text-red-700">{questao}</span>
                                  </div>
                                  <div className="shrink-0">
                                    {acaoExistente ? (
                                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${COR_ACAO[acaoExistente.tipo_acao]}`}>
                                        {acaoExistente.tipo_acao}
                                        {acaoExistente.dias_suspensao ? ` (${acaoExistente.dias_suspensao}d)` : ''}
                                      </span>
                                    ) : (
                                      <button
                                        onClick={e => {
                                          e.stopPropagation()
                                          if (avaliacao) onRegistrarAcao({
                                            avaliacaoId: avaliacao.id,
                                            colaboradorNome: r.nome,
                                            questao,
                                            dataAvaliacao: data,
                                          })
                                        }}
                                        className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-900 bg-white border border-brand-200 hover:border-brand-400 px-2 py-0.5 rounded transition-colors"
                                      >
                                        <Plus size={10} /> Ação
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {info.observacoes && (
                          <p className="text-xs text-gray-500 italic border-t border-gray-100 pt-2 mt-2">
                            "{info.observacoes}"
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Gsdpq() {
  const { usuario } = useAuth()
  const [avaliacoes, setAvaliacoes] = useState<GsdpqAvaliacao[]>([])
  const [acoes, setAcoes] = useState<GsdpqAcao[]>([])
  const [questoes, setQuestoes] = useState<string[]>([])
  const [abaAtiva, setAbaAtiva] = useState<'dashboard' | 'colaboradores' | 'questoes' | 'acoes'>('dashboard')
  const [filtroEquipe, setFiltroEquipe] = useState('Todas')
  const [filtroPeriodo, setFiltroPeriodo] = useState({ de: '', ate: '' })
  const [carregando, setCarregando] = useState(false)
  const [uploadando, setUploadando] = useState(false)
  const [modalAcao, setModalAcao] = useState<ModalAcao | null>(null)
  const [abaUpload, setAbaUpload] = useState<'gsdpq' | 'colaboradores'>('gsdpq')

  async function carregarDados() {
    if (!usuario) return
    setCarregando(true)
    const [{ data: avs }, { data: acs }] = await Promise.all([
      supabase.from('gsdpq_avaliacoes').select('*').eq('filial', usuario.filial).order('data_avaliacao'),
      supabase.from('gsdpq_acoes').select('*').eq('filial', usuario.filial).order('created_at', { ascending: false }),
    ])
    const todasAvs = avs ?? []
    setAvaliacoes(todasAvs)
    setAcoes(acs ?? [])
    const qs = Array.from(new Set(todasAvs.map(a => a.questao)))
    setQuestoes(qs)
    setCarregando(false)
  }

  useEffect(() => { carregarDados() }, [usuario?.filial])

  // Upload GSDPQ
  const onDropGsdpq = useCallback(async (files: File[]) => {
    if (!usuario || !files[0]) return
    setUploadando(true)
    const buffer = await files[0].arrayBuffer()
    const { rows, questoes: qs } = parseGsdpqExcel(buffer)

    // Busca colaboradores pra vincular IDs
    const { data: colab } = await supabase.from('gsdpq_colaboradores').select('id, nome').eq('filial', usuario.filial)
    const colabMap = new Map((colab ?? []).map(c => [c.nome.toUpperCase(), c.id]))

    const rowsComFilial = rows.map(r => ({
      ...r,
      filial: usuario.filial,
      colaborador_id: colabMap.get(r.colaborador_nome.toUpperCase()) ?? null,
    }))

    // Upsert em lotes de 50
    for (let i = 0; i < rowsComFilial.length; i += 50) {
      await supabase.from('gsdpq_avaliacoes')
        .upsert(rowsComFilial.slice(i, i + 50), { onConflict: 'filial,colaborador_nome,data_avaliacao,questao' })
    }

    setQuestoes(qs)
    setUploadando(false)
    carregarDados()
  }, [usuario])

  // Upload Colaboradores
  const onDropColab = useCallback(async (files: File[]) => {
    if (!usuario || !files[0]) return
    setUploadando(true)
    const buffer = await files[0].arrayBuffer()
    const rows = parseColaboradoresExcel(buffer, usuario.filial)

    for (let i = 0; i < rows.length; i += 50) {
      await supabase.from('gsdpq_colaboradores')
        .upsert(rows.slice(i, i + 50), { onConflict: 'filial,nome' })
    }
    setUploadando(false)
    alert(`${rows.length} colaboradores atualizados com sucesso.`)
  }, [usuario])

  const { getRootProps: getRootGsdpq, getInputProps: getInputGsdpq, isDragActive: isDragGsdpq } = useDropzone({
    onDrop: onDropGsdpq,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'text/csv': ['.csv'] },
    multiple: false,
  })

  const { getRootProps: getRootColab, getInputProps: getInputColab, isDragActive: isDragColab } = useDropzone({
    onDrop: onDropColab,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    multiple: false,
  })

  // Filtros
  const avaliacoesFiltradas = avaliacoes.filter(av => {
    if (filtroEquipe !== 'Todas' && av.equipe !== filtroEquipe) return false
    if (filtroPeriodo.de && av.data_avaliacao && av.data_avaliacao < filtroPeriodo.de) return false
    if (filtroPeriodo.ate && av.data_avaliacao && av.data_avaliacao > filtroPeriodo.ate) return false
    return true
  })

  const resumos = calcularResumos(avaliacoesFiltradas, questoes)
  const rankingQuestoes = calcularRankingQuestoes(avaliacoesFiltradas)
  const equipes = ['Todas', ...Array.from(new Set(avaliacoes.map(a => a.equipe).filter(Boolean) as string[]))]

  const totalNO = resumos.reduce((s, r) => s + r.totalNO, 0)
  const totalOK = resumos.reduce((s, r) => s + r.totalOK, 0)
  const conformidadeGeral = totalNO + totalOK > 0 ? Math.round((totalOK / (totalNO + totalOK)) * 100) : 0
  const comReincidencia = resumos.filter(r => r.reincidencias.length > 0).length

  // Comparativo por equipe
  const comparativoEquipes = equipes.filter(e => e !== 'Todas').map(equipe => {
    const avs = avaliacoesFiltradas.filter(a => a.equipe === equipe)
    const nos = avs.filter(a => a.resultado === 'NO').length
    const oks = avs.filter(a => a.resultado === 'OK').length
    const total = nos + oks
    return { equipe, conformidade: total > 0 ? Math.round((oks / total) * 100) : 0, nos, total: avs.length }
  })

  // Registrar ação
  async function salvarAcao(tipo: string, dias: number | null, obs: string) {
    if (!modalAcao || !usuario) return
    await supabase.from('gsdpq_acoes').upsert({
      filial: usuario.filial,
      colaborador_nome: modalAcao.colaboradorNome,
      avaliacao_id: modalAcao.avaliacaoId,
      questao: modalAcao.questao,
      data_avaliacao: modalAcao.dataAvaliacao,
      tipo_acao: tipo,
      dias_suspensao: dias,
      observacao: obs || null,
      registrado_por: usuario.nome ?? usuario.login,
    }, { onConflict: 'avaliacao_id' })
    setModalAcao(null)
    carregarDados()
  }

  // Exportar Excel
  function exportarExcel() {
    const dados = resumos.map(r => ({
      'Colaborador': r.nome,
      'Equipe': r.equipe,
      'Avaliações': r.totalAvaliacoes,
      'Total NOs': r.totalNO,
      'Conformidade (%)': r.percentualConformidade,
      'Reincidências': r.reincidencias.length,
      'Ações Registradas': acoes.filter(a => a.colaborador_nome === r.nome).length,
    }))
    const ws = XLSX.utils.json_to_sheet(dados)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'GSDPQ')
    XLSX.writeFile(wb, `GSDPQ_${usuario?.filial}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Análise GSDPQ</h2>
          {usuario && <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Building2 size={12} /> {usuario.filial}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregarDados} disabled={carregando} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
          {avaliacoes.length > 0 && (
            <button onClick={exportarExcel} className="flex items-center gap-2 text-sm text-brand-700 hover:text-brand-900 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50">
              <Download size={14} /> Exportar
            </button>
          )}
        </div>
      </div>

      {/* Upload section */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex gap-4 mb-3">
          <button onClick={() => setAbaUpload('gsdpq')} className={`text-sm font-medium px-3 py-1.5 rounded-lg ${abaUpload === 'gsdpq' ? 'bg-brand-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            <FileSpreadsheet size={14} className="inline mr-1.5" />Planilha GSDPQ
          </button>
          <button onClick={() => setAbaUpload('colaboradores')} className={`text-sm font-medium px-3 py-1.5 rounded-lg ${abaUpload === 'colaboradores' ? 'bg-brand-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            <Users size={14} className="inline mr-1.5" />Colaboradores
          </button>
        </div>

        {abaUpload === 'gsdpq' && (
          <div {...getRootGsdpq()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${isDragGsdpq ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
            <input {...getInputGsdpq()} />
            {uploadando ? <Loader2 size={24} className="mx-auto text-brand-500 animate-spin" /> : <Upload size={24} className="mx-auto text-gray-400 mb-1" />}
            <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : 'Arraste a planilha GSDPQ (.xlsx)'}</p>
            <p className="text-xs text-gray-400 mt-0.5">Novos registros são adicionados, existentes são atualizados</p>
          </div>
        )}

        {abaUpload === 'colaboradores' && (
          <div {...getRootColab()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${isDragColab ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
            <input {...getInputColab()} />
            {uploadando ? <Loader2 size={24} className="mx-auto text-brand-500 animate-spin" /> : <Users size={24} className="mx-auto text-gray-400 mb-1" />}
            <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : 'Arraste a planilha de Colaboradores (.xlsx)'}</p>
            <p className="text-xs text-gray-400 mt-0.5">Novos colaboradores são adicionados, existentes são atualizados</p>
          </div>
        )}
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
        </div>
      ) : avaliacoes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma avaliação encontrada. Faça o upload da planilha GSDPQ para começar.</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Filtros */}
          <div className="flex items-center gap-4 flex-wrap bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium">Equipe:</span>
              {equipes.map(e => (
                <button key={e} onClick={() => setFiltroEquipe(e)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filtroEquipe === e ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{e}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-500 font-medium">Período:</span>
              <input type="text" placeholder="DD/MM/AAAA" value={filtroPeriodo.de} onChange={e => setFiltroPeriodo(p => ({ ...p, de: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <span className="text-xs text-gray-400">até</span>
              <input type="text" placeholder="DD/MM/AAAA" value={filtroPeriodo.ate} onChange={e => setFiltroPeriodo(p => ({ ...p, ate: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>

          {/* Alerta reincidências */}
          {comReincidencia > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm text-orange-800">
              <AlertTriangle size={18} className="shrink-0 text-orange-500" />
              <span><strong>{comReincidencia} colaborador{comReincidencia > 1 ? 'es' : ''}</strong> com reincidência no mesmo item de auditoria.</span>
            </div>
          )}

          {/* Abas */}
          <div className="flex gap-1 border-b border-gray-200">
            {([['dashboard', 'Dashboard'], ['colaboradores', 'Por Colaborador'], ['questoes', 'Questões'], ['acoes', 'Ações Disciplinares']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setAbaAtiva(id)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${abaAtiva === id ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{label}</button>
            ))}
          </div>

          {/* ── Dashboard ── */}
          {abaAtiva === 'dashboard' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Avaliações', value: avaliacoesFiltradas.filter((a, i, arr) => arr.findIndex(b => b.colaborador_nome === a.colaborador_nome && b.data_avaliacao === a.data_avaliacao) === i).length, icon: ClipboardList, color: 'blue' },
                  { label: 'Colaboradores', value: resumos.length, icon: Users, color: 'purple' },
                  { label: 'Total de NOs', value: totalNO, icon: XCircle, color: 'red' },
                  { label: 'Conformidade', value: `${conformidadeGeral}%`, icon: BarChart2, color: conformidadeGeral >= 80 ? 'green' : conformidadeGeral >= 60 ? 'yellow' : 'red' },
                ].map(({ label, value, icon: Icon, color }) => {
                  const colorMap: Record<string, string> = { blue: 'bg-blue-50 text-blue-700', purple: 'bg-purple-50 text-purple-700', red: 'bg-red-50 text-red-600', green: 'bg-brand-50 text-brand-700', yellow: 'bg-yellow-50 text-yellow-600' }
                  return (
                    <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-3">
                      <div className={`p-2.5 rounded-lg ${colorMap[color]}`}><Icon size={20} /></div>
                      <div><p className="text-xs text-gray-500">{label}</p><p className={`text-2xl font-bold ${color === 'red' ? 'text-red-600' : 'text-gray-900'}`}>{value}</p></div>
                    </div>
                  )
                })}
              </div>

              {/* Comparativo equipes */}
              {comparativoEquipes.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Comparativo por Equipe</p>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={comparativoEquipes} barSize={40}>
                      <XAxis dataKey="equipe" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" width={32} />
                      <Tooltip formatter={(v) => [`${v}%`, 'Conformidade']} />
                      <Bar dataKey="conformidade" radius={[4, 4, 0, 0]}>
                        {comparativoEquipes.map((e) => (
                          <Cell key={e.equipe} fill={e.conformidade >= 80 ? '#1a4451' : e.conformidade >= 60 ? '#f59e0b' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top 5 mais NOs */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-3">Top 5 — Mais NOs</p>
                <div className="space-y-2">
                  {resumos.slice(0, 5).map((r, i) => (
                    <div key={r.nome} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-gray-700">{r.nome}</span>
                          <span className="text-red-600 font-bold">{r.totalNO} NOs</span>
                        </div>
                        <ConformidadeBar pct={r.percentualConformidade} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Por Colaborador ── */}
          {abaAtiva === 'colaboradores' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Colaborador</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Aval.</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">NOs</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Reinc.</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Ações</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-44">Conformidade</th>
                  </tr>
                </thead>
                <tbody>
                  {resumos.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-gray-400">Nenhum dado</td></tr>}
                  {resumos.map(r => (
                    <ColaboradorRow key={r.nome} r={r} avaliacoes={avaliacoesFiltradas} acoes={acoes} onRegistrarAcao={setModalAcao} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Questões ── */}
          {abaAtiva === 'questoes' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 text-xs text-gray-500 font-medium">
                Questões com NOs — ordenadas por frequência
              </div>
              {rankingQuestoes.length === 0
                ? <p className="text-center py-10 text-gray-400">Nenhum NO registrado</p>
                : <div className="divide-y divide-gray-100">
                    {rankingQuestoes.map((q, i) => {
                      const total = q.NO + q.OK
                      const pct = total > 0 ? Math.round((q.NO / total) * 100) : 0
                      return (
                        <div key={q.questao} className="px-4 py-3 flex items-center gap-4">
                          <span className="text-xs font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                          <p className="flex-1 text-sm text-gray-700">{q.questao}</p>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="flex items-center gap-1 text-xs text-brand-700"><CheckCircle size={13} />{q.OK}</span>
                            <span className="flex items-center gap-1 text-xs text-red-600 font-bold"><XCircle size={13} />{q.NO}</span>
                            <div className="w-20"><ConformidadeBar pct={100 - pct} /></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
              }
            </div>
          )}

          {/* ── Ações Disciplinares ── */}
          {abaAtiva === 'acoes' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                <span className="text-xs text-gray-500 font-medium">{acoes.length} ações registradas</span>
              </div>
              {acoes.length === 0
                ? <p className="text-center py-10 text-gray-400">Nenhuma ação registrada</p>
                : <div className="divide-y divide-gray-100">
                    {acoes.map(a => (
                      <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium shrink-0 ${COR_ACAO[a.tipo_acao]}`}>
                          {a.tipo_acao}{a.dias_suspensao ? ` (${a.dias_suspensao}d)` : ''}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{a.colaborador_nome}</p>
                          <p className="text-xs text-gray-500 truncate">{a.questao}</p>
                          {a.observacao && <p className="text-xs text-gray-400 italic mt-0.5">"{a.observacao}"</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">{a.data_avaliacao}</p>
                          <p className="text-xs text-gray-400">{a.registrado_por}</p>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          )}

        </div>
      )}

      {/* Modal Ação */}
      {modalAcao && (
        <ModalRegistrarAcao
          modal={modalAcao}
          acaoExistente={acoes.find(a => a.avaliacao_id === modalAcao.avaliacaoId)}
          onClose={() => setModalAcao(null)}
          onSalvar={salvarAcao}
        />
      )}
    </div>
  )
}
