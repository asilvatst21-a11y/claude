import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Pencil, Phone, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { SALA_TML_LABEL } from '../lib/tml'
import type { SupervisorTML } from '../types'

export default function DistribuicaoTMLSupervisores() {
  const { usuario } = useAuth()
  const [supervisores, setSupervisores] = useState<SupervisorTML[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<SupervisorTML | null>(null)
  const [modal, setModal] = useState(false)
  const [excluindo, setExcluindo] = useState<SupervisorTML | null>(null)
  const [removendo, setRemovendo] = useState(false)
  const [erro, setErro] = useState('')

  const [nome, setNome] = useState('')
  const [sala, setSala] = useState<'COLORADO' | 'SUB-FURIA' | ''>('')
  const [telefone, setTelefone] = useState('')

  const fetchSupervisores = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const { data } = await supabase
      .from('supervisores_tml')
      .select('*')
      .eq('filial', usuario.filial)
      .order('nome')
    setSupervisores(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [usuario])

  useEffect(() => { fetchSupervisores() }, [fetchSupervisores])

  function abrirCriar() {
    setEditando(null)
    setNome('')
    setSala('')
    setTelefone('')
    setErro('')
    setModal(true)
  }

  function abrirEditar(s: SupervisorTML) {
    setEditando(s)
    setNome(s.nome)
    setSala(s.sala)
    setTelefone(s.telefone)
    setErro('')
    setModal(true)
  }

  async function handleSalvar() {
    if (!usuario || !nome.trim() || !sala || !telefone.trim()) return
    setSalvando(true)
    setErro('')
    try {
      if (editando) {
        const { error } = await supabase
          .from('supervisores_tml')
          .update({ nome: nome.trim(), sala, telefone: telefone.trim(), updated_at: new Date().toISOString() })
          .eq('id', editando.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('supervisores_tml')
          .insert({ filial: usuario.filial, nome: nome.trim(), sala, telefone: telefone.trim() })
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
      const { error } = await supabase.from('supervisores_tml').delete().eq('id', excluindo.id)
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
          <Link to="/distribuicao/tml" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold mt-1">Supervisores — TML</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre o supervisor responsável por sala para receber os alertas de TML
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
            <p className="text-sm mt-1">Cadastre um supervisor por sala para receber os alertas de TML.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sala</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">WhatsApp</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {supervisores.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{s.nome}</td>
                    <td className="px-4 py-3">{SALA_TML_LABEL[s.sala] ?? s.sala}</td>
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sala</label>
                <select value={sala} onChange={(e) => setSala(e.target.value as 'COLORADO' | 'SUB-FURIA')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                  <option value="">Selecione...</option>
                  <option value="COLORADO">COLORADO (7H)</option>
                  <option value="SUB-FURIA">SUB-FURIA (8H)</option>
                </select>
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
                disabled={salvando || !nome.trim() || !sala || !telefone.trim()}
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
