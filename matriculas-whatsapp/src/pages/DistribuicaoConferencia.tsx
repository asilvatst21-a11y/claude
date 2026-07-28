import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ClipboardCheck, Upload, Loader2, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, Search, Link2, Settings2, ExternalLink, ChevronDown, ChevronRight, Copy, X, Timer, MessageSquare,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { listarGrupos, type GrupoZApi } from '../lib/zapi'
import { GroupPicker } from './DistribuicaoTMLWhatsappConfig'
import {
  importarSeparacao, importarRetornaveis, buscarResumoDia, buscarDivergenciasDoMapa, montarMensagensDivergenciaMapa,
  buscarBaiasDoMapa, buscarSugestoes, buscarMapasParados, type ResumoDiaConf, type BaiaConf, type SugestaoConf, type MapaParadoConf,
} from '../lib/conferencia'
import { formatarDataBR } from '../lib/utils'

// Tempo gasto numa baia — do PRIMEIRO ITEM marcado (não da abertura da
// baia, que infla o tempo quando o ajudante só dá uma olhada em várias
// baias antes de conferir de verdade) até o fim da conferência. Cai pra
// "iniciada_em" só se não tiver nenhum item marcado (ex.: baia pulada sem
// conferir nada). Null se ainda não foi iniciada ou finalizada.
function duracaoBaiaMin(b: BaiaConf): number | null {
  const inicio = b.primeiroItemEm ?? b.iniciadaEm
  if (!inicio || !b.finalizadaEm) return null
  return Math.max(0, Math.round((new Date(b.finalizadaEm).getTime() - new Date(inicio).getTime()) / 60000))
}

// Data local (não UTC) — consistente com a página do ajudante (ConferenciaDigital).
function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatarMinutosParado(min: number | null): string {
  if (min == null) return '—'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto > 0 ? `${h}h${resto}min` : `${h}h`
}

export default function DistribuicaoConferencia() {
  const { usuario } = useAuth()
  const [dataOperacao, setDataOperacao] = useState(hojeISO)
  const [resumo, setResumo] = useState<ResumoDiaConf | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadingRetornaveis, setUploadingRetornaveis] = useState(false)
  const [erro, setErro] = useState('')
  const [ultimoImport, setUltimoImport] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputRetornaveisRef = useRef<HTMLInputElement>(null)

  const [configAberta, setConfigAberta] = useState(false)
  const [tabelaAberta, setTabelaAberta] = useState(true)
  const [sugestoesAberta, setSugestoesAberta] = useState(false)
  const [sugestoes, setSugestoes] = useState<SugestaoConf[]>([])
  const [loadingSugestoes, setLoadingSugestoes] = useState(false)
  const [mapasParadosAberta, setMapasParadosAberta] = useState(true)
  const [mapasParados, setMapasParados] = useState<MapaParadoConf[]>([])
  const [loadingMapasParados, setLoadingMapasParados] = useState(false)
  const [grupo, setGrupo] = useState('')
  const [grupoOriginal, setGrupoOriginal] = useState('')
  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscandoGrupos, setBuscandoGrupos] = useState(false)
  const [erroGrupos, setErroGrupos] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [copiandoDivergenciaMapa, setCopiandoDivergenciaMapa] = useState<number | null>(null)
  const [divergenciaCopiada, setDivergenciaCopiada] = useState<number | null>(null)

  const [detalheMapa, setDetalheMapa] = useState<number | null>(null)
  const [detalheBaias, setDetalheBaias] = useState<BaiaConf[]>([])
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null)

  const linkPublico = `${window.location.origin}/conferencia`

  const fetchResumo = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const r = await buscarResumoDia(usuario.filial, dataOperacao)
    setResumo(r)
    setLoading(false)
  }, [usuario, dataOperacao])

  const fetchConfig = useCallback(async () => {
    if (!usuario) return
    const { data } = await supabase.from('filiais').select('grupo_conferencia_whatsapp').eq('nome', usuario.filial).maybeSingle()
    const v = data?.grupo_conferencia_whatsapp ?? ''
    setGrupo(v); setGrupoOriginal(v)
    const { data: ult } = await supabase.from('conferencia_baias')
      .select('importado_em').eq('filial', usuario.filial).eq('data', dataOperacao)
      .order('importado_em', { ascending: false }).limit(1).maybeSingle()
    setUltimoImport(ult?.importado_em ?? null)
  }, [usuario, dataOperacao])

  const fetchSugestoes = useCallback(async () => {
    if (!usuario) return
    setLoadingSugestoes(true)
    try {
      setSugestoes(await buscarSugestoes(usuario.filial))
    } finally {
      setLoadingSugestoes(false)
    }
  }, [usuario])

  const fetchMapasParados = useCallback(async () => {
    if (!usuario) return
    setLoadingMapasParados(true)
    try {
      setMapasParados(await buscarMapasParados(usuario.filial))
    } finally {
      setLoadingMapasParados(false)
    }
  }, [usuario])

  useEffect(() => { fetchResumo() }, [fetchResumo])
  useEffect(() => { fetchConfig() }, [fetchConfig])
  useEffect(() => { fetchSugestoes() }, [fetchSugestoes])
  useEffect(() => { fetchMapasParados() }, [fetchMapasParados])

  async function handleImportar(file: File) {
    if (!usuario) return
    setUploading(true); setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const { mapas, baias, itens } = await importarSeparacao(usuario.filial, dataOperacao, buffer)
      await fetchResumo(); await fetchConfig()
      alert(`Relatório importado: ${mapas} mapa(s), ${baias} baia(s), ${itens} item(ns). O progresso já conferido foi preservado.`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar o Relatório de Separação')
    } finally {
      setUploading(false)
    }
  }

  async function handleImportarRetornaveis(file: File) {
    if (!usuario) return
    setUploadingRetornaveis(true); setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const { mapas, itens } = await importarRetornaveis(usuario.filial, dataOperacao, buffer)
      await fetchResumo()
      alert(`Retornáveis importados: ${mapas} mapa(s), ${itens} item(ns). O progresso já conferido foi preservado.`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar o relatório de retornáveis (02.05.01)')
    } finally {
      setUploadingRetornaveis(false)
    }
  }

  async function buscarGruposZapi() {
    setBuscandoGrupos(true); setErroGrupos(null)
    const { grupos: gs, erro } = await listarGrupos()
    setBuscandoGrupos(false)
    if (erro) { setErroGrupos(erro); return }
    if (gs.length === 0) { setErroGrupos('Nenhum grupo encontrado nesta instância Z-API.'); return }
    setGrupos(gs.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function copiarId(id: string) {
    try { await navigator.clipboard.writeText(id); setCopiado(id); setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500) } catch { /* */ }
  }

  // Monta a(s) mensagem(ns) de divergência do mapa (mesmo texto do envio
  // automático) e copia pro clipboard — pra colar manualmente no grupo
  // enquanto o envio automático está pausado (ver whatsappStatus.ts).
  async function copiarDivergenciasMapa(mapa: number) {
    if (!usuario) return
    setCopiandoDivergenciaMapa(mapa)
    try {
      const divergencias = await buscarDivergenciasDoMapa(usuario.filial, mapa, dataOperacao)
      if (divergencias.length === 0) {
        alert('Nenhuma divergência encontrada pra esse mapa.')
        return
      }
      const texto = montarMensagensDivergenciaMapa(mapa, dataOperacao, divergencias)
      await navigator.clipboard.writeText(texto)
      setDivergenciaCopiada(mapa)
      setTimeout(() => setDivergenciaCopiada((m) => (m === mapa ? null : m)), 2500)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao copiar mensagem de divergência')
    } finally {
      setCopiandoDivergenciaMapa(null)
    }
  }

  // Detalhe do mapa: baia por baia, com o tempo que a pessoa levou em cada
  // uma (do início ao fim da conferência) — pra identificar onde o tempo foi
  // gasto, além do total agregado que já aparece na tabela.
  async function abrirDetalheMapa(mapa: number) {
    if (!usuario) return
    setDetalheMapa(mapa)
    setDetalheBaias([])
    setErroDetalhe(null)
    setCarregandoDetalhe(true)
    try {
      const lista = await buscarBaiasDoMapa(usuario.filial, mapa, dataOperacao)
      setDetalheBaias(lista)
    } catch (err) {
      setErroDetalhe(err instanceof Error ? err.message : 'Erro ao buscar as baias do mapa')
    } finally {
      setCarregandoDetalhe(false)
    }
  }


  async function salvarGrupo() {
    if (!usuario) return
    const v = grupo.trim()
    await supabase.from('filiais').update({ grupo_conferencia_whatsapp: v || null }).eq('nome', usuario.filial)
    setGrupoOriginal(v)
    alert('Grupo salvo.')
  }

  const kpis = [
    { label: 'Mapas conferidos', valor: resumo ? `${resumo.mapasConcluidos}/${resumo.mapas.length}` : '—', icon: CheckCircle2, cor: 'text-green-600' },
    { label: 'Divergências', valor: resumo ? String(resumo.totalDivergencias) : '—', icon: AlertTriangle, cor: resumo && resumo.totalDivergencias > 0 ? 'text-red-600' : 'text-gray-900' },
    { label: 'Tempo médio de conferência', valor: resumo?.tempoMedioMin != null ? `${resumo.tempoMedioMin} min` : '—', icon: Clock, cor: 'text-gray-900' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Distribuição</p>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-accent-600" /> Conferência Digital</h1>
          <p className="text-sm text-muted-foreground mt-1">Acompanhe as conferências que o ajudante faz no celular: mapas conferidos, divergências e tempo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setConfigAberta((v) => !v)} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors"><Settings2 className="h-4 w-4" /> Config. WhatsApp</button>
          <button onClick={fetchResumo} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erro}</div>}

      {/* Link público */}
      <div className="bg-accent-50 border border-accent-200 rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
        <Link2 className="h-4 w-4 text-accent-600 shrink-0" />
        <span className="text-sm text-accent-900">Link do ajudante (celular, sem login):</span>
        <a href="/conferencia" target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent-700 underline flex items-center gap-1">{linkPublico} <ExternalLink className="h-3.5 w-3.5" /></a>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => copiarId(linkPublico)} className="text-xs px-2 py-1 rounded border border-accent-300 text-accent-700 hover:bg-accent-100">{copiado === linkPublico ? 'Copiado' : 'Copiar link'}</button>
        </div>
        <p className="w-full text-xs text-muted-foreground">
          Copie e cole no grupo do time — o disparo automático pra cada motorista/ajudante foi removido (era um envio em massa que arriscava travar o número de novo).
        </p>
      </div>

      {/* Config WhatsApp */}
      {configAberta && (
        <div className="border rounded-lg bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div><h3 className="text-sm font-semibold">Grupo de WhatsApp — divergências</h3><p className="text-xs text-muted-foreground">Recebe o aviso automático quando o ajudante marca uma divergência.</p></div>
            <button onClick={buscarGruposZapi} disabled={buscandoGrupos} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50 shrink-0">
              {buscandoGrupos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar grupos (Z-API)
            </button>
          </div>
          {erroGrupos && <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md p-3"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erroGrupos}</div>}
          <GroupPicker label="Grupo das divergências" value={grupo} onChange={setGrupo} grupos={grupos} onCopy={copiarId} copiado={copiado} />
          <button onClick={salvarGrupo} disabled={grupo.trim() === grupoOriginal} className="px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors">Salvar</button>
        </div>
      )}

      {/* Import + data */}
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="border rounded-lg bg-white p-4">
          <h3 className="text-sm font-semibold">Relatório de Separação</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">Import diário. Reimportar preserva o que o ajudante já conferiu.</p>
          <div className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-accent-500 hover:bg-accent/30 transition-colors" onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="h-7 w-7 mx-auto mb-1.5 animate-spin text-accent-500" /> : <Upload className="h-7 w-7 mx-auto mb-1.5 text-muted-foreground" />}
            <p className="text-sm font-medium">{uploading ? 'Processando...' : 'Clique para importar (.csv / .xlsx)'}</p>
            {ultimoImport && <p className="text-xs text-muted-foreground mt-1">Último import: {new Date(ultimoImport).toLocaleString('pt-BR')}</p>}
          </div>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportar(f); if (inputRef.current) inputRef.current.value = '' }} />
        </div>
        <div className="border rounded-lg bg-white p-4">
          <h3 className="text-sm font-semibold">Retornáveis (02.05.01)</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">Cria a baia de retornáveis de cada mapa, conferida na saída junto com os produtos.</p>
          <div className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-accent-500 hover:bg-accent/30 transition-colors" onClick={() => inputRetornaveisRef.current?.click()}>
            {uploadingRetornaveis ? <Loader2 className="h-7 w-7 mx-auto mb-1.5 animate-spin text-accent-500" /> : <Upload className="h-7 w-7 mx-auto mb-1.5 text-muted-foreground" />}
            <p className="text-sm font-medium">{uploadingRetornaveis ? 'Processando...' : 'Clique para importar (.csv)'}</p>
          </div>
          <input ref={inputRetornaveisRef} type="file" accept=".csv,.inf,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportarRetornaveis(f); if (inputRetornaveisRef.current) inputRetornaveisRef.current.value = '' }} />
        </div>
        <div className="border rounded-lg bg-white p-4">
          <label className="text-sm font-medium block mb-1.5">Data</label>
          <input type="date" value={dataOperacao} onChange={(e) => setDataOperacao(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="border rounded-lg bg-white p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><k.icon className="h-4 w-4" /> {k.label}</div>
            <div className={`text-2xl font-bold ${k.cor}`}>{k.valor}</div>
          </div>
        ))}
      </div>

      {/* Tabela por mapa */}
      <div className="border rounded-lg bg-white">
        <button onClick={() => setTabelaAberta(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 border-b text-left">
          {tabelaAberta ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <h2 className="font-semibold text-sm">Mapas — {formatarDataBR(dataOperacao)}</h2>
        </button>
        {tabelaAberta && (loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-accent-500" /></div>
        ) : !resumo || resumo.mapas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum mapa importado nesta data. Importe o Relatório de Separação acima.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Mapa</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Baias</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Itens</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Divergências</th>
                  <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Tempo</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Ajudante</th>
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resumo.mapas.map((m) => (
                  <tr key={m.mapa} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-semibold tabular-nums">
                      <button onClick={() => abrirDetalheMapa(m.mapa)} className="underline decoration-dotted hover:text-accent-700" title="Ver tempo por baia">
                        {m.mapa}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {m.concluido
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" /> Conferido</span>
                          : m.baiasConferidas > 0
                            ? <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"><Clock className="h-3 w-3" /> Em conferência</span>
                            : <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">Aguardando</span>}
                        {m.baiasPuladas > 0 && (
                          <span
                            title={m.puladasDetalhe.map((p) => `${p.rotulo} — ${p.motivo ?? 'sem motivo'}`).join('\n')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full cursor-help"
                          >
                            <AlertTriangle className="h-3 w-3" /> {m.baiasPuladas} pulada{m.baiasPuladas > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.baiasConferidas}/{m.totalBaias}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.itensConferidos}/{m.totalItens}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${m.divergencias > 0 ? 'text-red-600 font-semibold' : ''}`}>{m.divergencias}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.tempoMin != null ? `${m.tempoMin} min` : '—'}</td>
                    <td className="px-3 py-2">{m.conferidoPor ?? '—'}</td>
                    <td className="px-3 py-2">
                      {m.divergencias > 0 && (
                        <button
                          onClick={() => copiarDivergenciasMapa(m.mapa)}
                          disabled={copiandoDivergenciaMapa === m.mapa}
                          title="Copiar mensagem de divergência pra colar no grupo"
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                        >
                          {copiandoDivergenciaMapa === m.mapa
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Copy className="h-3.5 w-3.5" />}
                          {divergenciaCopiada === m.mapa ? 'Copiado!' : 'Copiar msg'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Mapas pendentes — não finalizados, de qualquer dia dentro da janela */}
      <div className="border rounded-lg bg-white">
        <button onClick={() => setMapasParadosAberta((v) => !v)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
          <span className="flex items-center gap-2 font-semibold text-sm">
            {mapasParadosAberta ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Mapas pendentes
          </span>
          {mapasParados.length > 0 && (
            <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{mapasParados.length}</span>
          )}
        </button>
        {mapasParadosAberta && (
          loadingMapasParados ? (
            <div className="flex items-center justify-center py-8 border-t"><Loader2 className="h-5 w-5 animate-spin text-accent-500" /></div>
          ) : mapasParados.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 border-t">
              Nenhum mapa pendente nos últimos 14 dias — tudo que foi importado está finalizado ou em andamento recente.
            </p>
          ) : (
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Mapa</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Data</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Baias pendentes</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Parado há</th>
                    <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Responsável</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mapasParados.map((m) => (
                    <tr key={`${m.mapa}-${m.data}`} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-semibold tabular-nums">{m.mapa}</td>
                      <td className="px-3 py-2">{formatarDataBR(m.data)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.baiasPendentes}/{m.totalBaias}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-700">{formatarMinutosParado(m.minutosParado)}</td>
                      <td className="px-3 py-2">{m.quemNome ?? <span className="text-muted-foreground">Ninguém iniciou</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <div className="border rounded-lg bg-white">
        <button onClick={() => setSugestoesAberta((v) => !v)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
          <span className="flex items-center gap-2 font-semibold text-sm">
            {sugestoesAberta ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <MessageSquare className="h-4 w-4 text-accent-600" /> Sugestões
          </span>
          <span className="text-xs text-muted-foreground">
            {sugestoes.filter((s) => s.status === 'respondida').length} de {sugestoes.length} respondida(s)
          </span>
        </button>
        {sugestoesAberta && (
          loadingSugestoes ? (
            <div className="flex items-center justify-center py-8 border-t"><Loader2 className="h-5 w-5 animate-spin text-accent-500" /></div>
          ) : sugestoes.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 border-t">
              Nenhuma sugestão registrada ainda — os colaboradores podem enviar pelo menu
              "Sugestões" no chat da Aurora, a qualquer momento.
            </p>
          ) : (
            <div className="border-t divide-y max-h-[420px] overflow-y-auto">
              {sugestoes.map((s) => (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold">
                      {s.nome ?? '—'}{' '}
                      <span className="text-muted-foreground font-normal">
                        · {s.mapa != null ? `Mapa ${s.mapa} · ${formatarDataBR(s.data)}` : 'Via chat da Aurora'}
                      </span>
                    </p>
                    {s.status === 'respondida'
                      ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Respondida</span>
                      : <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Aguardando</span>}
                  </div>
                  {s.resposta
                    ? <p className="text-sm text-gray-700 mt-1.5">"{s.resposta}"</p>
                    : <p className="text-xs text-muted-foreground mt-1.5">Ainda sem resposta.</p>}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {detalheMapa != null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="font-semibold flex items-center gap-1.5"><Timer className="h-4 w-4 text-accent-600" /> Tempo por baia — Mapa {detalheMapa}</h2>
                <p className="text-xs text-muted-foreground">{formatarDataBR(dataOperacao)}</p>
              </div>
              <button onClick={() => setDetalheMapa(null)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5">
              {carregandoDetalhe ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-accent-500" /></div>
              ) : erroDetalhe ? (
                <p className="text-sm text-red-600">{erroDetalhe}</p>
              ) : detalheBaias.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma baia encontrada.</p>
              ) : (
                <div className="space-y-2">
                  {detalheBaias.map((b) => {
                    const min = duracaoBaiaMin(b)
                    return (
                      <div key={b.id} className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{b.rotulo}</p>
                          {b.status === 'pulada'
                            ? <p className="text-xs text-orange-700">Pulada — {b.motivoPulada ?? 'sem motivo'}</p>
                            : b.status === 'pendente'
                              ? <p className="text-xs text-muted-foreground">{!b.iniciadaEm ? 'Ainda não iniciada' : 'Em andamento'}</p>
                              : <p className="text-xs text-green-700">Conferida</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-bold tabular-nums">{min != null ? `${min} min` : '—'}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setDetalheMapa(null)} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
