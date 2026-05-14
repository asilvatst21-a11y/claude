import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Lock, Building2, User, Loader2 } from 'lucide-react'

const FILIAIS = ['CDD PETROPOLIS']

export default function Login() {
  const navigate = useNavigate()
  const { entrar } = useAuth()
  const [filial, setFilial] = useState(FILIAIS[0])
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { sucesso, erro: erroMsg } = await entrar(filial, login, senha)
    setLoading(false)
    if (sucesso) {
      navigate('/')
    } else {
      setErro(erroMsg ?? 'Erro ao entrar')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-brand-700 px-8 py-6 flex flex-col items-center">
          <img src="/logo.svg" alt="LOG20" className="h-16 mb-3 invert brightness-0 contrast-200" style={{ filter: 'brightness(0) invert(1)' }} />
          <h1 className="text-white text-2xl font-bold tracking-tight">PDV Crítico</h1>
          <p className="text-brand-200 text-sm mt-1">Sistema de Disparo de Mensagens</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Filial</label>
            <div className="relative">
              <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={filial}
                onChange={e => setFilial(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white appearance-none"
              >
                {FILIAIS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Usuário</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={login}
                onChange={e => setLogin(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Digite seu usuário"
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Digite sua senha"
                autoComplete="current-password"
              />
            </div>
          </div>

          {erro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !login || !senha}
            className="w-full bg-accent-500 hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading
              ? <><Loader2 size={18} className="animate-spin" /> Entrando...</>
              : 'Entrar'
            }
          </button>
        </form>

        <div className="bg-gray-50 px-8 py-4 text-center border-t border-gray-100">
          <p className="text-xs text-gray-500">© LOG20 Logística — PDV Crítico</p>
        </div>
      </div>
    </div>
  )
}
