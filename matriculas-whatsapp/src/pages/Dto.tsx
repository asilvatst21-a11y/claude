import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  FileSpreadsheet, Upload, Loader2, Building2, RefreshCw, Download,
  AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp, ClipboardList, Send, Check, MessageSquare
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { enviarMensagemGrupo } from '../lib/zapi'
import { registrarOrientacaoVerbalFluxo } from '../lib/fluxoPunitivo'
import { formatarDataBR } from '../lib/utils'
import type { DtoObservacao } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

type QuestaoConfKey = 'tem_padrao' | 'uso_epis' | 'funcionario_treinado' | 'ferramentas_ok' | 'cumpre_sop' | 'padrao_completo' | 'conhece_padrao'
type StatusAcao = 'Pendente' | 'Em Andamento' | 'Concluído'

// ── Constants ─────────────────────────────────────────────────────────────────

const QUESTOES_CONF: { key: QuestaoConfKey; label: string }[] = [
  { key: 'tem_padrao', label: 'Padrão escrito' },
  { key: 'uso_epis', label: 'EPI 100%' },
  { key: 'funcionario_treinado', label: 'Treinamento' },
  { key: 'ferramentas_ok', label: 'Ferramentas OK' },
  { key: 'cumpre_sop', label: 'Cumpre SOP' },
  { key: 'padrao_completo', label: 'Padrão completo' },
  { key: 'conhece_padrao', label: 'Conhece padrão' },
]

const STATUS_ACAO: StatusAcao[] = ['Pendente', 'Em Andamento', 'Concluído']

// ── Helpers ───────────────────────────────────────────────────────────────────

function excelDate(val: string): string {
  const n = parseFloat(val)
  if (!isNaN(n) && n > 40000 && n < 100000) {
    const date = new Date(Math.round((n - 25569) * 86400 * 1000))
    return date.toLocaleDateString('pt-BR')
  }
  return val
}

function calcConformidade(obs: DtoObservacao): number {
  const sim = QUESTOES_CONF.filter(q => obs[q.key] === 'SIM').length
  const nao = QUESTOES_CONF.filter(q => obs[q.key] === 'NÃO').length
  return sim + nao > 0 ? Math.round((sim / (sim + nao)) * 100) : 100
}

function temAnomalia(obs: DtoObservacao): boolean {
  return obs.houve_desvio === 'SIM' || QUESTOES_CONF.some(q => obs[q.key] === 'NÃO')
}

// Os campos de tarefas de segurança vêm de uma resposta de múltipla escolha
// exportada como texto único, com os itens separados por ; ou ,
function splitTarefas(valor: string | null): string[] {
  if (!valor) return []
  return valor.split(/[;,]/).map(t => t.trim()).filter(Boolean)
}

function parseDtoExcel(buffer: ArrayBuffer, filial: string): Omit<DtoObservacao, 'id' | 'created_at' | 'status_acao' | 'responsavel_acao' | 'prazo_acao'>[] {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false })
  return raw.filter(r => (r['Colaborador'] ?? '').trim()).map(r => ({
    filial,
    external_id: (r['c'] ?? '').trim() || null,
    data_aplicacao: excelDate(r['Data da Aplicação'] ?? ''),
    colaborador: (r['Colaborador'] ?? '').trim(),
    lider_inspecao: (r['Lider na Inspeção'] ?? '').trim() || null,
    avaliador: (r['Avaliador'] ?? '').trim() || null,
    cargo_avaliador: (r['Cargo Avaliador'] ?? '').trim() || null,
    lider_atual: (r['Lider Atual'] ?? '').trim() || null,
    cpf_avaliado: (r['CPF Avaliado'] ?? '').trim() || null,
    operacao: (r['Operação'] ?? '').trim() || null,
    area: (r['Área'] ?? '').trim() || null,
    atividade: (r['Atividade'] ?? '').trim() || null,
    duracao: (r['Duração'] ?? '').trim() || null,
    tem_padrao: (r['Há um padrão escrito para esta atividade?'] ?? '').trim() || null,
    uso_epis: (r['Há o uso de 100% dos EPIs previstos para execução da atividade?'] ?? '').trim() || null,
    epis_utilizados: (r['Selecione os EPIs:'] ?? '').trim() || null,
    funcionario_treinado: (r['O funcionário está treinado para executar a atividade conforme padrão?'] ?? '').trim() || null,
    ferramentas_ok: (r['As ferramentas, materiais e equipamentos estão disponíveis e em boas condições para o uso?'] ?? '').trim() || null,
    checklist_realizado: (r['Se SIM, foi realizado checklist de inspeção antes do uso?'] ?? '').trim() || null,
    executado_wms: (r['A atividade foi executada através do WMS?'] ?? '').trim() || null,
    cumpre_sop: (r['O funcionário cumpre a atividade seguindo o passo a passo descrito no padrão (SOP)'] ?? '').trim() || null,
    passo_nao_cumprido: (r['Descreva o passo não cumprido:'] ?? '').trim() || null,
    padrao_completo: (r['O padrão observado retrata o procedimento completo? O SOP está disponível e acessível para todos?'] ?? '').trim() || null,
    conhece_padrao: (r['O funcionário possui conhecimento das habilidades e do procedimentos do padrão (SOP) necessário para exercer a função?'] ?? '').trim() || null,
    tarefas_seguranca: (r['Neste procedimento foi observado quais tarefas especificas de Segurança?'] ?? '').trim() || null,
    houve_desvio: (r['Houve algum desvio nas tarefas de segurança?'] ?? '').trim() || null,
    tarefa_com_desvio: (r['Houve Desvio em alguma destas tarefas especificas de segurança?'] ?? '').trim() || null,
    qual_desvio: (r['Qual Desvio Encontrado?'] ?? '').trim() || null,
    acao_gerada: (r['Descreva a ação gerada:'] ?? '').trim() || null,
  }))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConformidadeBar({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'bg-brand-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 text-right">{pct}%</span>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Dto() {
  const { usuario } = useAuth()
  const [observacoes, setObservacoes] = useState<DtoObservacao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [uploadando, setUploadando] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState<'dashboard' | 'atividades' | 'colaboradores' | 'acoes' | 'avaliadores' | 'tarefas'>('dashboard')
  const [filtroArea, setFiltroArea] = useState('Todas')
  const [filtroAvaliador, setFiltroAvaliador] = useState('Todos')
  const [filtroPeriodo, setFiltroPeriodo] = useState({ de: '', ate: '' })
  const [filtroStatus, setFiltroStatus] = useState<StatusAcao | 'Todos'>('Todos')
  const [expandedAtividade, setExpandedAtividade] = useState<string | null>(null)
  const [expandedObs, setExpandedObs] = useState<string | null>(null)
  const [solicitados, setSolicitados] = useState<Set<string>>(new Set())
  const [orientados, setOrientados] = useState<Set<string>>(new Set())

  async function carregarDados() {
    if (!usuario) return
    setCarregando(true)
    const { data } = await supabase
      .from('dto_observacoes')
      .select('*')
      .eq('filial', usuario.filial)
      .order('data_aplicacao', { ascending: false })
    setObservacoes(data ?? [])
    setCarregando(false)
  }

  useEffect(() => { carregarDados() }, [usuario?.filial])

  const onDrop = useCallback(async (files: File[]) => {
    if (!usuario || !files[0]) return
    setUploadando(true)
    const buffer = await files[0].arrayBuffer()
    const rows = parseDtoExcel(buffer, usuario.filial)
    const comId = rows.filter(r => r.external_id)
    const semId = rows.filter(r => !r.external_id)
    for (let i = 0; i < comId.length; i += 50) {
      await supabase.from('dto_observacoes').upsert(
        comId.slice(i, i + 50).map(r => ({ ...r, status_acao: 'Pendente' })),
        { onConflict: 'filial,external_id', ignoreDuplicates: false }
      )
    }
    if (semId.length > 0) {
      for (let i = 0; i < semId.length; i += 50) {
        await supabase.from('dto_observacoes').insert(semId.slice(i, i + 50).map(r => ({ ...r, status_acao: 'Pendente' })))
      }
    }
    setUploadando(false)
    carregarDados()
  }, [usuario])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    multiple: false,
  })

  // ── Filtros ──
  const obsFiltradas = observacoes.filter(obs => {
    if (filtroArea !== 'Todas' && obs.area !== filtroArea) return false
    if (filtroAvaliador !== 'Todos' && obs.avaliador !== filtroAvaliador) return false
    if (filtroPeriodo.de && obs.data_aplicacao && obs.data_aplicacao < filtroPeriodo.de) return false
    if (filtroPeriodo.ate && obs.data_aplicacao && obs.data_aplicacao > filtroPeriodo.ate) return false
    return true
  })

  const areas = ['Todas', ...Array.from(new Set(observacoes.map(o => o.area).filter(Boolean) as string[]))]
  const avaliadores = ['Todos', ...Array.from(new Set(observacoes.map(o => o.avaliador).filter(Boolean) as string[])).sort()]

  // ── KPIs ──
  const totalObs = obsFiltradas.length
  const comDesvio = obsFiltradas.filter(o => o.houve_desvio === 'SIM').length
  const comAnomalia = obsFiltradas.filter(temAnomalia).length
  const conformidadeGeral = obsFiltradas.length > 0
    ? Math.round(obsFiltradas.reduce((s, o) => s + calcConformidade(o), 0) / obsFiltradas.length)
    : 0
  const atividadesDistintas = new Set(obsFiltradas.map(o => o.atividade).filter(Boolean)).size

  // ── Por área ──
  const comparativoAreas = areas.filter(a => a !== 'Todas').map(area => {
    const avs = obsFiltradas.filter(o => o.area === area)
    const conf = avs.length > 0 ? Math.round(avs.reduce((s, o) => s + calcConformidade(o), 0) / avs.length) : 100
    return { area, conf, total: avs.length, desvios: avs.filter(o => o.houve_desvio === 'SIM').length }
  })

  // ── Por atividade ──
  const atividadeMap = new Map<string, DtoObservacao[]>()
  obsFiltradas.forEach(o => {
    const key = o.atividade ?? 'Sem atividade'
    if (!atividadeMap.has(key)) atividadeMap.set(key, [])
    atividadeMap.get(key)!.push(o)
  })
  const rankingAtividades = Array.from(atividadeMap.entries()).map(([atividade, avs]) => ({
    atividade,
    area: avs[0].area ?? '',
    total: avs.length,
    comDesvio: avs.filter(o => o.houve_desvio === 'SIM').length,
    comAnomalia: avs.filter(temAnomalia).length,
    conformidade: Math.round(avs.reduce((s, o) => s + calcConformidade(o), 0) / avs.length),
    obs: avs,
  })).sort((a, b) => b.comAnomalia - a.comAnomalia)

  // ── Por colaborador ──
  const colabMap = new Map<string, DtoObservacao[]>()
  obsFiltradas.forEach(o => {
    if (!colabMap.has(o.colaborador)) colabMap.set(o.colaborador, [])
    colabMap.get(o.colaborador)!.push(o)
  })
  const rankingColabs = Array.from(colabMap.entries()).map(([nome, avs]) => ({
    nome,
    total: avs.length,
    comDesvio: avs.filter(o => o.houve_desvio === 'SIM').length,
    conformidade: Math.round(avs.reduce((s, o) => s + calcConformidade(o), 0) / avs.length),
    atividades: Array.from(new Set(avs.map(o => o.atividade).filter(Boolean))) as string[],
  })).sort((a, b) => b.comDesvio - a.comDesvio)

  // ── Por avaliador ──
  const avalMap = new Map<string, DtoObservacao[]>()
  obsFiltradas.forEach(o => {
    if (!o.avaliador) return
    if (!avalMap.has(o.avaliador)) avalMap.set(o.avaliador, [])
    avalMap.get(o.avaliador)!.push(o)
  })
  const rankingAvaliadores = Array.from(avalMap.entries()).map(([nome, avs]) => ({
    nome,
    cargo: avs.find(a => a.cargo_avaliador)?.cargo_avaliador ?? '',
    total: avs.length,
    comDesvio: avs.filter(o => o.houve_desvio === 'SIM').length,
    taxaDesvio: Math.round((avs.filter(o => o.houve_desvio === 'SIM').length / avs.length) * 100),
    areas: Array.from(new Set(avs.map(o => o.area).filter(Boolean))) as string[],
    atividadesDistintas: new Set(avs.map(o => o.atividade).filter(Boolean)).size,
    anomalias: avs.filter(temAnomalia).length,
    mediaTarefas: Math.round((avs.reduce((s, o) => s + splitTarefas(o.tarefas_seguranca).length, 0) / avs.length) * 10) / 10,
  })).sort((a, b) => b.total - a.total)

  // ── Por tarefa ──
  const tarefaMap = new Map<string, { total: number; comDesvio: number }>()
  obsFiltradas.forEach(o => {
    const tarefas = splitTarefas(o.tarefas_seguranca)
    const desviadas = new Set(splitTarefas(o.tarefa_com_desvio))
    tarefas.forEach(t => {
      const entry = tarefaMap.get(t) ?? { total: 0, comDesvio: 0 }
      entry.total++
      if (desviadas.has(t)) entry.comDesvio++
      tarefaMap.set(t, entry)
    })
  })
  const rankingTarefas = Array.from(tarefaMap.entries()).map(([tarefa, v]) => ({
    tarefa,
    total: v.total,
    comDesvio: v.comDesvio,
    taxaDesvio: v.total > 0 ? Math.round((v.comDesvio / v.total) * 100) : 0,
  })).sort((a, b) => b.total - a.total)

  // ── Planos de ação ──
  const anomalias = obsFiltradas.filter(temAnomalia)
  const anomaliasFiltradas = filtroStatus === 'Todos' ? anomalias : anomalias.filter(o => o.status_acao === filtroStatus)
  const pendentes = anomalias.filter(o => o.status_acao === 'Pendente').length
  const emAndamento = anomalias.filter(o => o.status_acao === 'Em Andamento').length
  const concluidos = anomalias.filter(o => o.status_acao === 'Concluído').length

  async function atualizarStatus(id: string, status: StatusAcao) {
    await supabase.from('dto_observacoes').update({ status_acao: status }).eq('id', id)
    setObservacoes(prev => prev.map(o => o.id === id ? { ...o, status_acao: status } : o))
  }

  // Consolida todos os desvios do mesmo colaborador no mesmo dia em um único fluxo
  async function solicitarFluxo(obs: DtoObservacao[]) {
    if (!usuario || obs.length === 0) return
    const { data: filialData } = await supabase.from('filiais').select('grupo_fluxo_whatsapp').eq('nome', usuario.filial).single()
    const grupo = filialData?.grupo_fluxo_whatsapp ?? null

    const o0 = obs[0]
    const registradoPor = usuario.nome ?? usuario.login
    const dia = o0.data_aplicacao ? o0.data_aplicacao.slice(0, 10) : null

    const itens = obs.map(o => [o.qual_desvio, o.tarefa_com_desvio].filter(Boolean).join(' — ') || 'Desvio de segurança')
    const motivo = itens.length <= 1
      ? itens[0]
      : `${itens.length} desvio(s):\n` + itens.map((l, i) => `${i + 1}. ${l}`).join('\n')

    await supabase.from('fluxo_punitivo').insert({
      filial: usuario.filial,
      colaborador_nome: o0.colaborador,
      origem: 'DTO',
      tipo_acao: null,
      status: 'Solicitado',
      motivo,
      data_acao: dia,
      data_infracao: dia,
      observacao: null,
      registrado_por: registradoPor,
      source_id: obs.map(o => o.id).join(','),
    })

    if (grupo) {
      const lista = itens.map((l, i) => `${i + 1}. ${l}`).join('\n')
      const mensagem = `🔔 *Solicitação de Fluxo Punitivo*\n📍 Filial: ${usuario.filial}\n👤 Colaborador: ${o0.colaborador}\n📋 Origem: DTO\n🗓️ Data: ${o0.data_aplicacao ?? '—'}\n⚠️ Desvios (${itens.length}):\n${lista}\n✍️ Solicitado por: ${registradoPor}`
      const { sucesso, erro } = await enviarMensagemGrupo(grupo, mensagem)
      await supabase.from('disparos').insert({ filial: usuario.filial, whatsapp: grupo, mensagem, status: sucesso ? 'enviado' : 'erro', erro: erro ?? null })
      if (!sucesso) alert(`Solicitação registrada, mas a mensagem para o grupo falhou:\n${erro}`)
    } else {
      alert('Solicitação registrada. Configure o grupo de WhatsApp da filial em Admin → Filiais para enviar a notificação automaticamente.')
    }

    setSolicitados(prev => new Set([...prev, ...obs.map(o => o.id)]))
  }

  // Orientação Verbal: registra a tratativa (responsável) e conclui o(s) desvio(s),
  // sem notificar o grupo de WhatsApp (alternativa mais leve ao Fluxo Punitivo).
  async function orientacaoVerbal(obs: DtoObservacao[]) {
    if (!usuario || obs.length === 0) return
    const registradoPor = usuario.nome ?? usuario.login
    const ids = obs.map(o => o.id)
    const responsavel = `Orientação Verbal (${registradoPor})`
    await supabase.from('dto_observacoes')
      .update({ status_acao: 'Concluído', responsavel_acao: responsavel })
      .in('id', ids)
    setObservacoes(prev => prev.map(o => ids.includes(o.id)
      ? { ...o, status_acao: 'Concluído', responsavel_acao: responsavel }
      : o))
    setOrientados(prev => new Set([...prev, ...ids]))

    const o0 = obs[0]
    const dia = o0.data_aplicacao ? o0.data_aplicacao.slice(0, 10) : null
    const itens = obs.map(o => [o.qual_desvio, o.tarefa_com_desvio].filter(Boolean).join(' — ') || 'Desvio de segurança')
    const motivo = itens.length <= 1
      ? itens[0]
      : `${itens.length} desvio(s):\n` + itens.map((l, i) => `${i + 1}. ${l}`).join('\n')
    await registrarOrientacaoVerbalFluxo({
      filial: usuario.filial, colaboradorNome: o0.colaborador, origem: 'DTO', motivo,
      dataInfracao: dia, registradoPor, sourceId: ids.join(','),
    })
  }

  function exportarExcel() {
    const dados = obsFiltradas.map(o => ({
      'Data': o.data_aplicacao, 'Colaborador': o.colaborador,
      'Avaliador': o.avaliador, 'Cargo Avaliador': o.cargo_avaliador,
      'Área': o.area, 'Atividade': o.atividade,
      'Conformidade %': calcConformidade(o),
      'Desvio Seg.': o.houve_desvio, 'Qual Desvio': o.qual_desvio,
      'Ação Gerada': o.acao_gerada, 'Status Ação': o.status_acao,
    }))
    const ws = XLSX.utils.json_to_sheet(dados)
    const wb2 = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb2, ws, 'DTO')
    XLSX.writeFile(wb2, `DTO_${usuario?.filial}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Análise DTO</h2>
          {usuario && <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Building2 size={12} /> {usuario.filial}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregarDados} disabled={carregando} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
          {observacoes.length > 0 && (
            <button onClick={exportarExcel} className="flex items-center gap-2 text-sm text-brand-700 hover:text-brand-900 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50">
              <Download size={14} /> Exportar
            </button>
          )}
        </div>
      </div>

      {/* Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${isDragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
          <input {...getInputProps()} />
          {uploadando ? <Loader2 size={24} className="mx-auto text-brand-500 animate-spin" /> : <Upload size={24} className="mx-auto text-gray-400 mb-1" />}
          <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : 'Arraste a planilha DTO (.xlsx)'}</p>
          <p className="text-xs text-gray-400 mt-0.5">Novos registros adicionados, existentes atualizados (sem perder status das ações)</p>
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
        </div>
      ) : observacoes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileSpreadsheet size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma observação encontrada. Faça o upload da planilha DTO para começar.</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium w-16">Área:</span>
              {areas.map(a => (
                <button key={a} onClick={() => setFiltroArea(a)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filtroArea === a ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{a}</button>
              ))}
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-gray-500">Período:</span>
                <input type="text" placeholder="DD/MM/AAAA" value={filtroPeriodo.de} onChange={e => setFiltroPeriodo(p => ({ ...p, de: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                <span className="text-xs text-gray-400">até</span>
                <input type="text" placeholder="DD/MM/AAAA" value={filtroPeriodo.ate} onChange={e => setFiltroPeriodo(p => ({ ...p, ate: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
            </div>
            {avaliadores.length > 2 && (
              <div className="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-2.5">
                <span className="text-xs text-gray-500 font-medium w-16">Avaliador:</span>
                {avaliadores.map(a => (
                  <button key={a} onClick={() => setFiltroAvaliador(a)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filtroAvaliador === a ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {a === 'Todos' ? a : a.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
            {([
              ['dashboard', 'Dashboard', null],
              ['atividades', 'Por Atividade', null],
              ['colaboradores', 'Por Colaborador', null],
              ['acoes', 'Planos de Ação', pendentes],
              ['avaliadores', 'Por Avaliador', null],
              ['tarefas', 'Por Tarefa', null],
            ] as const).map(([id, label, badge]) => (
              <button key={id} onClick={() => setAbaAtiva(id)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-1.5 ${abaAtiva === id ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {label}
                {badge != null && badge > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">{badge}</span>}
              </button>
            ))}
          </div>

          {/* ── Dashboard ── */}
          {abaAtiva === 'dashboard' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Observações', value: totalObs, icon: ClipboardList, color: 'blue' },
                  { label: 'Desvios Seg.', value: comDesvio, icon: AlertTriangle, color: 'red' },
                  { label: 'Com Anomalia', value: comAnomalia, icon: XCircle, color: 'orange' },
                  { label: 'Conformidade', value: `${conformidadeGeral}%`, icon: CheckCircle, color: conformidadeGeral >= 80 ? 'green' : conformidadeGeral >= 60 ? 'yellow' : 'red' },
                ].map(({ label, value, icon: Icon, color }) => {
                  const cmap: Record<string, string> = { blue: 'bg-blue-50 text-blue-700', red: 'bg-red-50 text-red-600', orange: 'bg-orange-50 text-orange-700', green: 'bg-brand-50 text-brand-700', yellow: 'bg-yellow-50 text-yellow-600' }
                  return (
                    <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-3">
                      <div className={`p-2.5 rounded-lg ${cmap[color]}`}><Icon size={20} /></div>
                      <div>
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className={`text-2xl font-bold ${color === 'red' || color === 'orange' ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Atividades avaliadas</p>
                  <p className="text-3xl font-bold text-gray-900">{atividadesDistintas}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Avaliadores ativos</p>
                  <p className="text-3xl font-bold text-gray-900">{rankingAvaliadores.length}</p>
                </div>
              </div>

              {comparativoAreas.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Conformidade por Área</p>
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={comparativoAreas} barSize={48}>
                      <XAxis dataKey="area" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" width={32} />
                      <Tooltip formatter={(v) => [`${v}%`, 'Conformidade']} />
                      <Bar dataKey="conf" radius={[4, 4, 0, 0]}>
                        {comparativoAreas.map(a => (
                          <Cell key={a.area} fill={a.conf >= 80 ? '#1a4451' : a.conf >= 60 ? '#f59e0b' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Top Atividades com Anomalias</p>
                  <div className="space-y-2">
                    {rankingAtividades.filter(a => a.comAnomalia > 0).slice(0, 6).map((a, i) => (
                      <div key={a.atividade} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700 truncate">{a.atividade}</span>
                            <span className="text-orange-600 font-bold shrink-0 ml-2">{a.comAnomalia}/{a.total}</span>
                          </div>
                          <ConformidadeBar pct={a.conformidade} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-3">NÃOs por Item de Verificação</p>
                  <div className="space-y-2.5">
                    {QUESTOES_CONF.map(({ key, label }) => {
                      const nao = obsFiltradas.filter(o => o[key] === 'NÃO').length
                      const sim = obsFiltradas.filter(o => o[key] === 'SIM').length
                      const total = sim + nao
                      if (total === 0) return null
                      const pct = Math.round((sim / total) * 100)
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 w-32 shrink-0">{label}</span>
                          <div className="flex-1"><ConformidadeBar pct={pct} /></div>
                          {nao > 0 && <span className="text-xs text-red-600 font-medium shrink-0 w-12 text-right">{nao} NÃO</span>}
                        </div>
                      )
                    }).filter(Boolean)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Por Atividade ── */}
          {abaAtiva === 'atividades' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Atividade</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Área</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Obs.</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Desvios Seg.</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Anomalias</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-40">Conformidade</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingAtividades.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-gray-400">Nenhum dado</td></tr>}
                  {rankingAtividades.map(a => (
                    <>
                      <tr
                        key={a.atividade}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedAtividade(expandedAtividade === a.atividade ? null : a.atividade)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {expandedAtividade === a.atividade
                              ? <ChevronUp size={14} className="text-gray-400 shrink-0" />
                              : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                            <span className="font-medium text-gray-900">{a.atividade}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{a.area}</td>
                        <td className="px-4 py-3 text-center text-sm">{a.total}</td>
                        <td className="px-4 py-3 text-center">
                          {a.comDesvio > 0
                            ? <span className="text-xs font-bold bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{a.comDesvio}</span>
                            : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {a.comAnomalia > 0
                            ? <span className="text-xs font-bold bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">{a.comAnomalia}</span>
                            : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 w-40"><ConformidadeBar pct={a.conformidade} /></td>
                      </tr>
                      {expandedAtividade === a.atividade && (
                        <tr key={`${a.atividade}-exp`}>
                          <td colSpan={6} className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                            <div className="space-y-4">
                              <div>
                                <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Conformidade por item</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {QUESTOES_CONF.map(({ key, label }) => {
                                    const nao = a.obs.filter(o => o[key] === 'NÃO').length
                                    const sim = a.obs.filter(o => o[key] === 'SIM').length
                                    const total = sim + nao
                                    if (total === 0) return null
                                    return (
                                      <div key={key} className="flex items-center gap-2">
                                        <span className="text-xs text-gray-600 w-28 shrink-0">{label}</span>
                                        <div className="flex-1"><ConformidadeBar pct={Math.round((sim / total) * 100)} /></div>
                                      </div>
                                    )
                                  }).filter(Boolean)}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Avaliações realizadas ({a.obs.length})</p>
                                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                                  {[...a.obs].sort((x, y) => (y.data_aplicacao ?? '').localeCompare(x.data_aplicacao ?? '')).map(o => {
                                    const conf = calcConformidade(o)
                                    const tarefas = splitTarefas(o.tarefas_seguranca)
                                    const aberto = expandedObs === o.id
                                    return (
                                      <div key={o.id} className="bg-white border border-gray-100 rounded">
                                        <button
                                          type="button"
                                          onClick={() => setExpandedObs(aberto ? null : o.id)}
                                          className="w-full flex items-center gap-3 px-2.5 py-1.5 text-xs hover:bg-gray-50"
                                        >
                                          <span className="text-gray-500 shrink-0 w-16 text-left">{formatarDataBR(o.data_aplicacao)}</span>
                                          <span className="font-medium text-gray-800 flex-1 min-w-0 truncate text-left underline decoration-dotted">{o.colaborador}</span>
                                          {o.avaliador && <span className="text-gray-400 shrink-0 hidden sm:inline">{o.avaliador}</span>}
                                          {temAnomalia(o)
                                            ? <span className="text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded shrink-0">Anomalia</span>
                                            : <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded shrink-0">OK</span>}
                                          <span className="w-24 shrink-0"><ConformidadeBar pct={conf} /></span>
                                          {aberto ? <ChevronUp size={12} className="text-gray-400 shrink-0" /> : <ChevronDown size={12} className="text-gray-400 shrink-0" />}
                                        </button>
                                        {aberto && (
                                          <div className="px-3 py-2.5 border-t border-gray-100 text-xs space-y-2">
                                            <div>
                                              <p className="font-semibold text-gray-600 uppercase text-[10px] mb-1">Tarefas de segurança identificadas</p>
                                              {tarefas.length > 0 ? (
                                                <ul className="list-disc list-inside text-gray-700 space-y-0.5">
                                                  {tarefas.map((t, idx) => <li key={idx}>{t}</li>)}
                                                </ul>
                                              ) : (
                                                <p className="text-gray-400">Nenhuma tarefa de segurança identificada.</p>
                                              )}
                                            </div>
                                            {o.houve_desvio === 'SIM' && (
                                              <div className="bg-red-50 border border-red-100 rounded p-2 space-y-0.5">
                                                {o.tarefa_com_desvio && <p className="text-red-700"><span className="font-semibold">Tarefa com desvio:</span> {o.tarefa_com_desvio}</p>}
                                                {o.qual_desvio && <p className="text-red-700"><span className="font-semibold">Desvio:</span> {o.qual_desvio}</p>}
                                              </div>
                                            )}
                                            <div>
                                              <p className="font-semibold text-gray-600 uppercase text-[10px] mb-1">Plano de ação</p>
                                              <p className={o.acao_gerada ? 'text-gray-700' : 'text-gray-400'}>
                                                {o.acao_gerada || 'Nenhum plano de ação registrado para essa avaliação.'}
                                              </p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                              {a.obs.filter(o => o.houve_desvio === 'SIM').length > 0 && (() => {
                                // Agrupa desvios por colaborador + dia (um único fluxo por dia)
                                const desviosMap = new Map<string, DtoObservacao[]>()
                                a.obs.filter(o => o.houve_desvio === 'SIM').forEach(o => {
                                  const dia = (o.data_aplicacao ?? '').slice(0, 10)
                                  const key = `${o.colaborador}__${dia}`
                                  if (!desviosMap.has(key)) desviosMap.set(key, [])
                                  desviosMap.get(key)!.push(o)
                                })
                                const gruposDesvio = [...desviosMap.values()]
                                return (
                                  <div>
                                    <p className="text-xs font-semibold text-red-700 uppercase mb-2">Desvios de Segurança</p>
                                    <div className="space-y-1.5">
                                      {gruposDesvio.map(g => {
                                        const o0 = g[0]
                                        const ids = g.map(o => o.id)
                                        const jaSolic = ids.every(id => solicitados.has(id))
                                        const jaOrient = ids.every(id => orientados.has(id))
                                        return (
                                          <div key={o0.id} className="bg-red-50 rounded p-2.5 text-xs border border-red-100">
                                            <div className="flex justify-between items-center mb-1 gap-2">
                                              <span className="font-semibold text-red-800">{o0.colaborador}</span>
                                              <div className="flex items-center gap-2 flex-wrap justify-end">
                                                <span className="text-gray-500">{formatarDataBR(o0.data_aplicacao)}</span>
                                                {g.length > 1 && <span className="text-orange-700 font-semibold">{g.length} desvios</span>}
                                                {jaSolic ? (
                                                  <span className="flex items-center gap-0.5 text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                                                    <Check size={10} /> Solicitado
                                                  </span>
                                                ) : jaOrient ? (
                                                  <span className="flex items-center gap-0.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                                                    <Check size={10} /> Orientado
                                                  </span>
                                                ) : (
                                                  <>
                                                    <button onClick={() => orientacaoVerbal(g)}
                                                      className="flex items-center gap-0.5 text-xs text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-50">
                                                      <MessageSquare size={10} /> Orientação Verbal{g.length > 1 ? ` (${g.length})` : ''}
                                                    </button>
                                                    <button onClick={() => solicitarFluxo(g)}
                                                      className="flex items-center gap-0.5 text-xs text-orange-700 bg-white border border-orange-200 px-1.5 py-0.5 rounded hover:bg-orange-50">
                                                      <Send size={10} /> Solicitar Fluxo{g.length > 1 ? ` (${g.length})` : ''}
                                                    </button>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                            {g.map(o => (
                                              <div key={o.id} className="pl-2 border-l-2 border-red-200 mb-1 last:mb-0">
                                                {o.tarefa_com_desvio && <p className="text-red-700">Tarefa: {o.tarefa_com_desvio}</p>}
                                                {o.qual_desvio && <p className="text-red-700">Desvio: {o.qual_desvio}</p>}
                                                {o.acao_gerada && <p className="text-gray-500 italic">Ação: {o.acao_gerada}</p>}
                                              </div>
                                            ))}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Por Colaborador ── */}
          {abaAtiva === 'colaboradores' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Colaborador</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Obs.</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Desvios</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Atividades</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-40">Conformidade</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingColabs.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Nenhum dado</td></tr>}
                  {rankingColabs.map(c => (
                    <tr key={c.nome} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{c.nome}</td>
                      <td className="px-4 py-3 text-center text-sm">{c.total}</td>
                      <td className="px-4 py-3 text-center">
                        {c.comDesvio > 0
                          ? <span className="text-sm font-bold text-red-600">{c.comDesvio}</span>
                          : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.atividades.slice(0, 3).map(a => (
                            <span key={a} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{a}</span>
                          ))}
                          {c.atividades.length > 3 && <span className="text-xs text-gray-400">+{c.atividades.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 w-40"><ConformidadeBar pct={c.conformidade} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Planos de Ação ── */}
          {abaAtiva === 'acoes' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Pendentes', value: pendentes, cls: 'bg-red-50 border-red-200 text-red-700' },
                  { label: 'Em Andamento', value: emAndamento, cls: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
                  { label: 'Concluídos', value: concluidos, cls: 'bg-green-50 border-green-200 text-green-700' },
                ].map(({ label, value, cls }) => (
                  <div key={label} className={`rounded-xl border p-4 text-center ${cls}`}>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-xs font-medium mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                {(['Todos', 'Pendente', 'Em Andamento', 'Concluído'] as const).map(s => (
                  <button key={s} onClick={() => setFiltroStatus(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroStatus === s ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s}</button>
                ))}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {anomaliasFiltradas.length === 0
                  ? <p className="text-center py-10 text-gray-400">Nenhuma anomalia neste filtro</p>
                  : <div className="divide-y divide-gray-100">
                      {anomaliasFiltradas.map(o => (
                        <div key={o.id} className="px-4 py-3 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-xs text-gray-400 shrink-0">{formatarDataBR(o.data_aplicacao)}</span>
                              <span className="text-xs font-semibold text-gray-900">{o.colaborador}</span>
                              {o.atividade && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded shrink-0">{o.atividade}</span>}
                            </div>
                            {o.houve_desvio === 'SIM' && o.qual_desvio && (
                              <p className="text-xs text-red-700 flex items-start gap-1 mt-0.5">
                                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                {o.qual_desvio}
                              </p>
                            )}
                            {QUESTOES_CONF.filter(q => o[q.key] === 'NÃO').length > 0 && (
                              <p className="text-xs text-orange-600 mt-0.5">
                                NÃO em: {QUESTOES_CONF.filter(q => o[q.key] === 'NÃO').map(q => q.label).join(', ')}
                              </p>
                            )}
                            {o.acao_gerada && <p className="text-xs text-gray-400 italic mt-1">"{o.acao_gerada}"</p>}
                            <p className="text-xs text-gray-400 mt-0.5">Avaliador: {o.avaliador}</p>
                          </div>
                          <select
                            value={o.status_acao}
                            onChange={e => atualizarStatus(o.id, e.target.value as StatusAcao)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 shrink-0"
                          >
                            {STATUS_ACAO.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                }
              </div>
            </div>
          )}

          {/* ── Por Avaliador ── */}
          {abaAtiva === 'avaliadores' && (
            <div className="space-y-5">
              {rankingAvaliadores.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Observações por Avaliador</p>
                  <ResponsiveContainer width="100%" height={Math.max(100, rankingAvaliadores.length * 40)}>
                    <BarChart
                      data={rankingAvaliadores.map(a => ({
                        nome: a.nome.split(' ')[0] + (a.nome.split(' ')[1] ? ' ' + a.nome.split(' ')[1] : ''),
                        'Observações': a.total,
                        'Desvios': a.comDesvio,
                        'Anomalias': a.anomalias,
                      }))}
                      layout="vertical"
                      barSize={12}
                      margin={{ left: 8 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={130} />
                      <Tooltip />
                      <Bar dataKey="Observações" fill="#1a4451" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="Anomalias" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="Desvios" fill="#ef4444" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 justify-end mt-2">
                    {[['#1a4451', 'Observações'], ['#f59e0b', 'Anomalias'], ['#ef4444', 'Desvios Seg.']].map(([c, l]) => (
                      <span key={l} className="flex items-center gap-1 text-xs text-gray-500">
                        <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: c }} />{l}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Avaliador</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Cargo</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Obs.</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Anomalias</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Desvios Seg.</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Taxa Detecção</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Méd. Tarefas/Obs.</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Atividades</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Áreas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingAvaliadores.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-gray-400">Nenhum dado</td></tr>}
                    {rankingAvaliadores.map(a => (
                      <tr key={a.nome} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 text-sm">{a.nome}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{a.cargo}</td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-700">{a.total}</td>
                        <td className="px-4 py-3 text-center">
                          {a.anomalias > 0
                            ? <span className="text-xs font-bold bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">{a.anomalias}</span>
                            : <span className="text-xs text-gray-400">0</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {a.comDesvio > 0
                            ? <span className="text-xs font-bold bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{a.comDesvio}</span>
                            : <span className="text-xs text-gray-400">0</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${a.taxaDesvio >= 30 ? 'bg-red-50 text-red-700' : a.taxaDesvio >= 15 ? 'bg-yellow-50 text-yellow-700' : 'bg-brand-50 text-brand-700'}`}>
                            {a.taxaDesvio}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{a.mediaTarefas}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{a.atividadesDistintas}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {a.areas.map(ar => <span key={ar} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{ar}</span>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rankingAvaliadores.length >= 2 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-blue-900 mb-2">Insights</p>
                  <div className="space-y-1 text-xs text-blue-800">
                    <p>• <strong>{rankingAvaliadores[0].nome}</strong> realizou mais observações ({rankingAvaliadores[0].total})</p>
                    {(() => {
                      const top = [...rankingAvaliadores].sort((a, b) => b.taxaDesvio - a.taxaDesvio)[0]
                      return <p>• <strong>{top.nome}</strong> tem maior taxa de detecção de desvios ({top.taxaDesvio}%)</p>
                    })()}
                    {(() => {
                      const min = [...rankingAvaliadores].sort((a, b) => a.taxaDesvio - b.taxaDesvio)[0]
                      return <p>• <strong>{min.nome}</strong> tem menor taxa de detecção ({min.taxaDesvio}%) — verificar critério de avaliação</p>
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Por Tarefa ── */}
          {abaAtiva === 'tarefas' && (
            <div className="space-y-5">
              {rankingTarefas.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Tarefas mais observadas</p>
                  <ResponsiveContainer width="100%" height={Math.max(100, Math.min(rankingTarefas.length, 15) * 32)}>
                    <BarChart
                      data={rankingTarefas.slice(0, 15)}
                      layout="vertical"
                      barSize={12}
                      margin={{ left: 8 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="tarefa" tick={{ fontSize: 10 }} width={220} />
                      <Tooltip />
                      <Bar dataKey="total" name="Observações" fill="#1a4451" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="comDesvio" name="Com desvio" fill="#ef4444" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Tarefa</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Obs.</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Com Desvio</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 w-40">Taxa de Desvio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankingTarefas.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-gray-400">Nenhum dado</td></tr>}
                    {rankingTarefas.map(t => (
                      <tr key={t.tarefa} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 text-sm">{t.tarefa}</td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-700">{t.total}</td>
                        <td className="px-4 py-3 text-center">
                          {t.comDesvio > 0
                            ? <span className="text-xs font-bold bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{t.comDesvio}</span>
                            : <span className="text-xs text-gray-400">0</span>}
                        </td>
                        <td className="px-4 py-3"><ConformidadeBar pct={100 - t.taxaDesvio} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rankingTarefas.filter(t => t.comDesvio > 0).length >= 1 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-blue-900 mb-2">Insights</p>
                  <div className="space-y-1 text-xs text-blue-800">
                    <p>• <strong>{rankingTarefas[0].tarefa}</strong> é a tarefa mais observada ({rankingTarefas[0].total} vezes)</p>
                    {(() => {
                      const top = [...rankingTarefas].filter(t => t.total >= 2).sort((a, b) => b.taxaDesvio - a.taxaDesvio)[0]
                      return top ? <p>• <strong>{top.tarefa}</strong> tem a maior taxa de desvio ({top.taxaDesvio}%) — atenção nessa tarefa</p> : null
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
