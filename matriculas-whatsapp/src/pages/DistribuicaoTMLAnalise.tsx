import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, LabelList,
} from 'recharts'
import {
  BarChart2, AlertTriangle, CheckCircle2, Clock, Users, Timer, ChevronDown, ChevronRight,
  X, ListChecks, MinusCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  SALA_TML_LABEL, REGRAS_TML, horarioParaMinutos, etapaIdealMinutos,
  metaMatinalMinutos, gatilhoEstouroMinutos, metaMovimentacaoMinutos, META_TML_TOTAL_MIN,
  type SalaTML, type EtapaIdealParam, type MetaMatinalParam, type GatilhoEstouroParam,
} from '../lib/tml'
import { buscarConferenciaPorMapaPeriodo, type ConferenciaPassoMapa } from '../lib/conferencia'
import { formatarDataBR } from '../lib/utils'

const CORES = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d']
const TOOLTIP_STYLE = { borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function primeiroDiaDoMesISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Converte um timestamp ISO (matinal_tml.horario_final, conferencia_baias.
// iniciada_em/finalizada_em) pro horário local "HH:MM", pra exibir e comparar
// junto dos campos que já vêm como texto "HH:MM" (checklist_tml, historico_tml).
function horaCurtaISO(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface LinhaHistorico {
  mapa: number | null
  placa: string | null
  sala: SalaTML | null
  matricula: number | null
  nome: string | null
  data_saida: string | null
  horario_saida: string | null
  atraso_minutos: number | null
  resultado: 'no_prazo' | 'atrasado' | 'indefinido' | 'invalido'
}

interface LinhaChecklistPasso {
  mapa: number | null
  placa: string | null
  data: string | null
  sala: SalaTML | null
  horario_inicio: string | null
  horario_final: string | null
  tempo_deslocamento_minutos: number | null
}

interface LinhaMatinalPasso {
  sala: SalaTML | null
  data: string | null
  horario_final: string | null
  estouro_duracao: boolean | null
  duracao_minutos: number | null
}

// Tempo decorrido desde o horário matinal da sala até a saída real do carro.
function tempoSaidaMinutos(h: LinhaHistorico): number | null {
  if (!h.sala || !h.horario_saida) return null
  return horarioParaMinutos(h.horario_saida) - horarioParaMinutos(REGRAS_TML[h.sala].matinal)
}

interface LinhaAlerta {
  sala: SalaTML
  justificativa: string | null
  status: string
}

function Card({
  icon: Icon, label, value, hint, accent = 'text-accent-600 bg-accent/40',
}: { icon: typeof BarChart2; label: string; value: string; hint?: string; accent?: string }) {
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

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-l-4 border-accent-500 pl-3">
      <h2 className="text-base font-bold">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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

export default function DistribuicaoTMLAnalise() {
  const { usuario } = useAuth()
  const [de, setDe] = useState(primeiroDiaDoMesISO())
  const [ate, setAte] = useState(hojeISO())
  const [sala, setSala] = useState<SalaTML | 'TODAS'>('TODAS')
  const [aba, setAba] = useState<'geral' | 'motivos'>('geral')
  const [subAbaGeral, setSubAbaGeral] = useState<'consolidado' | 'abertura'>('consolidado')
  const [verPor, setVerPor] = useState<'dia' | 'periodo'>('dia')
  const [placaFiltro, setPlacaFiltro] = useState('')
  const [ugcFiltro, setUgcFiltro] = useState<string>('TODAS')

  const [historico, setHistorico] = useState<LinhaHistorico[]>([])
  const [alertas, setAlertas] = useState<LinhaAlerta[]>([])
  const [motivoUgc, setMotivoUgc] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [topMotoristasAberto, setTopMotoristasAberto] = useState(true)

  // ── Passo a passo por mapa (matinal → checklist → conferência → saída) ──
  const [checklistPasso, setChecklistPasso] = useState<LinhaChecklistPasso[]>([])
  const [matinaisPasso, setMatinaisPasso] = useState<LinhaMatinalPasso[]>([])
  const [etapaParams, setEtapaParams] = useState<EtapaIdealParam[]>([])
  const [matinalMetaParams, setMatinalMetaParams] = useState<MetaMatinalParam[]>([])
  const [gatilhoParams, setGatilhoParams] = useState<GatilhoEstouroParam[]>([])
  const [conferenciaPorMapa, setConferenciaPorMapa] = useState<Map<string, ConferenciaPassoMapa>>(new Map())
  const [passoAberto, setPassoAberto] = useState(true)
  const [detalheAberto, setDetalheAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const [{ data: hist }, { data: al }, { data: mot }, { data: chk }, { data: mat }, { data: etp }, { data: metaMat }, { data: gat }, confMapa] = await Promise.all([
      supabase
        .from('historico_tml')
        .select('mapa, placa, sala, matricula, nome, data_saida, horario_saida, atraso_minutos, resultado')
        .eq('filial', usuario.filial)
        .gte('data_saida', de)
        .lte('data_saida', ate)
        .limit(5000),
      supabase
        .from('alertas_tml')
        .select('sala, justificativa, status')
        .eq('filial', usuario.filial)
        .gte('created_at', de)
        .lte('created_at', `${ate}T23:59:59`)
        .limit(5000),
      supabase
        .from('motivos_justificativa_tml')
        .select('motivo, ugc')
        .eq('filial', usuario.filial),
      supabase
        .from('checklist_tml')
        .select('mapa, placa, data, sala, horario_inicio, horario_final, tempo_deslocamento_minutos')
        .eq('filial', usuario.filial)
        .gte('data', de)
        .lte('data', ate)
        .limit(5000),
      supabase
        .from('matinal_tml')
        .select('sala, data, horario_final, estouro_duracao, duracao_minutos')
        .eq('filial', usuario.filial)
        .gte('data', de)
        .lte('data', ate),
      supabase
        .from('tml_etapa_ideal')
        .select('etapa, ideal_minutos, vigente_a_partir')
        .eq('filial', usuario.filial),
      supabase
        .from('tml_meta_matinal')
        .select('dia_semana, meta_minutos, vigente_a_partir')
        .eq('filial', usuario.filial),
      supabase
        .from('tml_gatilho_estouro')
        .select('deslocamento_ideal_minutos, deslocamento_estouro_minutos, vigente_a_partir')
        .eq('filial', usuario.filial),
      buscarConferenciaPorMapaPeriodo(usuario.filial, de, ate),
    ])
    setHistorico(Array.isArray(hist) ? hist : [])
    setAlertas(Array.isArray(al) ? al : [])
    setMotivoUgc(new Map((Array.isArray(mot) ? mot : []).map((m: any) => [m.motivo, m.ugc || 'GERAL'])))
    setChecklistPasso(Array.isArray(chk) ? chk : [])
    setMatinaisPasso(Array.isArray(mat) ? mat : [])
    setEtapaParams(Array.isArray(etp) ? etp : [])
    setMatinalMetaParams(Array.isArray(metaMat) ? metaMat : [])
    setGatilhoParams(Array.isArray(gat) ? gat : [])
    setConferenciaPorMapa(confMapa)
    setLoading(false)
  }, [usuario, de, ate])

  useEffect(() => { carregar() }, [carregar])

  const historicoFiltrado = useMemo(
    () => (sala === 'TODAS' ? historico : historico.filter((h) => h.sala === sala)),
    [historico, sala]
  )
  const alertasFiltrados = useMemo(
    () => (sala === 'TODAS' ? alertas : alertas.filter((a) => a.sala === sala)),
    [alertas, sala]
  )

  // Saída antes da matinal é inválida e não entra em nenhuma conta — só fica
  // visível aqui como contador informativo.
  const totalInvalidos = historicoFiltrado.filter((h) => h.resultado === 'invalido').length
  const historicoValido = useMemo(
    () => historicoFiltrado.filter((h) => h.resultado !== 'invalido'),
    [historicoFiltrado]
  )

  // ── Passo a passo por mapa: junta historico_tml (saída) + matinal_tml
  // (fim da matinal) + checklist_tml (início/fim do checklist) +
  // conferencia_baias (início/fim da conferência) numa lista, uma linha por
  // mapa/dia, pra analisar o que impactou o TML daquela placa. ────────────
  const checklistPorMapaData = useMemo(() => {
    const m = new Map<string, LinhaChecklistPasso>()
    for (const c of checklistPasso) if (c.mapa != null && c.data) m.set(`${c.mapa}|${c.data}`, c)
    return m
  }, [checklistPasso])

  // Linhas de checklist sem mapa (o relatório de origem não preencheu o
  // número da rota — ver src/lib/tmlParser.ts) não têm como casar por mapa,
  // então casam por placa+data como alternativa.
  const checklistPorPlacaData = useMemo(() => {
    const m = new Map<string, LinhaChecklistPasso>()
    for (const c of checklistPasso) if (c.mapa == null && c.placa && c.data) m.set(`${c.placa}|${c.data}`, c)
    return m
  }, [checklistPasso])

  const matinalPorSalaData = useMemo(() => {
    const m = new Map<string, LinhaMatinalPasso>()
    for (const mt of matinaisPasso) if (mt.sala && mt.data) m.set(`${mt.sala}|${mt.data}`, mt)
    return m
  }, [matinaisPasso])

  interface LinhaAnalisePasso {
    chave: string
    mapa: number | null
    placa: string | null
    nome: string | null
    matricula: number | null
    sala: SalaTML
    data: string
    horarioSaida: string | null
    resultado: LinhaHistorico['resultado']
    tempoSaida: number | null
  }

  const analisePasso = useMemo<LinhaAnalisePasso[]>(() => {
    return historicoValido
      .filter((h): h is LinhaHistorico & { sala: SalaTML; data_saida: string } => !!h.sala && !!h.data_saida)
      .map((h) => ({
        chave: `${h.mapa ?? 's/mapa'}|${h.data_saida}|${h.matricula ?? h.nome}`,
        mapa: h.mapa, placa: h.placa, nome: h.nome, matricula: h.matricula,
        sala: h.sala, data: h.data_saida,
        horarioSaida: h.horario_saida, resultado: h.resultado,
        tempoSaida: tempoSaidaMinutos(h),
      }))
      .sort((a, b) => b.data.localeCompare(a.data) || (a.mapa ?? 0) - (b.mapa ?? 0))
  }, [historicoValido])

  // ── Abertura por etapa: Matinal + Deslocamento + Checklist + Conferência
  // + Tempo de Movimentação = TML Final (30min de meta). O Tempo de
  // Movimentação real não vem de nenhuma tabela — é o que sobra do TML
  // Final medido depois de tirar as outras 4 etapas, mesmo raciocínio da
  // meta (o que sobra dos 30min vira a meta de Movimentação).
  interface LinhaAbertura {
    chave: string
    mapa: number | null
    placa: string | null
    sala: SalaTML
    data: string
    matinalMin: number | null
    deslocamentoMin: number | null
    checklistMin: number | null
    confMin: number | null
    movimentacaoMin: number | null
    tmlFinalMin: number | null
    metaMatinal: number
    metaDeslocamento: number
    metaChecklist: number
    metaConferencia: number
    metaMovimentacao: number
  }

  const aberturaPorMapa = useMemo<LinhaAbertura[]>(() => {
    return analisePasso
      .filter((a) => !placaFiltro.trim() || (a.placa ?? '').toLowerCase().includes(placaFiltro.trim().toLowerCase()))
      .map((a) => {
        const checklist = (a.mapa != null ? checklistPorMapaData.get(`${a.mapa}|${a.data}`) : undefined)
          ?? (a.placa ? checklistPorPlacaData.get(`${a.placa}|${a.data}`) : undefined)
        const matinal = matinalPorSalaData.get(`${a.sala}|${a.data}`)
        const conferencia = conferenciaPorMapa.get(`${a.mapa}|${a.data}`)

        const matinalMin = matinal?.duracao_minutos ?? null
        const deslocamentoMin = checklist?.tempo_deslocamento_minutos ?? null
        const checklistMin = checklist?.horario_inicio && checklist?.horario_final
          ? horarioParaMinutos(checklist.horario_final) - horarioParaMinutos(checklist.horario_inicio)
          : null
        const confMin = conferencia?.inicio && conferencia?.fim
          ? Math.round((new Date(conferencia.fim).getTime() - new Date(conferencia.inicio).getTime()) / 60000)
          : null
        const tmlFinalMin = a.tempoSaida

        // Movimentação = saída na portaria − a última das duas etapas de
        // preparação a terminar (checklist ou conferência). Todo mapa com
        // checklist e/ou conferência registrados tem esse tempo — não
        // depende dos outros 4 pedaços estarem completos, e usa o horário
        // real de cada etapa em vez de subtrair do TML Final (que dava
        // negativo quando havia um intervalo entre o fim do checklist e o
        // início da conferência, tempo que não é rastreado em lugar nenhum).
        const checklistFimHM = checklist?.horario_final ?? null
        const confFimHM = horaCurtaISO(conferencia?.fim ?? null)
        const referenciasFim = [checklistFimHM, confFimHM].filter((h): h is string => !!h)
        const ultimaEtapaFim = referenciasFim.length > 0
          ? referenciasFim.reduce((maisTarde, atual) => horarioParaMinutos(atual) > horarioParaMinutos(maisTarde) ? atual : maisTarde)
          : null
        const movimentacaoMin = ultimaEtapaFim && a.horarioSaida
          ? horarioParaMinutos(a.horarioSaida) - horarioParaMinutos(ultimaEtapaFim)
          : null

        return {
          chave: a.chave, mapa: a.mapa, placa: a.placa, sala: a.sala, data: a.data,
          matinalMin, deslocamentoMin, checklistMin, confMin, movimentacaoMin, tmlFinalMin,
          metaMatinal: metaMatinalMinutos(a.data, matinalMetaParams),
          metaDeslocamento: gatilhoEstouroMinutos(a.data, gatilhoParams).ideal,
          metaChecklist: etapaIdealMinutos('checklist', a.data, etapaParams),
          metaConferencia: etapaIdealMinutos('conferencia', a.data, etapaParams),
          metaMovimentacao: metaMovimentacaoMinutos(a.data, { matinal: matinalMetaParams, etapa: etapaParams, gatilho: gatilhoParams }),
        }
      })
      .sort((a, b) => (b.tmlFinalMin ?? -1) - (a.tmlFinalMin ?? -1))
  }, [analisePasso, placaFiltro, checklistPorMapaData, checklistPorPlacaData, matinalPorSalaData, conferenciaPorMapa, matinalMetaParams, gatilhoParams, etapaParams])

  // Médias só sobre linhas com os 5 pedaços completos — parcial distorceria
  // a composição do gráfico.
  const aberturaCompleta = useMemo(() => aberturaPorMapa.filter(
    (l) => l.matinalMin != null && l.deslocamentoMin != null && l.checklistMin != null && l.confMin != null && l.movimentacaoMin != null
  ), [aberturaPorMapa])

  function media(campo: 'matinalMin' | 'deslocamentoMin' | 'checklistMin' | 'confMin' | 'movimentacaoMin' | 'tmlFinalMin'): number {
    if (aberturaCompleta.length === 0) return 0
    return aberturaCompleta.reduce((acc, l) => acc + (l[campo] ?? 0), 0) / aberturaCompleta.length
  }
  function mediaMeta(campo: 'metaMatinal' | 'metaDeslocamento' | 'metaChecklist' | 'metaConferencia' | 'metaMovimentacao'): number {
    if (aberturaCompleta.length === 0) return 0
    return aberturaCompleta.reduce((acc, l) => acc + l[campo], 0) / aberturaCompleta.length
  }

  const aberturaMedias = {
    matinal: media('matinalMin'), deslocamento: media('deslocamentoMin'), checklist: media('checklistMin'),
    conferencia: media('confMin'), movimentacao: media('movimentacaoMin'), tmlFinal: media('tmlFinalMin'),
    metaMatinal: mediaMeta('metaMatinal'), metaDeslocamento: mediaMeta('metaDeslocamento'), metaChecklist: mediaMeta('metaChecklist'),
    metaConferencia: mediaMeta('metaConferencia'), metaMovimentacao: mediaMeta('metaMovimentacao'),
  }

  const detalheAtual = useMemo(() => {
    if (!detalheAberto) return null
    const linha = analisePasso.find((a) => a.chave === detalheAberto)
    if (!linha) return null

    const checklist = (linha.mapa != null ? checklistPorMapaData.get(`${linha.mapa}|${linha.data}`) : undefined)
      ?? (linha.placa ? checklistPorPlacaData.get(`${linha.placa}|${linha.data}`) : undefined)
    const matinal = matinalPorSalaData.get(`${linha.sala}|${linha.data}`)
    const conferencia = conferenciaPorMapa.get(`${linha.mapa}|${linha.data}`)

    const matinalFim = horaCurtaISO(matinal?.horario_final ?? null)
    const checklistInicio = checklist?.horario_inicio ?? null
    const checklistFim = checklist?.horario_final ?? null
    const confInicioISO = conferencia?.inicio ?? null
    const confFimISO = conferencia?.fim ?? null
    const confInicio = horaCurtaISO(confInicioISO)
    const confFim = horaCurtaISO(confFimISO)

    const checklistMin = checklistInicio && checklistFim
      ? horarioParaMinutos(checklistFim) - horarioParaMinutos(checklistInicio)
      : null
    const checklistEstourou = checklistMin != null
      ? checklistMin > etapaIdealMinutos('checklist', linha.data, etapaParams)
      : null

    const confMin = confInicioISO && confFimISO
      ? Math.round((new Date(confFimISO).getTime() - new Date(confInicioISO).getTime()) / 60000)
      : null
    const confEstourou = confMin != null
      ? confMin > etapaIdealMinutos('conferencia', linha.data, etapaParams)
      : null

    const deslocamentoMin = matinalFim && checklistInicio
      ? horarioParaMinutos(checklistInicio) - horarioParaMinutos(matinalFim)
      : null
    const ateConferenciaMin = checklistFim && confInicio
      ? horarioParaMinutos(confInicio) - horarioParaMinutos(checklistFim)
      : null
    const ateSaidaMin = confFim && linha.horarioSaida
      ? horarioParaMinutos(linha.horarioSaida) - horarioParaMinutos(confFim)
      : null

    return {
      linha,
      matinalFim, matinalEstourou: matinal?.estouro_duracao ?? null,
      checklistInicio, checklistFim, checklistMin, checklistEstourou,
      confInicio, confFim, confMin, confEstourou, confEmAndamento: conferencia != null && !conferencia.concluido,
      deslocamentoMin, ateConferenciaMin, ateSaidaMin,
    }
  }, [detalheAberto, analisePasso, checklistPorMapaData, checklistPorPlacaData, matinalPorSalaData, conferenciaPorMapa, etapaParams])

  // ── Cards de resumo ──────────────────────────────────────────────────────
  const totalSaidas = historicoValido.length
  const totalPerdidos = historicoValido.filter((h) => h.resultado === 'atrasado').length
  const pctPerdido = totalSaidas > 0 ? (totalPerdidos / totalSaidas) * 100 : 0
  const validos = historicoValido.filter((h) => h.resultado === 'no_prazo' || h.resultado === 'atrasado')
  const pctAtingimento = validos.length > 0
    ? (validos.filter((h) => h.resultado === 'no_prazo').length / validos.length) * 100
    : 0
  const totalJustificados = alertasFiltrados.filter((a) => a.status === 'justificado').length
  const pctJustificado = totalPerdidos > 0 ? (totalJustificados / totalPerdidos) * 100 : 0

  // ── Tempo de saída (saída real − horário matinal) e conformidade geral do CDD ──
  const comTempoSaida = historicoValido
    .map((h) => ({ h, t: tempoSaidaMinutos(h) }))
    .filter((x): x is { h: LinhaHistorico; t: number } => x.t != null)
  const tempoSaidaMedioGeral = comTempoSaida.length > 0
    ? comTempoSaida.reduce((acc, x) => acc + x.t, 0) / comTempoSaida.length
    : 0
  const dentroToleranciaGeral = comTempoSaida.filter((x) => x.t <= REGRAS_TML[x.h.sala as SalaTML].toleranciaMin).length
  const pctConformidadeGeral = comTempoSaida.length > 0 ? (dentroToleranciaGeral / comTempoSaida.length) * 100 : 0

  // ── Ranking por sala ──────────────────────────────────────────────────────
  const porSala = useMemo(() => {
    const mapa = new Map<string, { sala: string; saidas: number; perdidos: number; noPrazo: number; somaTempoSaida: number; nTempoSaida: number; dentroTolerancia: number }>()
    for (const h of historicoValido) {
      if (!h.sala) continue
      const k = mapa.get(h.sala) ?? { sala: h.sala, saidas: 0, perdidos: 0, noPrazo: 0, somaTempoSaida: 0, nTempoSaida: 0, dentroTolerancia: 0 }
      k.saidas++
      if (h.resultado === 'atrasado') k.perdidos++
      if (h.resultado === 'no_prazo') k.noPrazo++
      const tempoSaida = tempoSaidaMinutos(h)
      if (tempoSaida != null) {
        k.somaTempoSaida += tempoSaida
        k.nTempoSaida++
        if (tempoSaida <= REGRAS_TML[h.sala].toleranciaMin) k.dentroTolerancia++
      }
      mapa.set(h.sala, k)
    }
    return [...mapa.values()].map((k) => ({
      sala: SALA_TML_LABEL[k.sala as SalaTML] ?? k.sala,
      saidas: k.saidas,
      perdidos: k.perdidos,
      pct: k.saidas > 0 ? Math.round((k.perdidos / k.saidas) * 1000) / 10 : 0,
      pctAtingimento: (k.noPrazo + k.perdidos) > 0 ? Math.round((k.noPrazo / (k.noPrazo + k.perdidos)) * 1000) / 10 : 0,
      tempoSaidaMedio: k.nTempoSaida > 0 ? Math.round(k.somaTempoSaida / k.nTempoSaida) : 0,
      conformidadePct: k.nTempoSaida > 0 ? Math.round((k.dentroTolerancia / k.nTempoSaida) * 1000) / 10 : 0,
    }))
  }, [historicoValido])

  // ── Ranking de motoristas (reincidência + tempo médio em todas as saídas) ──
  const porMotorista = useMemo(() => {
    const mapa = new Map<string, { nome: string; matricula: number | null; saidas: number; perdidos: number; somaTempo: number; nTempo: number }>()
    for (const h of historicoValido) {
      const chave = h.matricula != null ? String(h.matricula) : `s/matricula:${h.nome}`
      const k = mapa.get(chave) ?? { nome: h.nome ?? '—', matricula: h.matricula, saidas: 0, perdidos: 0, somaTempo: 0, nTempo: 0 }
      k.saidas++
      if (h.resultado === 'atrasado') k.perdidos++
      if (h.atraso_minutos != null) { k.somaTempo += h.atraso_minutos; k.nTempo++ }
      mapa.set(chave, k)
    }
    return [...mapa.values()]
      .map((k) => ({ ...k, tempoMedio: k.nTempo > 0 ? Math.round(k.somaTempo / k.nTempo) : 0 }))
      .sort((a, b) => b.perdidos - a.perdidos)
      .slice(0, 10)
  }, [historicoValido])

  // ── Ranking de motivos ───────────────────────────────────────────────────
  // Num período maior, dezenas de motivos de todas as áreas viram fatias
  // finas demais pra ler — por isso dá pra filtrar por área (UGC) antes, e
  // mesmo assim só as MOTIVO_TOP_N mais frequentes aparecem sozinhas; o
  // resto agrupa em "Outros" em vez de poluir o gráfico.
  const MOTIVO_TOP_N = 8
  const porMotivo = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const a of alertasFiltrados) {
      if (!a.justificativa) continue
      const ugc = motivoUgc.get(a.justificativa) ?? 'GERAL'
      if (ugcFiltro !== 'TODAS' && ugc !== ugcFiltro) continue
      mapa.set(a.justificativa, (mapa.get(a.justificativa) ?? 0) + 1)
    }
    const ordenado = [...mapa.entries()]
      .map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total)
    if (ordenado.length <= MOTIVO_TOP_N) return ordenado
    const top = ordenado.slice(0, MOTIVO_TOP_N)
    const outros = ordenado.slice(MOTIVO_TOP_N).reduce((soma, m) => soma + m.total, 0)
    return [...top, { motivo: 'Outros', total: outros }]
  }, [alertasFiltrados, motivoUgc, ugcFiltro])

  // ── Ranking por área responsável (UGC) ────────────────────────────────────
  // A justificativa guarda o texto do motivo; cruzamos com o catálogo para
  // descobrir a área. Motivo sem área (ou texto livre) cai em "GERAL".
  const porUgc = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const a of alertasFiltrados) {
      if (!a.justificativa) continue
      const ugc = motivoUgc.get(a.justificativa) ?? 'GERAL'
      mapa.set(ugc, (mapa.get(ugc) ?? 0) + 1)
    }
    return [...mapa.entries()]
      .map(([ugc, total]) => ({ ugc, total }))
      .sort((a, b) => b.total - a.total)
  }, [alertasFiltrados, motivoUgc])

  // ── Tendência temporal (por dia): TML médio + conformidade ─────────────
  const porDia = useMemo(() => {
    const mapa = new Map<string, { dia: string; saidas: number; somaTempoSaida: number; nTempoSaida: number; dentroTolerancia: number }>()
    for (const h of historicoValido) {
      if (!h.data_saida || !h.sala) continue
      const k = mapa.get(h.data_saida) ?? { dia: h.data_saida, saidas: 0, somaTempoSaida: 0, nTempoSaida: 0, dentroTolerancia: 0 }
      k.saidas++
      const tempoSaida = tempoSaidaMinutos(h)
      if (tempoSaida != null) {
        k.somaTempoSaida += tempoSaida
        k.nTempoSaida++
        if (tempoSaida <= REGRAS_TML[h.sala].toleranciaMin) k.dentroTolerancia++
      }
      mapa.set(h.data_saida, k)
    }
    return [...mapa.values()]
      .sort((a, b) => a.dia.localeCompare(b.dia))
      .map((k) => ({
        dia: k.dia.slice(5).split('-').reverse().join('/'),
        saidas: k.saidas,
        tempoSaidaMedio: k.nTempoSaida > 0 ? Math.round(k.somaTempoSaida / k.nTempoSaida) : 0,
        conformidadePct: k.nTempoSaida > 0 ? Math.round((k.dentroTolerancia / k.nTempoSaida) * 1000) / 10 : 0,
      }))
  }, [historicoValido])

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" /> Análise de TML
          </h1>
          <p className="text-sm text-muted-foreground">Acumulado de TMLs perdidos e ranking por sala, motorista e motivo.</p>
        </div>
        <Link to="/distribuicao/tml/deslocamento" className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
          <Timer className="h-4 w-4" /> Tempo de Deslocamento
        </Link>
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
        {totalInvalidos > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {totalInvalidos} saída(s) inválida(s) (antes da matinal) excluída(s) da análise
          </span>
        )}
      </div>

      <div className="flex gap-1 border-b">
        {([
          { valor: 'geral', label: 'Visão geral' },
          { valor: 'motivos', label: 'Motivos & Áreas' },
        ] as const).map((t) => (
          <button
            key={t.valor}
            onClick={() => setAba(t.valor)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              aba === t.valor ? 'border-accent-500 text-accent-700' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'geral' && (
        <div className="flex gap-2 flex-wrap">
          {([
            { valor: 'consolidado', label: 'Consolidado' },
            { valor: 'abertura', label: 'Abertura por etapa' },
          ] as const).map((t) => (
            <button
              key={t.valor}
              onClick={() => setSubAbaGeral(t.valor)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                subAbaGeral === t.valor ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-muted-foreground border-gray-200 hover:bg-accent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : aba === 'geral' && subAbaGeral === 'abertura' ? (
        <>
          <div className="flex flex-wrap items-end gap-3 border rounded-lg bg-white p-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Ver por</label>
              <div className="flex rounded-md border overflow-hidden">
                <button
                  onClick={() => { setVerPor('dia'); setAte(de) }}
                  className={`px-3 py-1.5 text-sm font-medium ${verPor === 'dia' ? 'bg-accent-500 text-white' : 'bg-white text-muted-foreground hover:bg-accent'}`}
                >
                  Dia
                </button>
                <button
                  onClick={() => setVerPor('periodo')}
                  className={`px-3 py-1.5 text-sm font-medium border-l ${verPor === 'periodo' ? 'bg-accent-500 text-white' : 'bg-white text-muted-foreground hover:bg-accent'}`}
                >
                  Período
                </button>
              </div>
            </div>
            {verPor === 'dia' ? (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Data</label>
                <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setAte(e.target.value) }} className="border rounded-md px-2 py-1.5 text-sm" />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">De</label>
                  <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Até</label>
                  <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
                </div>
              </>
            )}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-muted-foreground mb-1">Placa</label>
              <input
                type="text"
                value={placaFiltro}
                onChange={(e) => setPlacaFiltro(e.target.value)}
                placeholder="Todas — ou filtre por uma placa (ex: JBP9G64)"
                className="w-full border rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {verPor === 'dia' && (
            <div className="flex items-center gap-1.5 flex-wrap bg-accent-50 border border-accent-200 rounded-lg px-3 py-2 text-xs text-accent-800">
              📌 Meta de {formatarDataBR(de)}:
              <b>Matinal {metaMatinalMinutos(de, matinalMetaParams)}min</b>+
              <b>Deslocamento {gatilhoEstouroMinutos(de, gatilhoParams).ideal}min</b>+
              <b>Checklist {etapaIdealMinutos('checklist', de, etapaParams)}min</b>+
              <b>Conferência {etapaIdealMinutos('conferencia', de, etapaParams)}min</b>+
              <b>Movimentação {metaMovimentacaoMinutos(de, { matinal: matinalMetaParams, etapa: etapaParams, gatilho: gatilhoParams })}min</b>=
              <b>{META_TML_TOTAL_MIN}min</b>
            </div>
          )}
          {verPor === 'periodo' && (
            <p className="text-xs text-muted-foreground">
              A meta de cada etapa varia por dia da semana — no período, cada mapa é comparado com a meta do
              próprio dia em que rodou (ver coluna "Meta" da tabela).
            </p>
          )}

          <SectionTitle title="Tempo médio por etapa" subtitle={`${aberturaCompleta.length} mapa(s) com os 5 pedaços completos, de ${aberturaPorMapa.length} no filtro`} />

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            {([
              { label: 'Matinal', v: aberturaMedias.matinal, meta: aberturaMedias.metaMatinal },
              { label: 'Deslocamento', v: aberturaMedias.deslocamento, meta: aberturaMedias.metaDeslocamento },
              { label: 'Checklist', v: aberturaMedias.checklist, meta: aberturaMedias.metaChecklist },
              { label: 'Conferência', v: aberturaMedias.conferencia, meta: aberturaMedias.metaConferencia },
              { label: 'Movimentação', v: aberturaMedias.movimentacao, meta: aberturaMedias.metaMovimentacao },
            ] as const).map((k) => {
              const diff = k.v - k.meta
              const dentro = diff <= 0.5
              return (
                <div key={k.label} className="border rounded-xl bg-white p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className="text-xl font-bold leading-tight">{k.v.toFixed(0)}min</p>
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1.5 ${dentro ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {dentro ? '✓' : '▲'} {diff >= 0 ? '+' : ''}{diff.toFixed(0)}min (meta {k.meta.toFixed(0)})
                  </span>
                </div>
              )
            })}
            <div className="border-2 rounded-xl bg-accent-50 border-accent-500 p-3">
              <p className="text-[11px] font-semibold text-accent-700 uppercase tracking-wide">TML Final</p>
              <p className="text-xl font-bold leading-tight text-accent-700">{aberturaMedias.tmlFinal.toFixed(0)}min</p>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1.5 ${(aberturaMedias.tmlFinal - META_TML_TOTAL_MIN) <= 0.5 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {(aberturaMedias.tmlFinal - META_TML_TOTAL_MIN) <= 0.5 ? '✓' : '▲'} {(aberturaMedias.tmlFinal - META_TML_TOTAL_MIN) >= 0 ? '+' : ''}{(aberturaMedias.tmlFinal - META_TML_TOTAL_MIN).toFixed(0)}min (meta {META_TML_TOTAL_MIN})
              </span>
            </div>
          </div>

          {aberturaCompleta.length > 0 && (
            <>
              <SectionTitle title="Composição do tempo total" subtitle="média dos mapas com dados completos no filtro" />
              <div className="border rounded-xl bg-white p-4">
                <div className="flex w-full h-8 rounded-lg overflow-hidden text-[11px] font-semibold text-white">
                  {([
                    { v: aberturaMedias.matinal, cor: '#0d9488', label: 'Matinal' },
                    { v: aberturaMedias.deslocamento, cor: '#38bdf8', label: 'Desloc.' },
                    { v: aberturaMedias.checklist, cor: '#818cf8', label: 'Checklist' },
                    { v: aberturaMedias.conferencia, cor: '#a78bfa', label: 'Conferência' },
                    { v: aberturaMedias.movimentacao, cor: '#f59e0b', label: 'Movim.' },
                  ] as const).map((s) => (
                    <div key={s.label} style={{ width: `${aberturaMedias.tmlFinal > 0 ? (s.v / aberturaMedias.tmlFinal) * 100 : 0}%`, background: s.cor }} className="flex items-center justify-center overflow-hidden whitespace-nowrap">
                      {s.v >= 2 ? `${s.label} · ${s.v.toFixed(0)}min` : ''}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-3 pt-2 border-t border-dashed text-sm">
                  <span className="text-muted-foreground">Soma das etapas = Tempo TML Final</span>
                  <span className="font-bold">
                    {aberturaMedias.tmlFinal.toFixed(0)}min{' '}
                    <span className={`text-xs font-semibold ${(aberturaMedias.tmlFinal - META_TML_TOTAL_MIN) > 0.5 ? 'text-red-600' : 'text-green-700'}`}>
                      ({(aberturaMedias.tmlFinal - META_TML_TOTAL_MIN) >= 0 ? '+' : ''}{(aberturaMedias.tmlFinal - META_TML_TOTAL_MIN).toFixed(0)}min sobre a meta de {META_TML_TOTAL_MIN})
                    </span>
                  </span>
                </div>
              </div>
            </>
          )}

          <SectionTitle title="Detalhe por mapa" subtitle="ordenado pelo TML Final, do mais lento pro mais rápido" />
          <div className="border rounded-xl bg-white shadow-sm overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 px-4">Mapa</th>
                  <th className="py-2 px-4">Placa</th>
                  <th className="py-2 px-4">Sala</th>
                  <th className="py-2 px-4">Data</th>
                  <th className="py-2 px-4 text-right">Matinal</th>
                  <th className="py-2 px-4 text-right">Desloc.</th>
                  <th className="py-2 px-4 text-right">Checklist</th>
                  <th className="py-2 px-4 text-right">Conferência</th>
                  <th className="py-2 px-4 text-right">Movimentação</th>
                  <th className="py-2 px-4 text-right">TML Final</th>
                </tr>
              </thead>
              <tbody>
                {aberturaPorMapa.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Nenhum mapa no filtro.</td></tr>
                ) : aberturaPorMapa.map((l) => (
                  <tr key={l.chave} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-2 px-4 font-semibold tabular-nums">{l.mapa ?? '—'}</td>
                    <td className="py-2 px-4">{l.placa ?? '—'}</td>
                    <td className="py-2 px-4 whitespace-nowrap">{SALA_TML_LABEL[l.sala]}</td>
                    <td className="py-2 px-4 whitespace-nowrap">{formatarDataBR(l.data)}</td>
                    {([
                      { v: l.matinalMin, meta: l.metaMatinal },
                      { v: l.deslocamentoMin, meta: l.metaDeslocamento },
                      { v: l.checklistMin, meta: l.metaChecklist },
                      { v: l.confMin, meta: l.metaConferencia },
                      { v: l.movimentacaoMin, meta: l.metaMovimentacao },
                    ] as const).map((c, i) => (
                      <td key={i} className={`py-2 px-4 text-right tabular-nums ${c.v != null && c.v > c.meta ? 'text-red-600 font-semibold' : ''}`}>
                        {c.v != null ? `${c.v}min` : '—'}
                      </td>
                    ))}
                    <td className={`py-2 px-4 text-right tabular-nums font-bold ${l.tmlFinalMin != null && l.tmlFinalMin > META_TML_TOTAL_MIN ? 'text-red-600' : 'text-green-700'}`}>
                      {l.tmlFinalMin != null ? `${l.tmlFinalMin}min` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : aba === 'geral' && subAbaGeral === 'consolidado' ? (
        <>
          <SectionTitle title="TML — saída na portaria" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card icon={CheckCircle2} label="Saídas no período" value={String(totalSaidas)} accent="text-blue-600 bg-blue-50" />
            <Card icon={AlertTriangle} label="TMLs perdidos" value={`${totalPerdidos} (${pctPerdido.toFixed(1)}%)`} accent="text-red-600 bg-red-50" />
            <Card icon={CheckCircle2} label="% Atingimento do TML" value={`${pctAtingimento.toFixed(1)}%`} accent="text-green-600 bg-green-50" />
            <Card icon={Users} label="Justificados" value={`${totalJustificados} (${pctJustificado.toFixed(0)}%)`} hint="do total de TMLs perdidos" accent="text-violet-600 bg-violet-50" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card icon={Clock} label="Tempo médio de saída — Geral CDD" value={`${tempoSaidaMedioGeral.toFixed(0)} min`} hint="saída real − horário matinal, todas as salas" accent="text-cyan-600 bg-cyan-50" />
            <Card icon={CheckCircle2} label="% Conformidade — Geral CDD" value={`${pctConformidadeGeral.toFixed(1)}%`} hint="carros que saíram dentro da tolerância" accent="text-green-600 bg-green-50" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartCard title="TMLs perdidos por sala">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={porSala} barGap={6} margin={{ top: 20 }}>
                  <defs>
                    <linearGradient id="gradPerdidos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.6} />
                    </linearGradient>
                    <linearGradient id="gradSaidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="sala" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="perdidos" name="Perdidos" fill="url(#gradPerdidos)" radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="perdidos" position="top" style={{ fontSize: 11, fill: '#ef4444', fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="saidas" name="Saídas" fill="url(#gradSaidas)" radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="saidas" position="top" style={{ fontSize: 11, fill: '#3b82f6', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                {porSala.map((s) => (
                  <p key={s.sala}>{s.sala}: {s.pct}% perdido</p>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="% de atingimento do TML por sala">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={porSala} barGap={6} margin={{ top: 20 }}>
                  <defs>
                    <linearGradient id="gradAtingimento" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity={1} />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="sala" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="pctAtingimento" name="% Atingimento" fill="url(#gradAtingimento)" radius={[8, 8, 0, 0]}>
                    <LabelList dataKey="pctAtingimento" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 11, fill: '#16a34a', fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Tempo médio de saída e % de conformidade por sala"
              subtitle="Saída real − horário matinal · conformidade = dentro da tolerância de cada sala"
            >
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={porSala} margin={{ top: 20 }}>
                  <defs>
                    <linearGradient id="gradTempoSaidaSala" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c3aed" stopOpacity={1} />
                      <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="sala" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="min" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="min" dataKey="tempoSaidaMedio" name="Tempo médio de saída (min)" fill="url(#gradTempoSaidaSala)" radius={[8, 8, 0, 0]} barSize={40}>
                    <LabelList dataKey="tempoSaidaMedio" position="top" style={{ fontSize: 11, fill: '#7c3aed', fontWeight: 600 }} />
                  </Bar>
                  <Line yAxisId="pct" type="monotone" dataKey="conformidadePct" name="% Conformidade" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3, fill: '#16a34a' }}>
                    <LabelList dataKey="conformidadePct" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 11, fill: '#16a34a', fontWeight: 600 }} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard
            title="Histórico de TML médio e conformidade por dia"
            subtitle="Barras: tempo médio de saída (min) · Linha: % de conformidade"
          >
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={porDia} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradTempoSaidaDia" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={1} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="dia" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="min" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="min" dataKey="tempoSaidaMedio" name="Tempo médio de saída (min)" fill="url(#gradTempoSaidaDia)" radius={[8, 8, 0, 0]} barSize={28}>
                  <LabelList dataKey="tempoSaidaMedio" position="top" style={{ fontSize: 11, fill: '#7c3aed', fontWeight: 600 }} />
                </Bar>
                <Line yAxisId="pct" type="monotone" dataKey="conformidadePct" name="% Conformidade" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3, fill: '#16a34a' }}>
                  <LabelList dataKey="conformidadePct" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 11, fill: '#16a34a', fontWeight: 600 }} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          <SectionTitle
            title="Passo a passo por mapa"
            subtitle="TML de cada mapa no período — abra os detalhes pra ver a linha do tempo completa (matinal, checklist, conferência e saída)."
          />
          <div className="border rounded-xl bg-white shadow-sm">
            <button onClick={() => setPassoAberto(v => !v)} className="w-full flex items-center justify-between gap-2 px-4 py-3 border-b text-left">
              <span className="flex items-center gap-2">
                {passoAberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <ListChecks className="h-4 w-4 text-primary shrink-0" />
                <h2 className="text-sm font-semibold">Mapas do período</h2>
              </span>
              <span className="text-xs text-muted-foreground">{analisePasso.length} registro(s)</span>
            </button>
            {passoAberto && (analisePasso.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum mapa no período.</p>
            ) : (
              <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 px-4">Mapa</th>
                      <th className="py-2 px-4">Motorista</th>
                      <th className="py-2 px-4">Sala</th>
                      <th className="py-2 px-4">Data</th>
                      <th className="py-2 px-4 text-right">TML</th>
                      <th className="py-2 px-4">Status</th>
                      <th className="py-2 px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisePasso.map((a) => (
                      <tr key={a.chave} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2 px-4 font-semibold tabular-nums">{a.mapa ?? '—'}</td>
                        <td className="py-2 px-4">
                          <div>{a.nome ?? '—'}</div>
                          {a.placa && <div className="text-xs text-muted-foreground">{a.placa}</div>}
                        </td>
                        <td className="py-2 px-4 whitespace-nowrap">{SALA_TML_LABEL[a.sala]}</td>
                        <td className="py-2 px-4 whitespace-nowrap">{formatarDataBR(a.data)}</td>
                        <td className={`py-2 px-4 text-right font-semibold tabular-nums ${a.resultado === 'atrasado' ? 'text-red-600' : 'text-green-700'}`}>
                          {a.tempoSaida != null ? `${a.tempoSaida} min` : '—'}
                        </td>
                        <td className="py-2 px-4">
                          {a.resultado === 'atrasado' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                              <AlertTriangle className="h-3 w-3" /> estouro de TML
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                              <CheckCircle2 className="h-3 w-3" /> dentro do TML
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          <button
                            onClick={() => setDetalheAberto(a.chave)}
                            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md border hover:bg-accent transition-colors whitespace-nowrap"
                          >
                            Ver detalhes
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className="border rounded-xl bg-white shadow-sm">
            <button onClick={() => setTopMotoristasAberto(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 border-b text-left">
              {topMotoristasAberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <h2 className="text-sm font-semibold">Top 10 motoristas com mais TML perdido</h2>
            </button>
            {topMotoristasAberto && (porMotorista.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum TML perdido no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                    <th className="py-2 px-4">Motorista</th>
                    <th className="py-2 px-4">Matrícula</th>
                    <th className="py-2 px-4 text-right">TMLs perdidos</th>
                    <th className="py-2 px-4 text-right">Tempo médio (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {porMotorista.map((m) => (
                    <tr key={`${m.matricula}-${m.nome}`} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 px-4">{m.nome}</td>
                      <td className="py-2 px-4">{m.matricula ?? '—'}</td>
                      <td className="py-2 px-4 text-right font-semibold text-red-600">{m.perdidos}</td>
                      <td className="py-2 px-4 text-right">{m.tempoMedio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </>
      ) : (
        <>
          <SectionTitle
            title="Motivos e áreas responsáveis"
            subtitle="Filtre por área pra ver só os motivos daquela área — evita misturar todo mundo numa pizza só."
          />

          <div className="flex flex-wrap items-end gap-3 border rounded-lg bg-white p-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Área (UGC)</label>
              <select value={ugcFiltro} onChange={(e) => setUgcFiltro(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm min-w-[160px]">
                <option value="TODAS">Todas as áreas</option>
                {porUgc.map((u) => (
                  <option key={u.ugc} value={u.ugc}>{u.ugc}</option>
                ))}
              </select>
            </div>
            {ugcFiltro !== 'TODAS' && (
              <span className="text-xs text-muted-foreground">
                Mostrando só motivos da área <strong>{ugcFiltro}</strong>
              </span>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartCard
              title="Distribuição por motivo"
              subtitle={`Top ${MOTIVO_TOP_N} motivos${ugcFiltro !== 'TODAS' ? ` — área ${ugcFiltro}` : ' — todas as áreas'}; o restante agrupado em "Outros"`}
            >
              {porMotivo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma justificativa registrada no período{ugcFiltro !== 'TODAS' ? ' para essa área' : ''}.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={porMotivo} dataKey="total" nameKey="motivo" cx="50%" cy="50%" innerRadius={45} outerRadius={95} paddingAngle={2} label={(p) => `${p.total}`}>
                      {porMotivo.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} stroke="#fff" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Atrasos por área responsável (UGC)" subtitle="Clique numa área no seletor acima pra abrir os motivos dela">
              {porUgc.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma justificativa registrada no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={porUgc} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="ugc" width={96} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                    <Bar dataKey="total" name="Atrasos" radius={[0, 6, 6, 0]} barSize={20} onClick={(d: any) => setUgcFiltro(d.ugc)} cursor="pointer">
                      {porUgc.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                      <LabelList dataKey="total" position="right" style={{ fontSize: 11, fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </>
      )}

      {detalheAtual && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between px-5 py-4 border-b">
              <div>
                <p className="text-xs font-semibold text-accent-600 uppercase tracking-wide">
                  Mapa {detalheAtual.linha.mapa ?? '—'} · {SALA_TML_LABEL[detalheAtual.linha.sala]}
                </p>
                <h2 className="font-semibold">{detalheAtual.linha.nome ?? '—'}</h2>
                <p className="text-xs text-muted-foreground">
                  {detalheAtual.linha.placa ? `${detalheAtual.linha.placa} · ` : ''}{formatarDataBR(detalheAtual.linha.data)}
                </p>
              </div>
              <button onClick={() => setDetalheAberto(null)} className="p-1 rounded hover:bg-accent shrink-0"><X className="h-4 w-4" /></button>
            </div>

            <div className="p-5">
              <div className="flex gap-2 mb-5">
                <div className={`flex-1 rounded-lg px-3 py-2 text-center ${detalheAtual.linha.resultado === 'atrasado' ? 'bg-red-50' : 'bg-green-50'}`}>
                  <p className={`text-lg font-bold tabular-nums ${detalheAtual.linha.resultado === 'atrasado' ? 'text-red-700' : 'text-green-700'}`}>
                    {detalheAtual.linha.tempoSaida != null ? `${detalheAtual.linha.tempoSaida} min` : '—'}
                  </p>
                  <p className="text-[10px] uppercase text-muted-foreground font-medium">TML final</p>
                </div>
                <div className="flex-1 rounded-lg px-3 py-2 text-center bg-slate-50">
                  <p className="text-lg font-bold tabular-nums">{REGRAS_TML[detalheAtual.linha.sala].toleranciaMin} min</p>
                  <p className="text-[10px] uppercase text-muted-foreground font-medium">tolerância da sala</p>
                </div>
              </div>

              <div className="space-y-0">
                <PassoTimeline
                  label="Fim da matinal"
                  horario={detalheAtual.matinalFim}
                  status={detalheAtual.matinalEstourou == null ? null : detalheAtual.matinalEstourou ? 'bad' : 'good'}
                  nota={detalheAtual.matinalEstourou == null ? 'Sem registro no Timer da Matinal — usado o horário padrão.' : detalheAtual.matinalEstourou ? 'Matinal estourou a meta de duração.' : 'Matinal dentro da meta de duração.'}
                />
                <PassoTimeline
                  label="Início do checklist"
                  horario={detalheAtual.checklistInicio}
                  gapLabel={detalheAtual.deslocamentoMin != null ? `${detalheAtual.deslocamentoMin} min de deslocamento` : undefined}
                />
                <PassoTimeline
                  label="Término do checklist"
                  horario={detalheAtual.checklistFim}
                  status={detalheAtual.checklistEstourou == null ? null : detalheAtual.checklistEstourou ? 'bad' : 'good'}
                  nota={detalheAtual.checklistMin != null ? `Checklist levou ${detalheAtual.checklistMin} min (ideal: até ${etapaIdealMinutos('checklist', detalheAtual.linha.data, etapaParams)} min).` : 'Sem horário de checklist registrado.'}
                />
                <PassoTimeline
                  label="Início da conferência"
                  horario={detalheAtual.confInicio}
                  gapLabel={detalheAtual.ateConferenciaMin != null ? `${detalheAtual.ateConferenciaMin} min até a conferência` : undefined}
                />
                <PassoTimeline
                  label="Término da conferência"
                  horario={detalheAtual.confFim}
                  status={detalheAtual.confEstourou == null ? null : detalheAtual.confEstourou ? 'bad' : 'good'}
                  nota={
                    detalheAtual.confEmAndamento
                      ? 'Conferência ainda em andamento.'
                      : detalheAtual.confMin != null
                        ? `Conferência levou ${detalheAtual.confMin} min (ideal: até ${etapaIdealMinutos('conferencia', detalheAtual.linha.data, etapaParams)} min).`
                        : 'Sem registro de conferência digital pra esse mapa.'
                  }
                />
                <PassoTimeline
                  label="Saída na portaria"
                  horario={detalheAtual.linha.horarioSaida}
                  status={detalheAtual.linha.resultado === 'atrasado' ? 'bad' : detalheAtual.linha.resultado === 'no_prazo' ? 'good' : null}
                  gapLabel={detalheAtual.ateSaidaMin != null ? `${detalheAtual.ateSaidaMin} min até a saída` : undefined}
                  ultimo
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-slate-50 rounded-b-xl">
              <button onClick={() => setDetalheAberto(null)} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Passo do timeline (Fim da matinal / Início-Término checklist /
// Início-Término conferência / Saída na portaria) — ícone de status só nos
// pontos em que dá pra dizer se estourou ou não; os demais são só marco
// no tempo (neutro), com o intervalo até a próxima etapa quando houver.
function PassoTimeline({
  label, horario, status, nota, gapLabel, ultimo = false,
}: {
  label: string
  horario: string | null
  status?: 'good' | 'bad' | null
  nota?: string
  gapLabel?: string
  ultimo?: boolean
}) {
  return (
    <div className="flex gap-3 pb-4 last:pb-0">
      <div className="flex flex-col items-center shrink-0">
        <div className={`h-7 w-7 rounded-full flex items-center justify-center border ${
          status === 'good' ? 'bg-green-50 border-green-300 text-green-600'
          : status === 'bad' ? 'bg-red-50 border-red-300 text-red-600'
          : 'bg-slate-50 border-slate-200 text-slate-400'
        }`}>
          {status === 'good' ? <CheckCircle2 className="h-4 w-4" />
            : status === 'bad' ? <AlertTriangle className="h-4 w-4" />
            : <MinusCircle className="h-3.5 w-3.5" />}
        </div>
        {!ultimo && <div className="w-px flex-1 bg-slate-200 mt-1" />}
      </div>
      <div className="flex-1 pt-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          <span className={`text-sm font-bold tabular-nums ${status === 'good' ? 'text-green-700' : status === 'bad' ? 'text-red-700' : ''}`}>
            {horario ?? '—'}
          </span>
        </div>
        {nota && <p className="text-xs text-muted-foreground mt-0.5">{nota}</p>}
        {gapLabel && (
          <span className="inline-block mt-1.5 text-[11px] text-muted-foreground bg-slate-50 border border-dashed border-slate-200 rounded-full px-2 py-0.5">
            {gapLabel}
          </span>
        )}
      </div>
    </div>
  )
}
