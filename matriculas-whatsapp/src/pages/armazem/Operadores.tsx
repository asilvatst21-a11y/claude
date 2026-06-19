import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, KeyRound, Users, Loader2 } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import type { Usuario } from '../../types'

const CARGOS = ['Operador', 'Manobrista', 'Ajudante de Armazém']
const SENHA_PADRAO = 'ARMAZEM123'

interface FormState {
  id: string | null
  login: string
  senha: string
  nome: string
  cargo: string
}

function estadoVazio(): FormState {
  return { id: null, login: '', senha: '', nome: '', cargo: CARGOS[0] }
}

export default function ArmazemOperadores() {
  const { usuario } = useAuth()
  const [operadores, setOperadores] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const fetchOperadores = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const { data } = await supabase
      .from('usuarios')
      .select('*')
      .eq('filial', usuario.filial)
      .not('cargo', 'is', null)
      .order('nome')
    setOperadores(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [usuario])

  useEffect(() => { fetchOperadores() }, [fetchOperadores])

  function abrirNovo() {
    setErro('')
    setForm(estadoVazio())
  }

  function abrirEdicao(o: Usuario) {
    setErro('')
    setForm({ id: o.id, login: o.login, senha: '', nome: o.nome ?? '', cargo: o.cargo ?? CARGOS[0] })
  }

  async function handleSalvar() {
    if (!usuario || !form) return
    setErro('')
    if (!form.login.trim()) return setErro('Informe o login do operador.')
    if (!form.nome.trim()) return setErro('Informe o nome do operador.')

    setSalvando(true)

    const resultado = form.id
      ? await supabase.from('usuarios').update({
          login: form.login.trim(),
          nome: form.nome.trim(),
          cargo: form.cargo,
          ...(form.senha ? { senha: form.senha } : {}),
        }).eq('id', form.id)
      : await supabase.from('usuarios').insert({
          filial: usuario.filial,
          login: form.login.trim(),
          senha: form.senha || SENHA_PADRAO,
          nome: form.nome.trim(),
          cargo: form.cargo,
          admin: false,
          permissoes: [],
        })

    setSalvando(false)
    if (resultado.error) return setErro(resultado.error.message)
    setForm(null)
    fetchOperadores()
  }

  async function excluir(o: Usuario) {
    if (!confirm(`Excluir o operador ${o.nome ?? o.login}?`)) return
    await supabase.from('usuarios').delete().eq('id', o.id)
    fetchOperadores()
  }

  async function resetarSenha(o: Usuario) {
    if (!confirm(`Resetar a senha de ${o.login} para "${SENHA_PADRAO}"?`)) return
    await supabase.from('usuarios').update({ senha: SENHA_PADRAO }).eq('id', o.id)
    alert(`Senha resetada para: ${SENHA_PADRAO}`)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-700 flex items-center gap-2">
            <Users size={24} /> Operadores — Armazém
          </h1>
          <p className="text-sm text-gray-500 mt-1">Cadastre os operadores que acessarão o app de atividades no celular.</p>
        </div>
        <Button onClick={abrirNovo}><Plus size={16} /> Novo operador</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="animate-spin" /></div>
      ) : operadores.length === 0 ? (
        <div className="text-center py-20 text-gray-400">Nenhum operador cadastrado ainda.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Login</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cargo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {operadores.map(o => (
                <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-900">{o.login}</td>
                  <td className="px-4 py-3 text-gray-700">{o.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{o.cargo ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => resetarSenha(o)} title="Resetar senha" className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded">
                        <KeyRound size={15} />
                      </button>
                      <button onClick={() => abrirEdicao(o)} title="Editar" className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => excluir(o)} title="Excluir" className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setForm(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-brand-700 mb-4">{form.id ? 'Editar operador' : 'Novo operador'}</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Login</label>
                <Input className="mt-1" value={form.login} onChange={e => setForm({ ...form, login: e.target.value })} />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Nome</label>
                <Input className="mt-1" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Cargo</label>
                <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={form.cargo}
                  onChange={e => setForm({ ...form, cargo: e.target.value })}
                >
                  {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Senha {form.id ? '(deixe em branco para manter)' : ''}
                </label>
                <Input
                  className="mt-1"
                  value={form.senha}
                  onChange={e => setForm({ ...form, senha: e.target.value })}
                  placeholder={form.id ? '••••••' : `Padrão: ${SENHA_PADRAO}`}
                />
              </div>

              {erro && <p className="text-sm text-red-600">{erro}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
                <Button onClick={handleSalvar} disabled={salvando}>
                  {salvando ? <Loader2 size={16} className="animate-spin" /> : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
