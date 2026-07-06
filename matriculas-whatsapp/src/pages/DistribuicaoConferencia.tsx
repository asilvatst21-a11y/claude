import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ClipboardCheck, Upload, Loader2, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, Search, Link2, Settings2, ExternalLink,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { listarGrupos, type GrupoZApi } from '../lib/zapi'
import { GroupPicker } from './DistribuicaoTMLWhatsappConfig'
import { importarSeparacao, buscarResumoDia, type ResumoDiaConf } from '../lib/conferencia'
import { formatarDataBR } from '../lib/utils'

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function DistribuicaoConferencia() {
  const { usuario } = useAuth()
  const [dataOperacao, setDataOperacao] = useState(hojeISO)
  const [resumo, setResumo] = useState<ResumoDiaConf | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [erro, setErro] = useState('')
  const [ultimoImport, setUltimoImport] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [configAberta, setConfigAberta] = useState(false)
  const [grupo, setGrupo] = useState('')
  const [grupoOriginal, setGrupoOriginal] = useState('')
  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscandoGrupos, setBuscandoGrupos] = useState(false)
  const [erroGrupos, setErroGrupos] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

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

  useEffect(() => { fetchResumo() }, [fetchResumo])
  useEffect(() => { fetchConfig() }, [fetchConfig])

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
        <button onClick={() => copiarId(linkPublico)} className="ml-auto text-xs px-2 py-1 rounded border border-accent-300 text-accent-700 hover:bg-accent-100">{copiado === linkPublico ? 'Copiado' : 'Copiar link'}</button>
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
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
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
        <div className="px-4 py-3 border-b"><h2 className="font-semibold text-sm">Mapas — {formatarDataBR(dataOperacao)}</h2></div>
        {loading ? (
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
                  <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Conferente</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resumo.mapas.map((m) => (
                  <tr key={m.mapa} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-semibold tabular-nums">{m.mapa}</td>
                    <td className="px-3 py-2">
                      {m.concluido
                        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" /> Conferido</span>
                        : m.baiasConferidas > 0
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"><Clock className="h-3 w-3" /> Em conferência</span>
                          : <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">Aguardando</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.baiasConferidas}/{m.totalBaias}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.itensConferidos}/{m.totalItens}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${m.divergencias > 0 ? 'text-red-600 font-semibold' : ''}`}>{m.divergencias}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.tempoMin != null ? `${m.tempoMin} min` : '—'}</td>
                    <td className="px-3 py-2">{m.conferidoPor ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
