import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, CheckCircle2, Image, Loader2, Pencil, Phone, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { listarGrupos, type GrupoZApi } from '../lib/zapi'
import { GroupPicker } from './DistribuicaoTMLWhatsappConfig'
import type { GsdpqSupervisor } from '../types'

export default function GsdpqSupervisores() {
  const { usuario } = useAuth()
  const [supervisores, setSupervisores] = useState<GsdpqSupervisor[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<GsdpqSupervisor | null>(null)
  const [modal, setModal] = useState(false)
  const [excluindo, setExcluindo] = useState<GsdpqSupervisor | null>(null)
  const [removendo, setRemovendo] = useState(false)
  const [erro, setErro] = useState('')

  const [nome, setNome] = useState('')
  const [equipe, setEquipe] = useState('')
  const [telefone, setTelefone] = useState('')

  // Grupo de WhatsApp que recebe a imagem com os vencimentos (botão manual
  // na aba Vencimentos — não há cron automático no plano atual do Vercel).
  const [grupoVencimento, setGrupoVencimento] = useState('')
  const [grupoOriginal, setGrupoOriginal] = useState('')
  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscandoGrupos, setBuscandoGrupos] = useState(false)
  const [erroBuscaGrupos, setErroBuscaGrupos] = useState<string | null>(null)
  const [salvandoGrupo, setSalvandoGrupo] = useState(false)
  const [grupoSalvo, setGrupoSalvo] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  const fetchSupervisores = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const [{ data }, { data: filialRow }] = await Promise.all([
      supabase.from('gsdpq_supervisores').select('*').eq('filial', usuario.filial).order('equipe'),
      supabase.from('filiais').select('grupo_gsdpq_whatsapp').eq('nome', usuario.filial).maybeSingle(),
    ])
    setSupervisores(Array.isArray(data) ? data : [])
    const g = filialRow?.grupo_gsdpq_whatsapp ?? ''
    setGrupoVencimento(g)
    setGrupoOriginal(g)
    setLoading(false)
  }, [usuario])

  useEffect(() => { fetchSupervisores() }, [fetchSupervisores])

  async function buscarGrupos() {
    setBuscandoGrupos(true)
    setErroBuscaGrupos(null)
    const { grupos: gs, erro: e } = await listarGrupos()
    setBuscandoGrupos(false)
    if (e) { setErroBuscaGrupos(e); return }
    if (gs.length === 0) { setErroBuscaGrupos('Nenhum grupo encontrado nesta instância Z-API.'); return }
    setGrupos(gs.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function salvarGrupo() {
    if (!usuario) return
    setSalvandoGrupo(true)
    setGrupoSalvo(false)
    await supabase.from('filiais').update({ grupo_gsdpq_whatsapp: grupoVencimento.trim() || null }).eq('nome', usuario.filial)
    setGrupoOriginal(grupoVencimento.trim())
    setSalvandoGrupo(false)
    setGrupoSalvo(true)
    setTimeout(() => setGrupoSalvo(false), 2500)
  }

  async function copiarGrupo(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiado(id)
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500)
    } catch {
      /* clipboard indisponível */
    }
  }

  const grupoAlterado = grupoVencimento.trim() !== grupoOriginal

  function abrirCriar() {
    setEditando(null)
    setNome('')
    setEquipe('')
    setTelefone('')
    setErro('')
    setModal(true)
  }

  function abrirEditar(s: GsdpqSupervisor) {
    setEditando(s)
    setNome(s.nome)
    setEquipe(s.equipe)
    setTelefone(s.telefone)
    setErro('')
    setModal(true)
  }

  async function handleSalvar() {
    if (!usuario || !nome.trim() || !equipe.trim() || !telefone.trim()) return
    setSalvando(true)
    setErro('')
    try {
      if (editando) {
        const { error } = await supabase
          .from('gsdpq_supervisores')
          .update({ nome: nome.trim(), equipe: equipe.trim(), telefone: telefone.trim(), updated_at: new Date().toISOString() })
          .eq('id', editando.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('gsdpq_supervisores')
          .insert({ filial: usuario.filial, nome: nome.trim(), equipe: equipe.trim(), telefone: telefone.trim() })
        if (error) throw new Error(error.message)
      }
      setModal(false)
      await fetchSupervisores()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir() {
    if (!excluindo) return
    setRemovendo(true)
    try {
      const { error } = await supabase.from('gsdpq_supervisores').delete().eq('id', excluindo.id)
      if (error) throw new Error(error.message)
      setExcluindo(null)
      await fetchSupervisores()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir')
    } finally {
      setRemovendo(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/gsdpq" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold mt-1">Supervisores — GSDPQ</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre o supervisor responsável por equipe para receber os alertas de vencimento do GSD
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={fetchSupervisores} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button onClick={abrirCriar} className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-sm transition-colors">
            <Plus className="h-4 w-4" /> Novo supervisor
          </button>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-1.5"><Image className="h-4 w-4" /> Grupo de WhatsApp — Vencimentos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recebe a imagem com todos os colaboradores a 15 dias ou menos do vencimento quando você clicar em "Gerar e enviar vencimentos" na aba Vencimentos.
            </p>
          </div>
          <button
            onClick={buscarGrupos}
            disabled={buscandoGrupos}
            className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50 shrink-0"
          >
            {buscandoGrupos ? <Loader2 className="h-4 w-4 animate-spin" /> : grupos.length > 0 ? <RefreshCw className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            {buscandoGrupos ? 'Buscando…' : grupos.length > 0 ? 'Atualizar grupos' : 'Buscar grupos (Z-API)'}
          </button>
        </div>
        <div className="p-4 space-y-3">
          {erroBuscaGrupos && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="break-all">{erroBuscaGrupos}</span>
            </div>
          )}
          <GroupPicker
            label="Grupo de vencimentos do GSD"
            value={grupoVencimento}
            onChange={setGrupoVencimento}
            grupos={grupos}
            onCopy={copiarGrupo}
            copiado={copiado}
          />
          <div className="flex items-center justify-end gap-3">
            {grupoSalvo && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Salvo!</span>}
            <button
              onClick={salvarGrupo}
              disabled={salvandoGrupo || !grupoAlterado}
              className="px-4 py-2 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
            >
              {salvandoGrupo ? 'Salvando…' : 'Salvar grupo'}
            </button>
          </div>
        </div>
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Lista de Supervisores</h2>
          <p className="text-xs text-muted-foreground">{supervisores.length} supervisor(es) cadastrado(s)</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
          </div>
        ) : supervisores.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum supervisor cadastrado.</p>
            <p className="text-sm mt-1">Cadastre um supervisor por equipe para receber os alertas de vencimento.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Equipe</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">WhatsApp</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {supervisores.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{s.nome}</td>
                    <td className="px-4 py-3">{s.equipe}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-green-600" />
                        <span>{s.telefone}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => abrirEditar(s)} className="flex items-center gap-1 px-3 py-1.5 rounded-md border text-xs hover:bg-accent transition-colors">
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                        <button onClick={() => setExcluindo(s)} className="flex items-center gap-1 px-3 py-1.5 rounded-md border text-xs hover:bg-accent transition-colors">
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">{editando ? 'Editar supervisor' : 'Novo supervisor'}</h2>
              <button onClick={() => setModal(false)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: João Silva" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Equipe</label>
                <input
                  value={equipe}
                  onChange={(e) => setEquipe(e.target.value)}
                  placeholder="Ex: SUB-FÚRIA (igual ao campo Equipe do colaborador)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use exatamente o mesmo nome de equipe cadastrado nos colaboradores.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">WhatsApp</label>
                <input
                  type="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="Ex: 21999999999 ou 5521999999999"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Digite apenas números. O código do país (55) será adicionado automaticamente se não informado.
                </p>
              </div>
              {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setModal(false)} disabled={salvando} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Cancelar</button>
              <button
                onClick={handleSalvar}
                disabled={salvando || !nome.trim() || !equipe.trim() || !telefone.trim()}
                className="px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors"
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {excluindo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">Excluir supervisor</h2>
              <button onClick={() => setExcluindo(null)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 text-sm">
              Tem certeza que deseja excluir <strong>{excluindo.nome}</strong>? Essa ação não pode ser desfeita.
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setExcluindo(null)} disabled={removendo} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Cancelar</button>
              <button onClick={handleExcluir} disabled={removendo} className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors">
                {removendo ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
