import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import html2canvas from 'html2canvas'
import * as XLSX from 'xlsx'
import {
  ArrowLeft, RefreshCw, Loader2, Upload, CheckCircle2, AlertTriangle, Send, Settings, GraduationCap,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { enviarImagemGrupo, enviarMensagemGrupo, enviarMensagemWhatsApp } from '../lib/zapi'
import { formatarDataBR } from '../lib/utils'
import {
  KPIS_FECHAMENTO, type KpiFechamento, type SalaFechamento, type ParametroFechamento,
  recalcularAutomaticos, salvarValorManual, diasDaSemanaAte, buscarValoresFechamento, buscarParametros,
  farolDoValor, parseFarolMotoristas, classificarResultado, montarTextosOrientacao, type LinhaFarolMotorista,
} from '../lib/fechamentoDia'

const SALAS: SalaFechamento[] = ['COLORADO', 'SUB-FURIA', 'CDD']
const SALA_LABEL: Record<SalaFechamento, string> = { COLORADO: 'Sala Colorado', 'SUB-FURIA': 'Sala Sub-Fúria', CDD: 'CDD Petrópolis (consolidado)' }

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatarValor(valor: number | null, kpi: KpiFechamento): string {
  if (valor == null) return '—'
  const def = KPIS_FECHAMENTO.find((k) => k.key === kpi)!
  if (def.unidade === 'percentual') return `${(valor * 100).toFixed(1)}%`
  if (def.unidade === 'minutos') return `${valor >= 0 ? '' : '-'}${Math.abs(Math.round(valor))} min`
  return valor.toFixed(2)
}

const FAROL_COR: Record<'g' | 'a' | 'r', string> = { g: '#2E9E63', a: '#D9A027', r: '#D14B42' }
const FAROL_BG: Record<'g' | 'a' | 'r', string> = { g: '#EAF7EF', a: '#FDF5E3', r: '#FCEDEC' }

export default function FechamentoDia() {
  const { usuario } = useAuth()
  const [data, setData] = useState(hojeISO())
  const [aba, setAba] = useState<'painel' | 'farol' | 'parametros'>('painel')

  const [parametros, setParametros] = useState<ParametroFechamento[]>([])
  const [valores, setValores] = useState<Record<string, Record<string, number | null>>>({}) // `${sala}|${dataDia}` -> {kpi: valor}
  const [acumMes, setAcumMes] = useState<Record<string, Record<string, number | null>>>({})
  const [loading, setLoading] = useState(true)
  const [recalculando, setRecalculando] = useState(false)
  const [salaAtiva, setSalaAtiva] = useState<SalaFechamento>('COLORADO')

  const [manuais, setManuais] = useState<Record<string, string>>({}) // `${sala}|${kpi}` -> string digitada
  const [salvandoManual, setSalvandoManual] = useState<string | null>(null)
  const [uploads, setUploads] = useState<{ devolucao_pdv?: File; rating?: File }>({})
  const [enviandoUpload, setEnviandoUpload] = useState<string | null>(null)

  const [farolLinhas, setFarolLinhas] = useState<(LinhaFarolMotorista & { sala: 'COLORADO' | 'SUB-FURIA'; resultado: string })[]>([])
  const [processandoFarol, setProcessandoFarol] = useState(false)
  const [salvandoFarol, setSalvandoFarol] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [envioOk, setEnvioOk] = useState(false)

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

  async function recalcular() {
    if (!usuario) return
    setRecalculando(true)
    await recalcularAutomaticos(usuario.filial, data)
    await fetchTudo()
    setRecalculando(false)
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

  async function processarArquivoFarol(file: File) {
    if (!usuario) return
    setProcessandoFarol(true)
    setErro('')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const nomeAba = wb.SheetNames.find((n) => n.toLowerCase().includes('farol')) ?? wb.SheetNames[0]
      const ws = wb.Sheets[nomeAba]
      const linhasBrutas: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
      const parsed = parseFarolMotoristas(linhasBrutas, parametros)

      // Sala do motorista vem do roster já existente (motoristas_sala_tml) — o
      // arquivo do Farol Motoristas não traz a sala.
      const matriculas = parsed.map((p) => p.matricula).filter((m): m is number => m != null)
      const { data: roster } = await supabase.from('motoristas_sala_tml').select('matricula, sala').eq('filial', usuario.filial).in('matricula', matriculas.length ? matriculas : [-1])
      const salaPorMatricula = new Map((roster ?? []).map((r) => [r.matricula, r.sala]))

      const comSala = parsed
        .map((p) => ({ ...p, sala: (p.matricula != null ? salaPorMatricula.get(p.matricula) : null) as 'COLORADO' | 'SUB-FURIA' | undefined }))
        .filter((p): p is LinhaFarolMotorista & { sala: 'COLORADO' | 'SUB-FURIA' } => !!p.sala)
        .map((p) => ({ ...p, resultado: classificarResultado(p) }))

      setFarolLinhas(comSala)
    } catch (e) {
      setErro(`Erro ao ler o arquivo: ${e instanceof Error ? e.message : String(e)}`)
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
        aderencia_ok: l.aderenciaOk, devolucao_fora_raio_ok: l.devolucaoForaRaioOk, tml_ok: l.tmlOk, devolucao_ok: l.devolucaoOk,
        resultado: l.resultado,
      })),
    )
    setSalvandoFarol(false)
  }

  const textosPorSala = useMemo(() => {
    const out: Record<string, { destaques: string; batePapo: string }> = {}
    for (const sala of ['COLORADO', 'SUB-FURIA'] as const) {
      const linhas = farolLinhas.filter((l) => l.sala === sala)
      out[sala] = montarTextosOrientacao(linhas, SALA_LABEL[sala], formatarDataBR(data))
    }
    return out
  }, [farolLinhas, data])

  async function confirmarEEnviar() {
    if (!usuario) return
    setEnviando(true)
    setErro('')
    try {
      const { data: filialRow } = await supabase
        .from('filiais')
        .select('grupo_matinal_colorado_whatsapp, grupo_matinal_subfuria_whatsapp, grupo_fechamento_cdd_whatsapp')
        .eq('nome', usuario.filial)
        .maybeSingle()

      const alvos: { ref: React.RefObject<HTMLDivElement | null>; grupo: string | null | undefined; legenda: string; sala: SalaFechamento }[] = [
        { ref: refColorado, grupo: filialRow?.grupo_matinal_colorado_whatsapp, legenda: `📊 Fechamento do Dia — Sala Colorado — ${formatarDataBR(data)}`, sala: 'COLORADO' },
        { ref: refSubFuria, grupo: filialRow?.grupo_matinal_subfuria_whatsapp, legenda: `📊 Fechamento do Dia — Sala Sub-Fúria — ${formatarDataBR(data)}`, sala: 'SUB-FURIA' },
        { ref: refCdd, grupo: filialRow?.grupo_fechamento_cdd_whatsapp, legenda: `📊 Fechamento do Dia — CDD Petrópolis — ${formatarDataBR(data)}`, sala: 'CDD' },
      ]

      for (const alvo of alvos) {
        if (!alvo.grupo || !alvo.ref.current) continue
        const canvas = await html2canvas(alvo.ref.current, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true, logging: false })
        const img = canvas.toDataURL('image/png')
        const { sucesso, erro: erroEnvio } = await enviarImagemGrupo(alvo.grupo, img, alvo.legenda)
        await supabase.from('disparos').insert({ filial: usuario.filial, whatsapp: alvo.grupo, mensagem: alvo.legenda, status: sucesso ? 'enviado' : 'erro', erro: erroEnvio ?? null })
      }

      // Destaques: no grupo da própria sala (reconhecimento público).
      for (const sala of ['COLORADO', 'SUB-FURIA'] as const) {
        const grupo = sala === 'COLORADO' ? filialRow?.grupo_matinal_colorado_whatsapp : filialRow?.grupo_matinal_subfuria_whatsapp
        const texto = textosPorSala[sala]?.destaques
        if (grupo && texto) {
          const { sucesso, erro: erroEnvio } = await enviarMensagemGrupo(grupo, texto)
          await supabase.from('disparos').insert({ filial: usuario.filial, whatsapp: grupo, mensagem: texto, status: sucesso ? 'enviado' : 'erro', erro: erroEnvio ?? null })
        }
      }

      // Bate-papo: só pro supervisor da sala, no privado (não expõe no grupo).
      for (const sala of ['COLORADO', 'SUB-FURIA'] as const) {
        const texto = textosPorSala[sala]?.batePapo
        if (!texto) continue
        const { data: supervisores } = await supabase.from('supervisores_tml').select('telefone').eq('filial', usuario.filial).eq('sala', sala)
        for (const s of supervisores ?? []) {
          if (!s.telefone) continue
          const { sucesso, erro: erroEnvio } = await enviarMensagemWhatsApp(s.telefone, texto)
          await supabase.from('disparos').insert({ filial: usuario.filial, whatsapp: s.telefone, mensagem: texto, status: sucesso ? 'enviado' : 'erro', erro: erroEnvio ?? null })
        }
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
              <button onClick={recalcular} disabled={recalculando} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border hover:bg-accent disabled:opacity-50">
                {recalculando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Recalcular automáticos
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              {KPIS_FECHAMENTO.filter((k) => k.automatico).map((k) => (
                <div key={k.key} className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2">
                  <span className="text-sm font-medium">{k.label}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700">● Automático</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {(['devolucao_pdv', 'rating'] as KpiFechamento[]).map((kpi) => (
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

              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm font-medium">Jornada Líquida</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">⚠ Manual (sem fonte automática ainda)</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SALAS.map((sala) => {
                    const chave = `${sala}|jornada_liquida`
                    const atual = valores[`${sala}|${data}`]?.['jornada_liquida']
                    return (
                      <div key={sala} className="space-y-1">
                        <label className="text-[10px] text-muted-foreground">{SALA_LABEL[sala]}</label>
                        <div className="flex items-center gap-1">
                          <input
                            value={manuais[chave] ?? (atual != null ? (atual * 100).toFixed(1) : '')}
                            onChange={(e) => setManuais((m) => ({ ...m, [chave]: e.target.value }))}
                            placeholder="%"
                            className="w-full px-2 py-1 text-xs border rounded"
                          />
                          <button onClick={() => salvarManual(sala, 'jornada_liquida')} disabled={salvandoManual === chave} className="text-[10px] px-1.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">
                            {salvandoManual === chave ? '…' : 'OK'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
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
              <p className="text-sm text-muted-foreground">Suba o relatório na aba "Farol Motoristas" pra gerar os destaques e o bate-papo.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="whitespace-pre-wrap border rounded-lg p-3 bg-green-50/50">{textosPorSala.COLORADO?.destaques || 'Sem destaques hoje.'}</div>
                <div className="whitespace-pre-wrap border rounded-lg p-3 bg-amber-50/50">{textosPorSala.COLORADO?.batePapo || 'Ninguém precisa de bate-papo hoje.'}</div>
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
          <h2 className="font-semibold text-sm">Upload do Farol Motoristas do dia</h2>
          <label className="flex flex-col items-center gap-2 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/40 transition-colors">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Toque para escolher a planilha (Farol Motoristas)</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivoFarol(f) }} />
          </label>
          {processandoFarol && <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" /> Lendo o arquivo…</p>}

          {farolLinhas.length > 0 && (
            <>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Matrícula</th><th className="px-3 py-2">Nome</th><th className="px-3 py-2">Sala</th>
                    <th className="px-3 py-2">Aderência</th><th className="px-3 py-2">Dev. Fora Raio</th><th className="px-3 py-2">TML</th><th className="px-3 py-2">Devolução</th><th className="px-3 py-2">Resultado</th>
                  </tr></thead>
                  <tbody>
                    {farolLinhas.map((l, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2">{l.matricula}</td>
                        <td className="px-3 py-2">{l.nome}</td>
                        <td className="px-3 py-2">{l.sala}</td>
                        <td className="px-3 py-2">{l.aderenciaOk == null ? '—' : l.aderenciaOk ? '✅' : '❌'}</td>
                        <td className="px-3 py-2">{l.devolucaoForaRaioOk == null ? '—' : l.devolucaoForaRaioOk ? '✅' : '❌'}</td>
                        <td className="px-3 py-2">{l.tmlOk == null ? '—' : l.tmlOk ? '✅' : '❌'}</td>
                        <td className="px-3 py-2">{l.devolucaoOk == null ? '—' : l.devolucaoOk ? '✅' : '❌'}</td>
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
              <button onClick={salvarFarol} disabled={salvandoFarol} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
                {salvandoFarol ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Salvar Farol do dia
              </button>
            </>
          )}
        </div>
      )}

      {aba === 'parametros' && <ParametrosTab filial={usuario.filial} parametros={parametros} onSalvo={fetchTudo} />}
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
  const [editando, setEditando] = useState<Record<string, { meta: string; bench: string }>>({})
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
      { filial, kpi, meta: parseVal(ed.meta), bench: parseVal(ed.bench) },
      { onConflict: 'filial,kpi' },
    )
    setSalvando(null)
    onSalvo()
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <h2 className="font-semibold text-sm flex items-center gap-1.5"><Settings className="h-4 w-4" /> Meta e Bench por KPI</h2>
      <div className="space-y-2">
        {KPIS_FECHAMENTO.map((k) => {
          const p = parametros.find((pp) => pp.kpi === k.key)
          const def = KPIS_FECHAMENTO.find((kk) => kk.key === k.key)!
          const metaAtual = p?.meta != null ? (def.unidade === 'percentual' ? (p.meta * 100).toFixed(1) : String(p.meta)) : ''
          const benchAtual = p?.bench != null ? (def.unidade === 'percentual' ? (p.bench * 100).toFixed(1) : String(p.bench)) : ''
          return (
            <div key={k.key} className="flex items-center gap-3 border rounded-lg p-3 flex-wrap">
              <span className="text-sm font-medium flex-1 min-w-[180px]">{k.label}</span>
              <input placeholder="Meta" defaultValue={metaAtual} onChange={(e) => setEditando((ed) => ({ ...ed, [k.key]: { ...ed[k.key], meta: e.target.value, bench: ed[k.key]?.bench ?? benchAtual } }))} className="w-24 px-2 py-1 text-xs border rounded" />
              <input placeholder="Bench" defaultValue={benchAtual} onChange={(e) => setEditando((ed) => ({ ...ed, [k.key]: { ...ed[k.key], bench: e.target.value, meta: ed[k.key]?.meta ?? metaAtual } }))} className="w-24 px-2 py-1 text-xs border rounded" />
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
