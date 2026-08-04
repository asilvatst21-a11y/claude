import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Power, RefreshCw, Search, Settings2, Upload, TrafficCone, AlertTriangle } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { formatarDataBR } from '../lib/utils'
import { formatarBRL } from '../lib/variavelArmazem'
import { listarGrupos, type GrupoZApi } from '../lib/zapi'
import { GroupPicker } from './DistribuicaoTMLWhatsappConfig'
import {
  buscarFarol, listarWatchlist, salvarWatchlistItem, alternarAtivoWatchlist, importarCora,
  CATEGORIA_LABEL, type FarolLinha, type WatchlistItem, type CategoriaWatchlist, type StatusFarol,
} from '../lib/farolCriticos'

const STATUS_CSS: Record<StatusFarol, string> = {
  pendente: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  iniciado: 'bg-blue-50 text-blue-700 border-blue-200',
  concluido: 'bg-green-50 text-green-700 border-green-200',
  atencao: 'bg-red-50 text-red-700 border-red-200',
  sem_mapa: 'bg-gray-100 text-gray-500 border-gray-200',
}
const STATUS_TAB_LABEL: Record<StatusFarol, string> = {
  pendente: 'Pendente', iniciado: 'Iniciado', concluido: 'Concluído', atencao: 'Atenção', sem_mapa: 'Sem mapa',
}

function hojeISO() { return new Date().toISOString().slice(0, 10) }

export default function DistribuicaoFarolCriticos() {
  const { usuario } = useAuth()
  const [data, setData] = useState(hojeISO())
  const [categoria, setCategoria] = useState<CategoriaWatchlist>('pdv_critico')
  const [filtroStatus, setFiltroStatus] = useState<StatusFarol | 'todos'>('todos')
  const [linhas, setLinhas] = useState<FarolLinha[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [abaCadastro, setAbaCadastro] = useState(false)
  const [novoCodigo, setNovoCodigo] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [novaCategoria, setNovaCategoria] = useState<CategoriaWatchlist>('pdv_critico')
  const [salvandoCadastro, setSalvandoCadastro] = useState(false)

  const [importando, setImportando] = useState(false)
  const [msgImport, setMsgImport] = useState('')

  const [configAberta, setConfigAberta] = useState(false)
  const [grupoFarol, setGrupoFarol] = useState('')
  const [grupoFarolOriginal, setGrupoFarolOriginal] = useState('')
  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscandoGrupos, setBuscandoGrupos] = useState(false)
  const [erroGrupos, setErroGrupos] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)

  const fetchConfig = useCallback(async () => {
    if (!usuario) return
    const { data: row } = await supabase.from('filiais').select('grupo_farol_criticos_whatsapp').eq('nome', usuario.filial).maybeSingle()
    const v = row?.grupo_farol_criticos_whatsapp ?? ''
    setGrupoFarol(v)
    setGrupoFarolOriginal(v)
  }, [usuario])

  useEffect(() => { fetchConfig() }, [fetchConfig])

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
    } catch { /* clipboard indisponível */ }
  }

  async function handleSalvarGrupoFarol() {
    if (!usuario) return
    setSalvandoGrupo(true)
    const v = grupoFarol.trim()
    await supabase.from('filiais').update({ grupo_farol_criticos_whatsapp: v || null }).eq('nome', usuario.filial)
    setGrupoFarolOriginal(v)
    setSalvandoGrupo(false)
    alert('Configuração salva.')
  }

  const carregar = useCallback(async () => {
    if (!usuario) return
    setCarregando(true)
    setErro('')
    try {
      const [f, w] = await Promise.all([buscarFarol(usuario.filial, data), listarWatchlist(usuario.filial)])
      setLinhas(f)
      setWatchlist(w)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar o Farol.')
    }
    setCarregando(false)
  }, [usuario, data])

  useEffect(() => { carregar() }, [carregar])

  async function adicionarWatchlist() {
    if (!usuario || !novoCodigo.trim() || !novoNome.trim()) return
    setSalvandoCadastro(true)
    const { error } = await salvarWatchlistItem({ filial: usuario.filial, codigo: novoCodigo, nome: novoNome, categoria: novaCategoria })
    setSalvandoCadastro(false)
    if (error) { setErro(`Erro ao cadastrar: ${error}`); return }
    setNovoCodigo(''); setNovoNome('')
    await carregar()
  }

  async function alternarWatchlist(item: WatchlistItem) {
    await alternarAtivoWatchlist(item.id, !item.ativo)
    await carregar()
  }

  async function handleImportarCora(file: File) {
    if (!usuario) return
    setImportando(true)
    setMsgImport('')
    setErro('')
    try {
      const { contagem } = await importarCora(file, usuario.filial, data)
      setMsgImport(`✅ ${contagem} nota(s) importada(s) do CORA para ${formatarDataBR(data)}.`)
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao importar CORA')
    }
    setImportando(false)
  }

  if (!usuario) return null

  const linhasDaCategoria = linhas.filter((l) => l.categoria === categoria)
  const linhasFiltradas = filtroStatus === 'todos' ? linhasDaCategoria : linhasDaCategoria.filter((l) => l.statusFarol === filtroStatus)
  const kpis: Record<StatusFarol, number> = { pendente: 0, iniciado: 0, concluido: 0, atencao: 0, sem_mapa: 0 }
  for (const l of linhasDaCategoria) kpis[l.statusFarol]++

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <TrafficCone className="h-6 w-6 text-primary" /> Farol de Mercados e PDVs Críticos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Status de entrega vindo do BEES (por PDV), motorista/placa de escalas_tml, valor da nota do CORA.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="px-3 py-2 text-sm border rounded-md" />
          <button onClick={() => setConfigAberta((v) => !v)} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border hover:bg-accent transition-colors">
            <Settings2 size={14} /> Config. WhatsApp
          </button>
          <button onClick={carregar} disabled={carregando} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {configAberta && (
        <div className="border rounded-lg bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <label className="block text-sm font-medium">Grupo de WhatsApp — imagem do Farol</label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enviada de novo a cada import do BEES em Jornada e Tempo em Rota. Para sozinha quando todos os
                PDVs da watchlist do dia estiverem "Concluído".
              </p>
            </div>
            <button onClick={buscarGruposZapi} disabled={buscandoGrupos}
              className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50 shrink-0">
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

          <GroupPicker label="Grupo do Farol de Críticos" value={grupoFarol} onChange={setGrupoFarol} grupos={grupos} onCopy={copiarId} copiado={copiado} />

          <div className="flex justify-end">
            <button onClick={handleSalvarGrupoFarol} disabled={salvandoGrupo || grupoFarol.trim() === grupoFarolOriginal}
              className="px-4 py-2 text-sm rounded-md bg-brand-700 text-white disabled:opacity-50">
              {salvandoGrupo ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {erro && <div className="text-sm text-red-700 bg-red-50 rounded-md p-3">{erro}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(['pendente', 'iniciado', 'concluido', 'atencao', 'sem_mapa'] as StatusFarol[]).map((s) => (
          <div key={s} className={`rounded-xl border p-3 ${STATUS_CSS[s]}`}>
            <p className="text-2xl font-bold">{kpis[s]}</p>
            <p className="text-xs">{STATUS_TAB_LABEL[s]}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {(Object.keys(CATEGORIA_LABEL) as CategoriaWatchlist[]).map((c) => (
          <button key={c} onClick={() => { setCategoria(c); setAbaCadastro(false) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap flex items-center gap-1.5 ${!abaCadastro && categoria === c ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {CATEGORIA_LABEL[c]}
            <span className="bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full">{watchlist.filter((w) => w.categoria === c && w.ativo).length}</span>
          </button>
        ))}
        <button onClick={() => setAbaCadastro(true)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${abaCadastro ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Cadastro
        </button>
      </div>

      {!abaCadastro ? (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Status:</span>
            {(['todos', 'pendente', 'iniciado', 'concluido', 'atencao', 'sem_mapa'] as const).map((s) => (
              <button key={s} onClick={() => setFiltroStatus(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filtroStatus === s ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s === 'todos' ? 'Todos' : STATUS_TAB_LABEL[s]}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
            {carregando ? (
              <div className="flex justify-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">PDV</th>
                    <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Mapa</th>
                    <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">Motorista</th>
                    <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Placa</th>
                    <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Status</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Valor NF</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasFiltradas.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-400">Nenhum item nesse filtro.</td></tr>
                  )}
                  {linhasFiltradas.map((l) => (
                    <tr key={l.watchlistId} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900">{l.nome}</p>
                        <p className="text-xs text-gray-400">{l.codigo}</p>
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{l.mapa ?? '—'}</td>
                      <td className="px-3 py-2.5 text-gray-700">{l.motorista ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{l.placa ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_CSS[l.statusFarol]}`}>{l.statusLabel}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{l.valorNota != null ? formatarBRL(l.valorNota) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-lg border border-dashed p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium">Importar CORA</p>
              <p className="text-xs text-muted-foreground">CSV do CORA (ponto e vírgula) — só usado pra puxar o valor da nota por cliente. O status de entrega continua vindo do BEES.</p>
              {msgImport && <p className="text-xs text-green-700 mt-1">{msgImport}</p>}
            </div>
            <label className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border hover:bg-accent transition-colors cursor-pointer">
              {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importando ? 'Importando…' : 'Selecionar CSV'}
              <input type="file" accept=".csv,.txt" className="hidden" disabled={importando}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportarCora(f); e.target.value = '' }} />
            </label>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold mb-3">Novo item na watchlist</p>
            <div className="grid sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Código do PDV</label>
                <input value={novoCodigo} onChange={(e) => setNovoCodigo(e.target.value)} placeholder="Ex: 9631" className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Nome</label>
                <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: Arena das Bebidas" className="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Categoria</label>
                <select value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value as CategoriaWatchlist)} className="w-full border rounded px-2 py-1.5 text-sm bg-white">
                  {(Object.keys(CATEGORIA_LABEL) as CategoriaWatchlist[]).map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}
                </select>
              </div>
              <button onClick={adicionarWatchlist} disabled={salvandoCadastro || !novoCodigo.trim() || !novoNome.trim()}
                className="flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-md bg-brand-700 text-white disabled:opacity-50">
                {salvandoCadastro ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Código</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">Nome</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 text-xs">Categoria</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-500 text-xs">Ativo</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-gray-400">Nenhum item cadastrado.</td></tr>}
                {watchlist.map((w) => (
                  <tr key={w.id} className={`border-b border-gray-50 ${!w.ativo ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-2 font-mono">{w.codigo}</td>
                    <td className="px-3 py-2">{w.nome}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{CATEGORIA_LABEL[w.categoria]}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => alternarWatchlist(w)} className="p-1 rounded hover:bg-gray-100" title={w.ativo ? 'Desativar' : 'Reativar'}>
                        <Power className={`h-4 w-4 ${w.ativo ? 'text-green-600' : 'text-gray-400'}`} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
