import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, LabelList,
} from 'recharts'
import { Timer, TrendingDown, CheckCircle2, AlertTriangle, Check, Loader2, SlidersHorizontal, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  SALA_TML_LABEL, type SalaTML, type GatilhoEstouroParam, type MetaMatinalParam,
  gatilhoEstouroMinutos, isSalaTML, metaMatinalMinutos, diaDaSemana,
  horarioInicioMatinalPadrao, horarioFinalMatinalPadrao, tempoDeslocamentoComMatinalReal,
} from '../lib/tml'
import { formatarDataBR } from '../lib/utils'
import {
  listarMotoristasComDeslocamento, buscarHistoricoMensalDeslocamento, buscarTabelaoDeslocamento,
  type MotoristaComDeslocamento, type HistoricoMensalMotorista, type MesDeslocamento, type TabelaoDeslocamento,
} from '../lib/deslocamentoTml'

const TOOLTIP_STYLE = { borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function primeiroDiaDoMesISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function primeiroDiaMes(mesISO: string): string {
  return `${mesISO}-01`
}

// Último dia do mês (28-31) — se cair no futuro (mês corrente), usa hoje,
// senão o filtro "Até" ficaria maior que a data mais recente disponível.
function ultimoDiaMes(mesISO: string): string {
  const [ano, mes] = mesISO.split('-').map(Number)
  const ultimo = new Date(ano, mes, 0).getDate()
  const data = `${mesISO}-${String(ultimo).padStart(2, '0')}`
  const hoje = hojeISO()
  return data > hoje ? hoje : data
}

interface LinhaChecklist {
  id: string
  sala: SalaTML | null
  matricula: number | null
  nome: string | null
  data: string | null
  horario_inicio: string | null
  horario_final_matinal: string | null
  tempo_deslocamento_minutos: number | null
  motivo: string | null
}

interface LinhaMatinal {
  id: number
  sala: SalaTML | null
  data: string | null
  horario_inicio: string | null
  horario_final: string | null
  meta_minutos: number | null
  duracao_minutos: number | null
  estouro_duracao: boolean | null
  motivo_estouro: string | null
  finalizado_automaticamente: boolean | null
}

interface OcorrenciaEstouro {
  chave: string
  tipo: 'Matinal' | 'Deslocamento'
  data: string | null
  sala: SalaTML | null
  minutos: number | null
  motivo: string | null
}

function formatarHoraISO(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function horaParaInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

interface ChaveGerenciamento {
  chave: string
  sala: SalaTML
  data: string
  matinal?: LinhaMatinal
  registros: number
}

function Card({
  icon: Icon, label, value, hint, accent = 'text-accent-600 bg-accent/40',
}: { icon: typeof Timer; label: string; value: string; hint?: string; accent?: string }) {
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

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>}
      {children}
    </div>
  )
}

export default function DistribuicaoTMLDeslocamento() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<'painel' | 'historico' | 'tabelao'>('painel')
  const [de, setDe] = useState(primeiroDiaDoMesISO())
  const [ate, setAte] = useState(hojeISO())
  const [mesFiltro, setMesFiltro] = useState(() => hojeISO().slice(0, 7))
  const [sala, setSala] = useState<SalaTML | 'TODAS'>('TODAS')

  // Filtro rápido por mês — troca "De"/"Até" pro primeiro/último dia do mês
  // escolhido (o range fica editável manualmente depois, se necessário).
  function aplicarFiltroMes(mes: string) {
    setMesFiltro(mes)
    setDe(primeiroDiaMes(mes))
    setAte(ultimoDiaMes(mes))
  }

  const [checklist, setChecklist] = useState<LinhaChecklist[]>([])
  const [matinais, setMatinais] = useState<LinhaMatinal[]>([])
  const [gatilhoParams, setGatilhoParams] = useState<GatilhoEstouroParam[]>([])
  const [metaParams, setMetaParams] = useState<MetaMatinalParam[]>([])
  const [loading, setLoading] = useState(true)
  const [salvandoMotivo, setSalvandoMotivo] = useState<string | null>(null)
  const [rascunhoMotivo, setRascunhoMotivo] = useState<Record<string, string>>({})

  const [gerenciarAberto, setGerenciarAberto] = useState(false)
  const [topMotoristasAberto, setTopMotoristasAberto] = useState(true)
  const [ocorrenciasAberto, setOcorrenciasAberto] = useState(true)
  const [historicoEstourosAberto, setHistoricoEstourosAberto] = useState(true)
  const [historicoMatinalAberto, setHistoricoMatinalAberto] = useState(true)
  const [antesMatinalAberto, setAntesMatinalAberto] = useState(true)
  const [rascunhoGerenciar, setRascunhoGerenciar] = useState<Record<string, { inicio: string; fim: string }>>({})
  const [salvandoGerenciar, setSalvandoGerenciar] = useState<string | null>(null)
  const [msgGerenciar, setMsgGerenciar] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const [{ data: chk }, { data: mat }, { data: gat }, { data: meta }] = await Promise.all([
      supabase
        .from('checklist_tml')
        .select('id, sala, matricula, nome, data, horario_inicio, horario_final_matinal, tempo_deslocamento_minutos, motivo')
        .eq('filial', usuario.filial)
        .gte('data', de)
        .lte('data', ate)
        .limit(5000),
      supabase
        .from('matinal_tml')
        .select('id, sala, data, horario_inicio, horario_final, meta_minutos, duracao_minutos, estouro_duracao, motivo_estouro, finalizado_automaticamente')
        .eq('filial', usuario.filial)
        .gte('data', de)
        .lte('data', ate)
        .order('data', { ascending: false }),
      supabase
        .from('tml_gatilho_estouro')
        .select('deslocamento_ideal_minutos, deslocamento_estouro_minutos, vigente_a_partir')
        .eq('filial', usuario.filial),
      supabase
        .from('tml_meta_matinal')
        .select('dia_semana, meta_minutos, vigente_a_partir')
        .eq('filial', usuario.filial),
    ])
    setChecklist(Array.isArray(chk) ? chk : [])
    setMatinais(Array.isArray(mat) ? mat : [])
    setGatilhoParams(Array.isArray(gat) ? gat : [])
    setMetaParams(Array.isArray(meta) ? meta : [])
    setLoading(false)
  }, [usuario, de, ate])

  useEffect(() => { carregar() }, [carregar])

  const checklistFiltrado = useMemo(() => {
    // Checklist de domingo não deve aparecer nem entrar em nenhuma conta —
    // não é dia de operação normal da matinal/deslocamento.
    const semDomingo = checklist.filter((c) => !c.data || diaDaSemana(c.data) !== 0)
    return sala === 'TODAS' ? semDomingo : semDomingo.filter((c) => c.sala === sala)
  }, [checklist, sala])

  const comDeslocamento = checklistFiltrado.filter((c) => c.tempo_deslocamento_minutos != null)
  const tempoDeslocamentoMedioGeral = comDeslocamento.length > 0
    ? comDeslocamento.reduce((acc, c) => acc + (c.tempo_deslocamento_minutos ?? 0), 0) / comDeslocamento.length
    : 0
  const antesMatinalGeral = comDeslocamento.filter((c) => (c.tempo_deslocamento_minutos ?? 0) < 0).length
  const pctAntesMatinalGeral = comDeslocamento.length > 0 ? (antesMatinalGeral / comDeslocamento.length) * 100 : 0
  // Cada registro é comparado contra o gatilho que estava vigente na SUA
  // data, não o gatilho atual — assim, melhorar o gatilho não reclassifica
  // o histórico já registrado.
  const estouroGatilhoGeral = comDeslocamento.filter(
    (c) => (c.tempo_deslocamento_minutos ?? 0) > gatilhoEstouroMinutos(c.data ?? hojeISO(), gatilhoParams).estouro
  ).length
  const pctEstouroGatilhoGeral = comDeslocamento.length > 0 ? (estouroGatilhoGeral / comDeslocamento.length) * 100 : 0
  const gatilhoAtual = gatilhoEstouroMinutos(hojeISO(), gatilhoParams)

  function corDeslocamento(min: number, data: string | null): string {
    const { ideal, estouro } = gatilhoEstouroMinutos(data ?? hojeISO(), gatilhoParams)
    if (min > estouro) return 'text-red-700'
    if (min > ideal) return 'text-amber-700'
    return 'text-green-700'
  }

  const porSalaDeslocamento = useMemo(() => {
    const mapa = new Map<string, { sala: string; soma: number; n: number; antesMatinal: number }>()
    for (const c of checklistFiltrado) {
      if (!c.sala || c.tempo_deslocamento_minutos == null) continue
      const k = mapa.get(c.sala) ?? { sala: c.sala, soma: 0, n: 0, antesMatinal: 0 }
      k.soma += c.tempo_deslocamento_minutos
      k.n++
      if (c.tempo_deslocamento_minutos < 0) k.antesMatinal++
      mapa.set(c.sala, k)
    }
    return [...mapa.values()].map((k) => ({
      sala: SALA_TML_LABEL[k.sala as SalaTML] ?? k.sala,
      tempoMedio: k.n > 0 ? Math.round(k.soma / k.n) : 0,
      pctAntesMatinal: k.n > 0 ? Math.round((k.antesMatinal / k.n) * 1000) / 10 : 0,
    }))
  }, [checklistFiltrado])

  const porDiaDeslocamento = useMemo(() => {
    const mapa = new Map<string, { data: string; soma: number; n: number }>()
    for (const c of comDeslocamento) {
      if (!c.data) continue
      const k = mapa.get(c.data) ?? { data: c.data, soma: 0, n: 0 }
      k.soma += c.tempo_deslocamento_minutos ?? 0
      k.n++
      mapa.set(c.data, k)
    }
    return [...mapa.values()]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((k) => ({
        data: formatarDataBR(k.data),
        tempoMedio: k.n > 0 ? Math.round((k.soma / k.n) * 10) / 10 : 0,
        registros: k.n,
      }))
  }, [comDeslocamento])

  const porMotoristaDeslocamento = useMemo(() => {
    const mapa = new Map<string, { nome: string; matricula: number | null; soma: number; n: number }>()
    for (const c of checklistFiltrado) {
      if (c.tempo_deslocamento_minutos == null) continue
      const chave = c.matricula != null ? String(c.matricula) : `s/matricula:${c.nome}`
      const k = mapa.get(chave) ?? { nome: c.nome ?? '—', matricula: c.matricula, soma: 0, n: 0 }
      k.soma += c.tempo_deslocamento_minutos
      k.n++
      mapa.set(chave, k)
    }
    return [...mapa.values()]
      .map((k) => ({ ...k, tempoMedio: k.n > 0 ? Math.round(k.soma / k.n) : 0 }))
      .sort((a, b) => b.tempoMedio - a.tempoMedio)
      .slice(0, 10)
  }, [checklistFiltrado])

  const ocorrenciasMaisDemoradas = useMemo(
    () => [...comDeslocamento].sort((a, b) => (b.tempo_deslocamento_minutos ?? 0) - (a.tempo_deslocamento_minutos ?? 0)).slice(0, 20),
    [comDeslocamento]
  )
  const ocorrenciasAntesMatinal = useMemo(
    () => comDeslocamento.filter((c) => (c.tempo_deslocamento_minutos ?? 0) < 0).sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '')),
    [comDeslocamento]
  )

  const matinaisFiltradas = useMemo(
    () => (sala === 'TODAS' ? matinais : matinais.filter((m) => m.sala === sala)),
    [matinais, sala]
  )

  const matinaisComDuracao = useMemo(
    () => matinaisFiltradas.filter((m) => m.duracao_minutos != null),
    [matinaisFiltradas]
  )
  const duracaoMatinalMediaGeral = matinaisComDuracao.length > 0
    ? matinaisComDuracao.reduce((acc, m) => acc + (m.duracao_minutos ?? 0), 0) / matinaisComDuracao.length
    : 0

  const porDiaMatinal = useMemo(() => {
    const mapa = new Map<string, { data: string; soma: number; n: number; meta: number | null }>()
    for (const m of matinaisComDuracao) {
      if (!m.data) continue
      const k = mapa.get(m.data) ?? { data: m.data, soma: 0, n: 0, meta: m.meta_minutos }
      k.soma += m.duracao_minutos ?? 0
      k.n++
      mapa.set(m.data, k)
    }
    return [...mapa.values()]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((k) => ({
        data: formatarDataBR(k.data),
        duracaoMedia: k.n > 0 ? Math.round((k.soma / k.n) * 10) / 10 : 0,
        meta: k.meta ?? undefined,
      }))
  }, [matinaisComDuracao])

  const historicoEstouros = useMemo(() => {
    const doMatinal: OcorrenciaEstouro[] = matinaisFiltradas
      .filter((m) => m.estouro_duracao)
      .map((m) => ({
        chave: `matinal-${m.id}`,
        tipo: 'Matinal',
        data: m.data,
        sala: m.sala,
        minutos: m.duracao_minutos,
        motivo: m.motivo_estouro,
      }))
    const doDeslocamento: OcorrenciaEstouro[] = comDeslocamento
      .filter((c) => (c.tempo_deslocamento_minutos ?? 0) > gatilhoEstouroMinutos(c.data ?? hojeISO(), gatilhoParams).estouro)
      .map((c) => ({
        chave: `deslocamento-${c.id}`,
        tipo: 'Deslocamento',
        data: c.data,
        sala: c.sala,
        minutos: c.tempo_deslocamento_minutos,
        motivo: c.motivo,
      }))
    return [...doMatinal, ...doDeslocamento].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
  }, [matinaisFiltradas, comDeslocamento, gatilhoParams])

  const chavesGerenciamento = useMemo(() => {
    const mapa = new Map<string, ChaveGerenciamento>()
    for (const m of matinaisFiltradas) {
      if (!m.sala || !m.data) continue
      const chave = `${m.sala}|${m.data}`
      const atual = mapa.get(chave) ?? { chave, sala: m.sala, data: m.data, registros: 0 }
      atual.matinal = m
      mapa.set(chave, atual)
    }
    for (const c of checklistFiltrado) {
      if (!c.sala || !c.data || !isSalaTML(c.sala)) continue
      const chave = `${c.sala}|${c.data}`
      const atual = mapa.get(chave) ?? { chave, sala: c.sala, data: c.data, registros: 0 }
      atual.registros++
      mapa.set(chave, atual)
    }
    return [...mapa.values()].sort((a, b) => b.data.localeCompare(a.data) || a.sala.localeCompare(b.sala))
  }, [matinaisFiltradas, checklistFiltrado])

  function valoresAtuaisGerenciamento(item: ChaveGerenciamento): { inicio: string; fim: string } {
    const rascunho = rascunhoGerenciar[item.chave]
    if (rascunho) return rascunho
    const inicio = item.matinal?.horario_inicio
      ? horaParaInput(item.matinal.horario_inicio)
      : horarioInicioMatinalPadrao(item.sala, item.data)
    const fim = item.matinal?.horario_final
      ? horaParaInput(item.matinal.horario_final)
      : horarioFinalMatinalPadrao(item.sala, item.data, metaParams)
    return { inicio, fim }
  }

  function atualizarRascunhoGerenciar(item: ChaveGerenciamento, campo: 'inicio' | 'fim', valor: string) {
    setRascunhoGerenciar((prev) => ({
      ...prev,
      [item.chave]: { ...valoresAtuaisGerenciamento(item), ...prev[item.chave], [campo]: valor },
    }))
  }

  async function salvarGerenciamento(item: ChaveGerenciamento) {
    if (!usuario) return
    const { inicio: inicioHHMM, fim: fimHHMM } = valoresAtuaisGerenciamento(item)
    if (!fimHHMM) {
      setMsgGerenciar('Informe ao menos o horário de fim da matinal.')
      return
    }
    setSalvandoGerenciar(item.chave)
    setMsgGerenciar(null)
    try {
      const inicioISO = inicioHHMM ? new Date(`${item.data}T${inicioHHMM}:00`).toISOString() : null
      const fimISO = new Date(`${item.data}T${fimHHMM}:00`).toISOString()
      const meta = metaMatinalMinutos(item.data, metaParams)
      const duracao = inicioISO != null
        ? Math.max(0, Math.round((new Date(fimISO).getTime() - new Date(inicioISO).getTime()) / 60000))
        : null
      const estourou = duracao != null && duracao > meta

      const payload = {
        filial: usuario.filial,
        sala: item.sala,
        data: item.data,
        horario_inicio: inicioISO,
        horario_final: fimISO,
        meta_minutos: meta,
        duracao_minutos: duracao,
        estouro_duracao: estourou,
        finalizado_automaticamente: false,
        motivo_estouro: estourou ? (item.matinal?.motivo_estouro ?? 'Ajuste manual de horário') : null,
      }

      const { error } = item.matinal
        ? await supabase.from('matinal_tml').update(payload).eq('id', item.matinal.id)
        : await supabase.from('matinal_tml').upsert(payload, { onConflict: 'filial,sala,data' })
      if (error) throw new Error(error.message)

      // Redefine o gatilho de estouro: recalcula o deslocamento de todo
      // checklist já importado daquele dia/sala com o novo fim da matinal.
      const { data: linhasChecklist, error: errChk } = await supabase
        .from('checklist_tml')
        .select('id, horario_inicio')
        .eq('filial', usuario.filial)
        .eq('sala', item.sala)
        .eq('data', item.data)
      if (errChk) throw new Error(errChk.message)

      await Promise.all(
        (linhasChecklist ?? [])
          .filter((l) => l.horario_inicio)
          .map((l) =>
            supabase
              .from('checklist_tml')
              .update({
                horario_final_matinal: fimHHMM,
                tempo_deslocamento_minutos: tempoDeslocamentoComMatinalReal(fimHHMM, l.horario_inicio as string),
              })
              .eq('id', l.id)
          )
      )

      setMsgGerenciar(
        `Horário de ${SALA_TML_LABEL[item.sala]} em ${formatarDataBR(item.data)} atualizado — ` +
        `${(linhasChecklist ?? []).length} registro(s) de checklist recalculado(s).`
      )
      setRascunhoGerenciar((prev) => {
        const cp = { ...prev }
        delete cp[item.chave]
        return cp
      })
      await carregar()
    } catch (err) {
      setMsgGerenciar(err instanceof Error ? `Erro: ${err.message}` : 'Erro ao salvar horário')
    } finally {
      setSalvandoGerenciar(null)
    }
  }

  async function salvarMotivo(id: string) {
    const motivo = (rascunhoMotivo[id] ?? '').trim()
    setSalvandoMotivo(id)
    const { error } = await supabase.from('checklist_tml').update({ motivo: motivo || null }).eq('id', id)
    if (!error) {
      setChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, motivo: motivo || null } : c)))
    }
    setSalvandoMotivo(null)
  }


  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Timer className="h-6 w-6 text-primary" /> Tempo de Deslocamento
        </h1>
        <p className="text-sm text-muted-foreground">
          Horário em que o motorista iniciou o checklist menos o horário real de fim da matinal (registrado no Timer da Matinal).
          Ideal hoje: até {gatilhoAtual.ideal} min. Estouro de gatilho hoje: acima de {gatilhoAtual.estouro} min.
          Ajuste esses valores na aba{' '}
          <Link to="/distribuicao/tml/parametros" className="text-accent-600 underline">Parâmetros</Link>.
        </p>
        <Link to="/distribuicao/tml/deslocamento/correcoes" className="text-xs text-muted-foreground underline hover:text-foreground">
          Corrigir registro com erro de leitura/digitação
        </Link>
      </div>

      <div className="flex gap-1 border-b">
        <button
          onClick={() => setAba('painel')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'painel' ? 'border-accent-600 text-accent-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Painel
        </button>
        <button
          onClick={() => setAba('historico')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'historico' ? 'border-accent-600 text-accent-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Histórico Mensal
        </button>
        <button
          onClick={() => setAba('tabelao')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'tabelao' ? 'border-accent-600 text-accent-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Tabelão Mensal
        </button>
      </div>

      {aba === 'historico' && usuario && <HistoricoMensalDeslocamentoTab filial={usuario.filial} />}
      {aba === 'tabelao' && usuario && <TabelaoDeslocamentoTab filial={usuario.filial} />}

      {aba === 'painel' && (
      <>
      <div className="flex flex-wrap items-end gap-3 border rounded-lg bg-white p-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Mês</label>
          <input
            type="month"
            value={mesFiltro}
            onChange={(e) => aplicarFiltroMes(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm"
          />
        </div>
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
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="border rounded-xl bg-white shadow-sm">
            <button
              onClick={() => setGerenciarAberto((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4 text-primary" /> Gerenciar tempo da matinal
              </span>
              {gerenciarAberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {gerenciarAberto && (
              <div className="border-t">
                <p className="text-xs text-muted-foreground px-4 pt-3">
                  Ajuste aqui o início e o fim da matinal — manual ou automático — de qualquer dia/sala.
                  Ao salvar, o deslocamento e os estouros de gatilho já registrados no checklist daquele
                  dia/sala são recalculados com o horário corrigido.
                </p>
                {msgGerenciar && (
                  <p className="text-xs px-4 pt-2 font-medium text-accent-700">{msgGerenciar}</p>
                )}
                {chavesGerenciamento.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">Nenhuma matinal ou checklist no período.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                          <th className="py-2 px-4">Data</th>
                          <th className="py-2 px-4">Sala</th>
                          <th className="py-2 px-4">Origem</th>
                          <th className="py-2 px-4">Início</th>
                          <th className="py-2 px-4">Fim</th>
                          <th className="py-2 px-4 text-right">Registros afetados</th>
                          <th className="py-2 px-4"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {chavesGerenciamento.map((item) => {
                          const valores = valoresAtuaisGerenciamento(item)
                          return (
                            <tr key={item.chave} className="border-b last:border-0 hover:bg-slate-50">
                              <td className="py-2 px-4 whitespace-nowrap">{formatarDataBR(item.data)}</td>
                              <td className="py-2 px-4 whitespace-nowrap">{SALA_TML_LABEL[item.sala]}</td>
                              <td className="py-2 px-4">
                                {item.matinal?.horario_final ? (
                                  item.matinal.finalizado_automaticamente ? (
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">automática</span>
                                  ) : (
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700">manual</span>
                                  )
                                ) : (
                                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">sem timer (padrão)</span>
                                )}
                              </td>
                              <td className="py-2 px-4">
                                <input
                                  type="time"
                                  value={valores.inicio}
                                  onChange={(e) => atualizarRascunhoGerenciar(item, 'inicio', e.target.value)}
                                  className="border rounded-md px-2 py-1 text-xs"
                                />
                              </td>
                              <td className="py-2 px-4">
                                <input
                                  type="time"
                                  value={valores.fim}
                                  onChange={(e) => atualizarRascunhoGerenciar(item, 'fim', e.target.value)}
                                  className="border rounded-md px-2 py-1 text-xs"
                                />
                              </td>
                              <td className="py-2 px-4 text-right">{item.registros}</td>
                              <td className="py-2 px-4">
                                <button
                                  onClick={() => salvarGerenciamento(item)}
                                  disabled={salvandoGerenciar === item.chave}
                                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border hover:bg-accent transition-colors disabled:opacity-50"
                                >
                                  {salvandoGerenciar === item.chave ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                  Salvar
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Card icon={Timer} label="Tempo médio de deslocamento" value={`${tempoDeslocamentoMedioGeral.toFixed(0)} min`} accent="text-cyan-600 bg-cyan-50" />
            <Card icon={AlertTriangle} label="Estouro de gatilho" value={`${estouroGatilhoGeral} (${pctEstouroGatilhoGeral.toFixed(1)}%)`} hint={`deslocamento acima do gatilho vigente em cada data`} accent="text-red-600 bg-red-50" />
            <Card icon={TrendingDown} label="Iniciaram antes da matinal" value={`${antesMatinalGeral} (${pctAntesMatinalGeral.toFixed(1)}%)`} hint="checklist começou antes do turno" accent="text-amber-600 bg-amber-50" />
            <Card icon={CheckCircle2} label="Registros de checklist" value={String(comDeslocamento.length)} accent="text-blue-600 bg-blue-50" />
          </div>

          <ChartCard title="Tempo médio de deslocamento e % de início antes da matinal por sala">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={porSalaDeslocamento} margin={{ top: 20 }}>
                <defs>
                  <linearGradient id="gradTempoDeslocamentoSala" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0891b2" stopOpacity={1} />
                    <stop offset="100%" stopColor="#0891b2" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="sala" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="min" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="min" dataKey="tempoMedio" name="Tempo médio de deslocamento (min)" fill="url(#gradTempoDeslocamentoSala)" radius={[8, 8, 0, 0]} barSize={40}>
                  <LabelList dataKey="tempoMedio" position="top" style={{ fontSize: 11, fill: '#0891b2', fontWeight: 600 }} />
                </Bar>
                <Line yAxisId="pct" type="monotone" dataKey="pctAntesMatinal" name="% antes da matinal" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }}>
                  <LabelList dataKey="pctAntesMatinal" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 11, fill: '#f59e0b', fontWeight: 600 }} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          {porDiaDeslocamento.length > 0 && (
            <ChartCard
              title="Tempo médio de deslocamento por dia"
              subtitle={`Média diária do horário de início do checklist menos o fim real da matinal${sala !== 'TODAS' ? ` — ${SALA_TML_LABEL[sala]}` : ''}`}
            >
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={porDiaDeslocamento} margin={{ top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="tempoMedio" name="Tempo médio de deslocamento (min)" fill="#0891b2" radius={[8, 8, 0, 0]} barSize={22}>
                    <LabelList dataKey="tempoMedio" position="top" style={{ fontSize: 10, fill: '#0891b2', fontWeight: 600 }} />
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          <div className="border rounded-xl bg-white shadow-sm">
            <button onClick={() => setTopMotoristasAberto(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 border-b text-left">
              {topMotoristasAberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <div>
                <h2 className="text-sm font-semibold">Top 10 motoristas com maior tempo de deslocamento</h2>
                <p className="text-xs text-muted-foreground">Tempo meta de início ainda não definido — ranking apenas por tempo médio</p>
              </div>
            </button>
            {topMotoristasAberto && (porMotoristaDeslocamento.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum registro de checklist no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                    <th className="py-2 px-4">Motorista</th>
                    <th className="py-2 px-4">Matrícula</th>
                    <th className="py-2 px-4 text-right">Registros</th>
                    <th className="py-2 px-4 text-right">Tempo médio (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {porMotoristaDeslocamento.map((m) => (
                    <tr key={`${m.matricula}-${m.nome}`} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 px-4">{m.nome}</td>
                      <td className="py-2 px-4">{m.matricula ?? '—'}</td>
                      <td className="py-2 px-4 text-right">{m.n}</td>
                      <td className="py-2 px-4 text-right font-semibold text-cyan-700">{m.tempoMedio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>

          <div className="border rounded-xl bg-white shadow-sm">
            <button onClick={() => setOcorrenciasAberto(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 border-b text-left">
              {ocorrenciasAberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <div>
                <h2 className="text-sm font-semibold">Ocorrências com maior tempo de deslocamento</h2>
                <p className="text-xs text-muted-foreground">Cadastre o motivo de quem levou mais tempo pra iniciar o checklist</p>
              </div>
            </button>
            {ocorrenciasAberto && (ocorrenciasMaisDemoradas.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum registro de checklist no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                    <th className="py-2 px-4">Data</th>
                    <th className="py-2 px-4">Motorista</th>
                    <th className="py-2 px-4">Sala</th>
                    <th className="py-2 px-4">Fim matinal</th>
                    <th className="py-2 px-4">Início checklist</th>
                    <th className="py-2 px-4 text-right">Deslocamento (min)</th>
                    <th className="py-2 px-4">Motivo</th>
                    <th className="py-2 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {ocorrenciasMaisDemoradas.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 px-4 whitespace-nowrap">{formatarDataBR(c.data)}</td>
                      <td className="py-2 px-4">{c.nome ?? '—'}</td>
                      <td className="py-2 px-4 whitespace-nowrap">{c.sala ? SALA_TML_LABEL[c.sala] : '—'}</td>
                      <td className="py-2 px-4">{c.horario_final_matinal ?? '—'}</td>
                      <td className="py-2 px-4">{c.horario_inicio ?? '—'}</td>
                      <td className={`py-2 px-4 text-right font-semibold ${corDeslocamento(c.tempo_deslocamento_minutos ?? 0, c.data)}`}>
                        {c.tempo_deslocamento_minutos}
                        {(c.tempo_deslocamento_minutos ?? 0) > gatilhoEstouroMinutos(c.data ?? hojeISO(), gatilhoParams).estouro && (
                          <span className="ml-1 text-[10px] font-bold uppercase">estouro</span>
                        )}
                      </td>
                      <td className="py-2 px-4">
                        <input
                          value={rascunhoMotivo[c.id] ?? c.motivo ?? ''}
                          onChange={(e) => setRascunhoMotivo((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          placeholder="Motivo…"
                          className="w-full border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="py-2 px-4">
                        <button
                          onClick={() => salvarMotivo(c.id)}
                          disabled={salvandoMotivo === c.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border hover:bg-accent transition-colors disabled:opacity-50"
                        >
                          {salvandoMotivo === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Salvar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>

          {ocorrenciasAntesMatinal.length > 0 && (
            <div className="border rounded-xl bg-amber-50 border-amber-200 shadow-sm">
              <button onClick={() => setAntesMatinalAberto(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 border-b border-amber-200 text-left">
                {antesMatinalAberto ? <ChevronDown className="h-4 w-4 shrink-0 text-amber-800" /> : <ChevronRight className="h-4 w-4 shrink-0 text-amber-800" />}
                <h2 className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" /> Colaboradores que iniciaram o checklist antes da matinal
                </h2>
              </button>
              {antesMatinalAberto && <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-amber-700 border-b border-amber-200">
                    <th className="py-2 px-4">Data</th>
                    <th className="py-2 px-4">Motorista</th>
                    <th className="py-2 px-4">Sala</th>
                    <th className="py-2 px-4">Fim matinal</th>
                    <th className="py-2 px-4">Início checklist</th>
                    <th className="py-2 px-4 text-right">Antes da matinal (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {ocorrenciasAntesMatinal.map((c) => (
                    <tr key={c.id} className="border-b border-amber-200 last:border-0">
                      <td className="py-2 px-4 whitespace-nowrap">{formatarDataBR(c.data)}</td>
                      <td className="py-2 px-4">{c.nome ?? '—'}</td>
                      <td className="py-2 px-4 whitespace-nowrap">{c.sala ? SALA_TML_LABEL[c.sala] : '—'}</td>
                      <td className="py-2 px-4">{c.horario_final_matinal ?? '—'}</td>
                      <td className="py-2 px-4">{c.horario_inicio ?? '—'}</td>
                      <td className="py-2 px-4 text-right font-semibold text-amber-800">{Math.abs(c.tempo_deslocamento_minutos ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>}
            </div>
          )}

          <div className="border rounded-xl bg-white shadow-sm">
            <button onClick={() => setHistoricoEstourosAberto(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 border-b text-left">
              {historicoEstourosAberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <div>
                <h2 className="text-sm font-semibold">Histórico de estouros — matinal e deslocamento</h2>
                <p className="text-xs text-muted-foreground">
                  Todo dia em que a matinal passou da meta ou o checklist começou com mais que o gatilho de estouro vigente naquela data, com o motivo registrado (quando houver).
                </p>
              </div>
            </button>
            {historicoEstourosAberto && (historicoEstouros.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum estouro registrado no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                    <th className="py-2 px-4">Data</th>
                    <th className="py-2 px-4">Tipo</th>
                    <th className="py-2 px-4">Sala</th>
                    <th className="py-2 px-4 text-right">Minutos</th>
                    <th className="py-2 px-4">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoEstouros.map((o) => (
                    <tr key={o.chave} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 px-4 whitespace-nowrap">{formatarDataBR(o.data)}</td>
                      <td className="py-2 px-4">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${o.tipo === 'Matinal' ? 'bg-cyan-50 text-cyan-700' : 'bg-red-50 text-red-700'}`}>
                          {o.tipo}
                        </span>
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap">{o.sala ? SALA_TML_LABEL[o.sala] : '—'}</td>
                      <td className="py-2 px-4 text-right font-semibold">{o.minutos ?? '—'}</td>
                      <td className="py-2 px-4">{o.motivo || <span className="text-muted-foreground">sem motivo registrado</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card icon={Timer} label="Duração média da matinal" value={`${duracaoMatinalMediaGeral.toFixed(1)} min`} accent="text-cyan-600 bg-cyan-50" />
            <Card icon={CheckCircle2} label="Matinais finalizadas" value={String(matinaisComDuracao.length)} accent="text-blue-600 bg-blue-50" />
            <Card icon={AlertTriangle} label="Matinais com estouro" value={String(matinaisFiltradas.filter((m) => m.estouro_duracao).length)} accent="text-amber-600 bg-amber-50" />
          </div>

          {porDiaMatinal.length > 0 && (
            <ChartCard title="Duração média da matinal por dia" subtitle="Tempo médio de início até o fim da matinal, comparado à meta do dia">
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={porDiaMatinal} margin={{ top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="data" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="duracaoMedia" name="Duração média (min)" fill="#0891b2" radius={[8, 8, 0, 0]} barSize={28}>
                    <LabelList dataKey="duracaoMedia" position="top" style={{ fontSize: 11, fill: '#0891b2', fontWeight: 600 }} />
                  </Bar>
                  <Line type="monotone" dataKey="meta" name="Meta (min)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          <div className="border rounded-xl bg-white shadow-sm">
            <button onClick={() => setHistoricoMatinalAberto(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 border-b text-left">
              {historicoMatinalAberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <div>
                <h2 className="text-sm font-semibold">Histórico da matinal</h2>
                <p className="text-xs text-muted-foreground">Todos os registros de início/fim da matinal feitos no Timer da Matinal, no período.</p>
              </div>
            </button>
            {historicoMatinalAberto && (matinaisFiltradas.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhuma matinal registrada no período.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                    <th className="py-2 px-4">Data</th>
                    <th className="py-2 px-4">Sala</th>
                    <th className="py-2 px-4">Início</th>
                    <th className="py-2 px-4">Fim</th>
                    <th className="py-2 px-4 text-right">Duração (min)</th>
                    <th className="py-2 px-4 text-right">Meta (min)</th>
                    <th className="py-2 px-4">Estouro</th>
                  </tr>
                </thead>
                <tbody>
                  {matinaisFiltradas.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 px-4 whitespace-nowrap">{formatarDataBR(m.data)}</td>
                      <td className="py-2 px-4 whitespace-nowrap">{m.sala ? SALA_TML_LABEL[m.sala] : '—'}</td>
                      <td className="py-2 px-4">{formatarHoraISO(m.horario_inicio)}</td>
                      <td className="py-2 px-4">{formatarHoraISO(m.horario_final)}</td>
                      <td className="py-2 px-4 text-right">{m.duracao_minutos ?? '—'}</td>
                      <td className="py-2 px-4 text-right">{m.meta_minutos ?? '—'}</td>
                      <td className="py-2 px-4">
                        {m.estouro_duracao ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">estouro</span>
                        ) : m.horario_final ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700">ok</span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">aberta</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </>
      )}
      </>
      )}
    </div>
  )
}

// ── Histórico Mensal / Tabelão — por motorista ───────────────────────────

const MESES_ABREV_DESLOC = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
function rotuloMesDesloc(mesISO: string): string {
  const [ano, mes] = mesISO.split('-').map(Number)
  return `${MESES_ABREV_DESLOC[mes - 1]}/${String(ano).slice(2)}`
}

type MetricaDesloc = 'tempo' | 'estouros'

function valorMesDesloc(m: Pick<MesDeslocamento, 'tempoMedioMinutos' | 'diasComEstouro'>, metrica: MetricaDesloc): number {
  return metrica === 'tempo' ? m.tempoMedioMinutos : m.diasComEstouro
}
function fmtMetricaDesloc(v: number, metrica: MetricaDesloc): string {
  return metrica === 'tempo' ? `${v.toFixed(1)} min` : `${Math.round(v)}`
}

function variacaoBadgeDesloc(pct: number | null): { texto: string; cor: string } {
  if (pct == null) return { texto: '—', cor: 'text-muted-foreground' }
  const sinal = pct > 0 ? '+' : ''
  // Deslocamento subir é ruim (diferente do RV): inverte as cores.
  const cor = pct > 5 ? 'text-red-600' : pct < -5 ? 'text-green-700' : 'text-muted-foreground'
  return { texto: `${sinal}${pct.toFixed(0)}%`, cor }
}

function SeletorMetricaDesloc({ metrica, onMetrica }: { metrica: MetricaDesloc; onMetrica: (v: MetricaDesloc) => void }) {
  return (
    <div className="flex bg-muted rounded-md p-0.5 gap-0.5">
      <button onClick={() => onMetrica('tempo')} className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${metrica === 'tempo' ? 'bg-white shadow-sm text-accent-700' : 'text-muted-foreground'}`}>Tempo médio</button>
      <button onClick={() => onMetrica('estouros')} className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${metrica === 'estouros' ? 'bg-white shadow-sm text-accent-700' : 'text-muted-foreground'}`}>Qtd. estouros</button>
    </div>
  )
}

function HistoricoMensalDeslocamentoTab({ filial }: { filial: string }) {
  const [motoristas, setMotoristas] = useState<MotoristaComDeslocamento[]>([])
  const [nome, setNome] = useState('')
  const [dados, setDados] = useState<HistoricoMensalMotorista | null>(null)
  const [loading, setLoading] = useState(false)
  const [metrica, setMetrica] = useState<MetricaDesloc>('tempo')

  useEffect(() => {
    listarMotoristasComDeslocamento(filial).then((lista) => {
      setMotoristas(lista)
      setNome((atual) => atual || lista[0]?.nome || '')
    })
  }, [filial])

  useEffect(() => {
    if (!nome) { setDados(null); return }
    setLoading(true)
    buscarHistoricoMensalDeslocamento(filial, nome)
      .then(setDados)
      .finally(() => setLoading(false))
  }, [filial, nome])

  const meses = dados?.meses ?? []
  const valorMes = (m: MesDeslocamento) => valorMesDesloc(m, metrica)
  const mesAtual = meses[meses.length - 1] ?? null
  const mesAnterior = meses[meses.length - 2] ?? null
  const pctVsAnterior = mesAtual && mesAnterior && valorMes(mesAnterior) > 0
    ? ((valorMes(mesAtual) - valorMes(mesAnterior)) / valorMes(mesAnterior)) * 100
    : null
  const badgeVsAnterior = variacaoBadgeDesloc(pctVsAnterior)

  const ultimos6 = meses.slice(-6)
  const media6 = ultimos6.length > 0 ? ultimos6.reduce((s, m) => s + valorMes(m), 0) / ultimos6.length : 0
  const totalEstouros = meses.reduce((s, m) => s + m.diasComEstouro, 0)

  const mediaSemUltimo = meses.length > 1 ? meses.slice(0, -1).reduce((s, m) => s + valorMes(m), 0) / (meses.length - 1) : null
  const tendencia = mediaSemUltimo == null || !mesAtual ? null
    : valorMes(mesAtual) > mediaSemUltimo * 1.05 ? 'up'
    : valorMes(mesAtual) < mediaSemUltimo * 0.95 ? 'down'
    : 'flat'

  const maxValor = Math.max(1, ...meses.map(valorMes))
  const mesesComEstouro = [...meses].reverse().filter((m) => (dados?.estourosPorMes[m.mes]?.length ?? 0) > 0)

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1">Motorista</label>
          <select
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm min-w-[260px] focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            {motoristas.length === 0 && <option value="">Nenhum motorista com deslocamento calculado</option>}
            {motoristas.map((m) => <option key={m.nome} value={m.nome}>{m.nome}</option>)}
          </select>
        </div>
        <div className="ml-auto"><SeletorMetricaDesloc metrica={metrica} onMetrica={setMetrica} /></div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Carregando...</div>
      ) : meses.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Sem histórico de deslocamento pra esse motorista ainda.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border rounded-lg p-3 bg-white">
              <div className="text-[11px] text-muted-foreground mb-0.5">Mês atual{mesAtual ? ` (${rotuloMesDesloc(mesAtual.mes)})` : ''}</div>
              <div className="text-lg font-bold tabular-nums">{fmtMetricaDesloc(mesAtual ? valorMes(mesAtual) : 0, metrica)}</div>
              {pctVsAnterior != null && <div className={`text-xs font-semibold ${badgeVsAnterior.cor}`}>{badgeVsAnterior.texto} vs {mesAnterior ? rotuloMesDesloc(mesAnterior.mes) : ''}</div>}
            </div>
            <div className="border rounded-lg p-3 bg-white">
              <div className="text-[11px] text-muted-foreground mb-0.5">Média (até 6 meses)</div>
              <div className="text-lg font-bold tabular-nums">{fmtMetricaDesloc(media6, metrica)}</div>
            </div>
            <div className="border rounded-lg p-3 bg-white">
              <div className="text-[11px] text-muted-foreground mb-0.5">Dias com estouro (total)</div>
              <div className="text-lg font-bold tabular-nums text-red-600">{totalEstouros}</div>
            </div>
            <div className="border rounded-lg p-3 bg-white">
              <div className="text-[11px] text-muted-foreground mb-0.5">Tendência</div>
              <div className={`text-lg font-bold ${tendencia === 'up' ? 'text-red-600' : tendencia === 'down' ? 'text-green-700' : 'text-muted-foreground'}`}>
                {tendencia === 'up' ? 'Piorando' : tendencia === 'down' ? 'Melhorando' : tendencia === 'flat' ? 'Estável' : '—'}
              </div>
            </div>
          </div>

          <div className="border rounded-lg bg-white p-4">
            <div className="flex items-end gap-3" style={{ height: 180 }}>
              {meses.map((m) => (
                <div key={m.mes} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="text-[10px] font-semibold tabular-nums mb-1">{fmtMetricaDesloc(valorMes(m), metrica)}</div>
                  <div
                    className={`w-full max-w-[46px] rounded-t-md ${m.diasComEstouro > 0 ? 'bg-red-500' : 'bg-accent-500'}`}
                    style={{ height: `${Math.max(4, (valorMes(m) / maxValor) * 130)}px` }}
                    title={`${rotuloMesDesloc(m.mes)} · ${fmtMetricaDesloc(valorMes(m), metrica)}`}
                  />
                  <div className="text-[11px] text-muted-foreground mt-2 font-medium">{rotuloMesDesloc(m.mes)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                  <th className="py-2 px-4">Mês</th>
                  <th className="py-2 px-4 text-right">Tempo médio</th>
                  <th className="py-2 px-4 text-right">Dias c/ checklist</th>
                  <th className="py-2 px-4 text-right">Dias c/ estouro</th>
                  <th className="py-2 px-4 text-right">Variação</th>
                </tr>
              </thead>
              <tbody>
                {[...meses].reverse().map((m, i, arr) => {
                  const anterior = arr[i + 1]
                  const pct = anterior && valorMes(anterior) > 0 ? ((valorMes(m) - valorMes(anterior)) / valorMes(anterior)) * 100 : null
                  const badge = variacaoBadgeDesloc(pct)
                  return (
                    <tr key={m.mes} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 px-4 font-medium">{rotuloMesDesloc(m.mes)}</td>
                      <td className="py-2 px-4 text-right tabular-nums">{m.tempoMedioMinutos.toFixed(1)} min</td>
                      <td className="py-2 px-4 text-right tabular-nums">{m.diasComChecklist}</td>
                      <td className="py-2 px-4 text-right tabular-nums">{m.diasComEstouro}</td>
                      <td className={`py-2 px-4 text-right font-semibold ${badge.cor}`}>{badge.texto}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="border rounded-lg bg-white overflow-hidden">
            <div className="px-4 py-3 border-b text-sm font-semibold">Estouros — com justificativa</div>
            {mesesComEstouro.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum estouro registrado.</p>
            ) : (
              <div className="divide-y">
                {mesesComEstouro.map((m) => (
                  <div key={m.mes}>
                    <div className="px-4 py-2 text-xs font-bold uppercase text-muted-foreground bg-slate-50">{rotuloMesDesloc(m.mes)}</div>
                    {(dados?.estourosPorMes[m.mes] ?? []).map((e) => (
                      <div key={e.data} className="px-4 py-2.5 flex items-start gap-3 border-t">
                        <span className="text-xs font-bold text-muted-foreground w-16 shrink-0 pt-0.5">{formatarDataBR(e.data)}</span>
                        <div className="flex-1 text-sm">
                          <span className="font-bold text-red-600 mr-2">{e.tempoMinutos} min</span>
                          <span className={e.motivo ? 'text-foreground' : 'text-muted-foreground italic'}>{e.motivo || 'Sem justificativa registrada'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function TabelaoDeslocamentoTab({ filial }: { filial: string }) {
  const [dados, setDados] = useState<TabelaoDeslocamento | null>(null)
  const [loading, setLoading] = useState(false)
  const [metrica, setMetrica] = useState<MetricaDesloc>('tempo')
  const [mesesVisiveis, setMesesVisiveis] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')

  useEffect(() => {
    setLoading(true)
    buscarTabelaoDeslocamento(filial).then(setDados).finally(() => setLoading(false))
  }, [filial])

  const todosMeses = dados?.meses ?? []

  useEffect(() => {
    if (todosMeses.length > 0) setMesesVisiveis(new Set(todosMeses))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados])

  function toggleMes(mes: string) {
    setMesesVisiveis((prev) => {
      const novo = new Set(prev)
      if (novo.has(mes)) novo.delete(mes); else novo.add(mes)
      return novo
    })
  }

  const mesesOrdenados = todosMeses.filter((m) => mesesVisiveis.has(m))

  const valorCelula = (porMes: TabelaoDeslocamento['linhas'][number]['porMes'], mes: string): number | null => {
    const v = porMes[mes]
    if (!v) return null
    return valorMesDesloc(v, metrica)
  }

  const linhas = (dados?.linhas ?? [])
    .filter((l) => l.nome.toLowerCase().includes(busca.toLowerCase()))
    .filter((l) => mesesOrdenados.some((mes) => l.porMes[mes] != null))

  const mediaGeralPorMes = mesesOrdenados.map((mes) => {
    const valores = (dados?.linhas ?? []).map((l) => valorCelula(l.porMes, mes)).filter((v): v is number => v != null)
    return valores.length > 0 ? valores.reduce((s, v) => s + v, 0) / valores.length : null
  })

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex items-center flex-wrap gap-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase mr-1">Meses visíveis</label>
          {todosMeses.map((mes) => (
            <button
              key={mes}
              onClick={() => toggleMes(mes)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${mesesVisiveis.has(mes) ? 'bg-accent-500 border-accent-500 text-white' : 'bg-white border text-muted-foreground'}`}
            >
              {rotuloMesDesloc(mes)}
            </button>
          ))}
        </div>
        <div className="flex items-center flex-wrap gap-3">
          <SeletorMetricaDesloc metrica={metrica} onMetrica={setMetrica} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="🔍 Buscar motorista..."
            className="border rounded-md px-3 py-2 text-sm min-w-[220px] focus:outline-none focus:ring-2 focus:ring-accent-500 ml-auto"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Carregando...</div>
      ) : linhas.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Nenhum motorista encontrado.</div>
      ) : mesesOrdenados.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Selecione ao menos um mês pra ver a tabela.</div>
      ) : (
        <div className="border rounded-lg bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                  <th className="sticky left-0 bg-slate-50 py-2 px-4 min-w-[220px]">Motorista</th>
                  {mesesOrdenados.map((mes) => (
                    <th key={mes} className="py-2 px-4 text-right whitespace-nowrap">{rotuloMesDesloc(mes)}</th>
                  ))}
                  <th className="py-2 px-4 text-right">Tendência</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const primeiro = valorCelula(l.porMes, mesesOrdenados[0])
                  const ultimo = valorCelula(l.porMes, mesesOrdenados[mesesOrdenados.length - 1])
                  const pct = primeiro != null && primeiro > 0 && ultimo != null ? ((ultimo - primeiro) / primeiro) * 100 : null
                  const badge = variacaoBadgeDesloc(pct)
                  return (
                    <tr key={l.nome} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="sticky left-0 bg-white py-2 px-4 font-semibold border-r">{l.nome}</td>
                      {mesesOrdenados.map((mes) => {
                        const v = valorCelula(l.porMes, mes)
                        return (
                          <td key={mes} className="py-2 px-4 text-right tabular-nums font-semibold">
                            {v == null ? <span className="text-gray-300">—</span> : fmtMetricaDesloc(v, metrica)}
                          </td>
                        )
                      })}
                      <td className={`py-2 px-4 text-right font-semibold ${badge.cor}`}>{badge.texto}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2">
                  <td className="sticky left-0 bg-slate-50 py-2 px-4 font-bold border-r">Média geral</td>
                  {mediaGeralPorMes.map((v, i) => (
                    <td key={mesesOrdenados[i]} className="py-2 px-4 text-right font-bold tabular-nums bg-slate-50">{v == null ? '—' : fmtMetricaDesloc(v, metrica)}</td>
                  ))}
                  <td className="bg-slate-50" />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-4 py-2.5 text-[11px] text-muted-foreground border-t">"—" indica mês sem checklist pra esse motorista. Motorista sem lançamento nos meses visíveis some da lista.</div>
        </div>
      )}
    </div>
  )
}
