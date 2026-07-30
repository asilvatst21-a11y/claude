import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import html2canvas from 'html2canvas'
import * as XLSX from 'xlsx'
import {
  ArrowLeft, RefreshCw, Loader2, Upload, CheckCircle2, AlertTriangle, Send, Settings, GraduationCap,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { enviarImagemGrupo, enviarMensagemGrupo, listarGrupos, type GrupoZApi } from '../lib/zapi'
import { GroupPicker } from './DistribuicaoTMLWhatsappConfig'
import { formatarDataBR } from '../lib/utils'
import {
  KPIS_FECHAMENTO, type KpiFechamento, type SalaFechamento, type ParametroFechamento,
  recalcularAutomaticos, recalcularAutomaticosPeriodo, primeiroDiaDoMes, salvarValorManual, diasDaSemanaAte, buscarValoresFechamento, buscarParametros,
  farolDoValor, gerarFarolAutomatico, classificarResultado, montarTextosOrientacao, type LinhaFarolMotorista, type CriterioFarol, type TierFarol,
  diagnosticarDeslocamento, type DiagnosticoDeslocamentoDia,
  parseDevolucaoPdv, salvarDevolucoesPdv, parseMapasDia, salvarMapasDia,
  enviarConvitesGatilho, buscarStatusPendenciasPorMapa,
} from '../lib/fechamentoDia'

const SALAS: SalaFechamento[] = ['COLORADO', 'SUB-FURIA', 'CDD']
const SALA_LABEL: Record<SalaFechamento, string> = { COLORADO: 'Sala Colorado', 'SUB-FURIA': 'Sala Sub-Fúria', CDD: 'CDD Petrópolis (consolidado)' }

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatarValor(valor: number | null, kpi: KpiFechamento): string {
  if (valor == null) return '—'
  const def = KPIS_FECHAMENTO.find((k) => k.key === kpi)!
  if (def.unidade === 'percentual') return `${(valor * 100).toFixed(kpi === 'devolucao_pdv' ? 2 : 1)}%`
  if (def.unidade === 'minutos') return `${valor >= 0 ? '' : '-'}${Math.abs(Math.round(valor))} min`
  return valor.toFixed(2)
}

const FAROL_COR: Record<'g' | 'a' | 'r', string> = { g: '#2E9E63', a: '#D9A027', r: '#D14B42' }
const FAROL_BG: Record<'g' | 'a' | 'r', string> = { g: '#EAF7EF', a: '#FDF5E3', r: '#FCEDEC' }

const TIER_LABEL: Record<TierFarol, string> = { destaque: 'Destaque', meta: 'Meta', atencao: 'Atenção', bate_papo: 'Bate-papo' }
const TIER_COR: Record<TierFarol, string> = { destaque: '#2E9E63', meta: '#3F6FB0', atencao: '#D9A027', bate_papo: '#D14B42' }
const TIER_BG: Record<TierFarol, string> = { destaque: '#EAF7EF', meta: '#EAF1FB', atencao: '#FDF5E3', bate_papo: '#FCEDEC' }

function CriterioChip({ criterio, kpi }: { criterio: CriterioFarol; kpi: KpiFechamento }) {
  if (criterio.tier == null) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ color: TIER_COR[criterio.tier], background: TIER_BG[criterio.tier] }}
    >
      {criterio.valor != null ? formatarValor(criterio.valor, kpi) : ''} · {TIER_LABEL[criterio.tier]}
    </span>
  )
}

export default function FechamentoDia() {
  const { usuario } = useAuth()
  const [data, setData] = useState(hojeISO())
  const [aba, setAba] = useState<'painel' | 'farol' | 'parametros'>('painel')

  const [parametros, setParametros] = useState<ParametroFechamento[]>([])
  const [valores, setValores] = useState<Record<string, Record<string, number | null>>>({}) // `${sala}|${dataDia}` -> {kpi: valor}
  const [acumMes, setAcumMes] = useState<Record<string, Record<string, number | null>>>({})
  const [loading, setLoading] = useState(true)
  const [recalculando, setRecalculando] = useState(false)
  const [recalculandoMes, setRecalculandoMes] = useState(false)
  const [progressoMes, setProgressoMes] = useState<string | null>(null)
  const [salaAtiva, setSalaAtiva] = useState<SalaFechamento>('COLORADO')

  const [manuais, setManuais] = useState<Record<string, string>>({}) // `${sala}|${kpi}` -> string digitada
  const [salvandoManual, setSalvandoManual] = useState<string | null>(null)
  const [uploads, setUploads] = useState<{ devolucao_pdv?: File; rating?: File }>({})
  const [enviandoUpload, setEnviandoUpload] = useState<string | null>(null)

  const [farolLinhas, setFarolLinhas] = useState<(LinhaFarolMotorista & { resultado: string })[]>([])
  const [processandoFarol, setProcessandoFarol] = useState(false)
  const [salvandoFarol, setSalvandoFarol] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [envioOk, setEnvioOk] = useState(false)

  const [diagnostico, setDiagnostico] = useState<DiagnosticoDeslocamentoDia[] | null>(null)
  const [diagnosticando, setDiagnosticando] = useState(false)

  const [enviandoConvites, setEnviandoConvites] = useState(false)
  const [resultadoConvites, setResultadoConvites] = useState<{ enviados: number; semTelefone: number; falhaEnvio: number } | null>(null)
  const [statusPendencias, setStatusPendencias] = useState<Map<number, { total: number; respondidas: number }>>(new Map())

  const [enviandoDevolucao, setEnviandoDevolucao] = useState(false)
  const [devolucaoMsg, setDevolucaoMsg] = useState<string | null>(null)

  const [enviandoMapas, setEnviandoMapas] = useState(false)
  const [mapasMsg, setMapasMsg] = useState<string | null>(null)
  const [mapasMsgAviso, setMapasMsgAviso] = useState(false)

  const refColorado = useRef<HTMLDivElement>(null)
  const refSubFuria = useRef<HTMLDivElement>(null)
  const refCdd = useRef<HTMLDivElement>(null)

  const dias = useMemo(() => diasDaSemanaAte(data), [data])

  const fetchTudo = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const [params, valoresResp] = await Promise.all([
      buscarParametros(usuario.filial),
      buscarValoresFechamento(usuario.filial, data),
    ])
    setParametros(params)
    if (valoresResp.erro) setErro(`Erro ao carregar os valores: ${valoresResp.erro}`)
    const mapa: Record<string, Record<string, number | null>> = {}
    for (const v of valoresResp.semana) {
      const chave = `${v.sala}|${v.data}`
      mapa[chave] ??= {}
      mapa[chave][v.kpi] = v.valor
    }
    setValores(mapa)
    setAcumMes(valoresResp.acumMes as any)
    setLoading(false)
  }, [usuario, data])

  useEffect(() => { fetchTudo() }, [fetchTudo])

  useEffect(() => {
    if (!usuario) return
    buscarStatusPendenciasPorMapa(usuario.filial, data).then(setStatusPendencias)
  }, [usuario, data])

  async function recalcular() {
    if (!usuario) return
    setRecalculando(true)
    setErro('')
    const { error } = await recalcularAutomaticos(usuario.filial, data)
    if (error) setErro(`Erro ao recalcular ${formatarDataBR(data)}: ${error}`)
    await fetchTudo()
    setRecalculando(false)
  }

  async function recalcularMesInteiro() {
    if (!usuario) return
    setRecalculandoMes(true)
    setProgressoMes(null)
    setErro('')
    const { erros } = await recalcularAutomaticosPeriodo(usuario.filial, primeiroDiaDoMes(data), data, (feito, total, dia) => {
      setProgressoMes(`${feito}/${total} — ${formatarDataBR(dia)}`)
    })
    if (erros.length > 0) {
      setErro(`${erros.length} dia(s) falharam ao recalcular: ${erros.map((e) => `${formatarDataBR(e.dia)} (${e.mensagem})`).join('; ')}`)
    }
    await fetchTudo()
    setProgressoMes(null)
    setRecalculandoMes(false)
  }

  async function rodarDiagnosticoDeslocamento() {
    if (!usuario) return
    setDiagnosticando(true)
    const { dias: diagDias, erro: erroDiag } = await diagnosticarDeslocamento(usuario.filial, dias[0], data)
    if (erroDiag) setErro(`Erro no diagnóstico: ${erroDiag}`)
    setDiagnostico(diagDias)
    setDiagnosticando(false)
  }

  async function processarArquivoDevolucaoPdv(file: File) {
    if (!usuario) return
    setEnviandoDevolucao(true)
    setDevolucaoMsg(null)
    setErro('')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][]
      const parsed = parseDevolucaoPdv(linhas)
      if (parsed.length === 0) {
        setErro('Não encontrei linhas válidas (Mapa/Data) nesse arquivo.')
        return
      }
      const datasDoArquivo = [...new Set(parsed.map((l) => l.data))].sort()
      const { error: erroSalvar } = await salvarDevolucoesPdv(usuario.filial, parsed)
      if (erroSalvar) {
        setErro(`Erro ao salvar as devoluções: ${erroSalvar}`)
        return
      }
      const { erros } = await recalcularAutomaticosPeriodo(usuario.filial, primeiroDiaDoMes(data), data)
      if (erros.length > 0) {
        setErro(`${erros.length} dia(s) falharam ao recalcular Devolução PDV: ${erros.map((e) => formatarDataBR(e.dia)).join(', ')}`)
      }
      setDevolucaoMsg(`${parsed.length} devoluções processadas (datas no arquivo: ${formatarDataBR(datasDoArquivo[0])} a ${formatarDataBR(datasDoArquivo[datasDoArquivo.length - 1])}) — recalculado até ${formatarDataBR(data)}.`)
      await fetchTudo()
    } finally {
      setEnviandoDevolucao(false)
    }
  }

  async function processarArquivoMapasDia(file: File) {
    if (!usuario) return
    setEnviandoMapas(true)
    setMapasMsg(null)
    setErro('')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][]
      const parsed = parseMapasDia(linhas)
      if (parsed.length === 0) {
        setErro('Não encontrei linhas válidas (Mapa/Data Entrega) nesse arquivo 03.11.49.02.')
        return
      }
      const datasDoArquivo = [...new Set(parsed.map((l) => l.data))].sort()
      const { error: erroSalvar, diagnostico } = await salvarMapasDia(usuario.filial, parsed)
      if (erroSalvar) {
        setErro(`Erro ao salvar os mapas do dia: ${erroSalvar}`)
        return
      }
      const { erros } = await recalcularAutomaticosPeriodo(usuario.filial, primeiroDiaDoMes(data), data)
      if (erros.length > 0) {
        setErro(`${erros.length} dia(s) falharam ao recalcular Jornada Líquida/Devolução PDV: ${erros.map((e) => formatarDataBR(e.dia)).join(', ')}`)
      }
      let msg = `${parsed.length} mapas processados (datas no arquivo: ${formatarDataBR(datasDoArquivo[0])} a ${formatarDataBR(datasDoArquivo[datasDoArquivo.length - 1])}) — recalculado até ${formatarDataBR(data)}.`
      let aviso = false
      if (diagnostico && diagnostico.semSala > 0) {
        aviso = true
        msg += ` ⚠️ ${diagnostico.semSala} de ${diagnostico.total} mapa(s) ficaram sem sala reconhecida (não contam pra Jornada Líquida/Devolução PDV)`
        if (diagnostico.matriculasNaoEncontradas.length > 0) {
          msg += ` — matrícula(s) não cadastrada(s) em Distribuição TML › Motoristas: ${diagnostico.matriculasNaoEncontradas.join(', ')}`
        }
        msg += '.'
      }
      setMapasMsgAviso(aviso)
      setMapasMsg(msg)
      await fetchTudo()
    } finally {
      setEnviandoMapas(false)
    }
  }

  async function salvarManual(sala: SalaFechamento, kpi: KpiFechamento) {
    if (!usuario) return
    const chave = `${sala}|${kpi}`
    const bruto = manuais[chave]
    if (bruto == null || bruto.trim() === '') return
    const def = KPIS_FECHAMENTO.find((k) => k.key === kpi)!
    let valor = parseFloat(bruto.replace(',', '.'))
    if (!Number.isFinite(valor)) return
    if (def.unidade === 'percentual') valor = valor / 100
    setSalvandoManual(chave)
    await salvarValorManual(usuario.filial, sala, data, kpi, valor)
    setSalvandoManual(null)
    await fetchTudo()
  }

  async function enviarUpload(tipo: 'devolucao_pdv' | 'rating') {
    if (!usuario) return
    const file = uploads[tipo]
    if (!file) return
    setEnviandoUpload(tipo)
    const path = `${usuario.filial}/${data}/${tipo}-${Date.now()}-${file.name}`
    const { error: errUp } = await supabase.storage.from('fechamento-dia').upload(path, file, { upsert: true })
    if (!errUp) {
      await supabase.from('fechamento_dia_uploads').insert({
        filial: usuario.filial, data, tipo, arquivo_nome: file.name, arquivo_path: path, enviado_por: usuario.nome ?? null,
      })
    } else {
      setErro(`Erro ao subir o arquivo: ${errUp.message}`)
    }
    setEnviandoUpload(null)
  }

  async function gerarFarolDoDia() {
    if (!usuario) return
    setProcessandoFarol(true)
    setErro('')
    try {
      const linhas = await gerarFarolAutomatico(usuario.filial, data, parametros)
      setFarolLinhas(linhas.map((l) => ({ ...l, resultado: classificarResultado(l) })))
    } catch (e) {
      setErro(`Erro ao gerar o Farol: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setProcessandoFarol(false)
    }
  }

  async function salvarFarol() {
    if (!usuario || farolLinhas.length === 0) return
    setSalvandoFarol(true)
    await supabase.from('fechamento_dia_farol_motoristas').delete().eq('filial', usuario.filial).eq('data', data)
    await supabase.from('fechamento_dia_farol_motoristas').insert(
      farolLinhas.map((l) => ({
        filial: usuario.filial, data, matricula: l.matricula, nome: l.nome, sala: l.sala,
        aderencia_tier: l.aderencia.tier, aderencia_valor: l.aderencia.valor,
        tml_tier: l.tml.tier, tml_valor: l.tml.valor,
        devolucao_tier: l.devolucao.tier, devolucao_valor: l.devolucao.valor,
        iv_deslocamento_tier: l.ivDeslocamento.tier, iv_deslocamento_valor: l.ivDeslocamento.valor,
        resultado: l.resultado,
      })),
    )
    setSalvandoFarol(false)
    if (usuario) setStatusPendencias(await buscarStatusPendenciasPorMapa(usuario.filial, data))
  }

  async function enviarConvitesDoDia() {
    if (!usuario || farolLinhas.length === 0) return
    setEnviandoConvites(true)
    setResultadoConvites(null)
    setErro('')
    try {
      const resultado = await enviarConvitesGatilho(usuario.filial, data, farolLinhas)
      setResultadoConvites(resultado)
      setStatusPendencias(await buscarStatusPendenciasPorMapa(usuario.filial, data))
    } catch (e) {
      setErro(`Erro ao enviar os convites de bate-papo: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEnviandoConvites(false)
    }
  }

  const textosPorSala = useMemo(() => {
    const out: Record<string, { destaques: string; batePapo: string }> = {}
    for (const sala of ['COLORADO', 'SUB-FURIA'] as const) {
      const linhas = farolLinhas.filter((l) => l.sala === sala)
      out[sala] = montarTextosOrientacao(linhas, SALA_LABEL[sala], formatarDataBR(data), statusPendencias)
    }
    return out
  }, [farolLinhas, data, statusPendencias])

  async function confirmarEEnviar() {
    if (!usuario) return
    setEnviando(true)
    setErro('')
    try {
      const { data: filialRow } = await supabase
        .from('filiais')
        .select('grupo_fechamento_whatsapp')
        .eq('nome', usuario.filial)
        .maybeSingle()
      const grupo = filialRow?.grupo_fechamento_whatsapp

      if (!grupo) {
        setErro('Configure o grupo de WhatsApp do Fechamento na aba Parâmetros antes de enviar.')
        return
      }

      const alvos: { ref: React.RefObject<HTMLDivElement | null>; legenda: string }[] = [
        { ref: refColorado, legenda: `📊 Fechamento do Dia — Sala Colorado — ${formatarDataBR(data)}` },
        { ref: refSubFuria, legenda: `📊 Fechamento do Dia — Sala Sub-Fúria — ${formatarDataBR(data)}` },
        { ref: refCdd, legenda: `📊 Fechamento do Dia — CDD Petrópolis — ${formatarDataBR(data)}` },
      ]

      for (const alvo of alvos) {
        if (!alvo.ref.current) continue
        const canvas = await html2canvas(alvo.ref.current, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true, logging: false })
        const img = canvas.toDataURL('image/png')
        const { sucesso, erro: erroEnvio } = await enviarImagemGrupo(grupo, img, alvo.legenda)
        await supabase.from('disparos').insert({ filial: usuario.filial, whatsapp: grupo, mensagem: alvo.legenda, status: sucesso ? 'enviado' : 'erro', erro: erroEnvio ?? null })
      }

      // Texto de orientação (destaques + bate-papo das duas salas), no mesmo grupo único.
      const textoOrientacao = [
        textosPorSala.COLORADO?.destaques, textosPorSala.COLORADO?.batePapo,
        textosPorSala['SUB-FURIA']?.destaques, textosPorSala['SUB-FURIA']?.batePapo,
      ].filter(Boolean).join('\n\n')
      if (textoOrientacao) {
        const { sucesso, erro: erroEnvio } = await enviarMensagemGrupo(grupo, textoOrientacao)
        await supabase.from('disparos').insert({ filial: usuario.filial, whatsapp: grupo, mensagem: textoOrientacao, status: sucesso ? 'enviado' : 'erro', erro: erroEnvio ?? null })
      }

      await supabase.from('fechamento_dia_envios').upsert({
        filial: usuario.filial, data, status: 'enviado', confirmado_por: usuario.nome ?? null, confirmado_em: new Date().toISOString(),
        texto_destaques: [textosPorSala.COLORADO?.destaques, textosPorSala['SUB-FURIA']?.destaques].filter(Boolean).join('\n\n'),
        texto_bate_papo: [textosPorSala.COLORADO?.batePapo, textosPorSala['SUB-FURIA']?.batePapo].filter(Boolean).join('\n\n'),
      }, { onConflict: 'filial,data' })

      setEnvioOk(true)
      setTimeout(() => setEnvioOk(false), 4000)
    } catch (e) {
      setErro(`Erro ao enviar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEnviando(false)
    }
  }

  if (!usuario) return null

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <Link to="/distribuicao" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="flex items-center gap-2 mt-1 flex-wrap justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold">Fechamento do Dia</h1>
          </div>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="px-3 py-2 text-sm border rounded-md" />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Confira os KPIs de hoje (semana até agora + acumulado do mês) e envie as imagens de fechamento pro grupo, junto com o texto de destaques e bate-papo.
        </p>
      </div>

      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
        <button onClick={() => setAba('painel')} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${aba === 'painel' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'}`}>Painel</button>
        <button onClick={() => setAba('farol')} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${aba === 'farol' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'}`}>Farol Motoristas</button>
        <button onClick={() => setAba('parametros')} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${aba === 'parametros' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'}`}>Parâmetros</button>
      </div>

      {erro && <p className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 bg-red-50 rounded-md p-2"><AlertTriangle className="h-3.5 w-3.5" /> {erro}</p>}

      {aba === 'painel' && (
        <>
          {/* Relatórios do dia */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-sm">Relatórios do dia</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {progressoMes && <span className="text-[11px] text-muted-foreground">{progressoMes}</span>}
                <button onClick={recalcularMesInteiro} disabled={recalculandoMes || recalculando} title="Recalcula dia por dia desde o início do mês — útil se os dias anteriores nunca foram recalculados" className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border hover:bg-accent disabled:opacity-50">
                  {recalculandoMes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Recalcular o mês inteiro
                </button>
                <button onClick={recalcular} disabled={recalculando || recalculandoMes} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border hover:bg-accent disabled:opacity-50">
                  {recalculando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Recalcular só hoje
                </button>
                <button onClick={rodarDiagnosticoDeslocamento} disabled={diagnosticando} title="Mostra quantas linhas de checklist_tml existem por dia/sala e quantas têm tempo_deslocamento_minutos preenchido" className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border hover:bg-accent disabled:opacity-50">
                  {diagnosticando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Diagnóstico IV (semana)
                </button>
              </div>
            </div>

            {diagnostico && (
              <div className="border rounded-lg p-3 overflow-x-auto">
                <p className="text-xs font-medium mb-2">Checklist TML — linhas por dia/sala ({formatarDataBR(dias[0])} a {formatarDataBR(data)})</p>
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pr-3 py-1">Dia</th>
                      <th className="pr-3 py-1">Colorado (total / c/ coluna / s/ coluna)</th>
                      <th className="pr-3 py-1">Sub-Fúria (total / c/ coluna / s/ coluna)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostico.length === 0 ? (
                      <tr><td colSpan={3} className="py-1 text-muted-foreground">Nenhuma linha encontrada em checklist_tml nesse período.</td></tr>
                    ) : diagnostico.map((d) => (
                      <tr key={d.data} className="border-t">
                        <td className="pr-3 py-1">{formatarDataBR(d.data)}</td>
                        <td className="pr-3 py-1">{d.porSala.COLORADO.total} / {d.porSala.COLORADO.comColuna} / {d.porSala.COLORADO.semColuna}</td>
                        <td className="pr-3 py-1">{d.porSala['SUB-FURIA'].total} / {d.porSala['SUB-FURIA'].comColuna} / {d.porSala['SUB-FURIA'].semColuna}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-2">
              {KPIS_FECHAMENTO.filter((k) => k.automatico).map((k) => (
                <div key={k.key} className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2">
                  <span className="text-sm font-medium">{k.label}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700">● Automático</span>
                </div>
              ))}
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-medium">Jornada Líquida</span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700">● Automático (via upload 03.11.49.02)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Suba o relatório 03.11.49.02 (Mapa, Data Entrega, Placa, Motorista, MPD, Hora MPD, Entregas) — o mesmo da Carta de Controle TML.
                O sistema considera "bateu jornada" quando o MPD é "PC financeira" e a Hora MPD está dentro de 10h20 desde o início da matinal da sala
                (Colorado até 17:20, Sub-Fúria até 18:20). Esse upload também alimenta as entregas do dia usadas na Devolução PDV abaixo.
              </p>
              <label className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border cursor-pointer hover:bg-accent w-fit">
                {enviandoMapas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {enviandoMapas ? 'Processando…' : 'Anexar relatório 03.11.49.02'}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  disabled={enviandoMapas}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivoMapasDia(f); e.target.value = '' }}
                />
              </label>
              {mapasMsg && <p className={`text-xs ${mapasMsgAviso ? 'text-amber-600' : 'text-green-600'}`}>{mapasMsg}</p>}
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-medium">Devolução PDV</span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700">● Automático (via upload)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Suba o relatório de devolução (mesmo formato da planilha do cliente — 1 linha por nota devolvida, Mapa e Data).
                O sistema soma as devoluções por mapa/dia e cruza com as entregas do dia (relatório 03.11.49.02 acima) pra calcular o % por sala automaticamente.
              </p>
              <label className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border cursor-pointer hover:bg-accent w-fit">
                {enviandoDevolucao ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {enviandoDevolucao ? 'Processando…' : 'Anexar relatório de Devolução PDV'}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  disabled={enviandoDevolucao}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivoDevolucaoPdv(f); e.target.value = '' }}
                />
              </label>
              {devolucaoMsg && <p className="text-xs text-green-600">{devolucaoMsg}</p>}
            </div>

            <div className="space-y-2">
              {(['rating'] as KpiFechamento[]).map((kpi) => (
                <div key={kpi} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-sm font-medium">{KPIS_FECHAMENTO.find((k) => k.key === kpi)!.label}</span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">⚠ Manual</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border cursor-pointer hover:bg-accent">
                      <Upload className="h-3.5 w-3.5" /> {uploads[kpi as 'devolucao_pdv' | 'rating']?.name ?? 'Anexar relatório (referência)'}
                      <input type="file" className="hidden" onChange={(e) => setUploads((u) => ({ ...u, [kpi]: e.target.files?.[0] }))} />
                    </label>
                    {uploads[kpi as 'devolucao_pdv' | 'rating'] && (
                      <button onClick={() => enviarUpload(kpi as 'devolucao_pdv' | 'rating')} disabled={enviandoUpload === kpi} className="text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
                        {enviandoUpload === kpi ? 'Enviando…' : 'Guardar arquivo'}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {SALAS.map((sala) => {
                      const chave = `${sala}|${kpi}`
                      const atual = valores[`${sala}|${data}`]?.[kpi]
                      return (
                        <div key={sala} className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">{SALA_LABEL[sala]}</label>
                          <div className="flex items-center gap-1">
                            <input
                              value={manuais[chave] ?? (atual != null ? (KPIS_FECHAMENTO.find((k) => k.key === kpi)!.unidade === 'percentual' ? (atual * 100).toFixed(1) : String(atual)) : '')}
                              onChange={(e) => setManuais((m) => ({ ...m, [chave]: e.target.value }))}
                              placeholder="valor"
                              className="w-full px-2 py-1 text-xs border rounded"
                            />
                            <button onClick={() => salvarManual(sala, kpi)} disabled={salvandoManual === chave} className="text-[10px] px-1.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">
                              {salvandoManual === chave ? '…' : 'OK'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview tabs */}
          <div className="flex gap-1">
            {SALAS.map((s) => (
              <button key={s} onClick={() => setSalaAtiva(s)} className={`px-3 py-1.5 text-xs font-semibold rounded-md border ${salaAtiva === s ? 'bg-navy text-white' : 'text-muted-foreground'}`} style={salaAtiva === s ? { background: '#122036', color: '#fff' } : {}}>
                {SALA_LABEL[s]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <>
              <CardFechamento sala={salaAtiva} dias={dias} valores={valores} acumMes={acumMes} data={data} />
              {/* Templates ocultos usados pelo html2canvas para gerar as imagens finais */}
              <div className="absolute -left-[9999px] top-0">
                <div ref={refColorado}><CardFechamento sala="COLORADO" dias={dias} valores={valores} acumMes={acumMes} data={data} /></div>
                <div ref={refSubFuria}><CardFechamento sala="SUB-FURIA" dias={dias} valores={valores} acumMes={acumMes} data={data} /></div>
                <div ref={refCdd}><CardFechamento sala="CDD" dias={dias} valores={valores} acumMes={acumMes} data={data} /></div>
              </div>
            </>
          )}

          <div className="rounded-lg border p-4 space-y-3">
            <h2 className="font-semibold text-sm">Texto de orientação (gerado a partir do Farol Motoristas)</h2>
            {farolLinhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Gere o Farol na aba "Farol Motoristas" pra montar os destaques e o bate-papo.</p>
            ) : (
              <div className="space-y-3 text-sm">
                {(['COLORADO', 'SUB-FURIA'] as const).map((sala) => (
                  <div key={sala} className="grid sm:grid-cols-2 gap-3">
                    <div className="whitespace-pre-wrap border rounded-lg p-3 bg-green-50/50">{textosPorSala[sala]?.destaques || `Sem destaques hoje (${SALA_LABEL[sala]}).`}</div>
                    <div className="whitespace-pre-wrap border rounded-lg p-3 bg-amber-50/50">{textosPorSala[sala]?.batePapo || `Ninguém precisa de bate-papo hoje (${SALA_LABEL[sala]}).`}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={confirmarEEnviar} disabled={enviando} className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Confirmar e enviar pro grupo
            </button>
            {envioOk && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Enviado!</span>}
          </div>
        </>
      )}

      {aba === 'farol' && (
        <div className="rounded-lg border p-4 space-y-4">
          <h2 className="font-semibold text-sm">Farol Motoristas do dia</h2>
          <p className="text-sm text-muted-foreground">
            Gerado automaticamente, sem subir nenhum relatório — a partir do que o próprio sistema já apurou pro dia: Aderência ao Raio
            (BEES/Jornada), TML (Análise TML), Devolução (03.11.49.02 + upload de Devolução PDV) e IV-Deslocamento
            (checklist_tml). Motorista e ajudante de cada mapa vêm do cadastro de equipe (mesmo import da aba "Base" usado em Reposições).
          </p>
          <button onClick={gerarFarolDoDia} disabled={processandoFarol} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border hover:bg-accent disabled:opacity-50 w-fit">
            {processandoFarol ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Gerar Farol do dia
          </button>

          {farolLinhas.length > 0 && (
            <>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Mapa</th><th className="px-3 py-2">Motorista</th><th className="px-3 py-2">Ajudante(s)</th><th className="px-3 py-2">Sala</th>
                    <th className="px-3 py-2">Aderência</th><th className="px-3 py-2">TML</th><th className="px-3 py-2">Devolução</th><th className="px-3 py-2">IV-Deslocamento</th><th className="px-3 py-2">Resultado</th>
                  </tr></thead>
                  <tbody>
                    {farolLinhas.map((l) => (
                      <tr key={l.mapa} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{l.mapa}</td>
                        <td className="px-3 py-2">{l.nome}</td>
                        <td className="px-3 py-2">{l.ajudantes.map((a) => a.nome).join(', ') || '—'}</td>
                        <td className="px-3 py-2">{SALA_LABEL[l.sala]}</td>
                        <td className="px-3 py-2"><CriterioChip criterio={l.aderencia} kpi="aderencia_raio" /></td>
                        <td className="px-3 py-2"><CriterioChip criterio={l.tml} kpi="tml" /></td>
                        <td className="px-3 py-2"><CriterioChip criterio={l.devolucao} kpi="devolucao_pdv" /></td>
                        <td className="px-3 py-2"><CriterioChip criterio={l.ivDeslocamento} kpi="iv_deslocamento" /></td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${l.resultado === 'destaque' ? 'bg-green-50 text-green-700' : l.resultado === 'bate_papo' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                            {l.resultado === 'destaque' ? 'Destaque' : l.resultado === 'bate_papo' ? 'Bate-papo' : 'Neutro'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={salvarFarol} disabled={salvandoFarol} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
                  {salvandoFarol ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Salvar Farol do dia
                </button>
                <button onClick={enviarConvitesDoDia} disabled={enviandoConvites} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border hover:bg-accent disabled:opacity-50">
                  {enviandoConvites ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar convites de bate-papo (motorista/ajudante)
                </button>
              </div>
              {resultadoConvites && (
                <p className="text-xs text-muted-foreground">
                  {resultadoConvites.enviados} convite(s) enviado(s)
                  {resultadoConvites.semTelefone > 0 ? `, ${resultadoConvites.semTelefone} sem telefone cadastrado` : ''}
                  {resultadoConvites.falhaEnvio > 0 ? `, ${resultadoConvites.falhaEnvio} com falha no envio` : ''}.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {aba === 'parametros' && (
        <div className="space-y-6">
          <ParametrosTab filial={usuario.filial} parametros={parametros} onSalvo={fetchTudo} />
          <GruposFechamentoTab filial={usuario.filial} />
        </div>
      )}
    </div>
  )
}

function CardFechamento({
  sala, dias, valores, acumMes, data,
}: {
  sala: SalaFechamento
  dias: string[]
  valores: Record<string, Record<string, number | null>>
  acumMes: Record<string, Record<string, number | null>>
  data: string
}) {
  const [parametros, setParametros] = useState<ParametroFechamento[]>([])
  const { usuario } = useAuth()
  useEffect(() => { if (usuario) buscarParametros(usuario.filial).then(setParametros) }, [usuario])

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e6ea', borderRadius: 14, overflow: 'hidden', maxWidth: 640 }}>
      <div style={{ background: '#122036', color: '#fff', padding: '14px 16px' }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#E9BE7A' }}>◆ Resultado do dia</div>
        <h4 style={{ fontSize: 15, margin: '4px 0 0', fontWeight: 700 }}>{SALA_LABEL[sala]}</h4>
        <div style={{ fontSize: 10.5, color: '#B9C3D4', marginTop: 3 }}>{formatarDataBR(data)} · CDD Petrópolis</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, color: '#1a2433' }}>
        <thead>
          <tr style={{ background: '#F0F2F5' }}>
            <th style={th}>KPI</th>
            <th style={th}>Meta</th>
            {dias.map((d) => <th key={d} style={th}>{formatarDataBR(d).slice(0, 5)}</th>)}
            <th style={th}>Acum. mês</th>
          </tr>
        </thead>
        <tbody>
          {KPIS_FECHAMENTO.map((k) => {
            const p = parametros.find((pp) => pp.kpi === k.key)
            const acum = acumMes[sala]?.[k.key] ?? null
            const farolAcum = farolDoValor(acum, p)
            return (
              <tr key={k.key}>
                <td style={{ ...td, fontWeight: 700 }}>
                  {farolAcum && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 5, background: FAROL_COR[farolAcum] }} />}
                  {k.label}
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{p?.meta != null ? formatarValor(p.meta, k.key) : '—'}</td>
                {dias.map((d) => {
                  const v = valores[`${sala}|${d}`]?.[k.key] ?? null
                  const farol = farolDoValor(v, p)
                  return (
                    <td key={d} style={{ ...td, textAlign: 'right', fontFamily: 'monospace', background: farol ? FAROL_BG[farol] : undefined }}>
                      {formatarValor(v, k.key)}
                    </td>
                  )
                })}
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, background: farolAcum ? FAROL_BG[farolAcum] : undefined }}>
                  {formatarValor(acum, k.key)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#5b6675', fontWeight: 700, padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e2e6ea' }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #eef1f4' }

function ParametrosTab({ filial, parametros, onSalvo }: { filial: string; parametros: ParametroFechamento[]; onSalvo: () => void }) {
  const [editando, setEditando] = useState<Record<string, { meta: string; bench: string; gatilho: string; direcao: 'menor_melhor' | 'maior_melhor' }>>({})
  const [salvando, setSalvando] = useState<string | null>(null)

  async function salvar(kpi: KpiFechamento) {
    const ed = editando[kpi]
    if (!ed) return
    setSalvando(kpi)
    const def = KPIS_FECHAMENTO.find((k) => k.key === kpi)!
    const parseVal = (s: string) => {
      const n = parseFloat(s.replace(',', '.'))
      if (!Number.isFinite(n)) return null
      return def.unidade === 'percentual' ? n / 100 : n
    }
    await supabase.from('fechamento_dia_parametros').upsert(
      { filial, kpi, meta: parseVal(ed.meta), bench: parseVal(ed.bench), gatilho: parseVal(ed.gatilho), direcao: ed.direcao },
      { onConflict: 'filial,kpi' },
    )
    setSalvando(null)
    onSalvo()
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold text-sm flex items-center gap-1.5"><Settings className="h-4 w-4" /> Meta, Bench, Gatilho e Direção por KPI</h2>
      <p className="text-xs text-muted-foreground">
        Direção define se maior valor é melhor ou pior. Bench é o patamar de <strong>Destaque</strong> (precisa superar,
        não só bater a Meta). Gatilho é o patamar que, quando ultrapassado, marca o indicador como <strong>Bate-papo</strong>
        (aciona o convite automático por WhatsApp) — sem Gatilho definido, qualquer valor que não bate a Meta já vira Bate-papo.
      </p>
      <div className="space-y-2">
        {KPIS_FECHAMENTO.map((k) => {
          const p = parametros.find((pp) => pp.kpi === k.key)
          const def = KPIS_FECHAMENTO.find((kk) => kk.key === k.key)!
          const metaAtual = p?.meta != null ? (def.unidade === 'percentual' ? (p.meta * 100).toFixed(1) : String(p.meta)) : ''
          const benchAtual = p?.bench != null ? (def.unidade === 'percentual' ? (p.bench * 100).toFixed(1) : String(p.bench)) : ''
          const gatilhoAtual = p?.gatilho != null ? (def.unidade === 'percentual' ? (p.gatilho * 100).toFixed(1) : String(p.gatilho)) : ''
          const direcaoAtual = p?.direcao ?? 'maior_melhor'
          const ed = editando[k.key]
          return (
            <div key={k.key} className="flex items-center gap-3 border rounded-lg p-3 flex-wrap">
              <span className="text-sm font-medium flex-1 min-w-[180px]">{k.label}</span>
              <select
                value={ed?.direcao ?? direcaoAtual}
                onChange={(e) => setEditando((prev) => ({
                  ...prev,
                  [k.key]: {
                    meta: prev[k.key]?.meta ?? metaAtual, bench: prev[k.key]?.bench ?? benchAtual,
                    gatilho: prev[k.key]?.gatilho ?? gatilhoAtual, direcao: e.target.value as 'menor_melhor' | 'maior_melhor',
                  },
                }))}
                className="px-2 py-1 text-xs border rounded"
              >
                <option value="maior_melhor">Maior melhor</option>
                <option value="menor_melhor">Menor melhor</option>
              </select>
              <input
                placeholder="Meta" defaultValue={metaAtual}
                onChange={(e) => setEditando((prev) => ({
                  ...prev,
                  [k.key]: {
                    meta: e.target.value, bench: prev[k.key]?.bench ?? benchAtual,
                    gatilho: prev[k.key]?.gatilho ?? gatilhoAtual, direcao: prev[k.key]?.direcao ?? direcaoAtual,
                  },
                }))}
                className="w-24 px-2 py-1 text-xs border rounded"
              />
              <input
                placeholder="Bench" defaultValue={benchAtual}
                onChange={(e) => setEditando((prev) => ({
                  ...prev,
                  [k.key]: {
                    meta: prev[k.key]?.meta ?? metaAtual, bench: e.target.value,
                    gatilho: prev[k.key]?.gatilho ?? gatilhoAtual, direcao: prev[k.key]?.direcao ?? direcaoAtual,
                  },
                }))}
                className="w-24 px-2 py-1 text-xs border rounded"
              />
              <input
                placeholder="Gatilho" defaultValue={gatilhoAtual}
                onChange={(e) => setEditando((prev) => ({
                  ...prev,
                  [k.key]: {
                    meta: prev[k.key]?.meta ?? metaAtual, bench: prev[k.key]?.bench ?? benchAtual,
                    gatilho: e.target.value, direcao: prev[k.key]?.direcao ?? direcaoAtual,
                  },
                }))}
                className="w-24 px-2 py-1 text-xs border rounded"
              />
              <button onClick={() => salvar(k.key)} disabled={salvando === k.key} className="text-xs px-2.5 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50">
                {salvando === k.key ? '…' : 'Salvar'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GruposFechamentoTab({ filial }: { filial: string }) {
  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState<string | null>(null)

  const [grupo, setGrupo] = useState('')
  const [original, setOriginal] = useState('')

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!filial) { setCarregando(false); return }
    setCarregando(true)
    const { data } = await supabase
      .from('filiais')
      .select('grupo_fechamento_whatsapp')
      .eq('nome', filial)
      .maybeSingle()
    const v = data?.grupo_fechamento_whatsapp ?? ''
    setGrupo(v)
    setOriginal(v)
    setCarregando(false)
  }, [filial])

  useEffect(() => { carregar() }, [carregar])

  async function buscarGrupos() {
    setBuscando(true)
    setErroBusca(null)
    const { grupos: gs, erro } = await listarGrupos()
    setBuscando(false)
    if (erro) { setErroBusca(erro); return }
    if (gs.length === 0) { setErroBusca('Nenhum grupo encontrado nesta instância Z-API.'); return }
    setGrupos(gs.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function salvar() {
    if (!filial) return
    setSalvando(true)
    setSalvo(false)
    await supabase
      .from('filiais')
      .update({ grupo_fechamento_whatsapp: grupo.trim() || null })
      .eq('nome', filial)
    setOriginal(grupo.trim())
    setSalvando(false)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2500)
  }

  async function copiar(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiado(id)
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500)
    } catch {
      /* clipboard indisponível */
    }
  }

  const alterado = grupo.trim() !== original

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-sm flex items-center gap-1.5"><Send className="h-4 w-4" /> Grupo de WhatsApp do Fechamento</h2>
        <button onClick={buscarGrupos} disabled={buscando} className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs hover:bg-accent transition-colors disabled:opacity-50">
          {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : grupos.length > 0 ? <RefreshCw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          {buscando ? 'Buscando…' : grupos.length > 0 ? 'Atualizar grupos' : 'Buscar grupos (Z-API)'}
        </button>
      </div>

      {erroBusca && <p className="flex items-center gap-1.5 text-xs text-red-600 border border-red-200 bg-red-50 rounded-md p-2"><AlertTriangle className="h-3.5 w-3.5" /> {erroBusca}</p>}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <GroupPicker
          label="Grupo único do Fechamento"
          hint="Recebe as 3 imagens (Colorado, Sub-Fúria, CDD) e o texto de orientação (destaques + bate-papo)."
          value={grupo} onChange={setGrupo} grupos={grupos} onCopy={copiar} copiado={copiado}
        />
      )}

      <div className="flex items-center justify-end gap-3 border-t pt-3">
        {salvo && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Salvo!</span>}
        <button onClick={salvar} disabled={salvando || !alterado || !filial} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
          {salvando ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </div>
    </div>
  )
}
