import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Usuario, Filial, DtoAvaliador } from '../types'
import { SECOES_SISTEMA } from '../types'
import { Plus, Pencil, Trash2, Shield, KeyRound, Building2, UserCheck, Search, Loader2, Lock } from 'lucide-react'
import { listarGrupos, type GrupoZApi } from '../lib/zapi'

const AVALIADORES_PADRAO = [
  'ERIC DUNSHEE DE ABRANCHES MUSS',
  'RAFAEL MERCALDO RAPOZO',
  'EMERSON DE SOUZA VALENTIM',
  'ANDERSON ASSIS SILVA',
  'ROBERTA SOARES',
  'ARTHUR FERREIRA',
  'ISABELA KIMEL',
]

const SENHA_PADRAO = 'LOG20123'

type AbaTipo = 'filiais' | 'usuarios' | 'avaliadores'

export default function Admin() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<AbaTipo>('usuarios')
  const [filiais, setFiliais] = useState<Filial[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [avaliadores, setAvaliadores] = useState<DtoAvaliador[]>([])

  async function carregar() {
    const [{ data: f }, { data: u }, { data: av }] = await Promise.all([
      supabase.from('filiais').select('*').order('nome'),
      supabase.from('usuarios').select('*').order('filial').order('login'),
      supabase.from('dto_avaliadores').select('*').order('filial').order('nome'),
    ])
    setFiliais(f ?? [])
    setUsuarios(u ?? [])
    setAvaliadores(av ?? [])
  }

  useEffect(() => { carregar() }, [])

  if (!usuario?.admin) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          Acesso negado. Apenas administradores podem ver esta página.
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Administração</h2>

      <div className="flex gap-2 border-b border-gray-200 mb-6">
        <button
          onClick={() => setAba('usuarios')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'usuarios' ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Usuários
        </button>
        <button
          onClick={() => setAba('filiais')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'filiais' ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Filiais
        </button>
        <button
          onClick={() => setAba('avaliadores')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            aba === 'avaliadores' ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Avaliadores DTO
        </button>
      </div>

      {aba === 'usuarios'    && <AbaUsuarios    usuarios={usuarios} filiais={filiais} recarregar={carregar} usuarioAtual={usuario} />}
      {aba === 'filiais'     && <AbaFiliais     filiais={filiais} recarregar={carregar} />}
      {aba === 'avaliadores' && <AbaAvaliadores avaliadores={avaliadores} filiais={filiais} filialAtual={usuario.filial} recarregar={carregar} />}
    </div>
  )
}

function AbaUsuarios({
  usuarios, filiais, recarregar, usuarioAtual,
}: {
  usuarios: Usuario[]
  filiais: Filial[]
  recarregar: () => void
  usuarioAtual: Usuario
}) {
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ filial: '', login: '', senha: '', nome: '', admin: false })
  const [loading, setLoading] = useState(false)

  // Painel de permissões
  const [permModal, setPermModal] = useState<Usuario | null>(null)
  const [permSelecionadas, setPermSelecionadas] = useState<string[]>([])
  const [savingPerm, setSavingPerm] = useState(false)

  function abrirPermissoes(u: Usuario) {
    // null = sem restrição → pré-seleciona tudo para exibição
    setPermSelecionadas(u.permissoes ?? SECOES_SISTEMA.map(s => s.key))
    setPermModal(u)
  }

  function togglePerm(key: string) {
    setPermSelecionadas(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  async function salvarPermissoes() {
    if (!permModal) return
    setSavingPerm(true)
    await supabase.from('usuarios').update({ permissoes: permSelecionadas }).eq('id', permModal.id)
    setSavingPerm(false)
    setPermModal(null)
    recarregar()
  }

  function abrirNovo() {
    setForm({ filial: filiais[0]?.nome ?? '', login: '', senha: '', nome: '', admin: false })
    setEditId(null)
    setModal(true)
  }

  function abrirEditar(u: Usuario) {
    setForm({ filial: u.filial, login: u.login, senha: '', nome: u.nome ?? '', admin: u.admin })
    setEditId(u.id)
    setModal(true)
  }

  async function salvar() {
    setLoading(true)
    if (editId) {
      const payload: Record<string, unknown> = {
        filial: form.filial, login: form.login, nome: form.nome, admin: form.admin,
      }
      if (form.senha) payload.senha = form.senha
      await supabase.from('usuarios').update(payload).eq('id', editId)
    } else {
      await supabase.from('usuarios').insert({
        filial: form.filial,
        login: form.login,
        senha: form.senha || SENHA_PADRAO,
        nome: form.nome || null,
        admin: form.admin,
      })
    }
    setLoading(false)
    setModal(false)
    recarregar()
  }

  async function excluir(u: Usuario) {
    if (u.id === usuarioAtual.id) {
      alert('Você não pode excluir o próprio usuário.')
      return
    }
    if (!confirm(`Excluir o usuário ${u.login} (${u.filial})?`)) return
    await supabase.from('usuarios').delete().eq('id', u.id)
    recarregar()
  }

  async function resetarSenha(u: Usuario) {
    if (!confirm(`Resetar a senha de ${u.login} para "${SENHA_PADRAO}"?`)) return
    await supabase.from('usuarios').update({ senha: SENHA_PADRAO }).eq('id', u.id)
    alert(`Senha resetada para: ${SENHA_PADRAO}`)
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={abrirNovo}
          disabled={filiais.length === 0}
          className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Novo Usuário
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Filial</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Login</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Admin</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Acesso</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.length === 0 && (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">Nenhum usuário</td></tr>
            )}
            {usuarios.map(u => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700">{u.filial}</td>
                <td className="px-4 py-3 font-mono text-gray-900">{u.login}</td>
                <td className="px-4 py-3 text-gray-700">{u.nome ?? '—'}</td>
                <td className="px-4 py-3">
                  {u.admin
                    ? <span className="inline-flex items-center gap-1 text-xs bg-accent-50 text-accent-700 px-2 py-0.5 rounded-full"><Shield size={12} /> Admin</span>
                    : <span className="text-xs text-gray-400">—</span>
                  }
                </td>
                <td className="px-4 py-3">
                  {u.admin
                    ? <span className="text-xs text-gray-400">Todas</span>
                    : u.permissoes === null
                      ? <span className="text-xs text-gray-400">Sem restrição</span>
                      : <span className="text-xs text-brand-700 font-medium">{u.permissoes.length} seção(ões)</span>
                  }
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => resetarSenha(u)} title="Resetar senha" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded">
                      <KeyRound size={15} />
                    </button>
                    {!u.admin && (
                      <button onClick={() => abrirPermissoes(u)} title="Gerenciar acesso" className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded">
                        <Lock size={15} />
                      </button>
                    )}
                    <button onClick={() => abrirEditar(u)} title="Editar" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => excluir(u)} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{editId ? 'Editar Usuário' : 'Novo Usuário'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filial *</label>
                <select
                  value={form.filial}
                  onChange={e => setForm(f => ({ ...f, filial: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {filiais.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Login *</label>
                <input
                  value={form.login}
                  onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome (opcional)</label>
                <input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha {editId ? '(deixe em branco para manter)' : '*'}
                </label>
                <input
                  type="text"
                  value={form.senha}
                  onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder={editId ? '••••••' : `Padrão: ${SENHA_PADRAO}`}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.admin}
                  onChange={e => setForm(f => ({ ...f, admin: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 flex items-center gap-1"><Shield size={14} /> Administrador</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button
                onClick={salvar}
                disabled={loading || !form.login || !form.filial || (!editId && !form.senha)}
                className="px-4 py-2 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg font-medium"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Permissões */}
      {permModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Lock size={18} className="text-purple-600" /> Acesso por Seção
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">{permModal.login} · {permModal.filial}</p>
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-4">
              Marque as seções que este usuário pode acessar. Desmarque todas para bloquear o acesso completo.
            </p>

            <div className="space-y-4">
              {(['Segurança', 'Gente', 'Financeiro', 'Distribuição', 'Admin'] as const).map(grupo => {
                const secoes = SECOES_SISTEMA.filter(s => s.grupo === grupo)
                return (
                  <div key={grupo}>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">{grupo}</p>
                    <div className="space-y-1">
                      {secoes.map(s => (
                        <label key={s.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={permSelecionadas.includes(s.key)}
                            onChange={() => togglePerm(s.key)}
                            className="rounded text-brand-700"
                          />
                          <span className="text-sm text-gray-700">{s.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-gray-100">
              <button
                onClick={() => setPermSelecionadas(SECOES_SISTEMA.map(s => s.key))}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
              >
                Marcar tudo
              </button>
              <button
                onClick={() => setPermSelecionadas([])}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
              >
                Desmarcar tudo
              </button>
              <div className="flex-1" />
              <button onClick={() => setPermModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button
                onClick={salvarPermissoes}
                disabled={savingPerm}
                className="px-4 py-2 text-sm bg-brand-700 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-2"
              >
                {savingPerm ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                Salvar acesso
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function AbaFiliais({ filiais, recarregar }: { filiais: Filial[]; recarregar: () => void }) {
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [grupoWhatsapp, setGrupoWhatsapp] = useState('')
  const [loading, setLoading] = useState(false)
  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscandoGrupos, setBuscandoGrupos] = useState(false)
  const [filtroGrupo, setFiltroGrupo] = useState('')

  function abrirNovo() {
    setNome(''); setGrupoWhatsapp(''); setGrupos([]); setFiltroGrupo(''); setEditId(null); setModal(true)
  }

  function abrirEditar(f: Filial) {
    setNome(f.nome); setGrupoWhatsapp(f.grupo_fluxo_whatsapp ?? ''); setGrupos([]); setFiltroGrupo(''); setEditId(f.id); setModal(true)
  }

  async function buscarGrupos() {
    setBuscandoGrupos(true)
    const { grupos: gs, erro } = await listarGrupos()
    setBuscandoGrupos(false)
    if (erro) { alert(`Não foi possível buscar os grupos no Z-API:\n${erro}`); return }
    if (gs.length === 0) { alert('Nenhum grupo encontrado nesta instância Z-API.'); return }
    setGrupos(gs.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function salvar() {
    setLoading(true)
    const payload = { nome, grupo_fluxo_whatsapp: grupoWhatsapp.trim() || null }
    if (editId) {
      await supabase.from('filiais').update(payload).eq('id', editId)
    } else {
      await supabase.from('filiais').insert(payload)
    }
    setLoading(false)
    setModal(false)
    recarregar()
  }

  async function excluir(f: Filial) {
    if (!confirm(`Excluir a filial ${f.nome}?\n\nAtenção: usuários e cadastros vinculados continuarão referenciando este nome.`)) return
    await supabase.from('filiais').delete().eq('id', f.id)
    recarregar()
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={abrirNovo} className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> Nova Filial
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filiais.length === 0 && (
              <tr><td colSpan={2} className="text-center py-10 text-gray-400">Nenhuma filial cadastrada</td></tr>
            )}
            {filiais.map(f => (
              <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700 flex items-center gap-2"><Building2 size={14} className="text-brand-600" /> {f.nome}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => abrirEditar(f)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Pencil size={15} /></button>
                    <button onClick={() => excluir(f)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{editId ? 'Editar Filial' : 'Nova Filial'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Filial *</label>
                <input
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Ex: CDD CAMPOS"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Grupo WhatsApp — Fluxo Punitivo</label>
                  <button
                    type="button"
                    onClick={buscarGrupos}
                    disabled={buscandoGrupos}
                    className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-900 border border-brand-200 px-2 py-1 rounded-lg hover:bg-brand-50 disabled:opacity-50"
                  >
                    {buscandoGrupos ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    {buscandoGrupos ? 'Buscando…' : 'Buscar grupos (Z-API)'}
                  </button>
                </div>

                {grupos.length > 0 && (
                  <div className="mb-2 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-2 py-1.5 border-b border-gray-100 bg-gray-50">
                      <input
                        value={filtroGrupo}
                        onChange={e => setFiltroGrupo(e.target.value)}
                        placeholder="Filtrar grupos…"
                        className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-400"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {grupos
                        .filter(g => !filtroGrupo || g.name.toLowerCase().includes(filtroGrupo.toLowerCase()))
                        .map(g => (
                          <button
                            key={g.phone}
                            type="button"
                            onClick={() => setGrupoWhatsapp(g.phone)}
                            className={`w-full text-left px-3 py-2 text-xs border-b border-gray-50 hover:bg-brand-50 ${grupoWhatsapp === g.phone ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'}`}
                          >
                            <span className="block truncate">{g.name}</span>
                            <span className="block text-[10px] text-gray-400 font-mono truncate">{g.phone}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                <input
                  value={grupoWhatsapp}
                  onChange={e => setGrupoWhatsapp(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Ex: 120363019502650977-group"
                />
                <p className="text-xs text-gray-400 mt-1">Clique em "Buscar grupos" para listar os grupos da sua instância Z-API e selecionar — ou cole o ID do grupo manualmente.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button
                onClick={salvar}
                disabled={loading || !nome}
                className="px-4 py-2 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg font-medium"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function AbaAvaliadores({
  avaliadores, filiais, filialAtual, recarregar,
}: {
  avaliadores: DtoAvaliador[]
  filiais: Filial[]
  filialAtual: string
  recarregar: () => void
}) {
  const [filialFiltro, setFilialFiltro] = useState(filialAtual)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)
  const [semeando, setSemeando] = useState(false)

  const lista = avaliadores.filter(a => a.filial === filialFiltro).sort((a, b) => a.nome.localeCompare(b.nome))
  const nomesCadastrados = new Set(lista.map(a => a.nome.toUpperCase()))
  const faltamPadrao = AVALIADORES_PADRAO.filter(n => !nomesCadastrados.has(n.toUpperCase()))

  function abrirNovo() { setNome(''); setEditId(null); setModal(true) }
  function abrirEditar(av: DtoAvaliador) { setNome(av.nome); setEditId(av.id); setModal(true) }

  async function salvar() {
    if (!nome.trim()) return
    setLoading(true)
    if (editId) {
      await supabase.from('dto_avaliadores').update({ nome: nome.trim() }).eq('id', editId)
    } else {
      await supabase.from('dto_avaliadores').insert({ filial: filialFiltro, nome: nome.trim() })
    }
    setLoading(false); setModal(false); recarregar()
  }

  async function toggleAtivo(av: DtoAvaliador) {
    await supabase.from('dto_avaliadores').update({ ativo: !av.ativo }).eq('id', av.id)
    recarregar()
  }

  async function excluir(av: DtoAvaliador) {
    if (!confirm(`Excluir o avaliador "${av.nome}"?`)) return
    await supabase.from('dto_avaliadores').delete().eq('id', av.id)
    recarregar()
  }

  async function semearPadrao() {
    if (faltamPadrao.length === 0) return
    setSemeando(true)
    await supabase.from('dto_avaliadores').upsert(
      faltamPadrao.map(n => ({ filial: filialFiltro, nome: n })),
      { onConflict: 'filial,nome', ignoreDuplicates: true }
    )
    setSemeando(false); recarregar()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 font-medium">Filial:</label>
          <select
            value={filialFiltro}
            onChange={e => setFilialFiltro(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {filiais.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {faltamPadrao.length > 0 && (
            <button
              onClick={semearPadrao}
              disabled={semeando}
              className="flex items-center gap-1.5 text-sm text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50 disabled:opacity-60"
            >
              <UserCheck size={15} />
              {semeando ? 'Importando...' : `Importar padrão (${faltamPadrao.length})`}
            </button>
          )}
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Novo Avaliador
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={3} className="text-center py-10 text-gray-400">
                Nenhum avaliador cadastrado para esta filial.{' '}
                <button onClick={semearPadrao} className="text-brand-600 hover:underline">Importar padrão</button>
              </td></tr>
            )}
            {lista.map(av => (
              <tr key={av.id} className={`border-b border-gray-100 hover:bg-gray-50 ${!av.ativo ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-800">{av.nome}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleAtivo(av)}
                    className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                      av.ativo
                        ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    {av.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => abrirEditar(av)} title="Editar" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => excluir(av)} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{editId ? 'Editar Avaliador' : 'Novo Avaliador'}</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo *</label>
              <input
                value={nome}
                onChange={e => setNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && salvar()}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Ex: NOME SOBRENOME"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button
                onClick={salvar}
                disabled={loading || !nome.trim()}
                className="px-4 py-2 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg font-medium"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
