import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Plus, RefreshCw, Search, Users, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { Colaborador } from '../types'

// Campos que hoje são mantidos em duplicidade em outras telas (GSD, TML,
// Armazém) — aqui viram a fonte única. Ver supabase-migration-colaboradores-central.sql.
export default function Colaboradores() {
  const { usuario } = useAuth()
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [salvandoId, setSalvandoId] = useState<string | null>(null)

  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<Colaborador | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [nome, setNome] = useState('')
  const [matricula, setMatricula] = useState('')
  const [cargo, setCargo] = useState('')
  const [funcao, setFuncao] = useState('')
  const [equipe, setEquipe] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cpf, setCpf] = useState('')
  const [status, setStatus] = useState('')

  const fetchColaboradores = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const { data } = await supabase.from('colaboradores').select('*').eq('filial', usuario.filial).order('nome')
    setColaboradores((data ?? []) as Colaborador[])
    setLoading(false)
  }, [usuario])

  useEffect(() => { fetchColaboradores() }, [fetchColaboradores])

  function abrirCriar() {
    setEditando(null)
    setNome(''); setMatricula(''); setCargo(''); setFuncao(''); setEquipe(''); setTelefone(''); setCpf(''); setStatus('')
    setErro('')
    setModal(true)
  }

  function abrirEditar(c: Colaborador) {
    setEditando(c)
    setNome(c.nome); setMatricula(c.matricula ?? ''); setCargo(c.cargo ?? ''); setFuncao(c.funcao ?? '')
    setEquipe(c.equipe ?? ''); setTelefone(c.telefone ?? ''); setCpf(c.cpf ?? ''); setStatus(c.status ?? '')
    setErro('')
    setModal(true)
  }

  // Motoristas TML, Supervisores TML e Supervisores GSD ainda guardam seu
  // próprio telefone (usado direto pelos fluxos de WhatsApp) — em vez de já
  // trocar essas tabelas por completo, sincroniza o valor pra lá também
  // sempre que o telefone é corrigido aqui, casando por (filial, nome).
  async function sincronizarTelefone(filial: string, nomeColaborador: string, telefoneNovo: string | null) {
    await Promise.all([
      supabase.from('motoristas_sala_tml').update({ telefone: telefoneNovo }).eq('filial', filial).ilike('nome', nomeColaborador),
      supabase.from('supervisores_tml').update({ telefone: telefoneNovo }).eq('filial', filial).ilike('nome', nomeColaborador),
      supabase.from('gsdpq_supervisores').update({ telefone: telefoneNovo }).eq('filial', filial).ilike('nome', nomeColaborador),
    ])
  }

  async function handleSalvar() {
    if (!usuario || !nome.trim()) return
    setSalvando(true)
    setErro('')
    const campos = {
      filial: usuario.filial,
      nome: nome.trim(),
      matricula: matricula.trim() || null,
      cargo: cargo.trim() || null,
      funcao: funcao.trim() || null,
      equipe: equipe.trim() || null,
      telefone: telefone.trim() || null,
      cpf: cpf.trim() || null,
      status: status.trim() || null,
    }
    const { error } = editando
      ? await supabase.from('colaboradores').update(campos).eq('id', editando.id)
      : await supabase.from('colaboradores').insert(campos)
    setSalvando(false)
    if (error) {
      setErro(error.message.includes('duplicate') || error.message.includes('unique') ? 'Já existe um colaborador com esse nome.' : error.message)
      return
    }
    await sincronizarTelefone(usuario.filial, nome.trim(), campos.telefone)
    setModal(false)
    await fetchColaboradores()
  }

  // Edição rápida de telefone/cpf direto na tabela, sem abrir o modal.
  async function atualizarCampo(id: string, campos: Partial<Pick<Colaborador, 'telefone' | 'cpf'>>) {
    setSalvandoId(id)
    setColaboradores(prev => prev.map(c => (c.id === id ? { ...c, ...campos } : c)))
    await supabase.from('colaboradores').update(campos).eq('id', id)
    if ('telefone' in campos && usuario) {
      const colaborador = colaboradores.find(c => c.id === id)
      if (colaborador) await sincronizarTelefone(usuario.filial, colaborador.nome, campos.telefone ?? null)
    }
    setSalvandoId(null)
  }

  const buscaNorm = busca.trim().toLowerCase()
  const filtrados = useMemo(() => {
    if (!buscaNorm) return colaboradores
    return colaboradores.filter(c =>
      c.nome.toLowerCase().includes(buscaNorm) ||
      (c.matricula ?? '').toLowerCase().includes(buscaNorm) ||
      (c.equipe ?? '').toLowerCase().includes(buscaNorm) ||
      (c.funcao ?? '').toLowerCase().includes(buscaNorm)
    )
  }, [colaboradores, buscaNorm])

  const comTelefone = colaboradores.filter(c => c.telefone).length

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2"><Users className="h-5 w-5 text-accent-600" /> Colaboradores</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro central de nome, matrícula, cargo/função/equipe, telefone e CPF. Outras telas (GSD, TML,
            Armazém, Fixação de Motorista) já usam ou vão passar a usar esse cadastro em vez de manter listas
            próprias — cadastre ou corrija um colaborador aqui e ele aparece atualizado nos outros módulos.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <button onClick={fetchColaboradores} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button onClick={abrirCriar} className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent-500 hover:bg-accent-600 text-white text-sm transition-colors">
            <Plus className="h-4 w-4" /> Novo colaborador
          </button>
        </div>
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-sm">Lista de Colaboradores</h2>
            <p className="text-xs text-muted-foreground">{colaboradores.length} cadastrado(s) · {comTelefone} com telefone</p>
          </div>
          <div className="relative shrink-0">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar nome, matrícula, equipe..."
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md w-56 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum colaborador encontrado.</p>
            <p className="text-sm mt-1">Cadastre manualmente ou importe a planilha de colaboradores em Jornada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Matrícula</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cargo / Função</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Equipe</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Telefone</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">CPF</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtrados.map(c => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{c.nome}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.matricula ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{[c.cargo, c.funcao].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.equipe ?? c.sala ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        defaultValue={c.telefone ?? ''}
                        placeholder="—"
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v !== (c.telefone ?? '')) atualizarCampo(c.id, { telefone: v || null })
                        }}
                        disabled={salvandoId === c.id}
                        className="w-32 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        defaultValue={c.cpf ?? ''}
                        placeholder="—"
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v !== (c.cpf ?? '')) atualizarCampo(c.id, { cpf: v || null })
                        }}
                        disabled={salvandoId === c.id}
                        className="w-28 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.status ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => abrirEditar(c)} className="text-xs px-3 py-1.5 rounded-md border hover:bg-accent transition-colors">
                        Editar
                      </button>
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
              <h2 className="font-semibold">{editando ? 'Editar colaborador' : 'Novo colaborador'}</h2>
              <button onClick={() => setModal(false)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
                <input value={nome} onChange={e => setNome(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Matrícula</label>
                  <input value={matricula} onChange={e => setMatricula(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">CPF</label>
                  <input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="Só números" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Cargo</label>
                  <input value={cargo} onChange={e => setCargo(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Função</label>
                  <input value={funcao} onChange={e => setFuncao(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Equipe</label>
                  <input value={equipe} onChange={e => setEquipe(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                  <input value={status} onChange={e => setStatus(e.target.value)} placeholder="Ex: TRABALHANDO" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Telefone (WhatsApp)</label>
                <input
                  type="tel"
                  value={telefone}
                  onChange={e => setTelefone(e.target.value)}
                  placeholder="Ex: 21999999999 ou 5521999999999"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setModal(false)} disabled={salvando} className="px-4 py-2 rounded-lg text-sm border hover:bg-accent transition-colors">Cancelar</button>
              <button
                onClick={handleSalvar}
                disabled={salvando || !nome.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white transition-colors"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
