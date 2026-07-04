import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Upload, Loader2, RefreshCw, Link2, CheckCircle, AlertTriangle, Clock,
  Route, Send, Calendar, Settings2, Search,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { parseBeesBuffer, parseRoteirizadorBuffer } from '../lib/tmlParser'
import { enviarMensagemWhatsApp, enviarMensagemGrupo, listarGrupos, type GrupoZApi } from '../lib/zapi'
import { GroupPicker } from './DistribuicaoTMLWhatsappConfig'
import {
  buscarJornadaDoDia, calcularKpis, agruparPorSala, montarMensagemCdd,
  montarMensagemJornadaSala, montarMensagemIvSala, montarMensagemAderenciaSala,
  montarMensagemAlertaAderenciaMotorista, ADERENCIA_MINIMA, JORNADA_LIMITE_MIN,
  SALAS_JORNADA, SALA_JORNADA_LABEL, SALA_JORNADA_PARA_TML, formatarDuracao,
  type LinhaJornada, type SalaJornada, type SituacaoJornada,
} from '../lib/jornada'
import { formatarDataBR } from '../lib/utils'

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatarPct(x: number | null): string {
  return x == null ? '—' : `${Math.round(x * 100)}%`
}

// Indicadores que viram vermelho na tabela quando não estão batendo a meta.
function foraDaMeta(l: LinhaJornada) {
  return {
    aderencia: l.aderencia != null && l.aderencia < ADERENCIA_MINIMA,
    prevChegada: l.tempoPrevMin != null && l.tempoPrevMin > JORNADA_LIMITE_MIN,
    devolucao: l.devolucao > 0,
    foraRaio: l.entregaForaRaio + l.devForaRaio > 0,
    menos4min: l.menos4min > 0,
    not10s: l.not10s > 0,
  }
}

type CampoOrdenacao =
  | 'mapa' | 'saida' | 'previsaoChegada' | 'trRealMin' | 'entregasPrevistas'
  | 'realizadas' | 'pendentes' | 'devolucao' | 'foraRaio' | 'menos4min' | 'not10s'
  | 'aderencia' | 'percConclusao'

const OPCOES_ORDENACAO: { valor: CampoOrdenacao; label: string }[] = [
  { valor: 'mapa', label: 'Mapa' },
  { valor: 'saida', label: 'Saída' },
  { valor: 'previsaoChegada', label: 'Prev. cheg.' },
  { valor: 'trRealMin', label: 'TR Real' },
  { valor: 'entregasPrevistas', label: 'Entregas' },
  { valor: 'realizadas', label: 'Realizadas' },
  { valor: 'pendentes', label: 'Pendentes' },
  { valor: 'devolucao', label: 'Devolução' },
  { valor: 'foraRaio', label: 'F.Raio' },
  { valor: 'menos4min', label: '<4min' },
  { valor: 'not10s', label: 'Not<10s' },
  { valor: 'aderencia', label: 'Aderência' },
  { valor: 'percConclusao', label: '% Concl.' },
]

function valorOrdenacao(l: LinhaJornada, campo: CampoOrdenacao): number {
  switch (campo) {
    case 'mapa': return l.mapa
    case 'saida': {
      const h = l.horaSaidaReal ?? l.horaSaidaPrev
      return h ? Number(h.replace(':', '')) : -1
    }
    case 'previsaoChegada': return l.previsaoChegada ? Number(l.previsaoChegada.replace(':', '')) : -1
    case 'trRealMin': return l.trRealMin ?? -1
    case 'entregasPrevistas': return l.entregasPrevistas ?? -1
    case 'realizadas': return l.realizadas
    case 'pendentes': return l.pendentes ?? -1
    case 'devolucao': return l.devolucao
    case 'foraRaio': return l.entregaForaRaio + l.devForaRaio
    case 'menos4min': return l.menos4min
    case 'not10s': return l.not10s
    case 'aderencia': return l.aderencia ?? -1
    case 'percConclusao': return l.percConclusao ?? -1
  }
}

function SituacaoBadge({ situacao, rotaFinalizada }: { situacao: SituacaoJornada; rotaFinalizada?: boolean }) {
  const selo = rotaFinalizada ? (
    <span title="Confirmado pelo MPD (PC Financeira) — rota já prestou contas" className="ml-1 text-[10px] text-muted-foreground">
      ✓ MPD
    </span>
  ) : null
  if (situacao === 'batendo') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-100">
        <CheckCircle className="h-3 w-3" /> Batendo{selo}
      </span>
    )
  }
  if (situacao === 'nao_bate') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-red-700 bg-red-100">
        <AlertTriangle className="h-3 w-3" /> Não bate{selo}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-gray-700 bg-gray-100">
      <Clock className="h-3 w-3" /> Em rota
    </span>
  )
}

function ImportBox({
  titulo, descricao, onFile, isUploading, statusLine,
}: {
  titulo: string
  descricao: string
  onFile: (file: File) => void
  isUploading: boolean
  statusLine: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="border rounded-lg bg-white p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">{descricao}</p>
      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-accent-500 hover:bg-accent/30 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-accent-500" />
        ) : (
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">{isUploading ? 'Processando...' : 'Clique para importar'}</p>
        <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls ou .csv</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            if (inputRef.current) inputRef.current.value = ''
          }}
        />
      </div>
      {statusLine && <p className="text-xs text-muted-foreground mt-2">{statusLine}</p>}
    </div>
  )
}

// Carta de controle: X = previsão de chegada, Y = % de conclusão da rota.
function CartaControle({ linhas }: { linhas: LinhaJornada[] }) {
  const pontos = linhas
    .map((l) => {
      if (!l.previsaoChegada || l.percConclusao == null) return null
      const [h, m] = l.previsaoChegada.split(':').map(Number)
      return { mapa: l.mapa, minutos: h * 60 + m, concl: l.percConclusao, situacao: l.situacao }
    })
    .filter((p): p is { mapa: number; minutos: number; concl: number; situacao: SituacaoJornada } => p !== null)

  if (pontos.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Sem dados suficientes pra desenhar a carta ainda.</p>
  }

  const minMin = Math.min(...pontos.map((p) => p.minutos)) - 30
  const maxMin = Math.max(...pontos.map((p) => p.minutos)) + 30
  const W = 720, H = 220, padL = 46, padR = 20, padT = 10, padB = 26
  const plotW = W - padL - padR, plotH = H - padT - padB
  const x = (min: number) => padL + ((min - minMin) / Math.max(maxMin - minMin, 1)) * plotW
  const y = (concl: number) => padT + (1 - concl) * plotH

  const cor = (s: SituacaoJornada) => (s === 'batendo' ? '#22c55e' : s === 'nao_bate' ? '#ef4444' : '#eab308')

  const horasEixo: number[] = []
  for (let m = Math.ceil(minMin / 60) * 60; m <= maxMin; m += 60) horasEixo.push(m)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} fontFamily="system-ui" fontSize="10">
      <rect x={padL} y={padT} width={plotW} height={plotH * 0.34} fill="#dcfce7" opacity={0.5} />
      <rect x={padL} y={padT + plotH * 0.34} width={plotW} height={plotH * 0.33} fill="#fef9c3" opacity={0.5} />
      <rect x={padL} y={padT + plotH * 0.67} width={plotW} height={plotH * 0.33} fill="#fee2e2" opacity={0.5} />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#e2e8f0" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#e2e8f0" />
      <text x={padL - 6} y={padT + 4} textAnchor="end" fill="#94a3b8">100%</text>
      <text x={padL - 6} y={H - padB + 4} textAnchor="end" fill="#94a3b8">0%</text>
      {horasEixo.map((m) => (
        <text key={m} x={x(m)} y={H - padB + 14} textAnchor="middle" fill="#94a3b8">
          {String(Math.floor(m / 60) % 24).padStart(2, '0')}:00
        </text>
      ))}
      {pontos.map((p) => (
        <circle key={p.mapa} cx={x(p.minutos)} cy={y(p.concl)} r={4.5} fill={cor(p.situacao)}>
          <title>{`Mapa ${p.mapa} — ${formatarPct(p.concl)} conclusão, prev. ${String(Math.floor(p.minutos / 60)).padStart(2, '0')}:${String(p.minutos % 60).padStart(2, '0')}`}</title>
        </circle>
      ))}
    </svg>
  )
}

export default function JornadaRota() {
  const { usuario } = useAuth()
  const [dataOperacao, setDataOperacao] = useState(hojeISO)
  const [linhas, setLinhas] = useState<LinhaJornada[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingBees, setUploadingBees] = useState(false)
  const [uploadingRot, setUploadingRot] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [filtroSala, setFiltroSala] = useState<SalaJornada | 'todos'>('todos')
  const [ordenarPor, setOrdenarPor] = useState<CampoOrdenacao>('mapa')
  const [ordemDesc, setOrdemDesc] = useState(false)
  const [configAberta, setConfigAberta] = useState(false)
  const [grupoJornada, setGrupoJornada] = useState('')
  const [grupoJornadaOriginal, setGrupoJornadaOriginal] = useState('')
  const [ultimoImportBees, setUltimoImportBees] = useState<string | null>(null)
  const [ultimoImportRot, setUltimoImportRot] = useState<string | null>(null)
  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscandoGrupos, setBuscandoGrupos] = useState(false)
  const [erroGrupos, setErroGrupos] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const fetchJornada = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const lista = await buscarJornadaDoDia(usuario.filial, dataOperacao)
    setLinhas(lista)
    setLoading(false)
  }, [usuario, dataOperacao])

  const fetchConfig = useCallback(async () => {
    if (!usuario) return
    const { data } = await supabase
      .from('filiais')
      .select('grupo_jornada_whatsapp')
      .eq('nome', usuario.filial)
      .maybeSingle()
    const v = data?.grupo_jornada_whatsapp ?? ''
    setGrupoJornada(v)
    setGrupoJornadaOriginal(v)
  }, [usuario])

  async function buscarGruposZapi() {
    setBuscandoGrupos(true)
    setErroGrupos(null)
    const { grupos: gs, erro } = await listarGrupos()
    setBuscandoGrupos(false)
    if (erro) { setErroGrupos(erro); return }
    if (gs.length === 0) { setErroGrupos('Nenhum grupo encontrado nesta instância Z-API.'); return }
    setGrupos(gs.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function copiarId(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiado(id)
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500)
    } catch {
      /* clipboard indisponível */
    }
  }

  const fetchUltimosImports = useCallback(async () => {
    if (!usuario) return
    const [{ data: b }, { data: r }] = await Promise.all([
      supabase.from('jornada_bees').select('importado_em').eq('filial', usuario.filial).eq('data', dataOperacao).order('importado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('jornada_roteirizador').select('importado_em').eq('filial', usuario.filial).eq('data', dataOperacao).order('importado_em', { ascending: false }).limit(1).maybeSingle(),
    ])
    setUltimoImportBees(b?.importado_em ?? null)
    setUltimoImportRot(r?.importado_em ?? null)
  }, [usuario, dataOperacao])

  useEffect(() => { fetchJornada() }, [fetchJornada])
  useEffect(() => { fetchConfig() }, [fetchConfig])
  useEffect(() => { fetchUltimosImports() }, [fetchUltimosImports])

  async function handleImportarBees(file: File) {
    if (!usuario) return
    setUploadingBees(true)
    setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const agregados = parseBeesBuffer(buffer)
      if (agregados.length === 0) {
        throw new Error('Nenhum registro encontrado na planilha. Confira se é o export do BEES (Tracking).')
      }

      const agora = new Date().toISOString()
      const rows = agregados.map((a) => ({
        filial: usuario.filial,
        mapa: a.mapa,
        data: dataOperacao,
        realizadas: a.realizadas,
        devolucao: a.devolucao,
        repasse: a.repasse,
        entrega_fora_raio: a.entregaForaRaio,
        dev_fora_raio: a.devForaRaio,
        menos_4min: a.menos4min,
        not_10s: a.not10s,
        tempo_real_medio_min: a.tempoRealMedioMin,
        ultima_finalizacao: a.ultimaFinalizacao,
        importado_em: agora,
      }))
      const { error } = await supabase.from('jornada_bees').upsert(rows, { onConflict: 'filial,mapa,data' })
      if (error) throw new Error(error.message)

      await fetchJornada()
      await fetchUltimosImports()

      // Envio automático a cada import do BEES (Tracking), conforme combinado.
      await enviarMensagensAutomatico()

      alert(`${agregados.length} mapa(s) atualizado(s) a partir do BEES. Mensagens enviadas por sala + resumo do CDD.`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar o BEES')
    } finally {
      setUploadingBees(false)
    }
  }

  async function handleImportarRoteirizador(file: File) {
    if (!usuario) return
    setUploadingRot(true)
    setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const linhasArquivo = parseRoteirizadorBuffer(buffer)
      if (linhasArquivo.length === 0) {
        throw new Error('Nenhuma placa encontrada na planilha. Confira se é o export do Roteirizador.')
      }

      // O Roteirizador não traz o mapa — casa por placa com a escala do
      // mesmo dia (mesma lógica que a planilha original faz por VLOOKUP).
      const placas = [...new Set(linhasArquivo.map((l) => l.placa))]
      const { data: escalas } = await supabase
        .from('escalas_tml')
        .select('mapa, placa')
        .eq('filial', usuario.filial)
        .eq('data_entrega', dataOperacao)
        .in('placa', placas)
      const mapaPorPlaca = new Map((escalas ?? []).map((e) => [e.placa, e.mapa]))

      const agora = new Date().toISOString()
      const rows: { filial: string; mapa: number; placa: string; data: string; tempo_dirigindo_min: number | null; importado_em: string }[] = []
      let semMapa = 0
      for (const l of linhasArquivo) {
        const mapa = mapaPorPlaca.get(l.placa)
        if (mapa == null) { semMapa++; continue }
        rows.push({ filial: usuario.filial, mapa, placa: l.placa, data: dataOperacao, tempo_dirigindo_min: l.tempoDirigindoMin, importado_em: agora })
      }
      if (rows.length === 0) {
        throw new Error('Nenhuma placa do Roteirizador bateu com a escala do dia. Importe a escala (03.11.49.02) antes.')
      }

      const { error } = await supabase.from('jornada_roteirizador').upsert(rows, { onConflict: 'filial,mapa,data' })
      if (error) throw new Error(error.message)

      await fetchJornada()
      await fetchUltimosImports()

      alert(
        `${rows.length} rota(s) do Roteirizador vinculada(s) ao mapa do dia.` +
        (semMapa > 0 ? `\n\n⚠️ ${semMapa} placa(s) não encontrada(s) na escala de ${formatarDataBR(dataOperacao)}.` : '')
      )
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar o Roteirizador')
    } finally {
      setUploadingRot(false)
    }
  }

  // Reusa os dados já calculados no estado, sem precisar buscar de novo —
  // chamado tanto pelo botão manual quanto automaticamente após o import.
  async function enviarMensagensAutomatico() {
    if (!usuario) return
    const lista = await buscarJornadaDoDia(usuario.filial, dataOperacao)
    const porSala = agruparPorSala(lista)

    for (const sala of SALAS_JORNADA) {
      const linhasSala = porSala.get(sala) ?? []
      if (linhasSala.length === 0) continue
      const salaTml = SALA_JORNADA_PARA_TML[sala]
      if (!salaTml) continue
      const { data: supervisores } = await supabase
        .from('supervisores_tml')
        .select('telefone')
        .eq('filial', usuario.filial)
        .eq('sala', salaTml)

      // 3 mensagens curtas por sala — cada uma só com o Top 5 do seu
      // indicador, em vez de uma mensagem única com tudo.
      const msgJornada = montarMensagemJornadaSala(sala, linhasSala, dataOperacao)
      const msgIv = montarMensagemIvSala(sala, linhasSala, dataOperacao)
      const msgAderencia = montarMensagemAderenciaSala(sala, linhasSala, dataOperacao)
      for (const sup of supervisores ?? []) {
        await enviarMensagemWhatsApp(sup.telefone, msgJornada)
        await enviarMensagemWhatsApp(sup.telefone, msgIv)
        await enviarMensagemWhatsApp(sup.telefone, msgAderencia)
      }
    }

    // Alerta direto pro motorista (não pro supervisor) quando a aderência
    // do próprio mapa fica abaixo da meta de 95%.
    for (const l of lista) {
      if (l.aderencia == null || l.aderencia >= ADERENCIA_MINIMA) continue
      if (!l.telefone) continue
      await enviarMensagemWhatsApp(l.telefone, montarMensagemAlertaAderenciaMotorista(l, dataOperacao))
    }

    const { data: filialRow } = await supabase
      .from('filiais')
      .select('grupo_jornada_whatsapp')
      .eq('nome', usuario.filial)
      .maybeSingle()
    if (filialRow?.grupo_jornada_whatsapp) {
      await enviarMensagemGrupo(filialRow.grupo_jornada_whatsapp, montarMensagemCdd(porSala, dataOperacao))
    }
  }

  async function handleEnviarManual() {
    setEnviando(true)
    setErro('')
    try {
      await enviarMensagensAutomatico()
      alert('Mensagens enviadas por sala + resumo do CDD.')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar mensagens')
    } finally {
      setEnviando(false)
    }
  }

  async function handleSalvarGrupo() {
    if (!usuario) return
    const v = grupoJornada.trim()
    await supabase.from('filiais').update({ grupo_jornada_whatsapp: v || null }).eq('nome', usuario.filial)
    setGrupoJornadaOriginal(v)
    alert('Grupo salvo.')
  }

  const kpis = useMemo(() => calcularKpis(linhas), [linhas])
  const porSala = useMemo(() => agruparPorSala(linhas), [linhas])
  const linhasFiltradas = useMemo(() => {
    const base = filtroSala === 'todos' ? linhas : linhas.filter((l) => l.sala === filtroSala)
    const sinal = ordemDesc ? -1 : 1
    return [...base].sort((a, b) => sinal * (valorOrdenacao(a, ordenarPor) - valorOrdenacao(b, ordenarPor)))
  }, [linhas, filtroSala, ordenarPor, ordemDesc])
  // Sem tempo previsto/entregas previstas não dá pra calcular previsão de
  // chegada, aderência nem % conclusão — geralmente porque essa escala foi
  // importada antes do parser ler essas 3 colunas novas.
  const semDadosDePlano = useMemo(
    () => linhas.filter((l) => l.tempoPrevMin == null || l.entregasPrevistas == null).length,
    [linhas],
  )

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Distribuição</p>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Route className="h-5 w-5 text-accent-600" /> Jornada e Tempo em Rota
          </h1>
          <p className="text-sm text-muted-foreground">
            Escala e saída já vêm de{' '}
            <Link to="/distribuicao/tml" className="text-accent-600 underline">Distribuição → Carta de Controle TML</Link>
            {' '}(sempre a importação mais recente do dia). Aqui só sobem BEES e Roteirizador.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setConfigAberta((v) => !v)} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <Settings2 className="h-4 w-4" /> Config. WhatsApp
          </button>
          <button
            onClick={handleEnviarManual}
            disabled={enviando || linhas.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-sm transition-colors"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar por sala + CDD
          </button>
          <button onClick={fetchJornada} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}

      {!loading && semDadosDePlano > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {semDadosDePlano} mapa(s) sem tempo previsto/entregas previstas — por isso a previsão de chegada,
            a aderência e o % de conclusão ficam vazios pra eles. Isso acontece quando a escala foi importada
            antes dessas 3 colunas existirem. Reimporte a escala de hoje (03.11.49.02) em{' '}
            <Link to="/distribuicao/tml" className="underline font-medium">Carta de Controle TML</Link> pra corrigir.
          </span>
        </div>
      )}

      {configAberta && (
        <div className="border rounded-lg bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <label className="block text-sm font-medium">Grupo de WhatsApp — resumo do CDD</label>
              <p className="text-xs text-muted-foreground mt-0.5">
                O envio por sala já usa o telefone de cada supervisor cadastrado em{' '}
                <Link to="/distribuicao/tml/supervisores" className="text-accent-600 underline">Supervisores TML</Link>.
                Este grupo recebe só o resumo consolidado do CDD.
              </p>
            </div>
            <button
              onClick={buscarGruposZapi}
              disabled={buscandoGrupos}
              className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50 shrink-0"
            >
              {buscandoGrupos ? <Loader2 className="h-4 w-4 animate-spin" /> : grupos.length > 0 ? <RefreshCw className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              {buscandoGrupos ? 'Buscando…' : grupos.length > 0 ? 'Atualizar grupos' : 'Buscar grupos (Z-API)'}
            </button>
          </div>

          {erroGrupos && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="break-all">{erroGrupos}</span>
            </div>
          )}

          <GroupPicker
            label="Grupo do resumo do CDD"
            value={grupoJornada}
            onChange={setGrupoJornada}
            grupos={grupos}
            onCopy={copiarId}
            copiado={copiado}
          />

          <div className="flex justify-end">
            <button
              onClick={handleSalvarGrupo}
              disabled={grupoJornada.trim() === grupoJornadaOriginal}
              className="px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      <div className="border rounded-lg bg-white px-4 py-3 flex flex-wrap items-center gap-3">
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <label className="text-sm font-medium whitespace-nowrap">Data da operação</label>
        <input
          type="date"
          value={dataOperacao}
          onChange={(e) => setDataOperacao(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        />
        <p className="text-xs text-muted-foreground">Usada nos imports do BEES e do Roteirizador desta tela.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ImportBox
          titulo="1. BEES (Tracking AMBEV)"
          descricao="Execução das entregas por PDV. Ao importar, envia automaticamente por sala + resumo do CDD."
          onFile={handleImportarBees}
          isUploading={uploadingBees}
          statusLine={ultimoImportBees ? `Atualizado às ${new Date(ultimoImportBees).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Ainda não importado hoje'}
        />
        <ImportBox
          titulo="2. Roteirizador"
          descricao="Tempo planejado por placa — base da previsão de chegada e da dispersão de tempo."
          onFile={handleImportarRoteirizador}
          isUploading={uploadingRot}
          statusLine={ultimoImportRot ? `Atualizado às ${new Date(ultimoImportRot).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Ainda não importado hoje'}
        />
        <div className="border rounded-lg bg-white p-4">
          <h3 className="text-sm font-semibold">3. Escala + saída (03.11.49.02 / 03.11.20)</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">Plano e horário real de saída — vêm de outra tela.</p>
          <div className="border rounded-lg bg-muted/40 p-6 text-center">
            <Link2 className="h-6 w-6 mx-auto mb-2 text-accent-600" />
            <p className="text-sm font-medium">Sincronizado automaticamente</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sempre lê a importação mais recente do dia — nada a subir aqui.
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{linhas.length} mapa(s) hoje</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Mapas</p>
          <p className="text-2xl font-bold">{kpis.mapas}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Prev. chegada média</p>
          <p className="text-2xl font-bold">{kpis.previsaoChegadaMedia ?? '—'}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Entregas</p>
          <p className="text-2xl font-bold">{kpis.entregasRealizadas}<span className="text-sm font-normal text-muted-foreground">/{kpis.entregasTotal}</span></p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">% conclusão rota</p>
          <p className="text-2xl font-bold">{formatarPct(kpis.percConclusaoMedio)}</p>
        </div>
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-sm">Carta de controle da jornada</h2>
            <p className="text-xs text-muted-foreground">Cada bolinha é um mapa — previsão de chegada × % de conclusão</p>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Batendo</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" /> Em rota</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Não bate</span>
          </div>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
          ) : (
            <CartaControle linhas={linhas} />
          )}
        </div>
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-sm">Relatório por mapa</h2>
        </div>
        <div className="px-4 py-2 border-b flex flex-wrap items-center gap-1.5">
          {([
            ['todos', `Todas (${linhas.length})`],
            ...SALAS_JORNADA.map((s) => [s, `${SALA_JORNADA_LABEL[s]} (${(porSala.get(s) ?? []).length})`] as const),
          ] as const).map(([valor, label]) => (
            <button
              key={valor}
              onClick={() => setFiltroSala(valor as SalaJornada | 'todos')}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                filtroSala === valor ? 'bg-accent-500 text-white border-accent-500' : 'hover:bg-accent'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Ordenar por</label>
            <select
              value={ordenarPor}
              onChange={(e) => setOrdenarPor(e.target.value as CampoOrdenacao)}
              className="px-2 py-1 border border-gray-200 rounded-md text-xs bg-white"
            >
              {OPCOES_ORDENACAO.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setOrdemDesc((v) => !v)}
              title={ordemDesc ? 'Decrescente' : 'Crescente'}
              className="px-2 py-1 rounded-md border text-xs hover:bg-accent transition-colors"
            >
              {ordemDesc ? '↓ Desc.' : '↑ Cresc.'}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
        ) : linhasFiltradas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum mapa. Importe a escala do dia em Carta de Controle TML e depois o BEES aqui.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Mapa</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Placa</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Motorista</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Sala</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Saída</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Prev. cheg.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">TR Real</th>
                  <th className="text-left px-2 py-2 font-medium text-muted-foreground">Bate Jornada?</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Entr.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Realiz.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Pend.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Devol.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">F.Raio</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">&lt;4min</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Not&lt;10s</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">Aderênc.</th>
                  <th className="text-right px-2 py-2 font-medium text-muted-foreground">% Concl.</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhasFiltradas.map((l) => {
                  const alerta = foraDaMeta(l)
                  const ruim = 'text-red-600 font-semibold'
                  return (
                  <tr key={l.mapa} className={`hover:bg-muted/30 transition-colors ${l.situacao === 'nao_bate' ? 'bg-red-50/40' : ''}`}>
                    <td className="px-2 py-1.5">{l.mapa}</td>
                    <td className="px-2 py-1.5 font-mono font-semibold">{l.placa ?? '—'}</td>
                    <td className="px-2 py-1.5">{l.nome ?? '—'}</td>
                    <td className="px-2 py-1.5">{SALA_JORNADA_LABEL[l.sala]}</td>
                    <td className="px-2 py-1.5">{l.horaSaidaReal ?? l.horaSaidaPrev ?? '—'}</td>
                    <td className={`px-2 py-1.5 ${alerta.prevChegada ? ruim : ''}`}>{l.previsaoChegada ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right">{l.trRealMin != null ? formatarDuracao(l.trRealMin) : '—'}</td>
                    <td className="px-2 py-1.5"><SituacaoBadge situacao={l.situacao} rotaFinalizada={l.rotaFinalizada} /></td>
                    <td className="px-2 py-1.5 text-right">{l.entregasPrevistas ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right">{l.realizadas}</td>
                    <td className="px-2 py-1.5 text-right">{l.pendentes ?? '—'}</td>
                    <td className={`px-2 py-1.5 text-right ${alerta.devolucao ? ruim : ''}`}>{l.devolucao}</td>
                    <td className={`px-2 py-1.5 text-right ${alerta.foraRaio ? ruim : ''}`}>{l.entregaForaRaio + l.devForaRaio}</td>
                    <td className={`px-2 py-1.5 text-right ${alerta.menos4min ? ruim : ''}`}>{l.menos4min}</td>
                    <td className={`px-2 py-1.5 text-right ${alerta.not10s ? ruim : ''}`}>{l.not10s}</td>
                    <td className={`px-2 py-1.5 text-right ${alerta.aderencia ? ruim : ''}`}>{formatarPct(l.aderencia)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{formatarPct(l.percConclusao)}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
