import { useState } from 'react'
import { UtensilsCrossed, Eye, EyeOff, LogIn, UserPlus, Shield } from 'lucide-react'
import { signInWithEmail, signUpWithEmail, signInWithGoogle, resendConfirmation } from '../store/supabase'

type Mode = 'login' | 'register'

export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showResend, setShowResend] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!email || !password) { setError('Preencha e-mail e senha'); return }
    if (mode === 'register' && !businessName.trim()) { setError('Informe o nome do estabelecimento'); return }
    if (password.length < 6) { setError('Senha deve ter pelo menos 6 caracteres'); return }

    setShowResend(false)
    setLoading(true)
    if (mode === 'login') {
      const { error: err } = await signInWithEmail(email, password)
      if (err) {
        setError(translateError(err))
        if (err.includes('Email not confirmed')) setShowResend(true)
      }
    } else {
      const { error: err } = await signUpWithEmail(email, password, businessName)
      if (err) setError(translateError(err))
      else setSuccess('Conta criada! Verifique seu e-mail para confirmar o cadastro.')
    }
    setLoading(false)
  }

  async function handleResend() {
    setResendLoading(true)
    const { error: err } = await resendConfirmation(email)
    setResendLoading(false)
    if (err) {
      setError('Não foi possível reenviar: ' + err)
    } else {
      setShowResend(false)
      setError('')
      setSuccess('E-mail de confirmação reenviado! Verifique sua caixa de entrada.')
    }
  }

  function translateError(msg: string) {
    if (msg.includes('Invalid login')) return 'E-mail ou senha incorretos'
    if (msg.includes('already registered')) return 'Este e-mail já está cadastrado'
    if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar'
    if (msg.includes('Password should')) return 'Senha deve ter pelo menos 6 caracteres'
    return msg
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-600 to-orange-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-lg mb-4">
            <UtensilsCrossed size={32} className="text-orange-500" />
          </div>
          <h1 className="text-3xl font-black text-white">FastFood Gestão</h1>
          <p className="text-orange-200 text-sm mt-1">Sistema completo para seu estabelecimento</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Abas */}
          <div className="grid grid-cols-2 border-b border-gray-100">
            <button
              onClick={() => { setMode('login'); setError(''); setSuccess(''); setShowResend(false) }}
              className={`py-3.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${mode === 'login' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <LogIn size={15} /> Entrar
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); setSuccess(''); setShowResend(false) }}
              className={`py-3.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${mode === 'register' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <UserPlus size={15} /> Criar conta
            </button>
          </div>

          <div className="p-6 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'register' && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Nome do estabelecimento</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="Ex: Burguer do João, Lanchonete Central..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                    autoComplete="organization"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Senha</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : '••••••••'}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-orange-400"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-4 py-2.5 space-y-2">
                  <p>{error}</p>
                  {showResend && (
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendLoading}
                      className="text-orange-600 font-semibold underline hover:no-underline disabled:opacity-60"
                    >
                      {resendLoading ? 'Reenviando...' : 'Reenviar e-mail de confirmação'}
                    </button>
                  )}
                </div>
              )}
              {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-xl px-4 py-2.5">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm transition-colors"
              >
                {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            </form>

            {/* Divisor */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">ou</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Google */}
            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-4 font-semibold text-gray-700 text-sm transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuar com Google
            </button>

            {/* Segurança */}
            <div className="flex items-start gap-2 bg-gray-50 rounded-xl p-3">
              <Shield size={14} className="text-green-500 shrink-0 mt-0.5" />
              <p className="text-xs text-gray-500">
                Seus dados são isolados por conta — nenhum estabelecimento acessa os dados de outro.
                Conexão criptografada (HTTPS) e tokens de acesso seguros.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-orange-200 text-xs">
          FastFood Gestão · Cada negócio, sua própria conta
        </p>
      </div>
    </div>
  )
}
