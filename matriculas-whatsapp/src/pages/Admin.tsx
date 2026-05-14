import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Usuario, Filial } from '../types'
import { Plus, Pencil, Trash2, Shield, KeyRound, Building2 } from 'lucide-react'

const SENHA_PADRAO = 'LOG20123'

type AbaTipo = 'filiais' | 'usuarios'

export default function Admin() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<AbaTipo>('usuarios')
  const [filiais, setFiliais] = useState<Filial[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  async function carregar() {
    const [{ data: f }, { data: u }] = await Promise.all([
      supabase.from('filiais').select('*').order('nome'),
      supabase.from('usuarios').select('*').order('filial').order('login'),
    ])
    setFiliais(f ?? [])
    setUsuarios(u ?? [])
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
      </div>

      {aba === 'usuarios' && <AbaUsuarios usuarios={usuarios} filiais={filiais} recarregar={carregar} usuarioAtual={usuario} />}
      {aba === 'filiais'  && <AbaFiliais  filiais={filiais} recarregar={carregar} />}
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
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => resetarSenha(u)} title="Resetar senha" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded">
                      <KeyRound size={15} />
                    </button>
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
    </>
  )
}

function AbaFiliais({ filiais, recarregar }: { filiais: Filial[]; recarregar: () => void }) {
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)

  function abrirNovo() {
    setNome(''); setEditId(null); setModal(true)
  }

  function abrirEditar(f: Filial) {
    setNome(f.nome); setEditId(f.id); setModal(true)
  }

  async function salvar() {
    setLoading(true)
    if (editId) {
      await supabase.from('filiais').update({ nome }).eq('id', editId)
    } else {
      await supabase.from('filiais').insert({ nome })
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Filial *</label>
              <input
                value={nome}
                onChange={e => setNome(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Ex: CDD CAMPOS"
              />
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
